/* =========================================================================
   Estudos com a Lumi — servidor (Cloudflare Worker)
   -------------------------------------------------------------------------
   - Serve o app (pasta public/) e as rotas /api/*.
   - Contas por família (convite + e-mail e senha), perfis de crianças com PIN.
   - Diretório de contas: Durable Object "Directory" (SQLite).
   - Dados de cada criança: um Durable Object "FamilyStore" por criança (cofre isolado).
   - Chama a API do Claude com limite de gasto por criança/dia e por mês.
   Segredos (Cloudflare → Worker → Settings → Variables and Secrets):
     ANTHROPIC_API_KEY  chave da API (platform.claude.com)
     FAMILY_CODE        usado só no primeiro acesso, para criar a conta do administrador
   ========================================================================= */
import { DurableObject } from 'cloudflare:workers';
import { Directory, AppError } from './directory.js';
import { Curriculum } from './curriculum.js';
export { Directory, Curriculum };

// Catálogo de matérias (id — descrição — idioma). O app manda quais o estudante faz; o prompt só lista essas.
const SUBJECT_CATALOG = [
  ['pt', 'Português (gramática, interpretação de texto) — em português do Brasil'],
  ['pt_ort', 'Português – Ortografia — em português'],
  ['pt_leit', 'Português – Leitura — em português'],
  ['pt_lit', 'Português – Literatura (escolas literárias, obras e autores brasileiros e portugueses, análise de texto) — em português'],
  ['pt_red', 'Português – Redação (gêneros textuais, dissertação argumentativa no estilo ENEM/vestibular, coesão e coerência) — em português'],
  ['bss', 'BSS – Brazilian Social Studies (história e geografia do Brasil) — em português'],
  ['en', 'English / English Language (grammar, vocabulary, writing; no IGCSE: First Language/ESL English) — in British English'],
  ['en_read', 'English Reading — in English'],
  ['en_spell', 'English Spelling — in English'],
  ['en_guided', 'Guided Reading (VIPERS: vocabulary, infer, predict, explain, retrieve, sequence/summarise) — in English'],
  ['en_lit', 'English Literature (set texts, poetry, drama, prose; themes, characters, language and structure) — in English'],
  ['ipc', 'IPC – International Primary Curriculum (science, history, geography units) — in English'],
  ['math', 'Math / Mathematics — in English'],
  ['fmath', 'Additional Mathematics (Cambridge IGCSE 0606 / Edexcel Further Pure Mathematics) ou Further Maths — in English'],
  ['sci', 'Science (combined: biology, chemistry, physics) — in English'],
  ['bio', 'Biology — in English'],
  ['chem', 'Chemistry — in English'],
  ['phys', 'Physics — in English'],
  ['hist', 'History — in English'],
  ['geog', 'Geography — in English'],
  ['comp', 'Computer Science (algorithms, programming in Python/pseudocode, data, networks) — in English'],
  ['econ', 'Economics — in English'],
  ['bus', 'Business — in English'],
  ['psych', 'Psychology — in English'],
  ['spa', 'Spanish (língua estrangeira: exercícios em espanhol, instruções em inglês)'],
  ['fre', 'French (língua estrangeira: exercícios em francês, instruções em inglês)'],
  ['tok', 'Theory of Knowledge (IB core: knowledge questions, themes, areas of knowledge) — in English'],
];
const SUBJECT_IDS = SUBJECT_CATALOG.map(x => x[0]);
const READ_IDS = ['pt_leit', 'en_read', 'en_guided', 'pt_lit', 'en_lit'];
const PRIMARY_IDS = ['pt', 'pt_ort', 'pt_leit', 'bss', 'en', 'en_read', 'en_spell', 'en_guided', 'ipc', 'math'];
const subjectsTxt = (ids, levels) => {
  const want = (Array.isArray(ids) ? ids : []).filter(id => SUBJECT_IDS.includes(id));
  const list = SUBJECT_CATALOG.filter(x => (want.length ? want : PRIMARY_IDS).includes(x[0]));
  const lv = levels && typeof levels === 'object' ? levels : {};
  return '\n' + list.map(([id, d]) => `- ${id}: ${d}${lv[id] === 'HL' ? ' — IB Higher Level (HL)' : lv[id] === 'SL' ? ' — IB Standard Level (SL)' : ''}`).join('\n');
};
const DOWS = ['sab', 'dom', 'seg', 'ter', 'qua', 'qui', 'sex'];
const YEAR_LABELS = {
  Y1: 'Year 1, Key Stage 1 do currículo britânico (≈ Infantil 5 no Brasil, 5–6 anos)', Y2: 'Year 2, Key Stage 1 do currículo britânico (≈ 1º ano no Brasil, 6–7 anos)',
  Y3: 'Year 3, Key Stage 2 do currículo britânico (≈ 2º ano no Brasil, 7–8 anos)', Y4: 'Year 4, Key Stage 2 do currículo britânico (≈ 3º ano no Brasil, 8–9 anos)',
  Y5: 'Year 5, Key Stage 2 do currículo britânico (≈ 4º ano no Brasil, 9–10 anos)', Y6: 'Year 6, Key Stage 2 do currículo britânico (≈ 5º ano no Brasil, 10–11 anos)',
  Y7: 'Year 7, Key Stage 3 do currículo britânico (≈ 6º ano no Brasil, 11–12 anos)', Y8: 'Year 8, Key Stage 3 do currículo britânico (≈ 7º ano no Brasil, 12–13 anos)',
  Y9: 'Year 9, Key Stage 3 do currículo britânico (≈ 8º ano no Brasil, 13–14 anos)',
  Y10: 'Year 10, Key Stage 4 / 1º ano do IGCSE (GCSE) do currículo britânico (≈ 9º ano no Brasil, 14–15 anos)',
  Y11: 'Year 11, Key Stage 4 / ano das provas do IGCSE (GCSE) do currículo britânico (≈ 1ª série do Ensino Médio no Brasil, 15–16 anos)',
  Y12: 'Year 12, 1º ano do IB Diploma Programme (DP1) (≈ 2ª série do Ensino Médio no Brasil, 16–17 anos)',
  Y13: 'Year 13, 2º ano do IB Diploma Programme (DP2, ano das provas finais do IB) (≈ 3ª série do Ensino Médio no Brasil, 17–18 anos)',
};
const yearNum = b => Number((String((b && b.yearId) || '').match(/\d+/) || [5])[0]);
// Orientação extra para o fundamental II e o médio (Key Stage 3, IGCSE e IB Diploma).
function stageRules(n) {
  if (n <= 6) return '';
  if (n <= 9) return `
- Key Stage 3: perguntas mais exigentes que no primário, com o vocabulário técnico da matéria; em Math inclua álgebra, proporção, geometria e estatística do ano.`;
  if (n <= 11) return `
- IGCSE/GCSE: siga o estilo das provas Cambridge IGCSE / Edexcel / AQA, com os "command words" (state, describe, explain, calculate, compare, evaluate) e a terminologia da especificação.
- Em Math e Sciences: cálculos com unidades, fórmulas e alguns passos; em "num" a resposta é só o número (com o arredondamento pedido no enunciado, ex.: "to 1 d.p.").
- Additional Mathematics (Cambridge 0606 / Edexcel Further Pure): logaritmos e exponenciais (inclusive equações e sistemas com logaritmos), surds (simplificar, racionalizar), completar o quadrado, discriminante e natureza das raízes, raízes α e β (soma e produto, expressões simétricas, nova equação), sistemas não lineares, inequações quadráticas, funções (domínio, imagem, composta, inversa), polinômios, trigonometria e introdução ao cálculo. Exercícios no estilo das provas, com resposta exata (ex.: "2√3", "x < -1 or x > 4", "f⁻¹(x) = (x+3)/2"): use "short" para respostas algébricas, com variações aceitas em "accept".
- Em literatura e humanas: perguntas de análise ("open") curtas, pedindo evidência do texto (PEE/PEEL), respondíveis em 2–4 frases.
- Em português: conteúdo da BNCC do ano equivalente (gramática, interpretação e literatura no nível do Ensino Médio quando for o caso).`;
  return `
- IB Diploma Programme: nível pré-universitário, no estilo das provas do IB (Paper 1/Paper 2/Paper 3), com os "command terms" do IB (define, describe, explain, analyse, compare and contrast, evaluate, discuss, to what extent) e a terminologia do guia de cada matéria.
- Respeite o nível de cada matéria: HL (Higher Level) tem mais profundidade e tópicos extras (AHL); SL (Standard Level) só o núcleo. Sem nível indicado, use SL.
- Mathematics: Analysis and Approaches (AA) ou Applications and Interpretation (AI), conforme o assunto informado (cálculo, funções, vetores, estatística e probabilidade, modelagem); em "num" só o resultado final (com a precisão pedida, ex.: "to 3 s.f.").
- Sciences (Biology, Chemistry, Physics): conceitos do guia atual, cálculos com unidades e algarismos significativos, interpretação de dados e "nature of science".
- Individuals & Societies (Economics, Business Management, History, Geography, Psychology): conceitos, aplicação a exemplos reais e avaliação; "open" pede 3–5 frases com argumento e contra-argumento.
- Language A (English A / Português A: literatura ou language & literature): análise guiada de trechos (estilo Paper 1), obras e temas globais (estilo Paper 2), recursos de linguagem e estrutura. Se citar ENEM/vestibular, inclua também esse estilo em português.
- Language B / ab initio (Spanish, French): vocabulário e gramática dos temas do IB (identities, experiences, human ingenuity, social organisation, sharing the planet).
- Theory of Knowledge: perguntas de conhecimento (knowledge questions), temas centrais e opcionais, áreas de conhecimento; peça perspectivas e exemplos, sem uma única resposta "certa" ("open"), ou "mc" sobre conceitos de TOK.
- Não escreva Internal Assessments, Extended Essay nem trabalhos avaliados pelo estudante: crie apenas exercícios de prática.
- As perguntas continuam claras e verificáveis: difíceis no conteúdo, claras na forma.`;
}
// Preço por milhão de tokens (US$): entrada / saída. Usado para estimar o gasto e aplicar os limites.
const PRICES = { 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.10, 0.50], 'claude-opus-5-5': [4, 20] };

