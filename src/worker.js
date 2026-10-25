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
     GOOGLE_TTS_API_KEY (opcional) voz natural da Lumi (Google Cloud Text-to-Speech); sem ela, o app usa a voz do aparelho
   ========================================================================= */
import { DurableObject } from 'cloudflare:workers';
import { Directory, AppError } from './directory.js';
import { Curriculum } from './curriculum.js';
import { Bank } from './bank.js';
import { Tts } from './tts.js';
import { BANK_CURRICULUM, BANK_READ_IDS, READ_LEVELS as BANK_READ_LEVELS, qKey, bookKey, fileOf, cleanQuestion, chapterDone, BOOK_CHAPTERS } from './bank-format.js';
export { Directory, Curriculum, Bank, Tts };

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
const PRIMARY_IDS = ['pt', 'pt_ort', 'pt_leit', 'bss', 'en', 'en_read', 'en_spell', 'ipc', 'math'];   // (Guided Reading saiu do app)
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
// Modelo por etapa: do Y1 até o ano escolhido no painel de admin (💳, "easy_max_year"; sem escolha, EASY_MAX_YEAR do wrangler)
// as perguntas e os livros usam o modelo barato (MODEL_EASY, Haiku); os outros anos usam o MODEL_PLAN (Sonnet). 0 = tudo no Sonnet.
let EASY_CACHE = null;   // { v, t } — evita ler o Directory a cada chamada (vale por 60 s nesta instância)
async function easyMaxYear(env) {
  if (EASY_CACHE && Date.now() - EASY_CACHE.t < 60_000) return EASY_CACHE.v;
  let v = Number(env.EASY_MAX_YEAR ?? 0);
  try { const s = await dir(env).getSetting('easy_max_year', null); if (s !== null && s !== '') v = Number(s); } catch { /* mantém o padrão */ }
  if (!Number.isFinite(v)) v = 0;
  EASY_CACHE = { v, t: Date.now() };
  return v;
}
const genModel = async (env, b) => yearNum(b) <= await easyMaxYear(env)
  ? (env.MODEL_EASY || env.MODEL_FAST || 'claude-haiku-5-5')
  : (env.MODEL_PLAN || 'claude-sonnet-5-5');
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
    if (l.length >= 300) return { err: 'Secret note limit reached.' };
    const n = { id: crypto.randomUUID().slice(0, 12), text, from, createdAt: new Date().toISOString(), openedAt: null };
    l.push(n); await this.ctx.storage.put('notes', l); return { note: n };
  }
  async notesDelete(id) {
    const l = await this.notes(); const n = l.find(x => x.id === id);
    if (!n) return { err: 'Secret note not found.' };
    if (n.openedAt) return { err: 'This secret note has already been opened.' };
    await this.ctx.storage.put('notes', l.filter(x => x.id !== id)); return { ok: true };
  }
  async notesAvailable() { return (await this.notes()).filter(n => !n.openedAt).length; }
  async notesOpen() {
    const l = await this.notes(); const un = l.filter(n => !n.openedAt);
    if (!un.length) return { err: 'No secret notes available.' };
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
  if (len > max) throw new HttpError(413, 'Upload too large.');
  try { return await req.json(); } catch { throw new HttpError(400, 'Invalid JSON.'); }
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
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'The Claude API key has not been set up on the server.');
  const childCap = Number(env.CHILD_DAILY_USD || 0.5), monthCap = Number(env.MONTHLY_USD || 40);
  const ok = await dir(env).aiCheck(ctx.familyId, ctx.childId, childCap, monthCap);
  if (!ok.ok) throw new HttpError(429, ok.why === 'child'
    ? 'Lumi has worked really hard today! This child’s daily limit has been reached. It opens up again tomorrow. 🦉'
    : 'The app’s monthly usage limit has been reached. Please let the administrator know.');
  // Streaming: a conexão recebe dados o tempo todo e não cai por tempo esgotado (erro 524) em respostas longas.
  const reqBody = JSON.stringify({
    model, max_tokens: maxTokens, system: system + CHILD_SAFETY, stream: true,
    messages: [{ role: 'user', content }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  });
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(`${env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST', body: reqBody,
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    });
    if (res.ok || ![429, 500, 502, 503, 504, 524, 529].includes(res.status) || attempt) break;
    await res.text().catch(() => '');
    await new Promise(r => setTimeout(r, 1500));   // uma nova tentativa para sobrecarga/instabilidade
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let msg = raw.slice(0, 300);
    try { msg = JSON.parse(raw).error?.message || msg; } catch { /* mantém texto */ }
    throw new HttpError(502, `Claude replied ${res.status}: ${msg}`);
  }
  const data = await readStream(res);
  const u = data.usage || {};
  const [pin, pout] = PRICES[model] || [4, 20];
  const usd = ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) * pin / 1e6 + (u.output_tokens || 0) * pout / 1e6;
  await dir(env).aiRecord(ctx.familyId, ctx.childId, usd);
  if (data.stop_reason === 'refusal') throw new HttpError(502, 'Claude declined this request.');
  if (data.stop_reason === 'max_tokens') throw new HttpError(502, 'Claude’s answer was too long. Try with fewer questions.');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try { return JSON.parse(text); } catch { throw new HttpError(502, 'Claude’s answer came in an unexpected format.'); }
}

// Lê o stream SSE da API: junta só os pedaços de texto (ignora o raciocínio) e guarda uso e motivo de parada.
async function readStream(res) {
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', text = '', usage = {}, stop = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const ev = buf.slice(0, i); buf = buf.slice(i + 2);
      const k = ev.indexOf('data: '); if (k < 0) continue;
      const line = ev.slice(k + 6);
      if (line.includes('"text_delta"')) { const d = JSON.parse(line); text += d.delta.text; continue; }
      if (line.includes('_delta') && !line.includes('"message_delta"')) continue;   // raciocínio/outros pedaços
      const d = JSON.parse(line);
      if (d.type === 'message_start') usage = Object.assign({}, d.message && d.message.usage);
      else if (d.type === 'message_delta') { if (d.usage) Object.assign(usage, d.usage); if (d.delta && d.delta.stop_reason) stop = d.delta.stop_reason; }
      else if (d.type === 'error') throw new HttpError(502, `Claude replied with an error: ${(d.error && d.error.message) || 'unknown'}`);
    }
  }
  return { content: [{ type: 'text', text }], usage, stop_reason: stop };
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
    message: { type: 'string', description: 'Mensagem curta e animada da mascote Lumi para o estudante, in British English.' },
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
// Planejamento em duas etapas (rápido e sem tempo esgotado): 1) roteiro da semana; 2) cada dia em paralelo.
const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    topics: {
      type: 'array', description: 'Uma linha por matéria encontrada, com TODOS os detalhes necessários (listas de palavras completas, exemplos, fórmulas, livro/capítulo): as próximas etapas não verão as fotos.',
      items: { type: 'object', properties: { subject: { type: 'string', enum: SUBJECT_IDS }, summary: { type: 'string' } }, required: ['subject', 'summary'], additionalProperties: false },
    },
    message: { type: 'string', description: 'Mensagem curta e animada da mascote Lumi para o estudante, in British English.' },
    focus: {
      type: 'array', description: 'Para cada dia, o subtema de cada matéria (variando ao longo da semana).',
      items: { type: 'object', properties: { day: { type: 'string', enum: DOWS },
        items: { type: 'array', items: { type: 'object', properties: { subject: { type: 'string', enum: SUBJECT_IDS }, focus: { type: 'string' } }, required: ['subject', 'focus'], additionalProperties: false } } },
        required: ['day', 'items'], additionalProperties: false },
    },
    books: {
      type: 'array', description: 'Um livro original por idioma de leitura (vazia se não houver leitura diária).',
      items: { type: 'object', properties: {
        subject: { type: 'string', enum: READ_IDS }, title: { type: 'string' }, premise: { type: 'string', description: 'Personagens, cenário e tom (2–3 frases).' },
        chapters: { type: 'array', items: { type: 'object', properties: { day: { type: 'string', enum: DOWS }, title: { type: 'string' }, synopsis: { type: 'string', description: 'O que acontece no capítulo (2–3 frases), com gancho para o próximo.' } }, required: ['day', 'title', 'synopsis'], additionalProperties: false } },
      }, required: ['subject', 'title', 'premise', 'chapters'], additionalProperties: false },
    },
  },
  required: ['topics', 'message', 'focus', 'books'],
  additionalProperties: false,
};
const DAY_SCHEMA = {
  type: 'object',
  properties: {
    questions: { type: 'array', items: qSchema(false) },
    passage: { type: 'object', description: 'O capítulo do dia (título e texto vazios se o dia não tiver leitura).', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'], additionalProperties: false },
  },
  required: ['questions', 'passage'],
  additionalProperties: false,
};
const POOL_SCHEMA = {
  type: 'object',
  properties: {
    days: { type: 'array', description: 'Uma entrada por dia pedido, com as perguntas desse dia.',
      items: { type: 'object', properties: { day: { type: 'string', enum: DOWS }, questions: { type: 'array', items: qSchema(false) } }, required: ['day', 'questions'], additionalProperties: false } },
    spare: { type: 'array', items: qSchema(false), description: 'Perguntas extras da semana (outros ângulos do assunto), para extras, revisão e desafios.' },
  },
  required: ['days', 'spare'], additionalProperties: false,
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
    questions: { type: 'array', items: qSchema(false), description: 'Na quantidade pedida: nunca peça resumo do capítulo; no máximo 1 "open" curta de inferência ou opinião ("Por que…?", "Como você acha que…?" / "Why…?", "How do you think…?"), as demais de compreensão ("mc" ou "short"), das mais literais às de inferência.' },
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
          note: { type: 'string', description: 'Comentário curto e gentil, no idioma da pergunta (português do Brasil nas matérias em português; inglês britânico nas demais). Pode ser vazio.' },
        },
        required: ['number', 'read', 'verdict', 'note'],
        additionalProperties: false,
      },
    },
    message: { type: 'string', description: 'Mensagem curta e encorajadora da Lumi, in British English.' },
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
- No máximo 1 em cada 4 perguntas pode ser "open". Nunca peça para resumir ("Resuma…", "Summarise…").
- "short" só quando existe UMA resposta certa clara (ou poucas, todas listadas em "accept"). Completar lacunas com várias respostas possíveis (comparações como "brave as a ___", sinônimos, adjetivos, "dê um exemplo de…") vira "mc" com uma única opção certa, ou "open".
- "proof" (caça-erros, só em Ortografia/Spelling): em "text", um parágrafo curto e natural (35–60 palavras), adequado ao ano e no idioma da matéria, com EXATAMENTE 4 ou 5 palavras escritas errado.
  De preferência use as palavras da semana, com erros típicos (letras trocadas, faltando ou dobradas, acento errado; em inglês, erros comuns como ie/ei, letra muda, -tion/-sion).
  Cada palavra errada aparece uma única vez no texto; todo o resto do texto está 100% correto. Não marque os erros (nada de negrito ou aspas).
  "errors": lista {wrong, right}, em que "wrong" é a palavra exatamente como está no texto. "q": instrução curta, ex.: "Caça-erros: encontre e corrija as 5 palavras escritas errado." / "Spot the mistakes: find and fix the 5 misspelled words.". "answer": "errada → certa; …". "options" e "accept" vazios.
  Nos outros tipos, "text" fica vazio e "errors" é uma lista vazia.
- Perguntas de completar letras: o enunciado SEMPRE diz o que escrever — a PALAVRA INTEIRA (ex.: "Complete e escreva a palavra inteira: ca_ _orro" / "Fill in the missing letters and write the whole word: fr_ _nd"); "answer" = a palavra inteira.
- Em Ortografia/Spelling use as palavras da semana: completar letras que faltam (escrevendo a palavra inteira), escolher a grafia correta, desembaralhar letras, escrever uma frase com a palavra.
- Em leitura/literatura, se não houver o texto, faça perguntas de compreensão que funcionem para quem leu (de preferência "open" curtas) e algumas sobre vocabulário/gramática ligadas ao tema.
- "hint" ajuda a pensar, nunca contém a resposta.
- Não repita perguntas iguais ou quase iguais.`;
}

async function handlePlan(env, b, ctx) {
  const days = (b.days || []).filter(d => DOWS.includes(d.dow) && d.n > 0);
  const LEVELS = { below: 'mais fácil (cerca de 1 ano abaixo)', at: 'no nível do ano', above: 'acima (cerca de 1 ano acima)', way: 'bem acima (cerca de 2 anos acima)' };
  days.forEach(d => { d.read = d.read && READ_IDS.includes(d.read.subject) ? { subject: d.read.subject, level: LEVELS[d.read.level] || LEVELS.at } : null; });
  const reading = days.some(d => d.read);
  if (!days.length) throw new HttpError(400, 'No days with questions.');
  const total = days.reduce((a, d) => a + d.n, 0);
  const images = (b.images || []).slice(0, 4);
  const text = String(b.text || '').slice(0, 6000);
  if (!text.trim() && !images.length) throw new HttpError(400, 'Tell me what you’re learning (or send a photo).');
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
   - Nesse dia, EXATAMENTE 3 perguntas dessa matéria são sobre o capítulo ("mc" ou "short", começando com "No capítulo…"/"In the chapter…"; nunca peça resumo). Essas 3 contam no total do dia.` : 'Sem leitura diária nesta semana: "passages" vazia. Em leitura, se não houver texto, siga a regra normal de leitura.'}
7. "message": 1–2 frases da Lumi (corujinha) animando o estudante, in British English.` },
  ];
  const out = await claude(env, ctx, {
    model: env.MODEL_PLAN || 'claude-sonnet-5-5', effort: env.EFFORT_PLAN || 'medium',
    system: studentProfile(b.name, b.year, b.mine, yearNum(b), b.levels), content, schema: PLAN_SCHEMA, maxTokens: 32000,
  });
  return out;
}

