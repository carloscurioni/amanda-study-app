/* =========================================================================
   Estudos com a Lumi — servidor (Cloudflare Worker)
   -------------------------------------------------------------------------
   - Serve o app (pasta public/) e as rotas /api/*.
   - Guarda o estado da família num Durable Object com SQLite (persistente).
   - Chama a API do Claude para criar perguntas, dar dicas e corrigir folhas.
   Segredos (Cloudflare → Worker → Settings → Variables and Secrets):
     ANTHROPIC_API_KEY  chave da API (console.anthropic.com)
     FAMILY_CODE        senha da família, digitada uma vez em cada aparelho
   ========================================================================= */
import { DurableObject } from 'cloudflare:workers';

const SUBJECT_IDS = ['pt', 'pt_ort', 'pt_leit', 'bss', 'en', 'en_read', 'en_spell', 'en_guided', 'ipc', 'math'];
const SUBJECTS_TXT = `
- pt: Português (gramática, interpretação) — em português do Brasil
- pt_ort: Português – Ortografia — em português
- pt_leit: Português – Leitura — em português
- bss: BSS – Brazilian Social Studies (história e geografia do Brasil) — em português
- en: English (grammar, vocabulary, writing) — in British English
- en_read: English Reading — in English
- en_spell: English Spelling — in English
- en_guided: Guided Reading (VIPERS: vocabulary, infer, predict, explain, retrieve, sequence/summarise) — in English
- ipc: IPC – International Primary Curriculum (science, history, geography units) — in English
- math: Math — in English`;
const DOWS = ['sab', 'dom', 'seg', 'ter', 'qua', 'qui', 'sex'];

/* ---------------- Durable Object: o "banco de dados" da família ---------------- */
export class FamilyStore extends DurableObject {
  async load() {
    return (await this.ctx.storage.get('state')) ?? null;
  }
  async save(state, baseRev) {
    const cur = await this.ctx.storage.get('state');
    const curRev = cur?.rev ?? 0;
    if (cur && baseRev !== curRev) return { ok: false, conflict: true, state: cur };
    const next = { ...state, rev: curRev + 1, savedAt: new Date().toISOString() };
    await this.ctx.storage.put('state', next);
    return { ok: true, rev: next.rev, savedAt: next.savedAt };
  }
  async reset() {
    await this.ctx.storage.delete('state');
    return { ok: true };
  }
  // Limite diário de chamadas ao Claude (proteção de custo).
  async useAi(limit) {
    const day = new Date().toISOString().slice(0, 10);
    const u = (await this.ctx.storage.get('ai')) || { day, n: 0 };
    if (u.day !== day) { u.day = day; u.n = 0; }
    if (u.n >= limit) return { ok: false, used: u.n };
    u.n++;
    await this.ctx.storage.put('ai', u);
    return { ok: true, used: u.n };
  }
  async aiUsage() { return (await this.ctx.storage.get('ai')) || null; }
}

/* ---------------- Utilitários HTTP ---------------- */
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function body(req, max = 12_000_000) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) throw new HttpError(413, 'Envio grande demais.');
  try { return await req.json(); } catch { throw new HttpError(400, 'JSON inválido.'); }
}
const store = env => env.STORE.get(env.STORE.idFromName('familia'));