/* ---------------- Cofre de cada criança (Durable Object) ---------------- */
export class FamilyStore extends DurableObject {
  async load() { return (await this.ctx.storage.get('state')) ?? null; }
  async save(state, baseRev) {
    const cur = await this.ctx.storage.get('state');
    const curRev = cur?.rev ?? 0;
    if (cur && baseRev !== curRev) return { ok: false, conflict: true, state: cur };
    const next = { ...state, rev: curRev + 1, savedAt: new Date().toISOString() };
    await this.ctx.storage.put('state', next);
    return { ok: true, rev: next.rev, savedAt: next.savedAt };
  }
  async reset() { await this.ctx.storage.deleteAll(); return { ok: true }; }
  // 💌 Recadinhos secretos dos pais: ficam fora do estado da criança (que vai para o aparelho dela).
  async notes() { return (await this.ctx.storage.get('notes')) || []; }
  async notesAdd(text, from) {
    const l = await this.notes();
    if (l.length >= 300) return { err: 'Limite de recadinhos atingido.' };
    const n = { id: crypto.randomUUID().slice(0, 12), text, from, createdAt: new Date().toISOString(), openedAt: null };
    l.push(n); await this.ctx.storage.put('notes', l); return { note: n };
  }
  async notesDelete(id) {
    const l = await this.notes(); const n = l.find(x => x.id === id);
    if (!n) return { err: 'Recadinho não encontrado.' };
    if (n.openedAt) return { err: 'Este recadinho já foi aberto.' };
    await this.ctx.storage.put('notes', l.filter(x => x.id !== id)); return { ok: true };
  }
  async notesAvailable() { return (await this.notes()).filter(n => !n.openedAt).length; }
  async notesOpen() {
    const l = await this.notes(); const un = l.filter(n => !n.openedAt);
    if (!un.length) return { err: 'Sem recadinhos disponíveis.' };
    const n = un[Math.floor(Math.random() * un.length)];
    n.openedAt = new Date().toISOString();
    await this.ctx.storage.put('notes', l);
    return { note: { id: n.id, text: n.text, from: n.from, openedAt: n.openedAt } };
  }
}