const READ_LEVELS_TXT = { below: 'mais fácil (cerca de 1 ano abaixo)', at: 'no nível do ano', above: 'acima (cerca de 1 ano acima)', way: 'bem acima (cerca de 2 anos acima)' };
async function handlePlanOutline(env, b, ctx) {
  const days = (b.days || []).filter(d => DOWS.includes(d.dow) && d.n > 0);
  if (!days.length) throw new HttpError(400, 'No days with questions.');
  days.forEach(d => { d.read = d.read && READ_IDS.includes(d.read.subject) ? { subject: d.read.subject, level: READ_LEVELS_TXT[d.read.level] || READ_LEVELS_TXT.at } : null; });
  const images = (b.images || []).slice(0, 4);
  const text = String(b.text || '').slice(0, 6000);
  if (!text.trim() && !images.length) throw new HttpError(400, 'Tell me what you’re learning (or send a photo).');
  const reading = days.filter(d => d.read);
  const content = [
    ...images.flatMap((img, i) => [{ type: 'text', text: `Foto ${i + 1} (material da escola):` }, { type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data } }]),
    { type: 'text', text: `O que o estudante (ou os pais) escreveu sobre a semana na escola, por matéria:
"""
${text || '(sem texto — use as fotos)'}
"""
${b.previous ? `\nTópicos da semana anterior (para revisão leve, opcional): ${String(b.previous).slice(0, 800)}` : ''}

Dias da semana com tarefa: ${days.map(d => `${d.dow} (${d.label || d.dow})${d.read ? ` · leitura do dia: ${d.read.subject}` : ''}`).join('; ')}.

Tarefa (é só o ROTEIRO; as perguntas serão criadas depois, dia a dia):
1. "topics": uma linha por matéria citada, no idioma da matéria, com os detalhes necessários para criar exercícios sem ver as fotos. Corrija erros de digitação óbvios (ex.: "surfs" = surds).
   Ortografia/Spelling — respeite o [modo]: "lista de palavras" = use exatamente as dadas; "tema" ou "a Lumi escolhe" = escolha 8–10 palavras adequadas ao ano e liste todas em "topics".
2. "focus": para cada dia acima, um subtema curto de CADA matéria citada, variando ao longo da semana (sem repetir a mesma ideia).
3. ${reading.length ? `"books": um livro original por matéria de leitura (${[...new Set(reading.map(d => d.read.subject))].join(', ')}), com título, premissa e um capítulo por dia em que essa matéria é a leitura do dia (${reading.map(d => `${d.dow}: ${d.read.subject}`).join(', ')}). Cada capítulo continua o anterior do mesmo livro (personagens fixos, gancho no fim). Se o estudante citou um livro, autor ou tema, inspire-se sem copiar.` : '"books": lista vazia (sem leitura diária).'}
4. "message": 1–2 frases da Lumi animando o estudante, in British English.` },
  ];
  return claude(env, ctx, {
    model: env.MODEL_PLAN || 'claude-sonnet-5-5', effort: 'low',
    system: studentProfile(b.name, b.year, b.mine, yearNum(b), b.levels), content, schema: OUTLINE_SCHEMA, maxTokens: 8000,
  });
}
async function handlePlanDay(env, b, ctx) {
  const d = b.day || {};
  if (!DOWS.includes(d.dow) || !(d.n > 0)) throw new HttpError(400, 'Invalid day.');
  const n = Math.max(1, Math.min(40, Number(d.n)));
  const yn = yearNum(b);
  const read = d.read && READ_IDS.includes(d.read.subject) ? d.read : null;
  const rn = read ? Math.max(6, Math.min(8, Number(read.n) || 7)) : 0;   // perguntas sobre o texto do dia
  const per = Math.max(1, Math.min(6, Number(b.perSubject) || 2));          // perguntas por tema
  const readingOnly = !!(b.readingOnly && read);   // as matérias vêm do banco da semana (plan-pool); aqui só o capítulo
  const topics = (b.topics || []).slice(0, 30).map(t => `- ${t.subject}: ${String(t.summary || '').slice(0, 600)}`).join('\n');
  const focus = (b.focus || []).slice(0, 30).map(f => `- ${f.subject}: ${String(f.focus || '').slice(0, 200)}`).join('\n');
  const spell = (b.topics || []).some(t => ['pt_ort', 'en_spell'].includes(t.subject));
  const readBlock = read ? `- LEITURA DO DIA (${read.subject}, nível: ${READ_LEVELS_TXT[read.level] || READ_LEVELS_TXT.at}): escreva em "passage" o capítulo de hoje do livro "${String(b.book && b.book.title || '').slice(0, 120)}".
  Premissa: ${String(b.book && b.book.premise || '').slice(0, 600)}
  ${b.book && b.book.before && b.book.before.length ? `Capítulos anteriores: ${b.book.before.slice(-6).map(c => `${c.title}: ${c.synopsis}`).join(' | ').slice(0, 1500)}` : 'É o primeiro capítulo.'}
  Capítulo de hoje: "${String(b.book && b.book.chapter && b.book.chapter.title || '').slice(0, 120)}" — ${String(b.book && b.book.chapter && b.book.chapter.synopsis || '').slice(0, 500)}
  "title": "Nome do livro — Capítulo N: título". Tamanho: ${yn <= 2 ? '120–200' : yn <= 6 ? '250–400' : '400–600'} palavras, no idioma da matéria, parágrafos separados por \n.
  EXATAMENTE ${rn} das perguntas são sobre o capítulo (subject ${read.subject}), começando com "No capítulo…"/"In the chapter…": nunca peça resumo do capítulo; no máximo 1 "open" curta de inferência ou opinião ("Por que…?", "Como você acha que…?" / "Why…?", "How do you think…?"), as demais de compreensão ("mc" ou "short"), das mais literais às de inferência.` : '- Sem leitura hoje: "passage" com título e texto vazios.';
  const content = [{ type: 'text', text: readingOnly ? `Hoje é ${d.label || d.dow}. Crie EXATAMENTE ${rn} perguntas, TODAS sobre o capítulo de hoje (as outras matérias já estão prontas).
${readBlock}` : `Assuntos da semana (por matéria):
${topics || '(sem assuntos)'}
${b.modes ? `\nModos escolhidos: ${String(b.modes).slice(0, 600)}` : ''}

Hoje é ${d.label || d.dow}. Subtema de hoje em cada matéria:
${focus || '(escolha um subtema de cada matéria)'}

Crie EXATAMENTE ${n} perguntas para hoje:
- EXATAMENTE ${per} pergunta${per > 1 ? 's' : ''} de CADA matéria listada acima${read ? `, mais as ${rn} do texto do dia` : ''}.
${spell ? '- Se houver Ortografia ou Spelling, inclua UMA pergunta "proof" (caça-erros) dessa matéria.\n' : ''}${readBlock}` }];
  return claude(env, ctx, {
    model: await genModel(env, b), effort: 'low',
    system: studentProfile(b.name, b.year, b.mine, yn, b.levels), content, schema: DAY_SCHEMA, maxTokens: 14000,
  });
}