/* ---------------- Chamada ao Claude com saída JSON garantida ---------------- */
async function claude(env, { model, effort, system, content, schema, maxTokens }) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'A chave da API do Claude não foi configurada no servidor.');
  const limit = Number(env.AI_DAILY_LIMIT || 150);
  const quota = await store(env).useAi(limit);
  if (!quota.ok) throw new HttpError(429, `Limite diário de ${limit} chamadas ao Claude atingido. Amanhã libera de novo.`);
  const res = await fetch(`${env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema } },
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    let msg = raw.slice(0, 300);
    try { msg = JSON.parse(raw).error?.message || msg; } catch { /* mantém texto */ }
    throw new HttpError(502, `Claude respondeu ${res.status}: ${msg}`);
  }
  const data = JSON.parse(raw);
  if (data.stop_reason === 'refusal') throw new HttpError(502, 'O Claude recusou este pedido.');
  if (data.stop_reason === 'max_tokens') throw new HttpError(502, 'A resposta do Claude ficou longa demais. Tente com menos perguntas.');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try { return JSON.parse(text); } catch { throw new HttpError(502, 'Resposta do Claude em formato inesperado.'); }
}

/* ---------------- Esquemas de saída ---------------- */
const QUESTION_PROPS = {
  subject: { type: 'string', enum: SUBJECT_IDS },
  type: { type: 'string', enum: ['mc', 'short', 'num', 'open'] },
  q: { type: 'string', description: 'Enunciado curto (até ~25 palavras), autoexplicativo, que faça sentido impresso no papel.' },
  options: { type: 'array', items: { type: 'string' }, description: 'Para "mc": 3 ou 4 opções curtas. Para os outros tipos: lista vazia.' },
  answer: { type: 'string', description: 'Resposta correta exata (para "mc", igual a uma das opções). Vazia para "open".' },
  accept: { type: 'array', items: { type: 'string' }, description: 'Outras grafias aceitáveis da resposta (pode ser vazia).' },
  hint: { type: 'string', description: 'Dica curta da mascote que ajuda sem entregar a resposta.' },
};
const qSchema = withDay => ({
  type: 'object',
  properties: withDay ? { day: { type: 'string', enum: DOWS }, ...QUESTION_PROPS } : QUESTION_PROPS,
  required: withDay ? ['day', ...Object.keys(QUESTION_PROPS)] : Object.keys(QUESTION_PROPS),
  additionalProperties: false,
});
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      items: { type: 'object', properties: { subject: { type: 'string', enum: SUBJECT_IDS }, summary: { type: 'string' } }, required: ['subject', 'summary'], additionalProperties: false },
    },
    message: { type: 'string', description: 'Mensagem curta e animada da mascote Lumi para a aluna, em português.' },
    passages: {
      type: 'array',
      description: 'Textos de leitura escritos para a aluna (só para matérias de leitura com nível escolhido). Pode ser vazia.',
      items: {
        type: 'object',
        properties: {
          subject: { type: 'string', enum: ['pt_leit', 'en_read', 'en_guided'] },
          day: { type: 'string', enum: DOWS },
          title: { type: 'string' },
          text: { type: 'string', description: 'Texto original, 120–200 palavras, no idioma da matéria, em parágrafos separados por \n.' },
        },
        required: ['subject', 'day', 'title', 'text'],
        additionalProperties: false,
      },
    },
    questions: { type: 'array', items: qSchema(true) },
  },
  required: ['topics', 'message', 'passages', 'questions'],
  additionalProperties: false,
};
const MORE_SCHEMA = { type: 'object', properties: { questions: { type: 'array', items: qSchema(false) } }, required: ['questions'], additionalProperties: false };
const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título curto do conteúdo (ex.: "O que é uma bacia hidrográfica?").' },
    explanation: { type: 'string', description: 'Explicação clara para a idade da aluna, 3 a 6 frases curtas.' },
    example: { type: 'string', description: 'Um exemplo concreto ou analogia do dia a dia (1–2 frases).' },
  },
  required: ['title', 'explanation', 'example'],
  additionalProperties: false,
};
const OPEN_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          verdict: { type: 'string', enum: ['ok', 'bad'] },
          note: { type: 'string', description: 'Comentário curto e gentil: o que ficou bom e/ou o que faltou.' },
        },
        required: ['number', 'verdict', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};
const TUTOR_SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false };
const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          read: { type: 'string', description: 'O que a aluna escreveu/marcou, transcrito. Vazio se em branco ou ilegível.' },
          verdict: { type: 'string', enum: ['ok', 'bad', 'blank'] },
          note: { type: 'string', description: 'Comentário curto e gentil (pode ser vazio).' },
        },
        required: ['number', 'read', 'verdict', 'note'],
        additionalProperties: false,
      },
    },
    message: { type: 'string', description: 'Mensagem curta e encorajadora da Lumi, em português.' },
    legible: { type: 'boolean', description: 'false se a foto estiver ilegível ou não for a folha certa.' },
  },
  required: ['results', 'message', 'legible'],
  additionalProperties: false,
};

/* ---------------- Prompts ---------------- */
const level = b => (b && b.year ? String(b.year).slice(0, 80) : 'cerca de 10 anos');
function studentProfile(name, year) {
  return `Você cria exercícios para ${name || 'uma aluna'} (${year || 'cerca de 10 anos'}), aluna de uma escola internacional bilíngue em São Paulo (currículo britânico/IPC em inglês + matérias brasileiras em português).
Matérias (id — idioma):${SUBJECTS_TXT}

Regras de qualidade:
- Prefira MUITAS perguntas curtas e simples a poucas difíceis. Nível e conteúdo adequados exatamente ao ano escolar dela (${year || 'cerca de 10 anos'}), seguindo o currículo britânico e a BNCC brasileira desse ano.
- Cada pergunta precisa funcionar sozinha, na tela E impressa em papel (sem imagens, sem áudio, sem "veja a figura").
- Fatos sempre corretos e verificáveis; se não tiver certeza de um fato, não use.
- Perguntas das matérias em português: português do Brasil. Das matérias em inglês: inglês britânico.
- Tipos: "mc" (3–4 opções, só uma correta, opções do mesmo tipo e tamanho parecido), "short" (resposta de 1–3 palavras, sem ambiguidade), "num" (resposta numérica exata; em "answer" só o número ou fração como "3/4"), "open" (resposta livre de 1–3 frases; answer vazio).
- No máximo 1 em cada 4 perguntas pode ser "open".
- Em Ortografia/Spelling use as palavras da semana: completar letras que faltam (ex.: "Complete: ca_ _orro"), escolher a grafia correta, desembaralhar letras, escrever uma frase com a palavra.
- Em leitura, se não houver o texto, faça perguntas de compreensão que funcionem para quem leu (de preferência "open" curtas) e algumas sobre vocabulário/gramática ligadas ao tema.
- "hint" ajuda a pensar, nunca contém a resposta.
- Não repita perguntas iguais ou quase iguais.`;
}

async function handlePlan(env, b) {
  const days = (b.days || []).filter(d => DOWS.includes(d.dow) && d.n > 0);
  if (!days.length) throw new HttpError(400, 'Nenhum dia com perguntas.');
  const total = days.reduce((a, d) => a + d.n, 0);
  const images = (b.images || []).slice(0, 4);
  const text = String(b.text || '').slice(0, 6000);
  if (!text.trim() && !images.length) throw new HttpError(400, 'Conte o que você está aprendendo (ou mande uma foto).');
  const dayList = days.map(d => `- ${d.dow} (${d.label || d.dow}): ${d.n} perguntas`).join('\n');
  const content = [
    ...images.flatMap((img, i) => [{ type: 'text', text: `Foto ${i + 1} (material da escola):` }, { type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data } }]),
    { type: 'text', text: `O que a aluna (ou os pais) escreveu sobre a semana na escola, por matéria:
"""
${text || '(sem texto — use as fotos)'}
"""
${b.previous ? `\nTópicos da semana anterior (para revisão leve, opcional): ${String(b.previous).slice(0, 800)}` : ''}

Tarefa:
1. Identifique os assuntos de cada matéria mencionados (texto e fotos). Em "topics", resuma em 1 linha cada matéria encontrada (no idioma da matéria).
2. Crie EXATAMENTE ${total} perguntas, distribuídas nestes dias (campo "day"):
${dayList}
3. Em cada dia, misture 2 a 4 matérias; ao longo da semana, cubra todas as matérias citadas, com mais peso nas que tiverem mais conteúdo.
4. Use apenas as matérias citadas. Se algo não se encaixar claramente, escolha a matéria mais próxima.
5. Ortografia/Spelling — respeite o [modo] indicado:
   - "lista de palavras": use exatamente as palavras dadas;
   - "tema": escolha 8–10 palavras desse padrão ortográfico (ex.: silent letters → knight, island, wrap…), adequadas ao ano dela;
   - "a Lumi escolhe": escolha 8–10 palavras adequadas ao ano dela (UK spelling lists / dificuldades ortográficas do português nessa série).
   Em "topics", liste as palavras escolhidas.
6. Leitura/Reading/Guided Reading com [nível do texto]: ESCREVA textos originais em "passages" (120–200 palavras, interessantes para a idade; histórias ou textos informativos; se ela citou um livro ou tema, inspire-se nele sem copiar trechos).
   Níveis em relação ao ano dela: "mais fácil" = cerca de 1 ano abaixo; "no meu nível" = o ano dela; "acima" = cerca de 1 ano acima; "bem acima" = cerca de 2 anos acima.
   Crie um texto para cada dia em que essa matéria tiver perguntas (no máximo 3 textos por matéria na semana). Nesses dias, TODAS as perguntas dessa matéria devem ser sobre o texto do dia (comece com "No texto…"/"In the text…").
   Se a matéria de leitura NÃO tiver [nível do texto], deixe sem texto e siga a regra normal de leitura.
7. "message": 1–2 frases da Lumi (corujinha) animando a aluna, em português.` },
  ];
  const out = await claude(env, {
    model: env.MODEL_PLAN || 'claude-sonnet-5-5', effort: env.EFFORT_PLAN || 'medium',
    system: studentProfile(b.name, b.year), content, schema: PLAN_SCHEMA, maxTokens: 32000,
  });
  return out;
}

async function handleMore(env, b) {
  const n = Math.max(1, Math.min(15, Number(b.n) || 5));
  const subjects = (b.subjects || []).filter(s => SUBJECT_IDS.includes(s));
  const content = [{ type: 'text', text: `Assuntos da semana:
${String(b.topics || '').slice(0, 3000) || '(revisão geral do 5º ano)'}
${subjects.length ? `\nUse só estas matérias: ${subjects.join(', ')}. Se alguma delas não tiver assunto listado acima, faça uma revisão do conteúdo típico dessa matéria para o ano escolar dela.` : '\nMisture as matérias da semana e inclua sempre Math e English.'}
${b.objectiveOnly ? '\nNÃO use o tipo "open" — só mc, short e num (correção automática).' : ''}
${b.exclude?.length ? `\nNão repita estas perguntas:\n- ${b.exclude.slice(0, 60).map(x => String(x).slice(0, 120)).join('\n- ')}` : ''}

Crie exatamente ${n} perguntas novas, curtas e variadas.` }];
  return claude(env, {
    model: env.MODEL_FAST || 'claude-haiku-5-5', effort: env.EFFORT_FAST || 'low',
    system: studentProfile(b.name, b.year), content, schema: MORE_SCHEMA, maxTokens: 8000,
  });
}

async function handleTutor(env, b) {
  const lang = b.lang === 'en' ? 'en' : 'pt';
  const content = [{ type: 'text', text: `Pergunta (${b.subjectName || b.subject}): ${String(b.q || '').slice(0, 600)}
${b.options?.length ? `Opções: ${b.options.join(' | ')}` : ''}
${b.answer ? `Resposta correta (NÃO revele): ${b.answer}` : ''}
${b.context ? `Contexto (texto que ela leu / assuntos): ${String(b.context).slice(0, 2000)}\n` : ''}${b.attempt ? `O que a aluna respondeu até agora: ${String(b.attempt).slice(0, 300)}` : 'A aluna ainda não respondeu.'}

Você é a Lumi, uma corujinha tutora gentil. Escreva em ${lang === 'en' ? 'English' : 'português'} de 1 a 3 frases curtas para uma criança (${level(b)}):
explique a ideia por trás da pergunta ou dê um exemplo parecido, SEM dizer a resposta e sem eliminar opções diretamente.
Se ela já respondeu errado, diga com carinho onde pensar de novo.` }];
  return claude(env, {
    model: env.MODEL_FAST || 'claude-haiku-5-5', effort: 'low',
    system: 'Você é uma tutora paciente para crianças. Nunca entregue a resposta.', content, schema: TUTOR_SCHEMA, maxTokens: 1500,
  });
}

async function handleGrade(env, b) {
  const images = (b.images || []).slice(0, 3);
  if (!images.length) throw new HttpError(400, 'Mande a foto da folha.');
  const qs = (b.questions || []).slice(0, 30);
  const list = qs.map((q, i) => `${i + 1}. [${q.type}] ${q.q}${q.options?.length ? ` (opções: ${q.options.join(' | ')})` : ''} → resposta esperada: ${q.type === 'open' ? '(resposta livre)' : q.answer}${q.accept?.length ? ` (também aceitar: ${q.accept.join(', ')})` : ''}`).join('\n');
  const content = [
    ...images.flatMap((img, i) => [{ type: 'text', text: `Foto ${i + 1} da folha respondida:` }, { type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data } }]),
    { type: 'text', text: `Esta é a folha impressa "${b.title || ''}" respondida à mão por uma criança (${level(b)}). As perguntas, na ordem impressa:
${list}

Para cada número, transcreva em "read" o que ela escreveu ou marcou e dê o veredito:
- "ok": correta (aceite pequenas variações de letra de mão e maiúsculas; em Ortografia/Spelling a grafia precisa estar certa, inclusive acentos);
- "bad": errada; - "blank": em branco ou ilegível.
- Perguntas de resposta livre também recebem "ok" ou "bad": "ok" se a resposta responde à pergunta de forma correta e razoável para a idade (não exija perfeição); "bad" se está errada, fora do assunto ou incompleta demais.
Em "note", um comentário curto e gentil: quando errada, diga a forma certa; nas livres, diga o que ficou bom e o que poderia melhorar. Se a foto não for desta folha ou estiver ilegível, legible=false.` },
  ];
  return claude(env, {
    model: env.MODEL_GRADE || env.MODEL_PLAN || 'claude-sonnet-5-5', effort: env.EFFORT_GRADE || 'medium',
    system: 'Você corrige folhas de exercícios escritas à mão por crianças, com precisão e carinho.', content, schema: GRADE_SCHEMA, maxTokens: 8000,
  });
}

const LANG_NAME = l => (l === 'en' ? 'English' : 'português do Brasil');
async function handleExplain(env, b) {
  const lang = b.lang === 'en' ? 'en' : 'pt';
  const content = [{ type: 'text', text: `Matéria: ${b.subjectName || b.subject}
Pergunta que a aluna está estudando: ${String(b.q || '').slice(0, 600)}
${b.options?.length ? `Opções: ${b.options.join(' | ')}` : ''}
${b.context ? `Contexto (assuntos da semana e texto lido): ${String(b.context).slice(0, 2500)}` : ''}

Explique, em ${LANG_NAME(lang)}, o CONTEÚDO por trás desta pergunta para uma criança (${level(b)}), como uma mini-aula:
o conceito, por que ele importa e um exemplo do dia a dia.
${b.done ? `Ela já respondeu. A resposta correta é: ${b.answer || '(resposta livre)'}. Pode explicar por que essa resposta está certa.` : 'Ela ainda NÃO respondeu: explique o conceito sem dar a resposta desta pergunta (use outro exemplo).'}
Fatos sempre corretos. Linguagem simples e animada, sem infantilizar.` }];
  return claude(env, {
    model: env.MODEL_EXPLAIN || env.MODEL_FAST || 'claude-haiku-5-5', effort: 'medium',
    system: 'Você é a Lumi, uma corujinha professora que explica conteúdos escolares para crianças com clareza e precisão.', content, schema: EXPLAIN_SCHEMA, maxTokens: 4000,
  });
}
async function handleCheckOpen(env, b) {
  const items = (b.items || []).slice(0, 20);
  if (!items.length) return { results: [] };
  const list = items.map((x, i) => `${i + 1}. (${x.subjectName || x.subject}; responder em ${LANG_NAME(x.lang)})
Pergunta: ${String(x.q).slice(0, 500)}
Resposta da aluna: ${String(x.answer || '').slice(0, 1200) || '(em branco)'}`).join('\n\n');
  const content = [{ type: 'text', text: `Corrija estas respostas livres de uma aluna (${level(b)}).
${b.context ? `Contexto (assuntos da semana e texto lido): ${String(b.context).slice(0, 2500)}\n` : ''}
${list}

Para cada número: "ok" se responde à pergunta de forma correta e razoável para a idade (não exija perfeição nem ortografia impecável, a menos que a pergunta seja de ortografia/escrita); "bad" se está errada, fora do assunto, em branco ou incompleta demais.
"note": 1–2 frases gentis no idioma da pergunta, dizendo o que ficou bom e, se for o caso, o que faltou ou qual seria a ideia certa.` }];
  return claude(env, {
    model: env.MODEL_FAST || 'claude-haiku-5-5', effort: 'medium',
    system: 'Você corrige respostas de crianças com justiça e carinho.', content, schema: OPEN_SCHEMA, maxTokens: 6000,
  });
}

/* ---------------- Roteador ---------------- */
async function api(req, env, path) {
  if (path === '/api/health') {
    return json({ ok: true, ai: !!env.ANTHROPIC_API_KEY, configured: !!env.FAMILY_CODE });
  }
  if (!env.FAMILY_CODE) throw new HttpError(503, 'Falta configurar o FAMILY_CODE no servidor.');
  if (!safeEqual(req.headers.get('x-family-code'), env.FAMILY_CODE)) throw new HttpError(401, 'Código da família incorreto.');

  const m = req.method;
  if (path === '/api/login' && m === 'POST') return json({ ok: true, ai: !!env.ANTHROPIC_API_KEY });
  if (path === '/api/state' && m === 'GET') return json({ state: await store(env).load() });
  if (path === '/api/state' && m === 'PUT') {
    const b = await body(req, 3_000_000);
    if (!b.state || typeof b.state !== 'object') throw new HttpError(400, 'Estado inválido.');
    const r = await store(env).save(b.state, Number(b.baseRev) || 0);
    return json(r, r.ok ? 200 : 409);
  }
  if (path === '/api/state' && m === 'DELETE') return json(await store(env).reset());
  if (path === '/api/usage' && m === 'GET') return json({ usage: await store(env).aiUsage(), limit: Number(env.AI_DAILY_LIMIT || 150) });
  if (m === 'POST') {
    const b = await body(req);
    if (path === '/api/plan') return json(await handlePlan(env, b));
    if (path === '/api/more') return json(await handleMore(env, b));
    if (path === '/api/tutor') return json(await handleTutor(env, b));
    if (path === '/api/grade') return json(await handleGrade(env, b));
    if (path === '/api/explain') return json(await handleExplain(env, b));
    if (path === '/api/check-open') return json(await handleCheckOpen(env, b));
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url.pathname); }
      catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status === 500) console.error(e);
        return json({ error: e.message || 'Erro no servidor.' }, status);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