/* ---------------- Utilitários HTTP ---------------- */
const HttpError = AppError;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
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
const dir = env => {
  const stub = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  return new Proxy({}, { get: (_, name) => async (...args) => {
    const r = await stub.rpc(String(name), ...args);
    if (r.err) throw new HttpError(r.status, r.err);
    return r.v;
  } });
};
const childStore = (env, childId) => env.STORE.get(env.STORE.idFromName('child:' + childId));
const legacyStore = env => env.STORE.get(env.STORE.idFromName('familia'));
const COOKIE = 'lumi_s';
function getCookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const sessionCookie = token => `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 86400}`;
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/* ---------------- Chamada ao Claude com saída JSON garantida ---------------- */
// Regras de segurança infantil acrescentadas a TODOS os prompts.
const CHILD_SAFETY = `

Segurança infantil (obrigatório): quem usa este app é uma criança ou adolescente (menor de idade). Todo conteúdo deve ser apropriado para a idade, gentil e educativo.
Nunca peça, repita ou invente dados pessoais (nome completo, endereço, escola, telefone, redes sociais, fotos de rosto).
Se o texto recebido trouxer algo impróprio, perigoso, pessoal ou fora do contexto escolar, ignore essa parte e produza apenas conteúdo escolar adequado.
Não inclua links nem nomes de sites, e nunca incentive o estudante a conversar com desconhecidos.
Você é uma inteligência artificial (a mascote Lumi); nunca finja ser uma pessoa.`;
async function claude(env, ctx, { model, effort, system, content, schema, maxTokens }) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'A chave da API do Claude não foi configurada no servidor.');
  const childCap = Number(env.CHILD_DAILY_USD || 0.5), monthCap = Number(env.MONTHLY_USD || 40);
  const ok = await dir(env).aiCheck(ctx.familyId, ctx.childId, childCap, monthCap);
  if (!ok.ok) throw new HttpError(429, ok.why === 'child'
    ? 'A Lumi já trabalhou bastante hoje! O limite diário desta criança foi atingido. Amanhã libera de novo. 🦉'
    : 'O limite mensal de uso do app foi atingido. Avise o administrador.');
  const res = await fetch(`${env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system: system + CHILD_SAFETY,
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
  const u = data.usage || {};
  const [pin, pout] = PRICES[model] || [4, 20];
  const usd = ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) * pin / 1e6 + (u.output_tokens || 0) * pout / 1e6;
  await dir(env).aiRecord(ctx.familyId, ctx.childId, usd);
  if (data.stop_reason === 'refusal') throw new HttpError(502, 'O Claude recusou este pedido.');
  if (data.stop_reason === 'max_tokens') throw new HttpError(502, 'A resposta do Claude ficou longa demais. Tente com menos perguntas.');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try { return JSON.parse(text); } catch { throw new HttpError(502, 'Resposta do Claude em formato inesperado.'); }
}

/* ---------------- Esquemas de saída ---------------- */
const QUESTION_PROPS = {
  subject: { type: 'string', enum: SUBJECT_IDS },
  type: { type: 'string', enum: ['mc', 'short', 'num', 'open', 'proof'] },
  q: { type: 'string', description: 'Enunciado curto (até ~25 palavras), autoexplicativo, que faça sentido impresso no papel.' },
  options: { type: 'array', items: { type: 'string' }, description: 'Para "mc": 3 ou 4 opções curtas. Para os outros tipos: lista vazia.' },
  answer: { type: 'string', description: 'Resposta correta exata (para "mc", igual a uma das opções). Vazia para "open".' },
  accept: { type: 'array', items: { type: 'string' }, description: 'Outras grafias aceitáveis da resposta (pode ser vazia).' },
  hint: { type: 'string', description: 'Dica curta da mascote que ajuda sem entregar a resposta.' },
  text: { type: 'string', description: 'Só para "proof": o parágrafo COM as palavras escritas errado. Vazio nos outros tipos.' },
  errors: {
    type: 'array', description: 'Só para "proof": cada palavra errada exatamente como aparece no texto e a forma correta. Vazia nos outros tipos.',
    items: { type: 'object', properties: { wrong: { type: 'string' }, right: { type: 'string' } }, required: ['wrong', 'right'], additionalProperties: false },
  },
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
    message: { type: 'string', description: 'Mensagem curta e animada da mascote Lumi para o estudante, em português.' },
    passages: {
      type: 'array',
      description: 'Leitura diária: um capítulo do "livro da semana" para cada dia marcado com leitura. Pode ser vazia se nenhum dia tiver leitura.',
      items: {
        type: 'object',
        properties: {
          subject: { type: 'string', enum: READ_IDS },
          day: { type: 'string', enum: DOWS },
          title: { type: 'string' },
          text: { type: 'string', description: 'Capítulo original no idioma da matéria (tamanho indicado na tarefa), em parágrafos separados por \n.' },
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
    explanation: { type: 'string', description: 'Explicação clara para a idade e o ano do estudante, 3 a 6 frases curtas.' },
    example: { type: 'string', description: 'Um exemplo concreto ou analogia do dia a dia (1–2 frases).' },
  },
  required: ['title', 'explanation', 'example'],
  additionalProperties: false,
};
const OBJ_TYPES_NOTE = 'Só "mc", "short" ou "num" (correção automática).';
const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título curto da aulinha (ex.: "Acentuação: as oxítonas").' },
    explanation: { type: 'array', items: { type: 'string' }, description: '2 a 4 parágrafos curtos (2–3 frases cada), do mais simples ao mais completo.' },
    examples: { type: 'array', items: { type: 'string' }, description: '2 ou 3 exemplos concretos, cada um em 1 frase (pode usar "→").' },
    tip: { type: 'string', description: 'Um truque para lembrar (macete), 1 frase.' },
    practice: { type: 'array', items: qSchema(false), description: '3 ou 4 exercícios de prática sobre o MESMO conteúdo, do mais fácil ao mais difícil. ' + OBJ_TYPES_NOTE },
  },
  required: ['title', 'explanation', 'examples', 'tip', 'practice'],
  additionalProperties: false,
};
const READING_SCHEMA = {
  type: 'object',
  properties: {
    bookTitle: { type: 'string', description: 'Título do livro (o mesmo do capítulo anterior, se for continuação).' },
    title: { type: 'string', description: 'Título do capítulo, ex.: "Capítulo 3: A porta escondida".' },
    text: { type: 'string', description: 'O capítulo, em parágrafos separados por \n.' },
    summary: { type: 'string', description: 'Resumo do capítulo em 1–2 frases (para continuar a história depois).' },
    questions: { type: 'array', items: qSchema(false), description: 'Exatamente 4: 1 "open" pedindo um resumo do capítulo em 2–3 frases, e 3 de compreensão ("mc" ou "short").' },
  },
  required: ['bookTitle', 'title', 'text', 'summary', 'questions'],
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
          read: { type: 'string', description: 'O que o estudante escreveu/marcou, transcrito. Vazio se em branco ou ilegível.' },
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
function studentProfile(name, year, subjects, n, levels) {
  return `Você cria exercícios para ${name || 'um estudante'} (${year || 'cerca de 10 anos'}), de uma escola internacional bilíngue em São Paulo (currículo britânico e IB em inglês + matérias brasileiras em português).
Matérias que este estudante faz (id — descrição — idioma):${subjectsTxt(subjects, levels)}

Regras de qualidade:
- Prefira MUITAS perguntas curtas e diretas a poucas longas. Nível e conteúdo adequados exatamente ao ano escolar (${year || 'cerca de 10 anos'}), seguindo o currículo da escola (National Curriculum / IGCSE / IB Diploma) e a BNCC brasileira do ano equivalente.${stageRules(n || 5)}
- Spanish/French: o exercício é na língua estrangeira (vocabulário, gramática, tradução curta), com a instrução em inglês.
- Cada pergunta precisa funcionar sozinha, na tela E impressa em papel (sem imagens, sem áudio, sem "veja a figura").
- Fatos sempre corretos e verificáveis; se não tiver certeza de um fato, não use.
- Perguntas das matérias em português: português do Brasil. Das matérias em inglês: inglês britânico.
- Tipos: "mc" (3–4 opções, só uma correta, opções do mesmo tipo e tamanho parecido), "short" (resposta de 1–3 palavras, sem ambiguidade), "num" (resposta numérica exata; em "answer" só o número ou fração como "3/4"), "open" (resposta livre de 1–3 frases; answer vazio).
- No máximo 1 em cada 4 perguntas pode ser "open".
- "proof" (caça-erros, só em Ortografia/Spelling): em "text", um parágrafo curto e natural (35–60 palavras), adequado ao ano e no idioma da matéria, com EXATAMENTE 4 ou 5 palavras escritas errado.
  De preferência use as palavras da semana, com erros típicos (letras trocadas, faltando ou dobradas, acento errado; em inglês, erros comuns como ie/ei, letra muda, -tion/-sion).
  Cada palavra errada aparece uma única vez no texto; todo o resto do texto está 100% correto. Não marque os erros (nada de negrito ou aspas).
  "errors": lista {wrong, right}, em que "wrong" é a palavra exatamente como está no texto. "q": instrução curta, ex.: "Caça-erros: encontre e corrija as 5 palavras escritas errado." / "Spot the mistakes: find and fix the 5 misspelled words.". "answer": "errada → certa; …". "options" e "accept" vazios.
  Nos outros tipos, "text" fica vazio e "errors" é uma lista vazia.
- Em Ortografia/Spelling use as palavras da semana: completar letras que faltam (ex.: "Complete: ca_ _orro"), escolher a grafia correta, desembaralhar letras, escrever uma frase com a palavra.
- Em leitura/literatura, se não houver o texto, faça perguntas de compreensão que funcionem para quem leu (de preferência "open" curtas) e algumas sobre vocabulário/gramática ligadas ao tema.
- "hint" ajuda a pensar, nunca contém a resposta.
- Não repita perguntas iguais ou quase iguais.`;
}

async function handlePlan(env, b, ctx) {
  const days = (b.days || []).filter(d => DOWS.includes(d.dow) && d.n > 0);
  const LEVELS = { below: 'mais fácil (cerca de 1 ano abaixo)', at: 'no nível do ano', above: 'acima (cerca de 1 ano acima)', way: 'bem acima (cerca de 2 anos acima)' };
  days.forEach(d => { d.read = d.read && READ_IDS.includes(d.read.subject) ? { subject: d.read.subject, level: LEVELS[d.read.level] || LEVELS.at } : null; });
  const reading = days.some(d => d.read);
  if (!days.length) throw new HttpError(400, 'Nenhum dia com perguntas.');
  const total = days.reduce((a, d) => a + d.n, 0);
  const images = (b.images || []).slice(0, 4);
  const text = String(b.text || '').slice(0, 6000);
  if (!text.trim() && !images.length) throw new HttpError(400, 'Conte o que você está aprendendo (ou mande uma foto).');
  const dayList = days.map(d => `- ${d.dow} (${d.label || d.dow}): ${d.n} perguntas${d.read ? ` · leitura do dia: ${d.read.subject} (nível: ${d.read.level}) — 3 dessas perguntas são sobre o capítulo` : ''}`).join('\n');
  const n = yearNum(b);
  const content = [
    ...images.flatMap((img, i) => [{ type: 'text', text: `Foto ${i + 1} (material da escola):` }, { type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data } }]),
    { type: 'text', text: `O que o estudante (ou os pais) escreveu sobre a semana na escola, por matéria:
"""
${text || '(sem texto — use as fotos)'}
"""
${b.previous ? `\nTópicos da semana anterior (para revisão leve, opcional): ${String(b.previous).slice(0, 800)}` : ''}

Tarefa:
1. Identifique os assuntos de cada matéria mencionados (texto e fotos). Em "topics", resuma em 1 linha cada matéria encontrada (no idioma da matéria).
2. Crie EXATAMENTE ${total} perguntas, distribuídas nestes dias (campo "day"):
${dayList}
3. Distribuição: TODO DIA tem cerca de ${Math.max(1, Math.min(4, Number(b.perSubject) || 2))} perguntas de CADA matéria citada (fora as 3 da leitura do dia). Se a conta do dia não fechar, use 1 a 3 por matéria, mas não deixe nenhuma matéria citada de fora num dia. Ao longo da semana, varie os subtemas de cada matéria (não repita a mesma ideia em dias diferentes).
4. Use apenas as matérias citadas. Se algo não se encaixar claramente, escolha a matéria mais próxima.
   Corrija erros de digitação óbvios nos tópicos escritos pelo estudante (ex.: em matemática, "surfs" = surds; "simutanious" = simultaneous) e use o nome certo em "topics".
5. Ortografia/Spelling — respeite o [modo] indicado:
   - "lista de palavras": use exatamente as palavras dadas;
   - "tema": escolha 8–10 palavras desse padrão ortográfico (ex.: silent letters → knight, island, wrap…), adequadas ao ano;
   - "a Lumi escolhe": escolha 8–10 palavras adequadas ao ano (UK spelling lists / dificuldades ortográficas do português nessa série).
   Em "topics", liste as palavras escolhidas.
   Em cada dia que tiver Ortografia ou Spelling, inclua UMA pergunta "proof" (caça-erros) dessa matéria.
6. ${reading ? `LEITURA DIÁRIA — "livro da semana": para cada dia marcado com "leitura do dia", escreva em "passages" um capítulo de um livro original (campo "subject" = a matéria indicada; "day" = o dia).
   - Um livro em português para os dias de matérias em português e outro em inglês para as de inglês. Cada capítulo continua a história do capítulo anterior do mesmo idioma (personagens fixos, gancho no fim para dar vontade de ler o próximo).
   - "title": "Nome do livro — Capítulo N: título do capítulo".
   - Tamanho: ${n <= 2 ? '120–200' : n <= 6 ? '250–400' : '400–600'} palavras. Nível de leitura conforme indicado para o dia, em relação ao ano do estudante. Em literatura (pt_lit/en_lit) a partir do IGCSE, pode ser um conto ou crônica original com recursos literários para analisar.
   - Se o estudante citou um livro, autor ou tema nessas matérias, inspire-se (sem copiar trechos de obras reais).
   - Nesse dia, EXATAMENTE 3 perguntas dessa matéria são sobre o capítulo: 1 "open" pedindo o resumo do capítulo em 2–3 frases ("Resuma o capítulo de hoje…"/"Summarise today's chapter…") e 2 de compreensão ("mc" ou "short"; comece com "No capítulo…"/"In the chapter…"). Essas 3 contam no total do dia.` : 'Sem leitura diária nesta semana: "passages" vazia. Em leitura, se não houver texto, siga a regra normal de leitura.'}
7. "message": 1–2 frases da Lumi (corujinha) animando o estudante, em português.` },
  ];
  const out = await claude(env, ctx, {
    model: env.MODEL_PLAN || 'claude-sonnet-5-5', effort: env.EFFORT_PLAN || 'medium',
    system: studentProfile(b.name, b.year, b.mine, yearNum(b), b.levels), content, schema: PLAN_SCHEMA, maxTokens: 32000,
  });
  return out;
}

async function handleMore(env, b, ctx) {
  const n = Math.max(1, Math.min(15, Number(b.n) || 5));  // (reforço também usa este limite)
  const subjects = (b.subjects || []).filter(s => SUBJECT_IDS.includes(s));
  const content = [{ type: 'text', text: `Assuntos da semana:
${String(b.topics || '').slice(0, 3000) || '(revisão geral do conteúdo do ano escolar)'}
${subjects.length ? `\nUse só estas matérias: ${subjects.join(', ')}. Se alguma delas não tiver assunto listado acima, faça uma revisão do conteúdo típico dessa matéria para o ano escolar.` : '\nMisture as matérias da semana (inclua Math e English se fizerem parte das matérias do estudante).'}
${b.objectiveOnly ? '\nNÃO use o tipo "open" — só mc, short, num e proof (correção automática). Se houver Spelling/Ortografia, inclua 1 "proof".' : ''}
${Array.isArray(b.focus) && b.focus.length ? `\nREFORÇO: o estudante errou ou disse que não sabia estas perguntas. Crie perguntas NOVAS e parecidas (mesmo conteúdo, outros números/palavras/exemplos), começando pelas mais fáceis, para ele aprender de verdade:\n- ${b.focus.slice(0, 15).map(x => String(x).slice(0, 200)).join('\n- ')}` : ''}
${b.exclude?.length ? `\nNão repita estas perguntas:\n- ${b.exclude.slice(0, 60).map(x => String(x).slice(0, 120)).join('\n- ')}` : ''}

Crie exatamente ${n} perguntas novas, curtas e variadas.` }];
  return claude(env, ctx, {
    model: env.MODEL_FAST || 'claude-haiku-5-5', effort: env.EFFORT_FAST || 'low',
    system: studentProfile(b.name, b.year, b.mine, yearNum(b), b.levels), content, schema: MORE_SCHEMA, maxTokens: 8000,
  });
}

// Aulinha: explicação em partes + exemplos + macete + exercícios de prática.
async function handleLesson(env, b, ctx) {
  const lang = b.lang === 'en' ? 'en' : 'pt';
  const content = [{ type: 'text', text: `Matéria: ${b.subjectName || b.subject}
${b.topic ? `Assunto pedido: ${String(b.topic).slice(0, 300)}\n` : ''}${b.q ? `Pergunta em que o estudante travou: ${String(b.q).slice(0, 600)}\n` : ''}${b.options?.length ? `Opções: ${b.options.join(' | ')}\n` : ''}${b.wrong ? `O que ele respondeu (errado): ${String(b.wrong).slice(0, 200)}\n` : ''}${b.context ? `Contexto (assuntos da semana / texto lido): ${String(b.context).slice(0, 2500)}\n` : ''}
Escreva, em ${LANG_NAME(lang)}, uma AULINHA da Lumi sobre o conteúdo por trás disso, para um estudante (${level(b)}) que disse que não sabe o assunto:
- comece do zero, com linguagem simples e animada (sem infantilizar), frases curtas, como uma boa professora particular;
- explique a regra ou o conceito passo a passo, mostre exemplos concretos e dê um macete para lembrar;
- se for ortografia/acentuação, explique a regra (ex.: quando se usa acento agudo, por que "você" tem acento) e mostre palavras que seguem e que não seguem a regra;
- ${b.done ? `ele já respondeu; pode usar a pergunta como exemplo e explicar a resposta certa (${b.answer || 'resposta livre'})` : 'NÃO dê a resposta da pergunta em que ele travou: explique com outros exemplos'};
- em "practice", 3 ou 4 exercícios curtos do MESMO conteúdo, do mais fácil ao mais difícil, para ele treinar na hora (${OBJ_TYPES_NOTE} "text" vazio, "errors" vazia, "accept" com variações aceitáveis).
Fatos sempre corretos.` }];
  return claude(env, ctx, {
    model: env.MODEL_LESSON || env.MODEL_PLAN || 'claude-sonnet-5-5', effort: 'low',
    system: studentProfile(b.name, b.year, b.mine, yearNum(b), b.levels) + '\nAgora você é a Lumi, professora particular paciente e muito clara.', content, schema: LESSON_SCHEMA, maxTokens: 6000,
  });
}
// Livro extra: um capítulo novo (continua o livro do estudante) + resumo + perguntas.
async function handleReading(env, b, ctx) {
  const lang = b.lang === 'en' ? 'en' : 'pt';
  const n = yearNum(b);
  const LEVELS = { below: 'mais fácil (cerca de 1 ano abaixo do ano dele)', at: 'no nível do ano dele', above: 'acima (cerca de 1 ano acima)', way: 'bem acima (cerca de 2 anos acima)' };
  const prev = (Array.isArray(b.chapters) ? b.chapters : []).slice(-6).map((c, i) => `- ${String(c.title || '').slice(0, 120)}: ${String(c.summary || '').slice(0, 300)}`).join('\n');
  const content = [{ type: 'text', text: `Escreva o próximo capítulo de um livro original em ${LANG_NAME(lang)} para o estudante ler (${level(b)}).
${b.bookTitle && prev ? `É a continuação do livro "${String(b.bookTitle).slice(0, 120)}". Capítulos anteriores:\n${prev}\nMantenha personagens e mundo; avance a história e termine com um gancho.` : `Comece um livro novo${b.theme ? ` sobre: ${String(b.theme).slice(0, 200)}` : ''} (aventura, mistério, animais, amizade ou ciência — escolha algo envolvente para a idade). Este é o Capítulo 1.`}
Nível de leitura: ${LEVELS[b.level] || LEVELS.at}. Tamanho: ${n <= 2 ? '150–250' : n <= 6 ? '300–450' : '450–650'} palavras.
Depois, 4 perguntas: 1 "open" pedindo o resumo do capítulo em 2–3 frases e 3 de compreensão ("mc" ou "short") sobre o capítulo (subject: ${lang === 'en' ? 'en_read' : 'pt_leit'}).` }];
  return claude(env, ctx, {
    model: env.MODEL_PLAN || 'claude-sonnet-5-5', effort: 'low',
    system: studentProfile(b.name, b.year, b.mine, yearNum(b), b.levels), content, schema: READING_SCHEMA, maxTokens: 8000,
  });
}

async function handleTutor(env, b, ctx) {
  const lang = b.lang === 'en' ? 'en' : 'pt';
  const content = [{ type: 'text', text: `Pergunta (${b.subjectName || b.subject}): ${String(b.q || '').slice(0, 600)}
${b.options?.length ? `Opções: ${b.options.join(' | ')}` : ''}
${b.answer ? `Resposta correta (NÃO revele): ${b.answer}` : ''}
${b.context ? `Contexto (texto lido / assuntos): ${String(b.context).slice(0, 2000)}\n` : ''}${b.attempt ? `O que o estudante respondeu até agora: ${String(b.attempt).slice(0, 300)}` : 'O estudante ainda não respondeu.'}

Você é a Lumi, uma corujinha tutora gentil. Escreva em ${lang === 'en' ? 'English' : 'português'} de 1 a 3 frases curtas para um estudante (${level(b)}):
explique a ideia por trás da pergunta ou dê um exemplo parecido, SEM dizer a resposta e sem eliminar opções diretamente.
Se ela já respondeu errado, diga com carinho onde pensar de novo.` }];
  return claude(env, ctx, {
    model: env.MODEL_FAST || 'claude-haiku-5-5', effort: 'low',
    system: 'Você é uma tutora paciente para estudantes. Nunca entregue a resposta.', content, schema: TUTOR_SCHEMA, maxTokens: 1500,
  });
}

async function handleGrade(env, b, ctx) {
  const images = (b.images || []).slice(0, 6);
  if (!images.length) throw new HttpError(400, 'Mande a foto da folha.');
  const qs = (b.questions || []).slice(0, 45);
  const list = qs.map((q, i) => `${i + 1}. [${q.type}] ${q.q}${q.options?.length ? ` (opções: ${q.options.join(' | ')})` : ''} → resposta esperada: ${q.type === 'open' ? '(resposta livre)' : q.answer}${q.accept?.length ? ` (também aceitar: ${q.accept.join(', ')})` : ''}`).join('\n');
  const content = [
    ...images.flatMap((img, i) => [{ type: 'text', text: `Foto ${i + 1} da folha respondida:` }, { type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data } }]),
    { type: 'text', text: `Esta é a folha impressa "${b.title || ''}" respondida à mão por um estudante (${level(b)}). As perguntas, na ordem impressa:
${list}

Para cada número, transcreva em "read" o que ela escreveu ou marcou e dê o veredito:
- "ok": correta (aceite pequenas variações de letra de mão e maiúsculas; em Ortografia/Spelling a grafia precisa estar certa, inclusive acentos);
- "bad": errada; - "blank": em branco ou ilegível.
- Caça-erros [proof]: em "read", liste as palavras que ela marcou e o que escreveu (ex.: "freind → friend"). "ok" só se encontrou e corrigiu TODAS as palavras erradas; em "note", diga quantas acertou.
- Perguntas de resposta livre também recebem "ok" ou "bad": "ok" se a resposta responde à pergunta de forma correta e razoável para a idade (não exija perfeição); "bad" se está errada, fora do assunto ou incompleta demais.
Em "note", um comentário curto e gentil: quando errada, diga a forma certa; nas livres, diga o que ficou bom e o que poderia melhorar. Se a foto não for desta folha ou estiver ilegível, legible=false.` },
  ];
  return claude(env, ctx, {
    model: env.MODEL_GRADE || env.MODEL_PLAN || 'claude-sonnet-5-5', effort: env.EFFORT_GRADE || 'medium',
    system: 'Você corrige folhas de exercícios escritas à mão por estudantes, com precisão e carinho.', content, schema: GRADE_SCHEMA, maxTokens: 8000,
  });
}

const LANG_NAME = l => (l === 'en' ? 'English' : 'português do Brasil');
async function handleExplain(env, b, ctx) {
  const lang = b.lang === 'en' ? 'en' : 'pt';
  const content = [{ type: 'text', text: `Matéria: ${b.subjectName || b.subject}
Pergunta que o estudante está estudando: ${String(b.q || '').slice(0, 600)}
${b.options?.length ? `Opções: ${b.options.join(' | ')}` : ''}
${b.context ? `Contexto (assuntos da semana e texto lido): ${String(b.context).slice(0, 2500)}` : ''}

Explique, em ${LANG_NAME(lang)}, o CONTEÚDO por trás desta pergunta para um estudante (${level(b)}), como uma mini-aula:
o conceito, por que ele importa e um exemplo do dia a dia.
${b.done ? `Ela já respondeu. A resposta correta é: ${b.answer || '(resposta livre)'}. Pode explicar por que essa resposta está certa.` : 'Ela ainda NÃO respondeu: explique o conceito sem dar a resposta desta pergunta (use outro exemplo).'}
Fatos sempre corretos. Linguagem simples e animada, sem infantilizar.` }];
  return claude(env, ctx, {
    model: env.MODEL_EXPLAIN || env.MODEL_FAST || 'claude-haiku-5-5', effort: 'medium',
    system: 'Você é a Lumi, uma corujinha professora que explica conteúdos escolares para estudantes com clareza e precisão.', content, schema: EXPLAIN_SCHEMA, maxTokens: 4000,
  });
}
async function handleCheckOpen(env, b, ctx) {
  const items = (b.items || []).slice(0, 20);
  if (!items.length) return { results: [] };
  const list = items.map((x, i) => `${i + 1}. (${x.subjectName || x.subject}; responder em ${LANG_NAME(x.lang)})
Pergunta: ${String(x.q).slice(0, 500)}
Resposta do estudante: ${String(x.answer || '').slice(0, 1200) || '(em branco)'}`).join('\n\n');
  const content = [{ type: 'text', text: `Corrija estas respostas livres de um estudante (${level(b)}).
${b.context ? `Contexto (assuntos da semana e texto lido): ${String(b.context).slice(0, 2500)}\n` : ''}
${list}

Para cada número: "ok" se responde à pergunta de forma correta e razoável para a idade (não exija perfeição nem ortografia impecável, a menos que a pergunta seja de ortografia/escrita); "bad" se está errada, fora do assunto, em branco ou incompleta demais.
"note": 1–2 frases gentis no idioma da pergunta, dizendo o que ficou bom e, se for o caso, o que faltou ou qual seria a ideia certa.` }];
  return claude(env, ctx, {
    model: env.MODEL_FAST || 'claude-haiku-5-5', effort: 'medium',
    system: 'Você corrige respostas de estudantes com justiça e carinho.', content, schema: OPEN_SCHEMA, maxTokens: 6000,
  });
}

/* ---------------- Roteador ---------------- */
const AI_HANDLERS = { plan: handlePlan, more: handleMore, tutor: handleTutor, grade: handleGrade, explain: handleExplain, 'check-open': handleCheckOpen, lesson: handleLesson, reading: handleReading };

async function api(req, env, url) {
  const path = url.pathname, m = req.method;
  // Proteção contra requisições de outros sites: toda escrita precisa do cabeçalho do app.
  if (m !== 'GET' && req.headers.get('x-lumi') !== '1') throw new HttpError(403, 'Requisição recusada.');
  const D = dir(env);

  if (path === '/api/health') {
    const st = await D.status();
    return json({ ok: true, ai: !!env.ANTHROPIC_API_KEY, setup: st.accounts === 0, canSetup: !!env.FAMILY_CODE });
  }
  // Primeiro acesso: cria a conta do administrador e leva os dados antigos para o 1º perfil.
  if (path === '/api/setup' && m === 'POST') {
    const b = await body(req, 50_000);
    if (!env.FAMILY_CODE || !safeEqual(b.code, env.FAMILY_CODE)) throw new HttpError(401, 'Código de configuração incorreto.');
    const r = await D.setup(b);
    const old = await legacyStore(env).load();
    if (old) {
      const st = { ...old, rev: 0 };
      if (b.childName) st.name = String(b.childName).slice(0, 30);
      await childStore(env, r.childId).save(st, 0);
    }
    return json({ ok: true, migrated: !!old }, 200, { 'set-cookie': sessionCookie(r.token) });
  }
  if (path === '/api/auth/login' && m === 'POST') {
    const b = await body(req, 10_000);
    const r = await D.login(b.email, b.password);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(r.token) });
  }
  const invM = path.match(/^\/api\/invite\/([A-Za-z0-9_-]{10,80})(\/accept)?$/);
  if (invM && m === 'GET' && !invM[2]) return json(await D.inviteInfo(invM[1]));
  if (invM && m === 'POST' && invM[2]) {
    const b = await body(req, 20_000);
    const r = await D.acceptInvite(invM[1], b);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(r.token) });
  }

  // ---- daqui para baixo, precisa estar logado ----
  const token = getCookie(req, COOKIE);
  const me = await D.auth(token);
  if (!me) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
  const familyId = me.family.id;
  const isAdmin = me.parent.role === 'admin';
  const need = cond => { if (!cond) throw new HttpError(403, 'Sem permissão.'); };

  if (path === '/api/auth/me' && m === 'GET') return json({ parent: me.parent, family: { id: me.family.id, name: me.family.name }, children: me.children, ai: !!env.ANTHROPIC_API_KEY });
  if (path === '/api/auth/logout' && m === 'POST') { await D.logout(token); return json({ ok: true }, 200, { 'set-cookie': clearCookie() }); }
  if (path === '/api/auth/verify' && m === 'POST') { const b = await body(req, 5_000); return json(await D.verifyPassword(me.parent.id, b.password, token)); }
  if (path === '/api/auth/lock' && m === 'POST') return json(await D.lockSession(token));
  if (path === '/api/auth/password' && m === 'POST') { const b = await body(req, 5_000); return json(await D.changePassword(me.parent.id, b.old, b.new)); }

  // Família: crianças, responsáveis, uso, convite para outro responsável, exportar e apagar
  if (path === '/api/family' && m === 'GET') return json({ parents: await D.familyParents(familyId), usage: await D.familyUsage(familyId) });
  if (path === '/api/family/children' && m === 'POST') { const b = await body(req, 5_000); return json(await D.addChild(familyId, b)); }
  const chM = path.match(/^\/api\/family\/children\/([A-Za-z0-9_-]+)(\/unlock)?$/);
  if (chM && m === 'PATCH') { const b = await body(req, 5_000); return json(await D.updateChild(familyId, chM[1], b)); }
  if (chM && m === 'POST' && chM[2]) { const b = await body(req, 2_000); return json(await D.unlockChild(familyId, chM[1], b.pin)); }
  if (chM && m === 'DELETE' && !chM[2]) {
    const b = await body(req, 5_000);
    if (!(await D.verifyPassword(me.parent.id, b.password)).ok) throw new HttpError(401, 'Senha incorreta.');
    await D.deleteChild(familyId, chM[1]);
    await childStore(env, chM[1]).reset();
    return json({ ok: true });
  }
  if (path === '/api/family/invite-parent' && m === 'POST') {
    const r = await D.createInvite(me.parent.id, { kind: 'join', familyId });
    return json({ link: `${url.origin}/?convite=${r.token}`, expires: r.expires });
  }
  if (path === '/api/family/export' && m === 'GET') {
    const out = { family: me.family.name, exportedAt: new Date().toISOString(), children: [] };
    for (const c of me.children) out.children.push({ ...c, data: await childStore(env, c.id).load() });
    return json(out);
  }
  if (path === '/api/family' && m === 'DELETE') {
    const b = await body(req, 5_000);
    if (!(await D.verifyPassword(me.parent.id, b.password)).ok) throw new HttpError(401, 'Senha incorreta.');
    const r = await D.deleteFamily(familyId);
    for (const id of r.childIds) await childStore(env, id).reset();
    return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }
  // 💬 Dúvida / sugestão / problema: grava no Directory e, se houver RESEND_API_KEY, manda e-mail ao atendimento
  if (path === '/api/feedback' && m === 'POST') {
    const b = await body(req, 12_000);
    const kind = ['duvida', 'sugestao', 'problema'].includes(b.kind) ? b.kind : 'duvida';
    const text = String(b.text || '').trim().slice(0, 2000);
    if (text.length < 3) throw new HttpError(400, 'Escreva a sua mensagem.');
    const child = b.childId ? me.children.find(c => c.id === b.childId) : null;
    const who = child ? `${child.name} (criança, perfil aberto por ${me.parent.name})` : `${me.parent.name} (responsável)`;
    const r = await D.feedbackAdd({ familyId, parentId: me.parent.id, childId: child ? child.id : null, who, kind, text, screen: b.screen, version: b.version, userAgent: req.headers.get('user-agent') });
    let emailed = false;
    if (env.RESEND_API_KEY && r.canEmail) {
      try { emailed = await sendFeedbackEmail(env, r, { kind, text, who, family: r.familyName, email: me.parent.email, screen: b.screen, version: b.version }); if (emailed) await D.feedbackEmailed(r.id); }
      catch (e) { console.error('feedback email', e); }
    }
    return json({ ok: true, id: r.id, emailed });
  }
  if (path === '/api/report' && m === 'POST') { const b = await body(req, 10_000); return json(await D.report(familyId, b.childId, b.kind, b.text)); }

  // Dados de cada criança (só da própria família)
  const stM = path.match(/^\/api\/children\/([A-Za-z0-9_-]+)\/state$/);
  if (stM) {
    need(me.children.some(c => c.id === stM[1]));
    const S = childStore(env, stM[1]);
    if (m === 'GET') return json({ state: await S.load() });
    if (m === 'PUT') {
      const b = await body(req, 3_000_000);
      if (!b.state || typeof b.state !== 'object') throw new HttpError(400, 'Estado inválido.');
      const r = await S.save(b.state, Number(b.baseRev) || 0);
      return json(r, r.ok ? 200 : 409);
    }
    if (m === 'DELETE') return json(await S.reset());
  }

  // 💌 Recadinhos: listar/criar/apagar só com a área dos pais desbloqueada (senha); a criança só vê ao comprar
  const ntM = path.match(/^\/api\/children\/([A-Za-z0-9_-]+)\/notes(?:\/([A-Za-z0-9_-]+))?$/);
  if (ntM) {
    need(me.children.some(c => c.id === ntM[1]));
    const N = childStore(env, ntM[1]); const sub = ntM[2];
    if (sub === 'status' && m === 'GET') return json({ available: await N.notesAvailable() });
    if (sub === 'open' && m === 'POST') { const r = await N.notesOpen(); if (r.err) throw new HttpError(404, r.err); return json(r); }
    if (!me.unlocked) throw new HttpError(403, 'Digite a senha da área dos pais de novo.');
    if (!sub && m === 'GET') return json({ notes: await N.notes() });
    if (!sub && m === 'POST') {
      const b = await body(req, 10_000);
      const text = String(b.text || '').replace(/\s+$/g, '').slice(0, 1000);
      if (!text.trim()) throw new HttpError(400, 'Escreva o recadinho.');
      const r = await N.notesAdd(text, String(me.parent.name || '').slice(0, 40)); if (r.err) throw new HttpError(400, r.err); return json(r);
    }
    if (sub && m === 'DELETE') { const r = await N.notesDelete(sub); if (r.err) throw new HttpError(400, r.err); return json(r); }
  }

  // Claude (sempre em nome de uma criança da família, com limite de gasto)
  const aiM = path.match(/^\/api\/ai\/([a-z-]+)$/);
  if (aiM && m === 'POST' && AI_HANDLERS[aiM[1]]) {
    const b = await body(req);
    const child = me.children.find(c => c.id === b.childId);
    need(child);
    b.name = child.name; b.yearId = YEAR_LABELS[child.year] ? child.year : 'Y5'; b.year = YEAR_LABELS[b.yearId];
    b.mine = (Array.isArray(b.mine) ? b.mine : []).filter(x => SUBJECT_IDS.includes(x)).slice(0, 30);
    b.levels = Object.fromEntries(Object.entries(b.levels && typeof b.levels === 'object' ? b.levels : {}).filter(([k, v]) => SUBJECT_IDS.includes(k) && (v === 'HL' || v === 'SL')));
    return json(await AI_HANDLERS[aiM[1]](env, b, { familyId, childId: child.id }));
  }

  // 🪄 Currículo de referência (varinha mágica): a semana letiva de cada matéria
  if (path === '/api/curriculum' && m === 'GET') {
    const C = await curriculum(env, url);
    const year = String(url.searchParams.get('year') || '').slice(0, 4);
    const week = Math.max(1, Math.min(37, Number(url.searchParams.get('week')) || 1));
    const subjects = String(url.searchParams.get('subjects') || '').split(',').filter(Boolean).slice(0, 30).map(x => { const [subject, level] = x.split(':'); return { subject, level: level === 'hl' || level === 'sl' ? level : '' }; });
    if (!/^Y\d{1,2}$/.test(year)) throw new HttpError(400, 'Ano escolar inválido.');
    return json({ year, week, rows: await C.week(year, week, subjects) });
  }

  // Administrador
  if (path.startsWith('/api/admin/')) {
    need(isAdmin);
    if (path === '/api/admin/overview' && m === 'GET') return json({ ...(await D.adminOverview()), monthCap: Number(env.MONTHLY_USD || 40), childCap: Number(env.CHILD_DAILY_USD || 0.5) });
    if (path === '/api/admin/invites' && m === 'POST') {
      const b = await body(req, 5_000);
      const r = await D.createInvite(me.parent.id, { kind: 'family', note: b.note });
      return json({ link: `${url.origin}/?convite=${r.token}`, expires: r.expires });
    }
    const rvM = path.match(/^\/api\/admin\/invites\/([a-f0-9]{12})$/);
    if (rvM && m === 'DELETE') return json(await D.revokeInvite(rvM[1]));
    if (path === '/api/admin/reset-link' && m === 'POST') {
      const b = await body(req, 2_000);
      const p = await D.parentById(b.parentId);
      if (!p) throw new HttpError(404, 'Responsável não encontrado.');
      const r = await D.createInvite(me.parent.id, { kind: 'reset', parentId: p.id });
      return json({ link: `${url.origin}/?redefinir=${r.token}`, expires: r.expires });
    }
    const fM = path.match(/^\/api\/admin\/families\/([A-Za-z0-9_-]+)$/);
    if (fM && m === 'PATCH') { const b = await body(req, 2_000); return json(await D.setFamily(fM[1], b)); }
    if (fM && m === 'DELETE') {
      need(fM[1] !== familyId);
      const r = await D.deleteFamily(fM[1]);
      for (const id of r.childIds) await childStore(env, id).reset();
      return json({ ok: true });
    }
    if (path === '/api/admin/curriculum' && m === 'GET') {
      const C = await curriculum(env, url);
      const y = url.searchParams.get('year');
      if (!y) return json(await C.stats());
      if (!url.searchParams.get('subject')) return json({ subjects: await C.subjectsFor(y) });
      return json({ row: await C.get(y, url.searchParams.get('subject'), url.searchParams.get('level') || '', Number(url.searchParams.get('week')) || 1) });
    }
    if (path === '/api/admin/curriculum/seed' && m === 'POST') return json(await seedCurriculum(env, url, true));
    if (path === '/api/admin/curriculum' && m === 'PUT') {
      const b = await body(req, 20_000);
      const r = await env.CURRICULUM.get(env.CURRICULUM.idFromName('curriculum')).edit(String(b.year), String(b.subject), b.level || '', Number(b.week), b);
      if (r.err) throw new HttpError(404, r.err); return json(r);
    }
    if (path === '/api/admin/feedback' && m === 'GET') return json({ items: await D.feedbackList(url.searchParams.get('all') === '1'), resend: !!env.RESEND_API_KEY });
    const fbM = path.match(/^\/api\/admin\/feedback\/(\d+)$/);
    if (fbM && m === 'POST') { const b = await body(req, 1_000); return json(await D.feedbackResolve(fbM[1], b.resolved !== false)); }
    if (path === '/api/admin/settings' && m === 'GET') return json(await D.settings());
    if (path === '/api/admin/settings' && m === 'PUT') { const b = await body(req, 2_000); if (b.support_email !== undefined) await D.setSetting('support_email', String(b.support_email).trim()); return json(await D.settings()); }
    const rpM = path.match(/^\/api\/admin\/reports\/(\d+)$/);
    if (rpM && m === 'POST') return json(await D.resolveReport(rpM[1]));
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

/* E-mail do feedback pela API do Resend (o workers.dev não tem domínio próprio para o Email Routing) */
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function sendFeedbackEmail(env, r, d) {
  const label = { duvida: 'Dúvida', sugestao: 'Sugestão', problema: 'Problema' }[d.kind];
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
    <h2 style="margin:0 0 8px">💬 ${escHtml(label)} — Estudos com a Lumi</h2>
    <p style="white-space:pre-wrap;background:#f7f4ff;border-radius:8px;padding:12px">${escHtml(d.text)}</p>
    <p style="color:#555;font-size:12px">Família: ${escHtml(d.family)} · De: ${escHtml(d.who)} · Responsável: ${escHtml(d.email)}<br>Tela: ${escHtml(d.screen)} · Versão: ${escHtml(d.version)} · Mensagem #${escHtml(r.id)}</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM || 'Estudos com a Lumi <onboarding@resend.dev>', to: [r.supportEmail], reply_to: d.email || undefined,
      subject: `[Lumi] ${label}: ${String(d.text).replace(/\s+/g, ' ').slice(0, 60)}`, html }),
  });
  if (!res.ok) console.error('resend', res.status, await res.text().catch(() => ''));
  return res.ok;
}

/* Currículo: carrega os JSON publicados (public/curriculum) no SQLite na primeira vez e quando a versão muda */
async function seedCurriculum(env, url, force) {
  const C = env.CURRICULUM.get(env.CURRICULUM.idFromName('curriculum'));
  const idx = await (await env.ASSETS.fetch(new URL('/curriculum/index.json', url.origin))).json().catch(() => null);
  if (!idx) throw new HttpError(500, 'Arquivos do currículo não encontrados.');
  const st = await C.stats();
  if (!force && st.version === idx.version && st.rows > 0) return { ok: true, skipped: true, ...st };
  let rows = 0;
  for (const stage of Object.keys(idx.stages)) {
    const files = await (await env.ASSETS.fetch(new URL(`/curriculum/${stage}.json`, url.origin))).json();
    rows += (await C.seed(files, null)).rows;
  }
  await C.seed([], idx.version);
  return { ok: true, rows, ...(await C.stats()) };
}
async function curriculum(env, url) {
  const C = env.CURRICULUM.get(env.CURRICULUM.idFromName('curriculum'));
  const st = await C.stats();
  if (!st.rows) await seedCurriculum(env, url, false);   // primeira vez: carrega sozinho
  return C;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); }
      catch (e) {
        const status = e && Number.isInteger(e.status) ? e.status : 500;
        if (status === 500) console.error(e);
        return json({ error: (e && e.message) || 'Erro no servidor.' }, status);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