// Banco da semana de UMA matéria personalizada: todas as perguntas dos dias numa chamada só (sem repetir entre dias)
// + perguntas extras para os extras, a revisão e os desafios da semana.
async function handlePlanPool(env, b, ctx) {
  const subject = String(b.subject || ''); if (!SUBJECT_IDS.includes(subject)) throw new HttpError(400, 'Invalid subject.');
  const days = (b.days || []).filter(d => DOWS.includes(d.dow)).slice(0, 7);
  if (!days.length) throw new HttpError(400, 'No days.');
  const per = Math.max(1, Math.min(6, Number(b.perDay) || 2));
  const spare = Math.max(0, Math.min(24, Number(b.spare) || 0));
  const spell = ['pt_ort', 'en_spell'].includes(subject);
  const content = [{ type: 'text', text: `Matéria: ${subject} — ${subjDesc(subject)}
Assunto da semana (do estudante/pais): ${String(b.summary || '').slice(0, 1500) || '(conteúdo típico do ano)'}
${b.modes ? `Modos escolhidos: ${String(b.modes).slice(0, 400)}\n` : ''}
Crie o BANCO DE PERGUNTAS DA SEMANA desta matéria, de uma vez, para explorar o assunto por inteiro ao longo da semana:
${days.map(d => `- ${d.dow} (${d.label || d.dow}): EXATAMENTE ${per} pergunta${per > 1 ? 's' : ''} — subtema do dia: ${String(d.focus || '(escolha um subtema diferente dos outros dias)').slice(0, 200)}`).join('\n')}
- "spare": EXATAMENTE ${spare} perguntas extras sobre outros ângulos do mesmo assunto (fatos, causas e consequências, vocabulário, comparações, datas e lugares, aplicação), para revisão e desafios.

Regras:
- NENHUMA pergunta pode repetir outra, nem perguntar o mesmo fato com outras palavras (em dias diferentes ou no "spare"). Cada dia fica no seu subtema; varie os fatos cobrados.
- Comece a semana pelo mais fácil e vá aprofundando. Tipos variados ("mc", "short"${['math', 'fmath', 'phys', 'chem', 'sci'].some(x => subject.startsWith(x)) ? ', "num"' : ''}; no máximo 1 em cada 4 "open").
${spell ? '- Ortografia/Spelling: 1 "proof" (caça-erros) por dia, com as palavras da semana.\n' : ''}- Em "subject" use sempre "${subject}".
${b.repeatTopic ? '- ATENÇÃO: este assunto já foi estudado nas semanas anteriores. Aprofunde e traga fatos, exemplos e formatos NOVOS.\n' : ''}${Array.isArray(b.avoid) && b.avoid.length ? `- Já usadas nas semanas anteriores (não repita nem faça quase iguais):\n  - ${b.avoid.slice(0, 40).map(x => String(x).slice(0, 120)).join('\n  - ')}` : ''}` }];
  return claude(env, ctx, {
    model: await genModel(env, b), effort: 'low',
    system: studentProfile(b.name, b.year, b.mine, yearNum(b), b.levels), content, schema: POOL_SCHEMA, maxTokens: 16000,
  });
}
async function handleMore(env, b, ctx) {
  const n = Math.max(1, Math.min(15, Number(b.n) || 5));  // (reforço também usa este limite)
  const subjects = (b.subjects || []).filter(s => SUBJECT_IDS.includes(s));
  const content = [{ type: 'text', text: `Assuntos da semana:
${String(b.topics || '').slice(0, 3000) || '(revisão geral do conteúdo do ano escolar)'}
${subjects.length ? `\nUse só estas matérias: ${subjects.join(', ')}.` : '\nMisture as matérias da semana.'}
${String(b.topics || '').trim() ? 'IMPORTANTE: as perguntas têm que ser sobre os ASSUNTOS DA SEMANA listados acima (os mesmos conteúdos, com outros exemplos, números e palavras). Não traga conteúdos que não estão na lista. Só se uma matéria pedida não tiver assunto listado, faça uma revisão do conteúdo típico dela para o ano escolar.' : 'Sem assuntos da semana: faça uma revisão do conteúdo típico de cada matéria para o ano escolar.'}
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
// Livro extra: um capítulo novo (continua o livro do estudante) + perguntas (sem pedir resumo à criança).
async function handleReading(env, b, ctx) {
  const lang = b.lang === 'en' ? 'en' : 'pt';
  const n = yearNum(b);
  const LEVELS = { below: 'mais fácil (cerca de 1 ano abaixo do ano dele)', at: 'no nível do ano dele', above: 'acima (cerca de 1 ano acima)', way: 'bem acima (cerca de 2 anos acima)' };
  const rn = Math.max(6, Math.min(8, Number(b.n) || 7));
  const prev = (Array.isArray(b.chapters) ? b.chapters : []).slice(-6).map((c, i) => `- ${String(c.title || '').slice(0, 120)}: ${String(c.summary || '').slice(0, 300)}`).join('\n');
  const content = [{ type: 'text', text: `Escreva o próximo capítulo de um livro original em ${LANG_NAME(lang)} para o estudante ler (${level(b)}).
${b.bookTitle && prev ? `É a continuação do livro "${String(b.bookTitle).slice(0, 120)}". Capítulos anteriores:\n${prev}\nMantenha personagens e mundo; avance a história e termine com um gancho.` : `Comece um livro novo${b.theme ? ` sobre: ${String(b.theme).slice(0, 200)}` : ''} (aventura, mistério, animais, amizade ou ciência — escolha algo envolvente para a idade). Este é o Capítulo 1.`}
Nível de leitura: ${LEVELS[b.level] || LEVELS.at}. Tamanho: ${n <= 2 ? '150–250' : n <= 6 ? '300–450' : '450–650'} palavras.
Depois, EXATAMENTE ${rn} pergunta${rn > 1 ? 's' : ''} (subject: ${lang === 'en' ? 'en_read' : 'pt_leit'}): nunca peça resumo do capítulo; no máximo 1 "open" curta de inferência ou opinião ("Por que…?", "Como você acha que…?" / "Why…?", "How do you think…?"), as demais de compreensão ("mc" ou "short"), das mais literais às de inferência.` }];
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
  if (!images.length) throw new HttpError(400, 'Send a photo of the sheet.');
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
Em "note", um comentário curto e gentil, no idioma da pergunta (português do Brasil nas matérias em português; inglês britânico nas demais): quando errada, diga a forma certa; nas livres, diga o que ficou bom e o que poderia melhorar. Se a foto não for desta folha ou estiver ilegível, legible=false.
Em "message", 1–2 frases encorajadoras da Lumi, in British English.` },
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
${x.expected ? `Resposta esperada pelo gabarito: ${String(x.expected).slice(0, 200)}\n` : ''}Resposta do estudante: ${String(x.answer || '').slice(0, 1200) || '(em branco)'}`).join('\n\n');
  const content = [{ type: 'text', text: `Corrija estas respostas livres de um estudante (${level(b)}).
${b.context ? `Contexto (assuntos da semana e texto lido): ${String(b.context).slice(0, 2500)}\n` : ''}
${list}

Para cada número: "ok" se responde à pergunta de forma correta e razoável para a idade (não exija perfeição nem ortografia impecável, a menos que a pergunta seja de ortografia/escrita); "bad" se está errada, fora do assunto, em branco ou incompleta demais.
Quando houver "resposta esperada", a do estudante não bateu com o gabarito: dê "ok" se ela também responde corretamente à pergunta (sinônimo, outra resposta válida quando a pergunta não restringe, forma equivalente, pequeno erro de digitação fora de ortografia); "bad" só se estiver errada.
"note": 1–2 frases gentis no idioma da pergunta, dizendo o que ficou bom e, se for o caso, o que faltou ou qual seria a ideia certa.` }];
  return claude(env, ctx, {
    model: env.MODEL_FAST || 'claude-haiku-5-5', effort: 'medium',
    system: 'Você corrige respostas de estudantes com justiça e carinho.', content, schema: OPEN_SCHEMA, maxTokens: 6000,
  });
}

/* ---------------- 🙋 Contestação: a criança acha que a correção automática errou ---------------- */
const CHALLENGE_SCHEMA = {
  type: 'object', properties: {
    verdict: { type: 'string', enum: ['right', 'wrong'], description: '"right" se a resposta do estudante deve ser aceita como correta; "wrong" se continua errada.' },
    explanation: { type: 'string', description: '1–3 frases curtas, gentis, no idioma pedido: por que está certa, ou qual é a ideia certa.' },
  }, required: ['verdict', 'explanation'], additionalProperties: false,
};
async function handleChallenge(env, b, ctx) {
  const lang = b.lang === 'pt' ? 'pt' : 'en';
  const spell = ['pt_ort', 'en_spell'].includes(b.subject);
  const content = [{ type: 'text', text: `A student (${level(b)}) disagrees with the automatic marking of this question. Decide fairly whether the student's answer should be ACCEPTED as correct.
Subject: ${String(b.subjectName || b.subject || '').slice(0, 80)}
Question (${String(b.type || '').slice(0, 10)}): ${String(b.q || '').slice(0, 800)}
${(b.options || []).length ? `Options: ${b.options.slice(0, 6).map(x => String(x).slice(0, 120)).join(' | ')}\n` : ''}Answer key: ${String(b.answer || '').slice(0, 300) || '(free answer)'}${(b.accept || []).length ? ` (also accepted: ${b.accept.slice(0, 8).join(', ')})` : ''}
Student's answer: ${String(b.given || '').slice(0, 600) || '(blank)'}
${b.why ? `Student's reason: ${String(b.why).slice(0, 300)}\n` : ''}${b.context ? `Context (text read / topics): ${String(b.context).slice(0, 2500)}\n` : ''}
Rules:
- Accept ("right") if the student's answer is correct or equivalent: same value in another format (e.g. 0.5 = 1/2, "7" = "seven"), a synonym that answers the question, a valid alternative interpretation of an ambiguous question, small typos in non-spelling subjects, or if the answer key itself is wrong.
- ${spell ? 'This is a SPELLING activity: the spelling (including accents) must be exactly right.' : 'Do not require perfect spelling unless the question is about spelling.'}
- Otherwise "wrong", and explain kindly what the right idea is (without making the student feel bad).
- Write "explanation" in ${lang === 'pt' ? 'Brazilian Portuguese' : 'British English'}, 1–3 short sentences.` }];
  return claude(env, ctx, { model: env.MODEL_PLAN || 'claude-sonnet-5-5', effort: 'low', system: 'You are Lumi, a fair and kind tutor who double-checks marking for school students.', content, schema: CHALLENGE_SCHEMA, maxTokens: 1500 });
}

/* ---------------- ⚡ Lumi's challenge: 1 pergunta difícil e objetiva (só quando o banco não tem nada) ---------------- */
const DARE_SCHEMA = {
  type: 'object', properties: {
    subject: { type: 'string', description: 'id da matéria (um dos ids pedidos)' },
    type: { type: 'string', enum: ['mc', 'short', 'num'] },
    q: { type: 'string', description: 'enunciado, autossuficiente, no idioma da matéria' },
    options: { type: 'array', items: { type: 'string' }, description: 'mc: 3–4 opções; outros tipos: []' },
    answer: { type: 'string', description: 'mc: idêntico a uma opção; short: 1–3 palavras; num: só o número' },
    accept: { type: 'array', items: { type: 'string' }, description: 'variações aceitas da resposta' },
    explanation: { type: 'string', description: '1–2 frases curtas explicando a resposta certa, no idioma da matéria' },
  }, required: ['subject', 'type', 'q', 'options', 'answer', 'accept', 'explanation'], additionalProperties: false,
};
async function handleDare(env, b, ctx) {
  const reading = b.mode === 'reading';
  const subs = (Array.isArray(b.subjects) ? b.subjects : b.mine).filter(x => SUBJECT_IDS.includes(x) && !BANK_READ_IDS.includes(x)).slice(0, 20);
  const lang = b.lang === 'pt' ? 'Brazilian Portuguese' : 'British English';
  const text = reading
    ? `Write ONE challenging comprehension question for a student (${level(b)}) about this short excerpt of today's reading text. It must be answerable from the excerpt alone (inference or vocabulary in context is great), objective (multiple choice "mc" or a 1–3 word "short" answer), and harder than a literal recall question.
Text: ${String(b.title || '').slice(0, 160)}
Excerpt:
${String(b.excerpt || '').slice(0, 1500)}
Use subject "${SUBJECT_IDS.includes(b.subject) ? b.subject : 'en_read'}". Write everything in ${lang}.`
    : `Write ONE hard but fair "challenge" question for a student (${level(b)}) on this week's school topics. Pick any one of these subjects: ${subs.map(id => `${id} = ${subjDesc(id)}`).join('; ')}.
This week's topics:
${String(b.topics || '').slice(0, 3000)}
Rules:
- Objective only: multiple choice ("mc", 3–4 short options, exactly one correct, "answer" identical to an option), a 1–3 word "short" answer, or "num" (number only) for maths/science.
- At the top of the student's year level ("stretch" difficulty), solvable in under 2 minutes without a text, picture or audio. Facts must be correct and verifiable.
- Write in the subject's language (Portuguese subjects in Brazilian Portuguese, the rest in British English).
- Do not repeat any of these recent questions: ${(Array.isArray(b.exclude) ? b.exclude : []).slice(-40).map(x => String(x).slice(0, 120)).join(' | ') || '(none)'}`;
  const r = await claude(env, ctx, { model: env.MODEL_PLAN || 'claude-sonnet-5-5', effort: 'low', system: 'You are Lumi, a playful tutor who writes short, accurate quiz questions for school students.', content: [{ type: 'text', text }], schema: DARE_SCHEMA, maxTokens: 1500 });
  const c = cleanQuestion(r, SUBJECT_IDS.includes(r.subject) ? r.subject : (subs[0] || 'math'));
  if (c.err || c.q.type === 'open' || c.q.type === 'proof') throw new HttpError(502, 'Lumi could not write a challenge right now.');
  return Object.assign(c.q, { explanation: String(r.explanation || '').slice(0, 400) });
}

/* ---------------- Banco de sugestões compartilhado ---------------- */
// O conteúdo criado aqui é reaproveitado por outras crianças do mesmo currículo/ano/semana.
// Por isso o prompt usa SÓ a linha do currículo de referência (nunca o texto, as fotos ou o nome da criança).
const bankStub = env => env.BANK.get(env.BANK.idFromName('bank'));
const bankLevel = (b, subject) => { const l = String(b.level || '').toLowerCase(); return l === 'hl' || l === 'sl' ? l : ''; };
const subjDesc = id => (SUBJECT_CATALOG.find(x => x[0] === id) || [id, id])[1];
const isPtSubj = id => id.startsWith('pt') || id === 'bss';
let BANK_INDEX = null, BANK_INDEX_AT = 0;
async function bankIndex(env, url) {
  if (BANK_INDEX && Date.now() - BANK_INDEX_AT < 60_000) return BANK_INDEX;
  try { const r = await env.ASSETS.fetch(new URL('/bank/index.json', url.origin)); BANK_INDEX = r.ok ? await r.json() : { files: {} }; }
  catch { BANK_INDEX = { files: {} }; }
  BANK_INDEX_AT = Date.now();
  return BANK_INDEX;
}
// Carrega no SQLite o arquivo publicado da semana (public/bank/uk/Y5/w12.json) quando é novo ou mudou.
async function bankEnsure(env, url, year, week) {
  const B = bankStub(env);
  const file = fileOf(BANK_CURRICULUM, year, week);
  const idx = await bankIndex(env, url);
  const h = idx.files && idx.files[file];
  if (h && (await B.loadedHash(file)) !== h) {
    const r = await env.ASSETS.fetch(new URL(`/bank/${file}.json`, url.origin));
    if (r.ok) await B.importFile(file, h, await r.json());
  }
  return B;
}
async function curriculumRow(env, url, year, subject, level, week) {
  const C = await curriculum(env, url);
  return (await C.get(year, subject, level, week)) || (level ? (await C.get(year, subject, 'sl', week)) || (await C.get(year, subject, '', week)) : null);
}
const rowTxt = row => row ? `Tópico: ${row.topic}
Tipo de semana: ${row.type === 'review' ? 'revisão' : row.type === 'exam' ? 'semana de provas (revisão para a prova)' : 'conteúdo novo'} (term ${row.term}, semana ${row.week_of_term} do term)
Objetivos: ${(row.objectives || []).join('; ')}
Palavras-chave: ${(row.keywords || []).join(', ')}${(row.spelling || []).length ? `\nPalavras da semana (ortografia): ${row.spelling.join(', ')}` : ''}` : '(sem linha no currículo: use o conteúdo típico desta matéria nesta altura do ano letivo)';
const SHARED_NOTE = `ATENÇÃO — BANCO COMPARTILHADO: este conteúdo será reutilizado por vários estudantes do mesmo ano e da mesma semana letiva.
Não use nomes de pessoas reais, nomes de escolas nem nada pessoal. Se precisar de personagens, invente nomes variados (brasileiros nas matérias em português, britânicos/internacionais nas em inglês).`;
const BANK_Q_SCHEMA = { type: 'object', properties: { questions: { type: 'array', items: qSchema(false) } }, required: ['questions'], additionalProperties: false };
async function handleBankFill(env, b, ctx) {
  const subject = String(b.subject || ''); if (!SUBJECT_IDS.includes(subject)) throw new HttpError(400, 'Invalid subject.');
  const level = bankLevel(b, subject); const week = Math.max(1, Math.min(37, Number(b.week) || 1));
  const row = await curriculumRow(env, ctx.url, b.yearId, subject, level, week);
  if (!row) throw new HttpError(404, 'Week not found in the reference curriculum.');
  const ckey = qKey(BANK_CURRICULUM, b.yearId, subject, level, week);
  const B = await bankEnsure(env, ctx.url, b.yearId, week);
  const n = Math.max(4, Math.min(30, Number(b.n) || 10));
  const avoid = (await B.recent(ckey, 80)).concat((Array.isArray(b.avoid) ? b.avoid : []).slice(0, 40).map(x => String(x).slice(0, 120)));
  const spell = (row.spelling || []).length > 0 || ['pt_ort', 'en_spell'].includes(subject);
  const content = [{ type: 'text', text: `${SHARED_NOTE}

Matéria: ${subject} — ${subjDesc(subject)}${level ? ` — IB ${level.toUpperCase()}` : ''}
Semana letiva ${week} do ano escolar, pelo currículo de referência:
${rowTxt(row)}

Crie EXATAMENTE ${n} perguntas desta matéria (campo "subject" = ${subject}) sobre o conteúdo desta semana:
- cubra todos os objetivos, das mais fáceis às mais difíceis, com tipos variados ("mc", "short", "num" quando fizer sentido; no máximo 1 em cada 4 "open");
${spell ? `- inclua 1 "proof" (caça-erros) a cada 6–8 perguntas, com as palavras da semana;
` : ''}- cada pergunta precisa funcionar sozinha, sem depender de outra.
${avoid.length ? `
Já existem no banco (não repita nem faça quase iguais):
- ${avoid.slice(0, 120).map(x => String(x).slice(0, 90)).join('\n- ')}` : ''}` }];
  const out = await claude(env, ctx, {
    model: await genModel(env, b), effort: 'low',
    system: studentProfile(null, YEAR_LABELS[b.yearId], [subject], yearNum(b), level ? { [subject]: level.toUpperCase() } : {}), content, schema: BANK_Q_SCHEMA, maxTokens: 16000,
  });
  const clean = (out.questions || []).map(q => cleanQuestion(q, subject)).filter(c => c.q).map(c => c.q);
  const stored = await B.addQuestions(ckey, subject, clean, 'api');
  return { questions: stored, topic: row.topic };
}
const BOOK_HEADER_SCHEMA = {
  type: 'object', properties: {
    title: { type: 'string' }, premise: { type: 'string', description: 'Personagens, cenário e tom (2–3 frases).' },
    chapters: { type: 'array', description: 'EXATAMENTE 7 capítulos.', items: { type: 'object', properties: { title: { type: 'string', description: 'Ex.: "Capítulo 1: A porta escondida".' }, synopsis: { type: 'string', description: 'O que acontece (2–3 frases).' } }, required: ['title', 'synopsis'], additionalProperties: false } },
  }, required: ['title', 'premise', 'chapters'], additionalProperties: false,
};
const CHAPTER_SCHEMA = {
  type: 'object', properties: {
    text: { type: 'string', description: 'O capítulo, em parágrafos separados por \n.' },
    questions: { type: 'array', items: qSchema(false), description: 'EXATAMENTE 8, sem pedir resumo: 1 "open" curta de inferência ou opinião e 7 de compreensão ("mc" ou "short"), das mais literais às de inferência.' },
  }, required: ['text', 'questions'], additionalProperties: false,
};
function bookArgs(b) {
  const subject = String(b.subject || ''); if (!BANK_READ_IDS.includes(subject)) throw new HttpError(400, 'Invalid reading subject.');
  const level = bankLevel(b, subject); const week = Math.max(1, Math.min(37, Number(b.week) || 1));
  const readLevel = BANK_READ_LEVELS.includes(b.readLevel) ? b.readLevel : 'at';
  return { subject, level, week, readLevel, ckey: bookKey(BANK_CURRICULUM, b.yearId, subject, level, week, readLevel), lang: isPtSubj(subject) ? 'pt' : 'en' };
}
async function handleBankBook(env, b, ctx) {
  const a = bookArgs(b);
  const B = await bankEnsure(env, ctx.url, b.yearId, a.week);
  const have = await B.book(a.ckey); if (have) return { book: Object.assign({ key: a.ckey }, have) };
  const row = await curriculumRow(env, ctx.url, b.yearId, a.subject, a.level, a.week);
  const content = [{ type: 'text', text: `${SHARED_NOTE}

Crie o ROTEIRO de um livro original em ${LANG_NAME(a.lang)} para a leitura diária (${YEAR_LABELS[b.yearId]}), com EXATAMENTE ${BOOK_CHAPTERS} capítulos.
- É uma série: cada capítulo é um episódio com começo, meio e fim (dá para ler sozinho), e a história avança de um capítulo para o outro (personagens fixos, um fio condutor, gancho leve no fim).
- Gênero envolvente para a idade (aventura, mistério, animais, amizade, ciência, fantasia…); nada de personagens de obras reais.
- Nível de leitura: ${READ_LEVELS_TXT[a.readLevel]}.
- Habilidade de leitura da semana (pelo currículo): ${row ? `${row.topic} — ${(row.objectives || []).join('; ')}` : 'compreensão e inferência'}. Planeje os capítulos para dar oportunidades de praticar essa habilidade.
- Em literatura (pt_lit/en_lit) a partir do IGCSE, pode ser uma sequência de contos ou crônicas originais com recursos literários para analisar.` }];
  const out = await claude(env, ctx, { model: await genModel(env, b), effort: 'low', system: studentProfile(null, YEAR_LABELS[b.yearId], [a.subject], yearNum(b), {}), content, schema: BOOK_HEADER_SCHEMA, maxTokens: 4000 });
  if ((out.chapters || []).length < BOOK_CHAPTERS) throw new HttpError(502, 'The book outline came back incomplete.');
  out.chapters = out.chapters.slice(0, BOOK_CHAPTERS);
  const book = await B.bookHeader(a.ckey, a.subject, out);
  if (!book) throw new HttpError(409, 'Book unavailable.');
  return { book: Object.assign({ key: a.ckey }, book) };
}
async function handleBankChapter(env, b, ctx) {
  const a = bookArgs(b); const idx = Math.max(0, Math.min(BOOK_CHAPTERS - 1, Number(b.idx) || 0));
  const B = await bankEnsure(env, ctx.url, b.yearId, a.week);
  const book = await B.book(a.ckey); if (!book) throw new HttpError(404, 'Book not found.');
  if (chapterDone(book.chapters[idx])) return { chapter: book.chapters[idx], title: book.title };
  const row = await curriculumRow(env, ctx.url, b.yearId, a.subject, a.level, a.week);
  const yn = yearNum(b);
  const c = book.chapters[idx];
  const content = [{ type: 'text', text: `${SHARED_NOTE}

Livro "${book.title}" (em ${LANG_NAME(a.lang)}). Premissa: ${book.premise}
Roteiro: ${book.chapters.map((x, i) => `${i + 1}. ${x.title} — ${x.synopsis}`).join(' | ')}

Escreva o capítulo ${idx + 1}: "${c.title}" — ${c.synopsis}
- Tamanho: ${yn <= 2 ? '120–200' : yn <= 6 ? '250–400' : '400–600'} palavras; nível de leitura ${READ_LEVELS_TXT[a.readLevel]}; parágrafos separados por \n.
- Um episódio com começo, meio e fim, que também funcione para quem não leu os anteriores (relembre em 1 frase o que for preciso).
- Depois, EXATAMENTE 8 perguntas (subject ${a.subject}), sem pedir resumo: 7 de compreensão (das mais literais às de inferência) e, por último, 1 "open" curta de inferência ou opinião ("mc" ou "short", começando com "${a.lang === 'pt' ? 'No capítulo…' : 'In the chapter…'}")${row ? `, praticando a habilidade da semana: ${row.topic}` : ''}.` }];
  const out = await claude(env, ctx, { model: await genModel(env, b), effort: 'low', system: studentProfile(null, YEAR_LABELS[b.yearId], [a.subject], yn, {}), content, schema: CHAPTER_SCHEMA, maxTokens: 6000 });
  const ch = await B.bookChapter(a.ckey, a.subject, idx, out);
  if (!ch) throw new HttpError(502, 'The chapter came back in an unexpected format.');
  return { chapter: ch, title: book.title };
}

/* ---------------- Roteador ---------------- */
const AI_HANDLERS = { dare: handleDare, challenge: handleChallenge, 'bank-fill': handleBankFill, 'bank-book': handleBankBook, 'bank-chapter': handleBankChapter, 'plan-outline': handlePlanOutline, 'plan-day': handlePlanDay, 'plan-pool': handlePlanPool, plan: handlePlan, more: handleMore, tutor: handleTutor, grade: handleGrade, explain: handleExplain, 'check-open': handleCheckOpen, lesson: handleLesson, reading: handleReading };

async function api(req, env, url) {
  const path = url.pathname, m = req.method;
  // Proteção contra requisições de outros sites: toda escrita precisa do cabeçalho do app.
  if (m !== 'GET' && req.headers.get('x-lumi') !== '1') throw new HttpError(403, 'Request refused.');
  const D = dir(env);

  if (path === '/api/health') {
    const st = await D.status();
    return json({ ok: true, version: appVersion(env), ai: !!env.ANTHROPIC_API_KEY, tts: !!env.GOOGLE_TTS_API_KEY, setup: st.accounts === 0, canSetup: !!env.FAMILY_CODE });
  }
  // Primeiro acesso: cria a conta do administrador e leva os dados antigos para o 1º perfil.
  if (path === '/api/setup' && m === 'POST') {
    const b = await body(req, 50_000);
    if (!env.FAMILY_CODE || !safeEqual(b.code, env.FAMILY_CODE)) throw new HttpError(401, 'Incorrect setup code.');
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
  if (!me) throw new HttpError(401, 'Session expired. Please log in again.');
  const familyId = me.family.id;
  const isAdmin = me.parent.role === 'admin';
  const need = cond => { if (!cond) throw new HttpError(403, 'Not allowed.'); };

  if (path === '/api/auth/me' && m === 'GET') return json({ parent: me.parent, family: { id: me.family.id, name: me.family.name }, children: me.children, ai: !!env.ANTHROPIC_API_KEY, tts: !!env.GOOGLE_TTS_API_KEY });
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
    if (!(await D.verifyPassword(me.parent.id, b.password)).ok) throw new HttpError(401, 'Incorrect password.');
    await D.deleteChild(familyId, chM[1]);
    await childStore(env, chM[1]).reset();
    return json({ ok: true });
  }
  const paM = path.match(/^\/api\/family\/parents\/([A-Za-z0-9_-]+)$/);
  if (paM && m === 'DELETE') {
    const b = await body(req, 5_000);
    if (!(await D.verifyPassword(me.parent.id, b.password)).ok) throw new HttpError(401, 'Incorrect password.');
    return json(await D.removeParent(familyId, paM[1], me.parent.id));
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
    if (!(await D.verifyPassword(me.parent.id, b.password)).ok) throw new HttpError(401, 'Incorrect password.');
    const r = await D.deleteFamily(familyId);
    for (const id of r.childIds) await childStore(env, id).reset();
    return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }
  // 💬 Dúvida / sugestão / problema: grava no Directory e, se houver RESEND_API_KEY, manda e-mail ao atendimento
  if (path === '/api/feedback' && m === 'POST') {
    const b = await body(req, 12_000);
    const kind = ['duvida', 'sugestao', 'problema'].includes(b.kind) ? b.kind : 'duvida';
    const text = String(b.text || '').trim().slice(0, 2000);
    if (text.length < 3) throw new HttpError(400, 'Please write your message.');
    const child = b.childId ? me.children.find(c => c.id === b.childId) : null;
    const who = child ? `${child.name} (child, profile opened by ${me.parent.name})` : `${me.parent.name} (parent)`;
    const r = await D.feedbackAdd({ familyId, parentId: me.parent.id, childId: child ? child.id : null, who, kind, text, screen: b.screen, version: b.version, userAgent: req.headers.get('user-agent') });
    let emailed = false;
    if (env.RESEND_API_KEY && r.canEmail) {
      try { emailed = await sendFeedbackEmail(env, r, { kind, text, who, family: r.familyName, email: me.parent.email, screen: b.screen, version: b.version, server: appVersion(env) }); if (emailed) await D.feedbackEmailed(r.id); }
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
      if (!b.state || typeof b.state !== 'object') throw new HttpError(400, 'Invalid state.');
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
    if (!me.unlocked) throw new HttpError(403, 'Please enter the Parents’ area password again.');
    if (!sub && m === 'GET') return json({ notes: await N.notes() });
    if (!sub && m === 'POST') {
      const b = await body(req, 10_000);
      const text = String(b.text || '').replace(/\s+$/g, '').slice(0, 1000);
      if (!text.trim()) throw new HttpError(400, 'Please write the secret note.');
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
    return json(await AI_HANDLERS[aiM[1]](env, b, { familyId, childId: child.id, url }));
  }

  // 🔊 Voz natural da Lumi (Google Cloud Text-to-Speech), com os áudios guardados para reaproveitar
  if (path === '/api/tts' && m === 'POST') {
    const b = await body(req, 20_000);
    const child = me.children.find(c => c.id === b.childId); need(child);
    if (!env.GOOGLE_TTS_API_KEY) throw new HttpError(503, 'Natural voice is not set up.');
    const lang = b.lang === 'en' ? 'en' : 'pt';
    const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 1800);
    if (!text) throw new HttpError(400, 'Empty text.');
    const voice = await ttsVoice(env, lang);
    const k = await sha256hex(`${voice.name}|${text}`);
    const T = env.TTS.get(env.TTS.idFromName('tts'));
    let audio = await T.get(k);
    if (!audio) {
      const ok = await D.aiCheck(familyId, child.id, Number(env.CHILD_DAILY_USD || 0.5), Number(env.MONTHLY_USD || 40));
      if (!ok.ok) throw new HttpError(429, 'Today’s usage limit has been reached.');
      const audioConfig = { audioEncoding: 'MP3' };
      if (!/Chirp/i.test(voice.name)) audioConfig.speakingRate = 0.95;
      const res = await fetch(`${env.TTS_BASE_URL || 'https://texttospeech.googleapis.com'}/v1/text:synthesize?key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { text }, voice: { languageCode: voice.lang, name: voice.name }, audioConfig }),
      });
      if (!res.ok) { const raw = await res.text().catch(() => ''); console.error('tts', res.status, raw.slice(0, 300)); throw new HttpError(502, `Natural voice unavailable (${res.status}).`); }
      const j = await res.json();
      audio = Uint8Array.from(atob(j.audioContent || ''), c => c.charCodeAt(0));
      await T.put(k, voice.name, text.length, audio);
      await D.aiRecord(familyId, child.id, text.length * (/Chirp/i.test(voice.name) ? 30 : 16) / 1e6);
    }
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=604800' } });
  }

  // 🏦 Banco de sugestões: sorteia perguntas e livros já prontos para a semana letiva (sem chamar o Claude)
  if (path === '/api/bank/draw' && m === 'POST') {
    const b = await body(req, 200_000);
    const child = me.children.find(c => c.id === b.childId); need(child);
    const year = YEAR_LABELS[child.year] ? child.year : 'Y5';
    const week = Math.max(1, Math.min(37, Number(b.week) || 1));
    const B = await bankEnsure(env, url, year, week);
    const keys = (Array.isArray(b.subjects) ? b.subjects : []).slice(0, 30).filter(x => SUBJECT_IDS.includes(x.subject))
      .map(x => ({ slot: x.subject + (bankLevel(x) ? '-' + bankLevel(x) : ''), ckey: qKey(BANK_CURRICULUM, year, x.subject, bankLevel(x), week), need: Math.max(0, Math.min(80, Number(x.need) || 0)) }));
    const books = (Array.isArray(b.books) ? b.books : []).slice(0, 4).filter(x => BANK_READ_IDS.includes(x.subject))
      .map(x => ({ subject: x.subject, ckey: bookKey(BANK_CURRICULUM, year, x.subject, bankLevel(x), week, x.readLevel) }));
    const exclude = (Array.isArray(b.exclude) ? b.exclude : []).slice(0, 600).map(String);
    const r = await B.draw(child.id + '|' + week, keys, books.map(x => x.ckey), exclude);
    return json({ year, week,
      questions: Object.fromEntries(keys.map(k => [k.slot, r.questions[k.ckey] || []])),
      have: Object.fromEntries(keys.map(k => [k.slot, r.have[k.ckey] || 0])),
      books: Object.fromEntries(books.map(x => [x.subject, r.books[x.ckey] ? Object.assign({ key: x.ckey }, r.books[x.ckey]) : null])) });
  }
  if (path === '/api/bank/report' && m === 'POST') {
    const b = await body(req, 5_000);
    const id = String(b.id || '').slice(0, 120); if (!id) throw new HttpError(400, 'Invalid item.');
    const r = await bankStub(env).report(id, familyId, isAdmin);
    await D.report(familyId, b.childId, 'banco', `Question bank item ${id}:${String(b.text || '').slice(0, 800)}`).catch(() => {});
    return json(r);
  }

  // 🪄 Currículo de referência (varinha mágica): a semana letiva de cada matéria
  if (path === '/api/curriculum' && m === 'GET') {
    const C = await curriculum(env, url);
    const year = String(url.searchParams.get('year') || '').slice(0, 4);
    const week = Math.max(1, Math.min(37, Number(url.searchParams.get('week')) || 1));
    const subjects = String(url.searchParams.get('subjects') || '').split(',').filter(Boolean).slice(0, 30).map(x => { const [subject, level] = x.split(':'); return { subject, level: level === 'hl' || level === 'sl' ? level : '' }; });
    if (!/^Y\d{1,2}$/.test(year)) throw new HttpError(400, 'Invalid school year.');
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
      if (!p) throw new HttpError(404, 'Parent not found.');
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
    if (path === '/api/admin/settings' && m === 'GET') return json(Object.assign(await D.settings(), { easy_default: Number(env.EASY_MAX_YEAR ?? 0) }));
    if (path === '/api/admin/settings' && m === 'PUT') { const b = await body(req, 2_000); if (b.support_email !== undefined) await D.setSetting('support_email', String(b.support_email).trim()); if (b.easy_max_year !== undefined) { await D.setSetting('easy_max_year', b.easy_max_year); EASY_CACHE = null; } return json(Object.assign(await D.settings(), { easy_default: Number(env.EASY_MAX_YEAR ?? 0) })); }
    // 🏦 Banco de sugestões
    if (path === '/api/admin/bank' && m === 'GET') {
      const B = bankStub(env);
      if (url.searchParams.get('ckey')) return json(await B.list({ ckey: url.searchParams.get('ckey'), limit: 200 }));
      if (url.searchParams.get('prefix') !== null) return json({ keys: await B.keys(url.searchParams.get('prefix')) });
      const idx = await bankIndex(env, url);
      return json({ ...(await B.stats()), repoFiles: Object.keys(idx.files || {}).length, repoVersion: idx.version || null, ...(await B.list({ limit: 50 })) });
    }
    if (path === '/api/admin/bank/status' && m === 'POST') { const b = await body(req, 2_000); const r = await bankStub(env).setStatus(String(b.id || ''), String(b.status || '')); if (r.err) throw new HttpError(400, r.err); return json(r); }
    if (path === '/api/admin/bank/item' && m === 'PUT') { const b = await body(req, 20_000); const r = await bankStub(env).edit(String(b.id || ''), b.q || {}); if (r.err) throw new HttpError(400, r.err); return json(r); }
    if (path === '/api/admin/bank/export' && m === 'GET') return json({ items: await bankStub(env).exportApi(url.searchParams.get('prefix') || '') });
    const rpM = path.match(/^\/api\/admin\/reports\/(\d+)$/);
    if (rpM && m === 'POST') return json(await D.resolveReport(rpM[1]));
  }
  throw new HttpError(404, 'Route not found.');
}

/* Voz natural: escolhe a melhor voz do Google para cada idioma (Chirp 3 HD > Neural2 > WaveNet; feminina), ou a definida em TTS_VOICE_PT/TTS_VOICE_EN */
const TTS_VOICES = {};
async function ttsVoice(env, lang) {
  const code = lang === 'en' ? 'en-GB' : 'pt-BR';
  const forced = lang === 'en' ? env.TTS_VOICE_EN : env.TTS_VOICE_PT;
  if (forced) return { name: forced, lang: code };
  if (TTS_VOICES[lang]) return TTS_VOICES[lang];
  let list = [];
  try { const r = await fetch(`${env.TTS_BASE_URL || 'https://texttospeech.googleapis.com'}/v1/voices?languageCode=${code}&key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`); if (r.ok) list = (await r.json()).voices || []; } catch { /* usa o padrão */ }
  const fem = v => v.ssmlGender === 'FEMALE';
  const rank = v => (/Chirp3-HD/.test(v.name) ? 40 : /Chirp/.test(v.name) ? 30 : /Neural2/.test(v.name) ? 20 : /Wavenet/.test(v.name) ? 10 : 0) + (fem(v) ? 5 : 0);
  const best = list.filter(v => (v.languageCodes || []).includes(code)).sort((a, b) => rank(b) - rank(a))[0];
  TTS_VOICES[lang] = { name: best ? best.name : (lang === 'en' ? 'en-GB-Neural2-C' : 'pt-BR-Neural2-C'), lang: code };
  return TTS_VOICES[lang];
}
async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Versão automática de cada deploy: data (horário de São Paulo) + começo do id da versão na Cloudflare. Ex.: 2026.10.25-1a2b3c4d
function appVersion(env) {
  const v = env.CF_VERSION_METADATA;
  if (!v || !v.id) return 'dev';
  let day = '';
  try { day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(v.timestamp)).replace(/-/g, '.'); } catch (e) { /* sem data */ }
  return (day ? day + '-' : '') + String(v.id).slice(0, 8);
}
/* E-mail do feedback pela API do Resend (o workers.dev não tem domínio próprio para o Email Routing) */
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function sendFeedbackEmail(env, r, d) {
  const label = { duvida: 'Question', sugestao: 'Suggestion', problema: 'Problem' }[d.kind];
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
    <h2 style="margin:0 0 8px">💬 ${escHtml(label)} — Study with Lumi</h2>
    <p style="white-space:pre-wrap;background:#f7f4ff;border-radius:8px;padding:12px">${escHtml(d.text)}</p>
    <p style="color:#555;font-size:12px">Family: ${escHtml(d.family)} · From: ${escHtml(d.who)} · Parent: ${escHtml(d.email)}<br>Screen: ${escHtml(d.screen)} · Version: ${escHtml(d.version)}${d.server && d.server !== d.version ? ` (server: ${escHtml(d.server)} — the app was opened before the last update)` : ''} · Message #${escHtml(r.id)}</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM || 'Study with Lumi <onboarding@resend.dev>', to: [r.supportEmail], reply_to: d.email || undefined,
      subject: `[Lumi] ${label}: ${String(d.text).replace(/\s+/g, ' ').slice(0, 60)}`, html }),
  });
  if (!res.ok) console.error('resend', res.status, await res.text().catch(() => ''));
  return res.ok;
}

/* Currículo: carrega os JSON publicados (public/curriculum) no SQLite na primeira vez e quando a versão muda */
async function seedCurriculum(env, url, force) {
  const C = env.CURRICULUM.get(env.CURRICULUM.idFromName('curriculum'));
  const idx = await (await env.ASSETS.fetch(new URL('/curriculum/index.json', url.origin))).json().catch(() => null);
  if (!idx) throw new HttpError(500, 'Curriculum files not found.');
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
        return json({ error: (e && e.message) || 'Server error.' }, status);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
