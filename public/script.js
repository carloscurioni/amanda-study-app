/* =========================================================================
   Estudos com a Lumi — app de estudos gamificado (HTML/CSS/JS puros)
   Estado salvo no localStorage do navegador. Sem back-end.
   -------------------------------------------------------------------------
   Seções:
     1. Configuração (matérias, valores de moedas, lojinha)
     2. Utilitários (datas, sorteio com semente, textos)
     3. Estado e persistência (localStorage)
     4. Mascote (SVG + balão de fala)
     5. Gerador de perguntas (por matéria) + importação JSON
     6. Semana: planejamento, distribuição, entrega/penalidade
     7. Telas: boas-vindas, início, minha semana, tarefa, lojinha, pais
     8. Inicialização
   ========================================================================= */
'use strict';

/* =========================================================================
   1. CONFIGURAÇÃO
   ========================================================================= */
const STORE_KEY = 'lumi-estudos-v1';
const MASCOT_NAME = 'Lumi';

// Ciclo semanal: começa no sábado e termina na sexta (dia da entrega).
const CYCLE = ['sab', 'dom', 'seg', 'ter', 'qua', 'qui', 'sex'];
const JS_DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const DOW_LABEL = { sab: 'Sáb', dom: 'Dom', seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex' };
const DOW_FULL = { sab: 'Sábado', dom: 'Domingo', seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta' };

const DEFAULT_SETTINGS = {
  pin: '1234',
  reward: 100,            // recompensa base: semana completa entregue na sexta
  penalty: 150,           // penalidade: semana não entregue (sempre MAIOR que a recompensa)
  latePct: 50,
  dayCoins: 10,
  notePrice: 500,
  schoolStart: '2026-08-03', // início do ano letivo (varinha)
  holidays: null,         // semanas de férias [{from, to, label}] (null = padrão 2026–27)
  sound: true,            // 🔊 musiquinhas das reações (🔇 desliga)         // 💌 preço do recadinho secreto
  questsOn: true,         // 📜 missões do dia e da semana
  buyQuests: true,        // missões de compra (recompensa = valor gasto + 50)           // moedas por tarefa do dia concluída no próprio dia (0 desliga; atrasada dentro da semana vale metade)            // recuperação: dias não feitos podem ser feitos até a sexta seguinte, valendo esta % da recompensa
  extraPerCorrect: 2,     // moedas por acerto nos exercícios extras
  extraSetSize: 5,        // perguntas por rodada de extras
  extraSetsPerDay: 3,     // rodadas de extras com moedas por dia
  minPerDay: 3,           // mínimo de perguntas que o estudante pode escolher por dia
  maxPerDay: 30,
  countMode: 'auto',      // auto: 2 perguntas por matéria por dia (+ leitura); manual: números abaixo
  perSubject: 2,          // perguntas de cada matéria por dia (modo automático)
  dailyReading: true,     // todo dia tem um texto (capítulo do "livro da semana") com resumo e perguntas
  readLevel: 'at',        // nível padrão do texto diário
  autoVoice: true,        // a Lumi lê as aulinhas em voz alta sozinha
  workshopCoins: 3,       // moedas por atividade concluída na Oficina de palavras
  workshopPerDay: 5,      // atividades com moedas por dia na Oficina
  counts: { sab: 9, dom: 9, seg: 7, ter: 7, qua: 7, qui: 7, sex: 5 }, // fim de semana um pouco maior
  gabaritoAfterFinish: true, // gabarito libera depois de concluir o dia
  voice: true,
  year: '',               // ano escolar (ex.: 'Y5'), escolhido na tela Minha semana
};

const SUBJECTS = [
  { id: 'pt',        lang: 'pt', group: 'pt', icon: '📝', short: 'Português',   name: 'Português',              color: '#e8590c', kind: 'grammar',
    ph: 'Ex.: substantivos e adjetivos; plural; sinônimos e antônimos', help: 'assuntos' },
  { id: 'pt_ort',    lang: 'pt', group: 'pt', icon: '✏️', short: 'Ortografia',  name: 'Português – Ortografia', color: '#d6336c', kind: 'spelling',
    ph: 'Palavras da semana, separadas por vírgula: exceção, cachorro, passeio…', help: 'palavras' },
  { id: 'pt_leit',   lang: 'pt', group: 'pt', icon: '📖', short: 'Leitura',     name: 'Português – Leitura',    color: '#ae3ec9', kind: 'reading',
    ph: '1ª linha: livro/capítulo. Opcional: cole um trecho do texto nas linhas seguintes.', help: 'livro + trecho' },
  { id: 'bss',       lang: 'pt', group: 'pt', icon: '🇧🇷', short: 'BSS',         name: 'BSS – Brazilian Social Studies', color: '#2b8a3e', kind: 'social',
    ph: 'Tema: regiões do Brasil, capitais, biomas, história… (ou "pergunta = resposta")', help: 'tema' },
  { id: 'en',        lang: 'en', group: 'en', icon: '🔤', short: 'English',     name: 'English',                color: '#1c7ed6', kind: 'grammar',
    ph: 'e.g. nouns & verbs; past tense; synonyms; prefixes; homophones', help: 'topics' },
  { id: 'en_read',   lang: 'en', group: 'en', icon: '📚', short: 'Reading',     name: 'English Reading',        color: '#5f3dc4', kind: 'reading',
    ph: '1st line: book/chapter. Optional: paste a passage on the next lines.', help: 'book + passage' },
  { id: 'en_spell',  lang: 'en', group: 'en', icon: '🐝', short: 'Spelling',    name: 'English Spelling',       color: '#f08c00', kind: 'spelling',
    ph: 'Spelling words, comma separated: because, friend, believe…', help: 'words' },
  { id: 'en_guided', lang: 'en', group: 'en', icon: '🔍', short: 'Guided Rdg',  name: 'Guided Reading',         color: '#0c8599', kind: 'guided',
    ph: '1st line: guided reading book. Optional: paste a passage below.', help: 'book + passage' },
  { id: 'ipc',       lang: 'en', group: 'en', icon: '🌍', short: 'IPC',         name: 'IPC – International Primary Curriculum', color: '#087f5b', kind: 'social',
    ph: 'Unit: Solar System, Ancient Egypt, plants… (or "question = answer")', help: 'unit' },
  { id: 'math',      lang: 'en', group: 'en', icon: '➗', short: 'Math',        name: 'Math',                   color: '#c92a2a', kind: 'math',
    ph: 'e.g. fractions, times tables, place value, perimeter, rounding', help: 'topics' },
  // ---- Ensino fundamental II / médio (Key Stage 3, IGCSE e IB Diploma) ----
  { id: 'pt_lit',    lang: 'pt', group: 'pt', icon: '📜', short: 'Literatura',  name: 'Português – Literatura',  color: '#9c36b5', kind: 'reading',
    ph: 'Ex.: Modernismo; estamos lendo Dom Casmurro, capítulos 10–20', help: 'tema / obra' },
  { id: 'pt_red',    lang: 'pt', group: 'pt', icon: '🖋️', short: 'Redação',     name: 'Português – Redação',     color: '#c2255c', kind: 'social',
    ph: 'Ex.: texto dissertativo-argumentativo; conectivos; proposta de intervenção', help: 'tema' },
  { id: 'en_lit',    lang: 'en', group: 'en', icon: '🎭', short: 'Eng Lit',     name: 'English Literature',     color: '#7048e8', kind: 'reading',
    ph: 'e.g. Macbeth, Act 1; An Inspector Calls; war poetry', help: 'text / theme' },
  { id: 'sci',       lang: 'en', group: 'en', icon: '🔬', short: 'Science',     name: 'Science',                color: '#0ca678', kind: 'social',
    ph: 'e.g. cells and organisation; forces and motion; acids and alkalis', help: 'topics' },
  { id: 'bio',       lang: 'en', group: 'en', icon: '🧬', short: 'Biology',     name: 'Biology',                color: '#2f9e44', kind: 'social',
    ph: 'e.g. photosynthesis; enzymes; inheritance and DNA', help: 'topics' },
  { id: 'chem',      lang: 'en', group: 'en', icon: '⚗️', short: 'Chemistry',   name: 'Chemistry',              color: '#1098ad', kind: 'social',
    ph: 'e.g. atomic structure; bonding; rates of reaction; moles', help: 'topics' },
  { id: 'phys',      lang: 'en', group: 'en', icon: '🧲', short: 'Physics',     name: 'Physics',                color: '#4263eb', kind: 'social',
    ph: 'e.g. energy; electricity; waves; Newton\'s laws', help: 'topics' },
  { id: 'hist',      lang: 'en', group: 'en', icon: '🏛️', short: 'History',     name: 'History',                color: '#a06c00', kind: 'social',
    ph: 'e.g. the Tudors; causes of World War I; the Cold War', help: 'topics' },
  { id: 'geog',      lang: 'en', group: 'en', icon: '🗺️', short: 'Geography',   name: 'Geography',              color: '#5c940d', kind: 'social',
    ph: 'e.g. rivers and coasts; urbanisation; climate change', help: 'topics' },
  { id: 'comp',      lang: 'en', group: 'en', icon: '💻', short: 'Computing',   name: 'Computer Science',       color: '#495057', kind: 'social',
    ph: 'e.g. binary; algorithms; Python loops; networks', help: 'topics' },
  { id: 'econ',      lang: 'en', group: 'en', icon: '📈', short: 'Economics',   name: 'Economics',              color: '#2b8a3e', kind: 'social',
    ph: 'e.g. supply and demand; elasticity; inflation; market failure', help: 'topics' },
  { id: 'bus',       lang: 'en', group: 'en', icon: '💼', short: 'Business',    name: 'Business',               color: '#e67700', kind: 'social',
    ph: 'e.g. marketing mix; cash flow; motivation theories', help: 'topics' },
  { id: 'psych',     lang: 'en', group: 'en', icon: '🧠', short: 'Psychology',  name: 'Psychology',             color: '#ae3ec9', kind: 'social',
    ph: 'e.g. memory models; social influence; research methods', help: 'topics' },
  { id: 'fmath',     lang: 'en', group: 'en', icon: '∑', short: 'Add Maths', name: 'Additional / Further Maths', color: '#a61e4d', kind: 'math',
    ph: 'e.g. logarithms; surds; completing the square; roots α and β; functions and inverses', help: 'topics' },
  { id: 'spa',       lang: 'en', group: 'en', icon: '🇪🇸', short: 'Spanish',     name: 'Spanish',                color: '#f03e3e', kind: 'social',
    ph: 'e.g. preterite vs imperfect; vocabulary: holidays', help: 'topics' },
  { id: 'fre',       lang: 'en', group: 'en', icon: '🇫🇷', short: 'French',      name: 'French',                 color: '#3b5bdb', kind: 'social',
    ph: 'e.g. passé composé; vocabulary: school and family', help: 'topics' },
  { id: 'tok',       lang: 'en', group: 'en', icon: '🤔', short: 'TOK',         name: 'Theory of Knowledge (IB)', color: '#5f3dc4', kind: 'social',
    ph: 'e.g. knowledge and technology; AOK: the natural sciences; knowledge questions', help: 'themes / AOK' },
];
const SUBJ = Object.fromEntries(SUBJECTS.map(s => [s.id, s]));
// Anos escolares (currículo britânico) com equivalente brasileiro e idade.
const SCHOOL_YEARS = [
  ['Y1', 'Year 1', 'Infantil 5', '5–6'], ['Y2', 'Year 2', '1º ano', '6–7'], ['Y3', 'Year 3', '2º ano', '7–8'],
  ['Y4', 'Year 4', '3º ano', '8–9'], ['Y5', 'Year 5', '4º ano', '9–10'], ['Y6', 'Year 6', '5º ano', '10–11'],
  ['Y7', 'Year 7', '6º ano', '11–12'], ['Y8', 'Year 8', '7º ano', '12–13'], ['Y9', 'Year 9', '8º ano', '13–14'],
  ['Y10', 'Year 10 (IGCSE)', '9º ano', '14–15'], ['Y11', 'Year 11 (IGCSE)', '1ª série EM', '15–16'],
  ['Y12', 'Year 12 (IB DP1)', '2ª série EM', '16–17'], ['Y13', 'Year 13 (IB DP2)', '3ª série EM', '17–18'],
];
// Etapas do currículo britânico e as matérias sugeridas em cada uma (cada estudante pode mudar).
function stageOf(year) {
  const n = Number(String(year || 'Y5').slice(1)) || 5;
  return n <= 6 ? 'primary' : n <= 9 ? 'ks3' : n <= 11 ? 'igcse' : 'ib';
}
const STAGE_LABEL = { primary: 'Primary (KS1–KS2)', ks3: 'Key Stage 3', igcse: 'IGCSE (KS4)', ib: 'IB Diploma Programme' };
const STAGE_SUBJECTS = {
  primary: ['pt', 'pt_ort', 'pt_leit', 'bss', 'en', 'en_read', 'en_spell', 'en_guided', 'ipc', 'math'],
  ks3: ['pt', 'pt_leit', 'bss', 'en', 'en_read', 'math', 'sci', 'hist', 'geog'],
  igcse: ['pt', 'pt_lit', 'bss', 'en', 'en_lit', 'math', 'bio', 'chem', 'phys', 'hist', 'geog'],
  ib: ['pt_lit', 'en_lit', 'math', 'bio', 'chem', 'econ', 'tok'],
};
// Matérias deste estudante: as escolhidas por ele, ou as sugeridas para a etapa do ano escolar.
function mySubjects() {
  const st = S.settings || {};
  const list = st.subjectsCustom && Array.isArray(st.subjects) && st.subjects.length ? st.subjects : STAGE_SUBJECTS[stageOf(st.year)];
  return SUBJECTS.map(x => x.id).filter(id => list.includes(id));
}
function yearLabel(id) {
  const y = SCHOOL_YEARS.find(x => x[0] === id);
  return y ? `${y[1]} do currículo britânico (≈ ${y[2]} no Brasil, ${y[3]} anos)` : '';
}

// Lojinha: itens permanentes (roupinhas, fundos, adesivos) e vales (prêmios reais, repetíveis).
const SHOP_CATS = [
  { id: 'hat', label: '🎩 Chapéus' },
  { id: 'glasses', label: '👓 Óculos' },
  { id: 'neck', label: '🎀 Acessórios' },
  { id: 'back', label: '🦋 Asas e capas' },
  { id: 'skin', label: '🎨 Cores da Lumi' },
  { id: 'pet', label: '🐾 Amiguinhos' },
  { id: 'bg', label: '🖼️ Fundos' },
  { id: 'sticker', label: '⭐ Adesivos' },
  { id: 'voucher', label: '🎟️ Vales' },
];
const SHOP_ITEMS = [
  { id: 'hat-cap',     cat: 'hat', name: 'Boné vermelho', price: 40 },
  { id: 'hat-flowers', cat: 'hat', name: 'Coroa de flores', price: 70 },
  { id: 'hat-witch',   cat: 'hat', name: 'Chapéu de bruxinha', price: 90 },
  { id: 'hat-crown',   cat: 'hat', name: 'Coroa dourada', price: 150 },
  { id: 'hat-grad',    cat: 'hat', name: 'Capelo de formatura', price: 200 },
  { id: 'hat-riding',  cat: 'hat', name: 'Capacete de hipismo', price: 180 },
  { id: 'hat-unicorn', cat: 'hat', name: 'Tiara de unicórnio', price: 300 },
  { id: 'hat-diamond', cat: 'hat', name: 'Coroa de diamante', price: 1200 },
  { id: 'gl-round',    cat: 'glasses', name: 'Óculos redondos', price: 35 },
  { id: 'gl-heart',    cat: 'glasses', name: 'Óculos de coração', price: 60 },
  { id: 'gl-sun',      cat: 'glasses', name: 'Óculos escuros', price: 80 },
  { id: 'gl-star',     cat: 'glasses', name: 'Óculos de estrela', price: 110 },
  { id: 'nk-bow',      cat: 'neck', name: 'Gravata-borboleta', price: 30 },
  { id: 'nk-scarf',    cat: 'neck', name: 'Cachecol', price: 50 },
  { id: 'nk-medal',    cat: 'neck', name: 'Medalha de campeã', price: 120 },
  { id: 'nk-pearls',   cat: 'neck', name: 'Colar de pérolas', price: 140 },
  { id: 'bk-bag',      cat: 'back', name: 'Mochila escolar', price: 90 },
  { id: 'bk-cape',     cat: 'back', name: 'Capa de super-heroína', price: 400 },
  { id: 'bk-wings',    cat: 'back', name: 'Asas de fada', price: 600 },
  { id: 'sk-pink',     cat: 'skin', name: 'Lumi Rosa', price: 120 },
  { id: 'sk-sky',      cat: 'skin', name: 'Lumi Azul-céu', price: 120 },
  { id: 'sk-mint',     cat: 'skin', name: 'Lumi Menta', price: 150 },
  { id: 'sk-gold',     cat: 'skin', name: 'Lumi Dourada', price: 1500 },
  { id: 'sk-galaxy',   cat: 'skin', name: 'Lumi Galáxia', price: 2500 },
  { id: 'pt-chick',    cat: 'pet', name: 'Pintinho', price: 250, emoji: '🐣' },
  { id: 'pt-cat',      cat: 'pet', name: 'Gatinho', price: 450, emoji: '🐱' },
  { id: 'pt-pony',     cat: 'pet', name: 'Pônei', price: 900, emoji: '🐴' },
  { id: 'pt-panda',    cat: 'pet', name: 'Pandinha', price: 1100, emoji: '🐼' },
  { id: 'pt-dragon',   cat: 'pet', name: 'Dragãozinho', price: 3000, emoji: '🐉' },
  { id: 'bg-ocean',    cat: 'bg', name: 'Oceano', price: 60, theme: 'theme-ocean', sw: 'linear-gradient(160deg,#c9ecff,#e0fbff)' },
  { id: 'bg-forest',   cat: 'bg', name: 'Floresta', price: 60, theme: 'theme-forest', sw: 'linear-gradient(160deg,#d8f3dc,#f1fbe7)' },
  { id: 'bg-sunset',   cat: 'bg', name: 'Pôr do sol', price: 90, theme: 'theme-sunset', sw: 'linear-gradient(160deg,#ffd6a5,#ffc6d9)' },
  { id: 'bg-candy',    cat: 'bg', name: 'Doceria', price: 90, theme: 'theme-candy', sw: 'linear-gradient(160deg,#ffd6ec,#d6f5ff)' },
  { id: 'bg-space',    cat: 'bg', name: 'Galáxia', price: 140, theme: 'theme-space', sw: 'linear-gradient(160deg,#1b1446,#3b2a85)' },
  { id: 'bg-rainbow',  cat: 'bg', name: 'Arco-íris', price: 200, theme: 'theme-rainbow', sw: 'linear-gradient(120deg,#ffd6d6,#fff1c1,#d6ffd9,#d6eaff,#ead6ff)' },
  { id: 'bg-castle',   cat: 'bg', name: 'Castelo encantado', price: 700, theme: 'theme-castle', sw: 'linear-gradient(160deg,#c9b6ff,#ffd1f0)' },
  { id: 'bg-gold',     cat: 'bg', name: 'Tesouro dourado', price: 1000, theme: 'theme-gold', sw: 'linear-gradient(160deg,#ffe28a,#fff6d6)' },
  ...[['🌈', 15], ['⭐', 15], ['🍉', 15], ['🌸', 15], ['🍩', 15], ['🎀', 15], ['🐬', 20], ['🦋', 20], ['🐱', 20], ['🎨', 20],
      ['🦄', 25], ['🐼', 25], ['🚀', 25], ['🐴', 30], ['🏆', 40],
      ['🍦', 20], ['🧁', 20], ['🛼', 30], ['🦖', 40], ['🎡', 50], ['🌋', 50], ['🎠', 60], ['🐉', 120], ['👑', 150], ['💎', 300]]
    .map(([e, p], i) => ({ id: 'st-' + i, cat: 'sticker', name: 'Adesivo', emoji: e, price: p })),
];
const DEFAULT_VOUCHERS = [
  { id: 'v-screen', name: '30 min extras de tela', price: 150 },
  { id: 'v-dinner', name: 'Escolher o jantar', price: 250 },
  { id: 'v-movie',  name: 'Escolher o filme da família', price: 300 },
];
DEFAULT_VOUCHERS.push(
  { id: 'v-icecream', name: 'Sorvete no fim de semana', price: 200 },
  { id: 'v-late', name: 'Dormir 30 min mais tarde', price: 250 },
  { id: 'v-outing', name: 'Escolher o passeio do domingo', price: 400 },
);
// Pacote 2: muito mais vales (prêmios reais), alguns bem caros. Os pais editam ou apagam.
const VOUCHER_PACK2 = [
  { id: 'v-music', name: 'Escolher as músicas do carro por 1 semana', price: 300 },
  { id: 'v-bed', name: 'Um dia sem arrumar a cama', price: 350 },
  { id: 'v-game1h', name: '1 hora extra de videogame', price: 450 },
  { id: 'v-breakfast', name: 'Café da manhã na cama', price: 500 },
  { id: 'v-pizza', name: 'Pizza no jantar', price: 600 },
  { id: 'v-late1h', name: 'Dormir 1 hora mais tarde no fim de semana', price: 700 },
  { id: 'v-book', name: 'Um livro novo à escolha', price: 800 },
  { id: 'v-sleepover', name: 'Convidar um amigo para dormir em casa', price: 1000 },
  { id: 'v-cash20', name: 'R$ 20 para gastar como quiser', price: 1200 },
  { id: 'v-restaurant', name: 'Escolher o restaurante do fim de semana', price: 1300 },
  { id: 'v-cinema', name: 'Cinema com pipoca', price: 1500 },
  { id: 'v-nochores', name: 'Fim de semana sem tarefas de casa', price: 1800 },
  { id: 'v-newgame', name: 'Um jogo novo (até R$ 60)', price: 2000 },
  { id: 'v-trip', name: 'Passeio especial (parque, aquário, kart…)', price: 2500 },
  { id: 'v-yesday', name: 'Dia do SIM (os pais dizem sim a pedidos combinados)', price: 3500 },
  { id: 'v-event', name: 'Ingresso para um jogo, show ou evento', price: 5000 },
  { id: 'v-wish', name: 'Item grande da lista de desejos', price: 7000 },
  { id: 'v-weekend', name: 'Escolher a viagem de um fim de semana', price: 10000 },
];
DEFAULT_VOUCHERS.push(...VOUCHER_PACK2.map(v => Object.assign({}, v)));

/* =========================================================================
   2. UTILITÁRIOS
   ========================================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uid = () => Math.random().toString(36).slice(2, 9);

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function dowOf(s) { return JS_DOW[parseYmd(s).getDay()]; }
function fmtDM(s) { const d = parseYmd(s); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`; }
function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
// "Hoje" pode ser simulado para testes com ?hoje=AAAA-MM-DD na URL.
function today() {
  const p = new URLSearchParams(location.search).get('hoje');
  return p && /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : ymd(new Date());
}
function cycleStartOf(s) { const back = (parseYmd(s).getDay() + 1) % 7; return addDays(s, -back); } // sábado anterior (ou hoje)

// Sorteio com semente: as tarefas geradas são estáveis.
function hashStr(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function makeRng(seed) {
  let a = hashStr(String(seed));
  const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = arr => arr[Math.floor(next() * arr.length)];
  const shuffle = arr => { const a2 = [...arr]; for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  const sample = (arr, n) => shuffle(arr).slice(0, n);
  return { next, int, pick, shuffle, sample };
}

// Normalização de respostas
function norm(s, strict) {
  let t = String(s ?? '').trim().toLowerCase()
    .replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').replace(/^["“”']+|["“”']+$/g, '').replace(/[.!?;]+$/, '').trim();
  if (!strict) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(the|a|an|o|a|os|as) /, '');
  return t;
}
function parseNum(s) {
  let t = String(s ?? '').trim().replace(/[^0-9.,/\-\s]/g, '').trim();
  const mixed = t.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fr = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (fr) return Number(fr[2]) ? Number(fr[1]) / Number(fr[2]) : NaN;
  t = t.replace(/\s/g, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');      // 47,382
  else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); // 47.382,5
  else t = t.replace(',', '.');
  return t === '' ? NaN : Number(t);
}
function numEq(a, b) { const x = parseNum(a), y = parseNum(b); return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-6; }

function isCorrect(q, ans) {
  if (q.type === 'open') return null;
  if (q.type === 'proof') return proofScore(q, ans) === q.errors.length;
  if (ans == null || String(ans).trim() === '') return false;
  const list = [q.answer, ...(q.accept || [])];
  if (q.type === 'num') return list.some(a => numEq(ans, a));
  // Ortografia/Spelling: acento e grafia contam sempre (vale para perguntas do Claude, da aulinha e do gerador)
  if (SUBJ[q.subject] && SUBJ[q.subject].kind === 'spelling' && q.type !== 'mc') return list.some(a => norm(a, true) === norm(ans, true));
  if (SUBJ[q.subject] && SUBJ[q.subject].kind === 'math' && list.some(a => mathCanon(a) === mathCanon(ans))) return true;
  return list.some(a => norm(a, q.strict) === norm(ans, q.strict));
}
// Respostas algébricas (Add Maths, IB): ignora espaços e variações de símbolos. Ex.: "x<-1 or x>4" = "x < −1 ou x > 4".
function mathCanon(s) {
  return String(s ?? '').toLowerCase()
    .replace(/\s+(or|ou|and|e)\s+/g, '|').replace(/[,;]/g, '|')
    .replace(/[−–—]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/⁻¹/g, '^-1').replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/√/g, 'sqrt').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/α/g, 'alpha').replace(/β/g, 'beta')
    .replace(/\s+/g, '').replace(/[.]$/, '').split('|').filter(Boolean)
    .map((x, _, all) => all.length === 1 ? x.replace(/^[a-z]=(?=-?[\d(s])/, '') : x).sort().join('|');
}
function answered(q, ans) {
  if (q && q.type === 'proof') return Object.keys(proofAns(ans)).length > 0;
  return ans != null && String(ans).trim() !== '';
}

/* =========================================================================
   3. ESTADO E PERSISTÊNCIA
   ========================================================================= */
function defaultState() {
  return {
    v: 1,
    name: '',
    tourDone: false,
    coins: 0,
    ledger: [],                 // {id, date, amount, reason} — o saldo é coinsBase + soma do extrato
    coinsBase: 0,               // moedas que não estão no extrato (lançamentos antigos já resumidos)
    ledgerV: 2,
    touched: {},                // quando os pais mexeram por último em ajustes/vales (para o merge entre aparelhos)
    settings: structuredCloneSafe(DEFAULT_SETTINGS),
    vouchers: structuredCloneSafe(DEFAULT_VOUCHERS),
    week: null,                 // semana atual (ver createWeek)
    lastTopics: {},             // tópicos da última semana (para reaproveitar)
    lastOpts: {},               // modos de spelling/nível de leitura da última semana
    streak: { n: 0, last: '', best: 0 }, // sequência de dias seguidos
    pendingImport: [],          // perguntas importadas antes de planejar a semana
    history: [],                // resumo das semanas anteriores
    extras: {},                 // { 'AAAA-MM-DD': { sets: n } }
    extra: null,                // rodada de extras em andamento
    owned: [],                  // ids de itens comprados
    equipped: { hat: null, glasses: null, neck: null, bg: null, back: null, skin: null, pet: null, fx: null, mascot: null },
    voucherPack: 2,             // pacotes de vales já adicionados (para levar vales novos a perfis antigos)
    practice: { pt: [], en: [] }, // palavras para treinar na Oficina (erradas ou "não sei")
    missed: [],                 // perguntas erradas recentes, para o reforço
    workshop: {},               // { 'AAAA-MM-DD': n } atividades com moedas na Oficina
    redemptions: [],            // vales resgatados {id, voucherId, name, date, delivered}
    rev: 0,                     // versão no servidor
  };
}
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
function normalizeState(s) {
  const base = defaultState();
  const merged = Object.assign(base, s || {});
  merged.settings = Object.assign(structuredCloneSafe(DEFAULT_SETTINGS), (s && s.settings) || {});
  merged.settings.counts = Object.assign({}, DEFAULT_SETTINGS.counts, ((s && s.settings) || {}).counts || {});
  merged.equipped = Object.assign(base.equipped, (s && s.equipped) || {});
  merged.practice = Object.assign({ pt: [], en: [] }, merged.practice || {});
  merged.touched = merged.touched || {};
  // Coleção (ovos): quem já tinha amiguinhos/mascotes comprados continua com eles
  merged.collection = merged.collection || {};
  (merged.owned || []).forEach(id => { if ((/^pt-/.test(id) || /^ms-/.test(id)) && !merged.collection[id]) merged.collection[id] = 1; });
  // Extrato v2: todo lançamento tem id; o saldo passa a ser calculado (coinsBase guarda o que já não está no extrato)
  merged.ledger = (merged.ledger || []).map((l, i) => l.id ? l : Object.assign({ id: 'm-' + hashStr(`${l.date}|${l.amount}|${l.reason}|${i}`).toString(36) }, l));
  if (!s || (s.ledgerV || 0) < 2) { merged.coinsBase = (Number(merged.coins) || 0) - ledgerSum(merged.ledger); merged.ledgerV = 2; }
  merged.coins = coinBalance(merged);
  if (!s || !s.voucherPack || s.voucherPack < 2) {   // perfis antigos recebem os vales novos uma vez
    const have = new Set((merged.vouchers || []).map(v => v.id));
    merged.vouchers = (merged.vouchers || []).concat(VOUCHER_PACK2.filter(v => !have.has(v.id)).map(v => Object.assign({}, v)));
    merged.voucherPack = 2;
  }
  return merged;
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) { console.warn('Estado inválido, recomeçando', e); }
  return defaultState();
}
let S = load();
function persistLocal() {
  try { localStorage.setItem(localKey(), JSON.stringify(S)); }
  catch (e) { toast('⚠️ Não consegui salvar neste navegador.'); }
}
function save() { persistLocal(); schedulePush(); }
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }

// key: id fixo para eventos que só podem acontecer uma vez (ex.: 'day-2026-10-24'); assim dois aparelhos não pagam duas vezes.
function addCoins(amount, reason, key) {
  const id = key || ('L' + uid());
  if (key && S.ledger.some(l => l.id === key || (l.covers || []).includes(key))) return false;
  S.ledger.unshift({ id, date: new Date().toISOString(), amount, reason });
  compactLedger(S);
  S.coins = coinBalance(S);
  save();
  renderCoins(true);
  return true;
}
function ledgerSum(list) { return (list || []).reduce((a, l) => a + (Number(l.amount) || 0), 0); }
function coinBalance(st) { return (Number(st.coinsBase) || 0) + ledgerSum(st.ledger); }
// Extrato muito grande: os lançamentos mais antigos viram um só "saldo anterior" (com a lista de ids que ele cobre).
function compactLedger(st) {
  if (st.ledger.length <= 1200) return;
  const keep = st.ledger.slice(0, 600), old = st.ledger.slice(600);
  const covers = old.flatMap(l => [l.id, ...(l.covers || [])]);
  keep.push({ id: 'c-' + hashStr(covers.slice().sort().join(',')).toString(36), date: old[0].date, amount: ledgerSum(old), reason: 'Saldo de lançamentos antigos', covers });
  st.ledger = keep;
}
function touch(k) { S.touched = S.touched || {}; S.touched[k] = Date.now(); }

/* ---------- Merge seguro entre aparelhos (quando o servidor responde 409) ---------- */
// Nada que a criança fez se perde: une dias concluídos, extrato, compras, resgates, palavras e histórico.
function mergeStates(localRaw, remoteRaw) {
  const L = normalizeState(JSON.parse(JSON.stringify(localRaw))), R = normalizeState(JSON.parse(JSON.stringify(remoteRaw)));
  const M = R;
  const byId = (a, b, key = 'id') => { const m = new Map(); [...(b || []), ...(a || [])].forEach(x => { if (x && x[key] != null && !m.has(x[key])) m.set(x[key], x); }); return [...m.values()]; };
  // extrato: união por id, sem lançamentos já cobertos por um resumo
  let led = byId(L.ledger, R.ledger);
  const covered = new Set(led.flatMap(l => l.covers || []));
  led = led.filter(l => !covered.has(l.id)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  M.ledger = led; M.coinsBase = Number.isFinite(R.coinsBase) ? R.coinsBase : L.coinsBase; compactLedger(M);
  M.coins = coinBalance(M);
  M.owned = [...new Set([...(R.owned || []), ...(L.owned || [])])];
  M.collection = Object.assign({}, R.collection); Object.entries(L.collection || {}).forEach(([k, v]) => { M.collection[k] = Math.max(v || 0, M.collection[k] || 0); });
  Object.keys(L.equipped || {}).forEach(k => { const v = L.equipped[k]; if (v == null || M.owned.includes(v) || k === 'mascot') M.equipped[k] = v; });
  M.redemptions = byId(L.redemptions, R.redemptions).map(x => { const a = (L.redemptions || []).find(y => y.id === x.id), b = (R.redemptions || []).find(y => y.id === x.id); return Object.assign({}, x, { delivered: !!((a && a.delivered) || (b && b.delivered)) }); });
  const newer = k => ((L.touched || {})[k] || 0) > ((R.touched || {})[k] || 0) ? L : R;
  M.settings = newer('settings').settings; M.vouchers = newer('vouchers').vouchers;
  M.touched = Object.assign({}, R.touched, L.touched, { settings: Math.max((L.touched || {}).settings || 0, (R.touched || {}).settings || 0), vouchers: Math.max((L.touched || {}).vouchers || 0, (R.touched || {}).vouchers || 0) });
  M.tourDone = L.tourDone || R.tourDone;
  // semana: a mais nova vale; se for a mesma, junta os dias (concluído ganha de não concluído; senão, o que tem mais respostas)
  const wk = (a, b) => { if (!a) return b; if (!b) return a; if (a.id !== b.id) return (a.start > b.start || (a.start === b.start && (a.created || '') > (b.created || ''))) ? a : b;
    const w = JSON.parse(JSON.stringify(b));
    Object.keys(a.days || {}).forEach(dt => { const x = a.days[dt], y = w.days[dt]; if (!y) { w.days[dt] = x; return; }
      const nx = Object.keys(x.answers || {}).length, ny = Object.keys(y.answers || {}).length;
      if ((x.status === 'done' && y.status !== 'done') || (x.status === y.status && nx > ny)) w.days[dt] = x;
      if (x.coinsAt || y.coinsAt) w.days[dt].coinsAt = x.coinsAt || y.coinsAt; });
    w.settled = a.settled || b.settled; w.settledAt = a.settledAt || b.settledAt; return w; };
  M.week = wk(L.week, R.week);
  if (M.week === L.week) { M.lastTopics = L.lastTopics; M.lastOpts = L.lastOpts; }
  if (L.recovery && R.recovery && L.recovery.start === R.recovery.start) {
    const r = M.recovery; Object.keys(L.recovery.days).forEach(dt => { if (L.recovery.days[dt].status === 'done' && (!r.days[dt] || r.days[dt].status !== 'done')) r.days[dt] = L.recovery.days[dt]; });
    r.n = Math.max(L.recovery.n, R.recovery.n); r.earned = Math.max(L.recovery.earned, R.recovery.earned);
  } else if (L.recovery && (!R.recovery || L.recovery.start > R.recovery.start)) M.recovery = L.recovery;
  M.history = byId(L.history, R.history, 'start').map(h => { const a = (L.history || []).find(x => x.start === h.start), b = (R.history || []).find(x => x.start === h.start); return a && b && a.done > b.done ? a : h; }).sort((a, b) => (a.start < b.start ? 1 : -1));
  const sa = L.streak || {}, sb = R.streak || {};
  M.streak = ((sa.last || '') > (sb.last || '') || ((sa.last || '') === (sb.last || '') && (sa.n || 0) > (sb.n || 0))) ? sa : sb;
  M.streak.best = Math.max(sa.best || 0, sb.best || 0);
  M.extras = Object.assign({}, R.extras); Object.entries(L.extras || {}).forEach(([d, v]) => { M.extras[d] = { sets: Math.max(v.sets || 0, (M.extras[d] || {}).sets || 0) }; });
  M.workshop = Object.assign({}, R.workshop); Object.entries(L.workshop || {}).forEach(([d, v]) => { M.workshop[d] = Math.max(v || 0, M.workshop[d] || 0); });
  if (L.extra && (!R.extra || (L.extra.date || '') >= (R.extra.date || ''))) M.extra = L.extra;
  ['pt', 'en'].forEach(k => { M.practice[k] = [...new Set([...(L.practice[k] || []), ...(R.practice[k] || [])])].slice(0, 30); });
  M.missed = (() => { const m = new Map(); [...(L.missed || []), ...(R.missed || [])].forEach(x => { if (x && x.q && !m.has(x.q.q)) m.set(x.q.q, x); }); return [...m.values()].slice(0, 40); })();
  M.books = Object.assign({}, R.books); Object.entries(L.books || {}).forEach(([k, b]) => { if (!M.books[k] || (b.chapters || []).length > (M.books[k].chapters || []).length) M.books[k] = b; });
  M.pendingImport = (() => { const m = new Map(); [...(L.pendingImport || []), ...(R.pendingImport || [])].forEach(q => { if (q && !m.has(q.q)) m.set(q.q, q); }); return [...m.values()]; })();
  M.notesOpened = (() => { const m = new Map(); [...(L.notesOpened || []), ...(R.notesOpened || [])].forEach(n => { if (n && !m.has(n.id)) m.set(n.id, n); }); return [...m.values()].sort((a, b) => ((a.openedAt || '') < (b.openedAt || '') ? 1 : -1)); })();
  if (L.quests || R.quests) {
    M.quests = JSON.parse(JSON.stringify(R.quests || {}));
    ['day', 'week'].forEach(k => { const a = (L.quests || {})[k], b = M.quests[k];
      if (!a) return; if (!b || (a.date || a.start) > (b.date || b.start)) { M.quests[k] = a; return; }
      if ((a.date || a.start) !== (b.date || b.start)) return;
      b.list.forEach(q => { const x = a.list.find(y => y.id === q.id); if (x) { q.progress = Math.max(q.progress || 0, x.progress || 0); q.spent = Math.max(q.spent || 0, x.spent || 0); q.claimed = q.claimed || x.claimed; } }); });
  }
  M.rev = R.rev;
  return M;
}


/* =========================================================================
   3b. SERVIDOR — contas da família, perfis das crianças e sincronização
   Com servidor: os pais entram com e-mail e senha; cada criança tem um perfil
   (com PIN) e um cofre de dados próprio. Sem servidor: tudo só neste aparelho.
   ========================================================================= */
const CHILD_KEY = 'lumi-child';
const Server = { on: false, ai: false, needsSetup: false, canSetup: false, me: null, childId: null, pushing: false, again: false, dirty: false, timer: null, status: 'local' };
const AI_ROUTES = { '/api/plan-outline': 'plan-outline', '/api/plan-day': 'plan-day', '/api/plan': 'plan', '/api/more': 'more', '/api/tutor': 'tutor', '/api/grade': 'grade', '/api/explain': 'explain', '/api/check-open': 'check-open', '/api/lesson': 'lesson', '/api/reading': 'reading' };
const AVATARS = ['🦉', '🦊', '🐼', '🐱', '🐶', '🦄', '🐸', '🐧', '🐯', '🐰', '🐨', '🐙'];
function localKey(id = Server.childId) { return id ? `${STORE_KEY}:${id}` : STORE_KEY; }
function savedChild() { try { return localStorage.getItem(CHILD_KEY) || ''; } catch (e) { return ''; } }
function rememberChild(id) { try { if (id) localStorage.setItem(CHILD_KEY, id); else localStorage.removeItem(CHILD_KEY); } catch (e) { /* ignora */ } }
function currentChild() { return Server.me && Server.me.children.find(c => c.id === Server.childId); }

async function apiCall(path, { method = 'GET', data, timeout = 30000 } = {}) {
  if (AI_ROUTES[path]) { path = '/api/ai/' + AI_ROUTES[path]; data = Object.assign({ mine: mySubjects(), levels: stageOf(S.settings.year) === 'ib' ? (S.settings.ibLevels || {}) : {} }, data, { childId: Server.childId }); }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(path, { method, signal: ctrl.signal, cache: 'no-store', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-lumi': '1' },
      body: data === undefined ? undefined : JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `Erro ${r.status}`); e.status = r.status; e.data = j; throw e; }
    return j;
  } catch (e) {
    if (e.name === 'AbortError') { const err = new Error('o servidor demorou demais'); err.status = 0; throw err; }
    if (e.status === undefined) e.status = 0;
    throw e;
  } finally { clearTimeout(t); }
}
async function detectServer() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    Server.on = !!j.ok; Server.ai = !!j.ai; Server.needsSetup = !!j.setup; Server.canSetup = !!j.canSetup;
    return Server.on;
  } catch (e) { return false; }
}
function schedulePush() {
  if (!Server.on || !Server.childId) return;
  Server.dirty = true;
  clearTimeout(Server.timer);
  Server.timer = setTimeout(pushState, 800);
}
async function pushState() {
  if (!Server.on || !Server.childId) return;
  if (Server.pushing) { Server.again = true; return; }
  Server.pushing = true; Server.dirty = false;
  const id = Server.childId;
  try {
    const r = await apiCall(`/api/children/${id}/state`, { method: 'PUT', data: { state: S, baseRev: S.rev || 0 } });
    if (id === Server.childId) { S.rev = r.rev; persistLocal(); Server.status = 'ok'; }
  } catch (e) {
    if (e.status === 409 && e.data && e.data.state && id === Server.childId) {
      // outro aparelho salvou antes: junta os dois estados (nada se perde) e manda o resultado de volta
      S = mergeStates(S, e.data.state); persistLocal(); Server.status = 'ok'; Server.again = true;
      applyTheme(); renderMascotMini(); renderCoins();
      if (!['work', 'check', 'selfcheck'].includes(currentScreen)) show(currentScreen);
      toast('🔄 Juntei com as mudanças de outro aparelho');
    } else if (e.status === 401) {
      Server.status = 'auth'; Server.me = null; VIEW.auth = { mode: 'login' }; show('login'); toast('Sua sessão expirou. Entre de novo.');
    } else { Server.dirty = true; Server.status = 'offline'; }
  } finally {
    Server.pushing = false;
    if (Server.again) { Server.again = false; pushState(); }
  }
}
async function flushPush() { clearTimeout(Server.timer); if (Server.dirty || Server.pushing) { await pushState(); } }
window.addEventListener('online', () => { if (Server.dirty) pushState(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Server.dirty) pushState(); });

// Entra no perfil de uma criança: carrega o cofre dela (servidor; cópia local se estiver sem internet).
async function enterChild(id) {
  const child = Server.me.children.find(c => c.id === id);
  if (!child) { rememberChild(''); VIEW.auth = { mode: 'profiles' }; show('login'); return; }
  await flushPush();
  Server.childId = id; rememberChild(id);
  let st = null;
  try { st = (await apiCall(`/api/children/${id}/state`)).state; Server.status = 'ok'; }
  catch (e) {
    if (e.status === 401) { Server.me = null; VIEW.auth = { mode: 'login' }; show('login'); return; }
    try { const raw = localStorage.getItem(localKey(id)); if (raw) st = JSON.parse(raw); } catch (err) { /* ignora */ }
    Server.status = 'offline'; toast('Sem conexão: usando a cópia deste aparelho.');
  }
  S = st ? normalizeState(st) : defaultState();
  S.name = child.name;
  S.settings.year = child.year || S.settings.year;
  if (!st) S.rev = 0;
  persistLocal();
  if (!st && Server.status === 'ok') pushState();
  startApp();
}
async function refreshMe() { Server.me = await apiCall('/api/auth/me'); Server.ai = Server.me.ai; return Server.me; }
function afterLogin() {
  history.replaceState(null, '', location.pathname + (new URLSearchParams(location.search).get('hoje') ? `?hoje=${new URLSearchParams(location.search).get('hoje')}` : ''));
  const kids = Server.me.children;
  if (!kids.length) { VIEW.auth = { mode: 'addchild', first: true }; show('login'); return; }
  const saved = savedChild();
  if (saved && kids.some(c => c.id === saved)) { enterChild(saved); return; }
  VIEW.auth = { mode: 'profiles' }; show('login');
}
async function switchProfile() {
  await flushPush();
  Server.childId = null; rememberChild(''); VIEW.parentsUnlocked = false;
  VIEW.auth = { mode: 'profiles' }; show('login');
}
async function logout() {
  await flushPush();
  try { await apiCall('/api/auth/logout', { method: 'POST', data: {} }); } catch (e) { /* ignora */ }
  Server.me = null; Server.childId = null; rememberChild(''); VIEW.parentsUnlocked = false;
  VIEW.auth = { mode: 'login' }; show('login');
}
// Copiar / compartilhar links de convite
async function shareLink(link, text) {
  if (navigator.share) { try { await navigator.share({ title: 'Estudos com a Lumi', text, url: link }); return; } catch (e) { /* cancelado */ } }
  try { await navigator.clipboard.writeText(link); toast('Link copiado!'); } catch (e) { toast('Copie o link da caixa.'); }
}
function linkBox(link, expires, text) {
  return `<div class="link-box"><input readonly value="${esc(link)}" onclick="this.select()"><button class="btn small primary" data-share="${esc(link)}" data-text="${esc(text)}">📤 Enviar</button></div>
    <div class="tiny muted">Vale até ${new Date(expires).toLocaleDateString('pt-BR')}. Só funciona uma vez.</div>`;
}
function bindShare(root) { $$('[data-share]', root).forEach(b => b.onclick = () => shareLink(b.dataset.share, b.dataset.text)); }

// Foto → JPEG reduzido em base64 (para mandar ao Claude)
async function fileToJpeg(file, max = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return { type: 'image/jpeg', data: cv.toDataURL('image/jpeg', quality).split(',')[1] };
  } finally { URL.revokeObjectURL(url); }
}
// Tela de espera com a Lumi (as chamadas ao Claude podem levar alguns segundos)
function showLoading(msgs) {
  let i = 0;
  const c = openModal(`<div class="modal-body celebrate"><div class="owl-big thinking">${mascotSVG(S.equipped, 'think')}</div>
    <p id="ld-msg" style="font-weight:800">${esc(msgs[0])}</p><div class="dots"><i></i><i></i><i></i></div></div>`);
  $('#modal').onclick = null;
  const timer = setInterval(() => { i = (i + 1) % msgs.length; const m = $('#ld-msg', c); if (m) m.textContent = msgs[i]; }, 3500);
  return () => { clearInterval(timer); $('#modal')._onClose = null; closeModal(); };
}

/* ---------- Telas de conta: primeiro acesso, login, convite, nova senha, perfis ---------- */
const CONSENT_HTML = `<label class="consent"><input type="checkbox" id="a-consent">
  <span>Sou pai, mãe ou responsável legal e autorizo o uso dos dados das crianças que eu cadastrar para as atividades do app, conforme o
  <a href="/privacidade.html" target="_blank" rel="noopener">Aviso de Privacidade</a>. Entendo que a Lumi é uma <b>inteligência artificial</b> (Claude, da Anthropic) e que respostas e fotos de atividades são enviadas a ela para criar e corrigir exercícios.</span></label>`;
const yearOptions = sel => SCHOOL_YEARS.map(([id, uk, br, age]) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${uk} · ${br} · ${age} anos</option>`).join('');
const avatarPicker = sel => `<div class="avatars">${AVATARS.map(a => `<button type="button" class="av ${a === sel ? 'on' : ''}" data-av="${a}">${a}</button>`).join('')}</div>`;
function bindAvatar(root, state) { $$('[data-av]', root).forEach(b => b.onclick = () => { state.avatar = b.dataset.av; $$('[data-av]', root).forEach(x => x.classList.toggle('on', x === b)); }); }
const val = id => (($('#' + id) || {}).value || '').trim();

function renderLogin() {
  const el = $('#scr-login');
  const a = VIEW.auth || { mode: 'login' };
  const owl = mood => `<div class="owl-big">${mascotSVG({ hat: null, glasses: null, neck: null }, mood || 'happy')}</div>`;
  const wrap = (inner) => `<div class="auth"><div class="auth-card">${inner}</div></div>`;
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { toast(e.message || 'Algo deu errado.'); } finally { btn.disabled = false; } };

  if (a.mode === 'firstrun') {
    const st = { avatar: '🦉' };
    el.innerHTML = wrap(`${owl('wow')}<h1>Configurar o app</h1>
      <p class="muted">Primeiro acesso: crie a sua conta de administrador. ${Server.canSetup ? 'Use o <b>FAMILY_CODE</b> que você cadastrou na Cloudflare.' : '<b>Falta configurar o FAMILY_CODE na Cloudflare.</b>'}</p>
      <label class="field">Código de configuração (FAMILY_CODE)<input id="a-code" type="password" autocomplete="off"></label>
      <div class="form-grid"><label class="field">Nome da família<input id="a-fam" placeholder="Ex.: Família Silva"></label>
      <label class="field">Seu nome<input id="a-pname" autocomplete="name"></label></div>
      <label class="field">Seu e-mail<input id="a-email" type="email" autocomplete="email"></label>
      <label class="field">Senha (mín. 8 caracteres)<input id="a-pass" type="password" autocomplete="new-password"></label>
      <h3>Primeira criança</h3>
      <p class="tiny muted">Os dados que já estão no app (moedas, compras, semana) vão para este perfil.</p>
      <div class="form-grid"><label class="field">Nome<input id="a-cname" maxlength="30"></label>
      <label class="field">Ano escolar<select id="a-cyear">${yearOptions('Y5')}</select></label>
      <label class="field">PIN da criança (4 números)<input id="a-cpin" inputmode="numeric" maxlength="4" autocomplete="off"></label></div>
      ${avatarPicker(st.avatar)}${CONSENT_HTML}
      <button class="btn primary big wide" id="a-go">Criar conta e entrar</button>`);
    bindAvatar(el, st);
    $('#a-go').onclick = e => busy(e.target, async () => {
      if (!$('#a-consent').checked) throw new Error('Marque a autorização para continuar.');
      await apiCall('/api/setup', { method: 'POST', data: { code: val('a-code'), familyName: val('a-fam'), parentName: val('a-pname'), email: val('a-email'), password: $('#a-pass').value,
        childName: val('a-cname'), childYear: $('#a-cyear').value, childPin: val('a-cpin'), childAvatar: st.avatar, consent: true } });
      Server.needsSetup = false;
      await refreshMe(); toast('✅ Conta criada!'); afterLogin();
    });
    return;
  }
  if (a.mode === 'login') {
    el.innerHTML = wrap(`${owl()}<h1>Estudos com a Lumi</h1><p class="muted">Entre com a conta da família.</p>
      <label class="field">E-mail<input id="a-email" type="email" autocomplete="username"></label>
      <label class="field">Senha<input id="a-pass" type="password" autocomplete="current-password"></label>
      <button class="btn primary big wide" id="a-go">Entrar</button>
      <button class="btn ghost small" id="a-forgot">Esqueci a senha</button>
      <p class="tiny muted">O app é só para famílias convidadas. Recebeu um convite? Abra o link que você recebeu.</p>`);
    const go = () => busy($('#a-go'), async () => {
      await apiCall('/api/auth/login', { method: 'POST', data: { email: val('a-email'), password: $('#a-pass').value } });
      await refreshMe(); afterLogin();
    });
    $('#a-go').onclick = go;
    $('#a-pass').onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#a-forgot').onclick = () => say('Peça ao administrador do app um <b>link para criar uma nova senha</b>. 🔑', { mood: 'think' });
    return;
  }
  if (a.mode === 'invite' || a.mode === 'reset') {
    if (!a.info) {
      el.innerHTML = wrap(`${owl('think')}<p>Abrindo o convite…</p>`);
      apiCall(`/api/invite/${encodeURIComponent(a.token)}`).then(info => { a.info = info; renderLogin(); })
        .catch(() => { a.info = { valid: false }; renderLogin(); });
      return;
    }
    if (!a.info.valid) {
      el.innerHTML = wrap(`${owl('sad')}<h1>Link inválido</h1><p class="muted">Este link expirou ou já foi usado. Peça um novo a quem enviou.</p><button class="btn primary wide" id="a-back">Ir para o login</button>`);
      $('#a-back').onclick = () => { history.replaceState(null, '', location.pathname); VIEW.auth = { mode: 'login' }; renderLogin(); };
      return;
    }
    const k = a.info.kind;
    if (k === 'reset') {
      el.innerHTML = wrap(`${owl()}<h1>Nova senha</h1><p class="muted">Para <b>${esc(a.info.email)}</b>.</p>
        <label class="field">Nova senha (mín. 8 caracteres)<input id="a-pass" type="password" autocomplete="new-password"></label>
        <label class="field">Repita a senha<input id="a-pass2" type="password" autocomplete="new-password"></label>
        <button class="btn primary big wide" id="a-go">Salvar e entrar</button>`);
    } else {
      el.innerHTML = wrap(`${owl('wow')}<h1>${k === 'join' ? `Entrar na família ${esc(a.info.familyName)}` : 'Bem-vindos!'}</h1>
        <p class="muted">${k === 'join' ? 'Crie o seu acesso como responsável.' : 'Crie a conta da sua família. Depois você cadastra as crianças.'}</p>
        ${k === 'family' ? '<label class="field">Nome da família<input id="a-fam" placeholder="Ex.: Família Silva"></label>' : ''}
        <label class="field">Seu nome<input id="a-pname" autocomplete="name"></label>
        <label class="field">Seu e-mail<input id="a-email" type="email" autocomplete="email"></label>
        <label class="field">Senha (mín. 8 caracteres)<input id="a-pass" type="password" autocomplete="new-password"></label>
        ${CONSENT_HTML}<button class="btn primary big wide" id="a-go">Criar acesso</button>`);
    }
    $('#a-go').onclick = e => busy(e.target, async () => {
      if (k === 'reset' && $('#a-pass').value !== $('#a-pass2').value) throw new Error('As senhas não são iguais.');
      if (k !== 'reset' && !$('#a-consent').checked) throw new Error('Marque a autorização para continuar.');
      await apiCall(`/api/invite/${encodeURIComponent(a.token)}/accept`, { method: 'POST', data: {
        password: $('#a-pass').value, email: val('a-email'), parentName: val('a-pname'), familyName: val('a-fam'), consent: k !== 'reset' } });
      await refreshMe(); toast(k === 'reset' ? '✅ Senha alterada!' : '✅ Acesso criado!'); afterLogin();
    });
    return;
  }
  if (a.mode === 'addchild') {
    const st = { avatar: AVATARS[(Server.me.children.length + 1) % AVATARS.length] };
    el.innerHTML = wrap(`${owl('wow')}<h1>${a.first ? 'Cadastre a primeira criança' : 'Nova criança'}</h1>
      <div class="form-grid"><label class="field">Nome<input id="a-cname" maxlength="30"></label>
      <label class="field">Ano escolar<select id="a-cyear">${yearOptions('Y5')}</select></label></div>
      <label class="field">PIN da criança (4 números) <span class="tiny muted">— ela usa para entrar no próprio perfil</span><input id="a-cpin" inputmode="numeric" maxlength="4" autocomplete="off"></label>
      <div class="field">Personagem</div>${avatarPicker(st.avatar)}
      <button class="btn primary big wide" id="a-go">Salvar</button>
      ${a.first ? '' : '<button class="btn ghost" id="a-cancel">Cancelar</button>'}`);
    bindAvatar(el, st);
    const c = $('#a-cancel'); if (c) c.onclick = () => { VIEW.auth = { mode: 'profiles' }; renderLogin(); };
    $('#a-go').onclick = e => busy(e.target, async () => {
      await apiCall('/api/family/children', { method: 'POST', data: { name: val('a-cname'), year: $('#a-cyear').value, pin: val('a-cpin'), avatar: st.avatar } });
      await refreshMe(); VIEW.auth = { mode: 'profiles' }; renderLogin();
    });
    return;
  }
  // Perfis: quem vai estudar?
  const kids = Server.me ? Server.me.children : [];
  el.innerHTML = wrap(`<h1>Quem vai estudar? 📚</h1><p class="muted">${esc(Server.me ? Server.me.family.name : '')}</p>
    <div class="profiles">${kids.map(c => `<button class="profile" data-kid="${c.id}"><span class="pf-av">${c.avatar || '🦉'}</span><b>${esc(c.name)}</b><span class="tiny muted">${esc((SCHOOL_YEARS.find(y => y[0] === c.year) || [])[1] || '')}</span></button>`).join('')}</div>
    <div class="row wrap center-row"><button class="btn small" id="a-add">＋ Adicionar criança</button><button class="btn small ghost" id="a-out">Sair da conta</button></div>`);
  $$('[data-kid]', el).forEach(b => b.onclick = () => askPin(kids.find(k => k.id === b.dataset.kid)));
  $('#a-add').onclick = async () => { if (await askParentPassword()) { VIEW.auth = { mode: 'addchild' }; renderLogin(); } };
  $('#a-out').onclick = () => logout();
}
// Teclado de PIN da criança
function askPin(child) {
  let pin = '';
  const c = openModal(`<div class="modal-body center"><div class="pf-av big">${child.avatar || '🦉'}</div><h3 style="margin:4px 0">Oi, ${esc(child.name)}!</h3>
    <p class="muted tiny">Digite o seu PIN</p><div class="pin-dots" id="pdots"></div>
    <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => `<button class="btn" ${k === '' ? 'disabled style="visibility:hidden"' : ''} data-k="${k}">${k}</button>`).join('')}</div></div>
    <div class="modal-foot"><button class="btn" data-close>Voltar</button></div>`);
  const dots = () => { $('#pdots', c).innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); };
  dots();
  $$('[data-k]', c).forEach(b => b.onclick = async () => {
    const k = b.dataset.k;
    if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
    dots();
    if (pin.length === 4) {
      try { await apiCall(`/api/family/children/${child.id}/unlock`, { method: 'POST', data: { pin } }); $('#modal')._onClose = null; closeModal(); enterChild(child.id); }
      catch (e) { pin = ''; dots(); const d = $('#pdots', c); d.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 250 }); toast(e.message); }
    }
  });
}
// Senha do responsável (para a área dos pais e ações sensíveis)
function askParentPassword(title = '🔒 Senha do responsável') {
  return new Promise(res => {
    const c = openModal(`<div class="modal-head"><h3>${title}</h3></div><div class="modal-body">
      <p class="tiny muted">${esc(Server.me.parent.email)}</p><input class="pin-input" id="pp" type="password" autocomplete="current-password" style="letter-spacing:normal;font-size:18px"></div>
      <div class="modal-foot"><button class="btn" data-no>Cancelar</button><button class="btn primary" data-yes>Confirmar</button></div>`, { onClose: () => res(false) });
    const go = async () => {
      try { const r = await apiCall('/api/auth/verify', { method: 'POST', data: { password: $('#pp', c).value } });
        if (r.ok) { $('#modal')._onClose = null; closeModal(); res($('#pp', c) ? true : true); } else { toast('Senha incorreta.'); $('#pp', c).value = ''; } }
      catch (e) { toast(e.message); }
    };
    $('[data-no]', c).onclick = () => closeModal();
    $('[data-yes]', c).onclick = go;
    $('#pp', c).onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => $('#pp', c) && $('#pp', c).focus(), 50);
  });
}

/* =========================================================================
   4. MASCOTE — a corujinha Lumi (SVG original) + balão de fala
   ========================================================================= */
const ACCESSORY_SVG = {
  'hat-cap': '<path d="M27 23 Q50 -2 73 23 Z" fill="#e5484d"/><path d="M66 22 Q86 20 90 26 Q77 28 63 25Z" fill="#c43a3f"/><circle cx="50" cy="7" r="2.6" fill="#c43a3f"/>',
  'hat-crown': '<path d="M30 23 L32 5 L41 14 L50 1 L59 14 L68 5 L70 23 Z" fill="#ffc83d" stroke="#e0a800" stroke-width="1.5" stroke-linejoin="round"/><circle cx="50" cy="15" r="2.6" fill="#e5484d"/><circle cx="38" cy="18" r="1.8" fill="#3fa7ff"/><circle cx="62" cy="18" r="1.8" fill="#3fa7ff"/>',
  'hat-witch': '<path d="M20 22 Q50 13 80 22 Q50 29 20 22Z" fill="#4b2a8a"/><path d="M35 20 L58 -10 L64 19 Z" fill="#5d36a8"/><path d="M37 16 Q50 12 62 15 L63 19 Q50 16 36 20Z" fill="#ffb703"/>',
  'hat-grad': '<path d="M50 3 L84 13 L50 23 L16 13 Z" fill="#222"/><path d="M33 17 L33 26 Q50 33 67 26 L67 17 L50 23Z" fill="#383838"/><path d="M50 13 L77 17 L77 29" stroke="#ffb703" stroke-width="1.6" fill="none"/><circle cx="77" cy="30" r="2.3" fill="#ffb703"/>',
  'hat-flowers': [[27, 22, '#ff8fab'], [36, 17, '#ffd43b'], [45, 15, '#74c0fc'], [55, 15, '#ff8fab'], [64, 17, '#ffd43b'], [73, 22, '#74c0fc']]
    .map(([x, y, c]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(r => `<circle cx="0" cy="-3.2" r="2.6" fill="${c}" transform="rotate(${r})"/>`).join('')}<circle r="2" fill="#fff3bf"/></g>`).join(''),
  'hat-riding': '<path d="M26 24 Q50 -4 74 24 Z" fill="#1d1d2b"/><path d="M68 23 Q82 22 86 27 Q75 29 64 26Z" fill="#11111a"/><path d="M27 24 Q50 30 73 24" stroke="#3a3a55" stroke-width="2" fill="none"/><circle cx="50" cy="6" r="2.2" fill="#3a3a55"/>',
  'hat-unicorn': '<path d="M45 18 L50 -8 L55 18 Z" fill="#ffd166" stroke="#e0a800" stroke-width="1"/><path d="M46 12 L54 9 M47 5 L53 2" stroke="#e0a800" stroke-width="1.2"/><path d="M28 22 Q50 14 72 22" stroke="#ff8fab" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="34" cy="19" r="3" fill="#ff8fab"/><circle cx="66" cy="19" r="3" fill="#74c0fc"/>',
  'hat-diamond': '<path d="M30 23 L32 6 L41 14 L50 0 L59 14 L68 6 L70 23 Z" fill="#d0ebff" stroke="#74c0fc" stroke-width="1.5" stroke-linejoin="round"/><path d="M50 8 L54 14 L50 20 L46 14Z" fill="#4dabf7"/><path d="M37 14 L40 18 L37 22 L34 18Z M63 14 L66 18 L63 22 L60 18Z" fill="#a5d8ff"/><path d="M36 9 l1 2 M60 4 l2 1" stroke="#fff" stroke-width="1.5"/>',
  'gl-star': ['37', '63'].map(x => `<path transform="translate(${x} 40) scale(1.15)" d="M0 -11 L3 -3.5 L11 -3.5 L4.5 1.5 L7 9.5 L0 4.5 L-7 9.5 L-4.5 1.5 L-11 -3.5 L-3 -3.5Z" fill="#ffd43b" fill-opacity=".85" stroke="#f08c00" stroke-width="1"/>`).join(''),
  'nk-pearls': [32, 38, 44, 50, 56, 62, 68].map((x, i) => `<circle cx="${x}" cy="${58 + Math.abs(3 - i) * -1 + 3}" r="2.6" fill="#fffaf0" stroke="#e6dccf" stroke-width=".8"/>`).join(''),
  'gl-round': '<g fill="none" stroke="#3a2c7a" stroke-width="2.4"><circle cx="37" cy="40" r="12"/><circle cx="63" cy="40" r="12"/><path d="M49 40 Q50 37 51 40"/></g>',
  'gl-heart': ['37', '63'].map(x => `<path transform="translate(${x} 41) scale(1.25)" d="M0 -3 C-5 -10 -14 -3 0 8 C14 -3 5 -10 0 -3Z" fill="#ff6b9a" fill-opacity=".82" stroke="#d6336c" stroke-width="1"/>`).join('') + '<path d="M47 39 h6" stroke="#d6336c" stroke-width="2"/>',
  'gl-sun': '<rect x="24" y="33" width="25" height="15" rx="6" fill="#1b1b2f"/><rect x="51" y="33" width="25" height="15" rx="6" fill="#1b1b2f"/><path d="M48 38 h4" stroke="#1b1b2f" stroke-width="3"/><path d="M28 37 h6 M55 37 h6" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>',
  'nk-bow': '<path d="M50 62 L37 55 L37 69 Z M50 62 L63 55 L63 69 Z" fill="#e5484d" stroke="#c43a3f" stroke-width="1" stroke-linejoin="round"/><circle cx="50" cy="62" r="3.2" fill="#c43a3f"/>',
  'nk-scarf': '<path d="M22 57 Q50 71 78 57 L78 64 Q50 78 22 64Z" fill="#2a9d8f"/><path d="M60 66 L64 86 L71 84 L68 64Z" fill="#2a9d8f"/><path d="M33 63 l2 5 M45 66 l1 5 M57 66 l-1 5 M68 62 l-2 5 M63 74 l7 -1 M64 80 l7 -1" stroke="#ffd43b" stroke-width="2"/>',
  'nk-medal': '<path d="M38 55 L50 73 L62 55" stroke="#3fa7ff" stroke-width="3.2" fill="none"/><circle cx="50" cy="77" r="7" fill="#ffc83d" stroke="#e0a800" stroke-width="1.5"/><text x="50" y="80.5" font-size="8.5" font-weight="900" text-anchor="middle" fill="#9c6c00" font-family="Nunito,sans-serif">1</text>',
};
const SKINS = {
  base: { body: '#7b5cf0', dark: '#6a4fd8', belly: '#ffe6b3', marks: '#e8c98a', ring: '#5b43c4' },
  'sk-pink': { body: '#f06292', dark: '#d81b60', belly: '#ffe4ec', marks: '#f8bbd0', ring: '#c2185b' },
  'sk-sky': { body: '#4fc3f7', dark: '#0288d1', belly: '#e1f5fe', marks: '#b3e5fc', ring: '#0277bd' },
  'sk-mint': { body: '#4db6ac', dark: '#00897b', belly: '#e0f2f1', marks: '#b2dfdb', ring: '#00796b' },
  'sk-gold': { body: '#ffc83d', dark: '#e0a800', belly: '#fff6d6', marks: '#f3d98a', ring: '#b8860b', extra: '<path d="M14 30 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2Z M86 62 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5Z" fill="#fff3b0"/>' },
  'sk-galaxy': { body: '#2b2363', dark: '#1b1446', belly: '#c9b8ff', marks: '#a68cff', ring: '#8f6bff', extra: '<g fill="#fff"><circle cx="30" cy="70" r="1.2"/><circle cx="72" cy="76" r="1"/><circle cx="26" cy="30" r="1"/><circle cx="74" cy="28" r="1.3"/><circle cx="64" cy="86" r="0.9"/><circle cx="34" cy="86" r="1.1"/></g>' },
};
const BACK_SVG = {
  'bk-wings': '<g opacity=".85"><ellipse cx="10" cy="42" rx="14" ry="22" fill="#b3e5fc" stroke="#81d4fa" stroke-width="1.5" transform="rotate(-20 10 42)"/><ellipse cx="90" cy="42" rx="14" ry="22" fill="#f8bbd0" stroke="#f48fb1" stroke-width="1.5" transform="rotate(20 90 42)"/><ellipse cx="12" cy="70" rx="9" ry="13" fill="#e1bee7" transform="rotate(20 12 70)"/><ellipse cx="88" cy="70" rx="9" ry="13" fill="#e1bee7" transform="rotate(-20 88 70)"/></g>',
  'bk-cape': '<path d="M26 40 Q50 50 74 40 L90 96 Q50 104 10 96 Z" fill="#e5484d"/><path d="M26 40 Q50 50 74 40 L78 48 Q50 58 22 48Z" fill="#c43a3f"/>',
  'bk-bag': '<rect x="74" y="44" width="20" height="26" rx="5" fill="#ffb703" stroke="#e09600" stroke-width="1.5"/><rect x="77" y="56" width="14" height="8" rx="2" fill="#ffd166"/>',
};
/* ---------- Lojinha ampliada: mais roupinhas, cores, amiguinhos, fundos e efeitos ---------- */
SHOP_CATS.splice(SHOP_CATS.findIndex(c => c.id === 'bg'), 0, { id: 'fx', label: '✨ Efeitos' });
SHOP_CATS.splice(SHOP_CATS.findIndex(c => c.id === 'skin'), 0, { id: 'mascot', label: '🐾 Trocar de bicho' });
// Categorias que vestem a mascote (aparecem no desenho)
const WEAR = ['hat', 'glasses', 'neck', 'back', 'skin', 'pet', 'fx', 'mascot'];
SHOP_ITEMS.push(
  // chapéus
  { id: 'hat-party', cat: 'hat', name: 'Chapéu de festa', price: 45 },
  { id: 'hat-bow', cat: 'hat', name: 'Laço gigante', price: 50 },
  { id: 'hat-beret', cat: 'hat', name: 'Boina de artista', price: 60 },
  { id: 'hat-beanie', cat: 'hat', name: 'Gorro de inverno', price: 70 },
  { id: 'hat-beach', cat: 'hat', name: 'Chapéu de praia', price: 80 },
  { id: 'hat-cat', cat: 'hat', name: 'Orelhas de gatinho', price: 90 },
  { id: 'hat-chef', cat: 'hat', name: 'Chapéu de chef', price: 100 },
  { id: 'hat-pirate', cat: 'hat', name: 'Chapéu de pirata', price: 160 },
  { id: 'hat-magic', cat: 'hat', name: 'Cartola mágica', price: 350 },
  { id: 'hat-astro', cat: 'hat', name: 'Capacete de astronauta', price: 900 },
  // óculos
  { id: 'gl-nerd', cat: 'glasses', name: 'Óculos de nerd', price: 40 },
  { id: 'gl-3d', cat: 'glasses', name: 'Óculos 3D', price: 90 },
  { id: 'gl-swim', cat: 'glasses', name: 'Óculos de natação', price: 70 },
  { id: 'gl-mono', cat: 'glasses', name: 'Monóculo chique', price: 150 },
  { id: 'gl-hero', cat: 'glasses', name: 'Máscara de heroína', price: 200 },
  // acessórios
  { id: 'nk-tie', cat: 'neck', name: 'Gravata', price: 40 },
  { id: 'nk-bandana', cat: 'neck', name: 'Bandana', price: 45 },
  { id: 'nk-bell', cat: 'neck', name: 'Sininho', price: 60 },
  { id: 'nk-lei', cat: 'neck', name: 'Colar havaiano', price: 100 },
  { id: 'nk-heart', cat: 'neck', name: 'Colar de coração', price: 180 },
  // costas
  { id: 'bk-butterfly', cat: 'back', name: 'Asas de borboleta', price: 450 },
  { id: 'bk-wizard', cat: 'back', name: 'Capa de mago', price: 500 },
  { id: 'bk-angel', cat: 'back', name: 'Asas de anjo', price: 800 },
  { id: 'bk-jet', cat: 'back', name: 'Mochila a jato', price: 1500 },
  // cores
  { id: 'sk-lilac', cat: 'skin', name: 'Lumi Lilás', price: 120 },
  { id: 'sk-orange', cat: 'skin', name: 'Lumi Laranja', price: 120 },
  { id: 'sk-snow', cat: 'skin', name: 'Lumi Neve', price: 300 },
  { id: 'sk-night', cat: 'skin', name: 'Lumi Noite', price: 400 },
  { id: 'sk-rainbow', cat: 'skin', name: 'Lumi Arco-íris', price: 2000 },
  // amiguinhos
  { id: 'pt-fish', cat: 'pet', name: 'Peixinho', price: 200, emoji: '🐠' },
  { id: 'pt-bunny', cat: 'pet', name: 'Coelhinho', price: 300, emoji: '🐰' },
  { id: 'pt-turtle', cat: 'pet', name: 'Tartaruguinha', price: 350, emoji: '🐢' },
  { id: 'pt-octo', cat: 'pet', name: 'Polvinho', price: 400, emoji: '🐙' },
  { id: 'pt-dog', cat: 'pet', name: 'Cachorrinho', price: 450, emoji: '🐶' },
  { id: 'pt-penguin', cat: 'pet', name: 'Pinguim', price: 500, emoji: '🐧' },
  { id: 'pt-fox', cat: 'pet', name: 'Raposinha', price: 600, emoji: '🦊' },
  { id: 'pt-koala', cat: 'pet', name: 'Coala', price: 700, emoji: '🐨' },
  { id: 'pt-dolphin', cat: 'pet', name: 'Golfinho', price: 800, emoji: '🐬' },
  { id: 'pt-unicorn', cat: 'pet', name: 'Unicórnio', price: 2000, emoji: '🦄' },
  // trocar de bicho: a Lumi vira outro animal (desenhos originais; roupinhas continuam servindo)
  { id: 'ms-owl', cat: 'mascot', name: 'Corujinha (original)', price: 0 },
  { id: 'ms-dog', cat: 'mascot', name: 'Cachorrinho', price: 2000 },
  { id: 'ms-cat', cat: 'mascot', name: 'Gatinho', price: 2000 },
  { id: 'ms-panda', cat: 'mascot', name: 'Pandinha', price: 2500 },
  // efeitos ao redor da Lumi
  { id: 'fx-bubbles', cat: 'fx', name: 'Bolhas', price: 150, fx: '🫧' },
  { id: 'fx-sparkle', cat: 'fx', name: 'Brilhos', price: 150, fx: '✨' },
  { id: 'fx-hearts', cat: 'fx', name: 'Corações', price: 200, fx: '💕' },
  { id: 'fx-music', cat: 'fx', name: 'Notas musicais', price: 200, fx: '🎵' },
  { id: 'fx-flowers', cat: 'fx', name: 'Pétalas', price: 250, fx: '🌸' },
  { id: 'fx-stars', cat: 'fx', name: 'Estrelinhas', price: 250, fx: '⭐' },
  { id: 'fx-snow', cat: 'fx', name: 'Floquinhos de neve', price: 300, fx: '❄️' },
  { id: 'fx-rainbow', cat: 'fx', name: 'Arco-íris', price: 600 },
  { id: 'fx-crown', cat: 'fx', name: 'Aura dourada', price: 2000 },
  // fundos
  { id: 'bg-clouds', cat: 'bg', name: 'Nuvens', price: 150, theme: 'theme-clouds', sw: 'linear-gradient(180deg,#dbeafe,#ffffff)' },
  { id: 'bg-jungle', cat: 'bg', name: 'Selva', price: 250, theme: 'theme-jungle', sw: 'linear-gradient(160deg,#9be7a8,#e9fcd2)' },
  { id: 'bg-snow', cat: 'bg', name: 'Inverno', price: 250, theme: 'theme-snow', sw: 'linear-gradient(180deg,#e3f2fd,#f8fbff)' },
  { id: 'bg-moon', cat: 'bg', name: 'Noite de lua', price: 400, theme: 'theme-moon', sw: 'linear-gradient(160deg,#0f1b3d,#3b4a8a)' },
  { id: 'bg-aurora', cat: 'bg', name: 'Aurora boreal', price: 1500, theme: 'theme-aurora', sw: 'linear-gradient(160deg,#0b2545,#13a89e,#8f6bff)' },
  // adesivos
  ...[['🍓', 15], ['🌻', 15], ['🐞', 15], ['🎈', 15], ['🍕', 15], ['🐸', 20], ['🦉', 20], ['🐙', 20], ['🎸', 25], ['⚽', 25],
      ['🏇', 30], ['🌍', 30], ['🦜', 30], ['🍭', 20], ['🧸', 35], ['🔮', 40], ['🪐', 45], ['🌠', 50], ['🦚', 60], ['🏰', 80]]
    .map(([e, p], i) => ({ id: 'st2-' + i, cat: 'sticker', name: 'Adesivo', emoji: e, price: p })),
);

Object.assign(ACCESSORY_SVG, {
  // laço apoiado no alto da cabeça, com as pontas caindo por cima dela
  'hat-bow': '<g stroke="#c2255c" stroke-width="1.2" stroke-linejoin="round"><path d="M60 24 Q57 29 52.5 32 L57 33.5 Q60.5 29 62 25Z" fill="#f06595"/><path d="M64 24 Q67 29 71.5 31.5 L67 33.5 Q64.5 29 63 25Z" fill="#f06595"/><path d="M62 23 Q47 7 44 17 Q43 28 62 23Z" fill="#ff8fab"/><path d="M62 23 Q77 7 80 17 Q81 28 62 23Z" fill="#ff8fab"/></g><path d="M49 15 Q53 14 56 18 M75 15 Q71 14 68 18" stroke="#fff" stroke-opacity=".6" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="62" cy="22.5" r="4" fill="#e64980" stroke="#c2255c" stroke-width="1.2"/>',
  'hat-beach': '<path d="M32 22 Q33 3 50 3 Q67 3 68 22Z" fill="#f7dc9b" stroke="#d4a53c" stroke-width="1.2"/><path d="M32.6 15 Q50 19 67.4 15 L68 21 Q50 25 32 21Z" fill="#ff6b9a"/><ellipse cx="50" cy="23" rx="37" ry="7" fill="#f4d58d" stroke="#d4a53c" stroke-width="1.2"/><path d="M20 23 Q50 28 80 23" stroke="#d4a53c" stroke-width=".8" fill="none" opacity=".6"/>' + [0, 72, 144, 216, 288].map(r => `<circle cx="64" cy="14.5" r="2.6" fill="#ffd43b" transform="rotate(${r} 64 17.5)"/>`).join('') + '<circle cx="64" cy="17.5" r="2" fill="#ff922b"/>',
  'hat-magic': '<ellipse cx="50" cy="23" rx="27" ry="5.5" fill="#212529"/><path d="M36 22 L37.5 -5 Q50 -8 62.5 -5 L64 22Z" fill="#2b2b33"/><path d="M36.6 13 L63.4 13 L63.7 19 L36.3 19Z" fill="#e5484d"/><ellipse cx="50" cy="-5" rx="12.5" ry="3" fill="#3a3a44"/><path d="M40 -1 L41 10" stroke="#fff" stroke-opacity=".25" stroke-width="2.5" stroke-linecap="round"/><path d="M70 2 l1.4 3 l3 1.4 l-3 1.4 l-1.4 3 l-1.4 -3 l-3 -1.4 l3 -1.4Z" fill="#ffd43b"/>',
  'hat-party': '<path d="M38 22 L50 -6 L62 22 Z" fill="#74c0fc"/><path d="M41 15 L59 15 M44 8 L56 8 M47 1 L53 1" stroke="#ff6b9a" stroke-width="3"/><circle cx="50" cy="-7" r="3.5" fill="#ffd43b"/>',
  'hat-beret': '<ellipse cx="46" cy="18" rx="25" ry="9" fill="#e03131" transform="rotate(-8 46 18)"/><circle cx="44" cy="8" r="2.5" fill="#c92a2a"/>',
  'hat-beanie': '<path d="M26 24 Q28 0 50 0 Q72 0 74 24 Z" fill="#4dabf7"/><rect x="25" y="18" width="50" height="8" rx="4" fill="#1c7ed6"/><circle cx="50" cy="-2" r="6" fill="#fff"/><path d="M36 6 v12 M50 3 v15 M64 6 v12" stroke="#74c0fc" stroke-width="2"/>',
  'hat-cat': '<path d="M24 26 L26 2 L42 18 Z" fill="#ffc9de" stroke="#f783ac" stroke-width="2"/><path d="M76 26 L74 2 L58 18 Z" fill="#ffc9de" stroke="#f783ac" stroke-width="2"/><path d="M28 20 Q50 12 72 20" stroke="#f783ac" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  'hat-chef': '<circle cx="35" cy="10" r="9.5" fill="#fff" stroke="#dee2e6" stroke-width="1.2"/><circle cx="65" cy="10" r="9.5" fill="#fff" stroke="#dee2e6" stroke-width="1.2"/><circle cx="50" cy="4" r="11.5" fill="#fff" stroke="#dee2e6" stroke-width="1.2"/><path d="M29 13 h42 v11 q-21 4 -42 0Z" fill="#fff" stroke="#dee2e6" stroke-width="1.2"/><path d="M38 15 v7 M50 15 v8 M62 15 v7" stroke="#e9ecef" stroke-width="1.5"/>',
  'hat-pirate': '<path d="M15 26 Q20 5 50 3 Q80 5 85 26 Q66 17 50 23 Q34 17 15 26Z" fill="#212529"/><path d="M15 26 Q34 17 50 23 Q66 17 85 26" stroke="#ffd43b" stroke-width="1.8" fill="none"/><circle cx="50" cy="11" r="4.2" fill="#fff"/><circle cx="48.4" cy="10.5" r="1" fill="#212529"/><circle cx="51.6" cy="10.5" r="1" fill="#212529"/><path d="M45 17 l10 -4 M45 13 l10 4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
  'hat-astro': '<circle cx="50" cy="44" r="40" fill="#d0ebff" fill-opacity=".28" stroke="#adb5bd" stroke-width="3"/><path d="M24 22 Q34 12 46 10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/><circle cx="50" cy="3" r="3" fill="#fa5252"/>',
  'gl-nerd': '<g fill="none" stroke="#212529" stroke-width="3"><rect x="25" y="32" width="23" height="17" rx="3"/><rect x="52" y="32" width="23" height="17" rx="3"/><path d="M48 39 h4"/></g>',
  'gl-3d': '<rect x="24" y="32" width="25" height="15" rx="2" fill="#fa5252" fill-opacity=".75" stroke="#fff" stroke-width="2"/><rect x="51" y="32" width="25" height="15" rx="2" fill="#4dabf7" fill-opacity=".75" stroke="#fff" stroke-width="2"/>',
  'gl-swim': '<path d="M20 40 H80" stroke="#15aabf" stroke-width="3"/><ellipse cx="37" cy="40" rx="12" ry="10" fill="#99e9f2" fill-opacity=".55" stroke="#1098ad" stroke-width="3"/><ellipse cx="63" cy="40" rx="12" ry="10" fill="#99e9f2" fill-opacity=".55" stroke="#1098ad" stroke-width="3"/>',
  'gl-mono': '<circle cx="63" cy="40" r="12" fill="none" stroke="#f59f00" stroke-width="2.5"/><path d="M74 46 Q80 64 70 78" stroke="#f59f00" stroke-width="1.5" fill="none"/>',
  'gl-hero': '<path d="M18 36 Q50 26 82 36 Q84 46 74 50 Q62 54 50 46 Q38 54 26 50 Q16 46 18 36Z" fill="#212529"/><ellipse cx="37" cy="41" rx="7" ry="6" fill="#fff"/><ellipse cx="63" cy="41" rx="7" ry="6" fill="#fff"/><circle cx="38" cy="42" r="3.5" fill="#2b2350"/><circle cx="62" cy="42" r="3.5" fill="#2b2350"/>',
  'nk-tie': '<path d="M46 58 L54 58 L52 62 L56 82 L50 88 L44 82 L48 62 Z" fill="#1c7ed6"/><path d="M47 70 l6 -4 M46 77 l8 -5" stroke="#74c0fc" stroke-width="1.5"/>',
  'nk-bandana': '<path d="M28 56 Q50 64 72 56 L50 80 Z" fill="#fa5252"/><circle cx="44" cy="62" r="1.5" fill="#fff"/><circle cx="56" cy="62" r="1.5" fill="#fff"/><circle cx="50" cy="70" r="1.5" fill="#fff"/>',
  'nk-bell': '<path d="M36 58 Q50 64 64 58" stroke="#e03131" stroke-width="3" fill="none"/><circle cx="50" cy="66" r="6" fill="#fcc419" stroke="#f08c00" stroke-width="1.5"/><path d="M46 66 h8" stroke="#f08c00" stroke-width="1.2"/>',
  'nk-lei': [28, 34, 40, 46, 52, 58, 64, 70].map((x, i) => `<circle cx="${x}" cy="${58 + (i > 0 && i < 7 ? 3 : 0) + (i > 1 && i < 6 ? 2 : 0)}" r="3.6" fill="${['#ff8fab', '#ffd43b', '#ff922b', '#da77f2'][i % 4]}"/>`).join(''),
  'nk-heart': '<path d="M36 57 Q50 66 64 57" stroke="#adb5bd" stroke-width="1.5" fill="none"/><path transform="translate(50 68) scale(.75)" d="M0 -3 C-5 -10 -14 -3 0 8 C14 -3 5 -10 0 -3Z" fill="#f03e3e"/>',
});
Object.assign(BACK_SVG, {
  'bk-butterfly': '<path d="M50 50 Q8 4 4 40 Q4 62 50 54Z" fill="#ffa94d" stroke="#e8590c" stroke-width="1.5"/><path d="M50 50 Q92 4 96 40 Q96 62 50 54Z" fill="#ffa94d" stroke="#e8590c" stroke-width="1.5"/><path d="M50 56 Q14 64 16 86 Q32 90 50 60Z" fill="#da77f2"/><path d="M50 56 Q86 64 84 86 Q68 90 50 60Z" fill="#da77f2"/><circle cx="18" cy="36" r="4" fill="#fff"/><circle cx="82" cy="36" r="4" fill="#fff"/>',
  'bk-wizard': '<path d="M24 40 Q50 50 76 40 L92 98 Q50 106 8 98 Z" fill="#5f3dc4"/><path d="M20 90 l2 4 l4 1 l-4 1 l-2 4 l-2 -4 l-4 -1 l4 -1Z M80 84 l2 4 l4 1 l-4 1 l-2 4 l-2 -4 l-4 -1 l4 -1Z M14 66 l1.5 3 l3 1 l-3 1 l-1.5 3 l-1.5 -3 l-3 -1 l3 -1Z" fill="#ffd43b"/>',
  'bk-angel': '<g fill="#fff" stroke="#dee2e6" stroke-width="1.5"><path d="M30 46 Q-6 30 2 62 Q10 76 30 64Z"/><path d="M70 46 Q106 30 98 62 Q90 76 70 64Z"/><path d="M28 52 Q4 50 8 70 Q18 78 30 66Z"/><path d="M72 52 Q96 50 92 70 Q82 78 70 66Z"/></g><ellipse cx="50" cy="2" rx="16" ry="4" fill="none" stroke="#ffd43b" stroke-width="3"/>',
  'bk-jet': '<rect x="10" y="42" width="14" height="34" rx="6" fill="#868e96" stroke="#495057" stroke-width="1.5"/><rect x="76" y="42" width="14" height="34" rx="6" fill="#868e96" stroke="#495057" stroke-width="1.5"/><path d="M12 76 Q17 98 22 76Z M78 76 Q83 98 88 76Z" fill="#ff922b"/><path d="M14 76 Q17 90 20 76Z M80 76 Q83 90 86 76Z" fill="#ffd43b"/>',
});
Object.assign(SKINS, {
  'sk-lilac': { body: '#b197fc', dark: '#9775fa', belly: '#f3f0ff', marks: '#d0bfff', ring: '#7950f2' },
  'sk-orange': { body: '#ff922b', dark: '#f76707', belly: '#fff4e6', marks: '#ffd8a8', ring: '#e8590c' },
  'sk-snow': { body: '#f8f9fa', dark: '#dee2e6', belly: '#ffffff', marks: '#e9ecef', ring: '#adb5bd' },
  'sk-night': { body: '#364fc7', dark: '#283593', belly: '#dbe4ff', marks: '#bac8ff', ring: '#1a237e', extra: '<path d="M70 70 a6 6 0 1 0 6 8 a5 5 0 1 1 -6 -8Z" fill="#ffe066"/>' },
  'sk-rainbow': { body: 'url(#lumiRainbow)', dark: '#845ef7', belly: '#fff9db', marks: '#ffe066', ring: '#7048e8',
    extra: '<defs><linearGradient id="lumiRainbow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset=".25" stop-color="#ffd43b"/><stop offset=".5" stop-color="#69db7c"/><stop offset=".75" stop-color="#4dabf7"/><stop offset="1" stop-color="#b197fc"/></linearGradient></defs>' },
});
// Efeitos: emojis espalhados ao redor da Lumi (ou desenhos especiais)
const FX_POS = [[4, 14, 13], [86, 6, 11], [92, 52, 12], [2, 60, 11], [16, 98, 10], [60, -4, 9]];
function fxSVG(id) {
  if (!id) return '';
  if (id === 'fx-rainbow') return '<g fill="none" stroke-width="4" opacity=".75"><path d="M2 60 A48 48 0 0 1 98 60" stroke="#ff6b6b"/><path d="M7 60 A43 43 0 0 1 93 60" stroke="#ffd43b"/><path d="M12 60 A38 38 0 0 1 88 60" stroke="#69db7c"/><path d="M17 60 A33 33 0 0 1 83 60" stroke="#4dabf7"/></g>';
  if (id === 'fx-crown') return '<ellipse cx="50" cy="56" rx="46" ry="48" fill="#ffd43b" opacity=".22"/><ellipse cx="50" cy="56" rx="40" ry="42" fill="none" stroke="#fcc419" stroke-width="2" stroke-dasharray="3 5"/>' + FX_POS.map(([x, y, s]) => `<text x="${x}" y="${y}" font-size="${s}">✨</text>`).join('');
  const it = SHOP_ITEMS.find(i => i.id === id);
  return it && it.fx ? FX_POS.map(([x, y, s]) => `<text x="${x}" y="${y}" font-size="${s}" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${it.fx}</text>`).join('') : '';
}
function emojiAcc(id) {
  const it = id && SHOP_ITEMS.find(i => i.id === id);
  if (!it || !it.emoji || !it.pos) return '';
  const [x, y, s] = it.pos;
  return `<text x="${x}" y="${y}" font-size="${s}" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${it.emoji}</text>`;
}

// Bichos da Lumi: desenhos originais no mesmo "molde" da coruja (corpo, olhos em 37/63 e pescoço em ~58),
// para chapéus, óculos e colares servirem em todos. Cada um tem cores próprias; as "Cores da Lumi" valem para todos.
const ANIMAL_COLORS = {
  'ms-dog': { body: '#d9a066', dark: '#9c6332', belly: '#fff4e2', marks: '#b97a3f', ring: '#5c3a1a' },
  'ms-cat': { body: '#f4a259', dark: '#d9782d', belly: '#fff1df', marks: '#d9782d', ring: '#a55a1d' },
  'ms-panda': { body: '#f8f9fa', dark: '#2b2b33', belly: '#ffffff', marks: '#dee2e6', ring: '#2b2b33' },
};
const INK = '#2b2350';
function animalEyes(mood, pupilR = 5.5) {
  const pos = mood === 'think' ? [[38, 37], [62, 37]] : [[37, 41], [63, 41]];
  const r = mood === 'wow' ? pupilR + 1.5 : pupilR;
  return pos.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="${r * .9}" ry="${r * 1.08}" fill="${INK}"/><circle cx="${x + 1.8}" cy="${y - 2.2}" r="${r * .36}" fill="#fff"/><circle cx="${x - 1.6}" cy="${y + 2}" r="${r * .16}" fill="#fff"/>`).join('');
}
const ANIMALS = {
  'ms-dog': (P, mood) => ({
    behind: `<path d="M77 76 Q97 70 93 50 Q90 46 87 50 Q89 62 75 68Z" fill="${P.dark}"/>`,
    arms: `<ellipse cx="23" cy="68" rx="6.5" ry="11" fill="${P.dark}" transform="rotate(14 23 68)"/><ellipse cx="77" cy="68" rx="6.5" ry="11" fill="${P.dark}" transform="rotate(-14 77 68)"/>`,
    belly: `<ellipse cx="50" cy="72" rx="17" ry="17" fill="${P.belly}"/>`,
    face: `<ellipse cx="64" cy="39" rx="11" ry="10" fill="${P.marks}" opacity=".85"/>${animalEyes(mood)}
      <ellipse cx="50" cy="55" rx="13" ry="9.5" fill="${P.belly}"/>
      <path d="M44.5 50 Q50 46.5 55.5 50 Q54.5 55 50 56 Q45.5 55 44.5 50Z" fill="${INK}"/><ellipse cx="48.5" cy="49.8" rx="2" ry="1" fill="#fff" opacity=".6"/>
      ${mood === 'sad' ? `<path d="M44 61 q6 -4 12 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` : `<path d="M50 56 v2.5 M44 58.5 q3 3 6 0 q3 3 6 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M47.5 60.5 q2.5 6 5 0Z" fill="#ff8fab"/>`}`,
    front: `<path d="M27 23 Q11 24 12 47 Q14 59 23 55 Q27 41 35 28Z" fill="${P.dark}"/><path d="M73 23 Q89 24 88 47 Q86 59 77 55 Q73 41 65 28Z" fill="${P.dark}"/>`,
    feet: `<ellipse cx="39" cy="90" rx="8" ry="4.5" fill="${P.dark}"/><ellipse cx="61" cy="90" rx="8" ry="4.5" fill="${P.dark}"/><path d="M37 88 v3 M41 88 v3 M59 88 v3 M63 88 v3" stroke="${P.belly}" stroke-width="1" opacity=".7"/>`,
  }),
  'ms-cat': (P, mood) => ({
    behind: `<path d="M23 34 L23 5 L45 21Z" fill="${P.body}"/><path d="M27.5 27 L27.5 12 L38.5 21Z" fill="#ffb3c6"/><path d="M77 34 L77 5 L55 21Z" fill="${P.body}"/><path d="M72.5 27 L72.5 12 L61.5 21Z" fill="#ffb3c6"/>
      <path d="M76 82 Q99 80 95 58 Q93 47 85 49 Q91 55 89 63 Q87 72 75 73Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/><path d="M90 52 l4 -2 M92 60 l4 0 M90 68 l4 2" stroke="${P.marks}" stroke-width="2" stroke-linecap="round"/>`,
    arms: `<ellipse cx="23" cy="69" rx="6" ry="10" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2" transform="rotate(14 23 69)"/><ellipse cx="77" cy="69" rx="6" ry="10" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2" transform="rotate(-14 77 69)"/>`,
    belly: `<ellipse cx="50" cy="71" rx="17" ry="18" fill="${P.belly}"/>`,
    face: `<path d="M44 23 q2 5 0 9 M50 21 v10 M56 23 q-2 5 0 9" stroke="${P.marks}" stroke-width="2.4" fill="none" stroke-linecap="round"/>${animalEyes(mood, 6)}
      <path d="M46.5 50 L53.5 50 L50 54Z" fill="#ff8fab" stroke="#e64980" stroke-width=".8" stroke-linejoin="round"/>
      ${mood === 'sad' ? `<path d="M45 59 q5 -3 10 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` : `<path d="M50 54 v2.5 M45 56.5 q2.5 3 5 0 q2.5 3 5 0" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`}
      <path d="M31 51 h-13 M31 54.5 l-12 3.5 M69 51 h13 M69 54.5 l12 3.5" stroke="${INK}" stroke-width="1.1" opacity=".55" stroke-linecap="round"/>`,
    front: '',
    feet: `<ellipse cx="39" cy="90" rx="7.5" ry="4.5" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2"/><ellipse cx="61" cy="90" rx="7.5" ry="4.5" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2"/>`,
  }),
  'ms-panda': (P, mood) => ({
    behind: `<circle cx="25" cy="24" r="10.5" fill="${P.dark}"/><circle cx="75" cy="24" r="10.5" fill="${P.dark}"/><circle cx="25" cy="24" r="5" fill="#495057" opacity=".5"/><circle cx="75" cy="24" r="5" fill="#495057" opacity=".5"/>`,
    arms: `<ellipse cx="22" cy="67" rx="8" ry="13" fill="${P.dark}" transform="rotate(16 22 67)"/><ellipse cx="78" cy="67" rx="8" ry="13" fill="${P.dark}" transform="rotate(-16 78 67)"/>`,
    belly: `<ellipse cx="50" cy="71" rx="18" ry="18" fill="${P.belly}" stroke="${P.marks}" stroke-width="1"/>`,
    face: `<ellipse cx="36" cy="42" rx="9.5" ry="12" fill="${P.dark}" transform="rotate(28 36 42)"/><ellipse cx="64" cy="42" rx="9.5" ry="12" fill="${P.dark}" transform="rotate(-28 64 42)"/>
      ${(mood === 'think' ? [[38, 38], [62, 38]] : [[37, 41], [63, 41]]).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${mood === 'wow' ? 5.5 : 4.6}" fill="#fff"/><circle cx="${x + .6}" cy="${y + .4}" r="${mood === 'wow' ? 3.4 : 2.8}" fill="${INK}"/><circle cx="${x + 1.6}" cy="${y - 1}" r="1" fill="#fff"/>`).join('')}
      <ellipse cx="50" cy="52" rx="4.8" ry="3.2" fill="${P.dark}"/>
      ${mood === 'sad' ? `<path d="M45 60 q5 -3 10 0" stroke="${P.dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` : `<path d="M50 55 v2.5 M45.5 57.5 q2.25 2.5 4.5 0 q2.25 2.5 4.5 0" stroke="${P.dark}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`}`,
    front: '',
    feet: `<ellipse cx="38" cy="90" rx="9" ry="5" fill="${P.dark}"/><ellipse cx="62" cy="90" rx="9" ry="5" fill="${P.dark}"/>`,
  }),
};
function mascotSVG(eq = S.equipped, mood = 'happy') {
  const kind = ANIMALS[eq.mascot] ? eq.mascot : null;
  const P = SKINS[eq.skin] || (kind ? ANIMAL_COLORS[kind] : SKINS.base);
  const pet = eq.pet && (SHOP_ITEMS.find(i => i.id === eq.pet) || {}).emoji;
  const acc = id => (id && (ACCESSORY_SVG[id] || emojiAcc(id))) || '';
  const head = `<svg class="owl" viewBox="0 -12 100 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="50" cy="96" rx="24" ry="4" fill="rgba(0,0,0,.12)"/>
    ${fxSVG(eq.fx)}${(eq.back && (BACK_SVG[eq.back] || emojiAcc(eq.back))) || ''}`;
  const neck = acc(eq.neck);
  const tail = `${kind && neck ? `<g transform="translate(0 6)">${neck}</g>` : neck}${acc(eq.glasses)}${acc(eq.hat)}
    ${pet ? `<text x="70" y="99" font-size="24" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${pet}</text>` : ''}
  </svg>`;
  if (kind) {
    const A = ANIMALS[kind](P, mood);
    const blush = '<ellipse cx="25" cy="52" rx="5" ry="3" fill="#ff8fab" opacity=".5"/><ellipse cx="75" cy="52" rx="5" ry="3" fill="#ff8fab" opacity=".5"/>';
    const [la, ra] = A.arms.includes('/><') ? [A.arms.split('/><')[0] + '/>', '<' + A.arms.split('/><').slice(1).join('/><')] : [A.arms, ''];
    return `${head}${A.behind}<g class="arm-l">${la}</g><g class="arm-r">${ra}</g>
    <ellipse cx="50" cy="56" rx="32" ry="36" fill="${P.body}"/>${A.belly}${P.extra || ''}${blush}${A.face}${A.front}${A.feet}${tail}`;
  }
  const pupils = mood === 'think' ? [[39, 36], [61, 36]] : mood === 'wow' ? [[37, 41], [63, 41]] : [[38, 42], [62, 42]];
  const pr = mood === 'wow' ? 7 : 5.5;
  const brows = mood === 'sad'
    ? '<path d="M27 27 L45 31 M73 27 L55 31" stroke="#3a2c7a" stroke-width="2.6" stroke-linecap="round"/>'
    : mood === 'think' ? '<path d="M28 27 Q37 23 46 27" stroke="#3a2c7a" stroke-width="2.2" fill="none" stroke-linecap="round"/>' : '';
  return `${head}
    <path d="M23 28 L28 8 L41 22 Z" fill="${P.dark}"/><path d="M77 28 L72 8 L59 22 Z" fill="${P.dark}"/>
    <g class="arm-l"><path d="M19 52 Q8 72 26 84 Q30 66 19 52Z" fill="${P.dark}"/></g><g class="arm-r"><path d="M81 52 Q92 72 74 84 Q70 66 81 52Z" fill="${P.dark}"/></g>
    <ellipse cx="50" cy="56" rx="32" ry="36" fill="${P.body}"/>
    <ellipse cx="50" cy="67" rx="20" ry="22" fill="${P.belly}"/>
    <path d="M41 64 q3 3 6 0 M53 64 q3 3 6 0 M47 72 q3 3 6 0 M41 80 q3 3 6 0 M53 80 q3 3 6 0" stroke="${P.marks}" stroke-width="1.6" fill="none" stroke-linecap="round"/>${P.extra || ''}
    <ellipse cx="26" cy="53" rx="5" ry="3" fill="#ff8fab" opacity=".55"/><ellipse cx="74" cy="53" rx="5" ry="3" fill="#ff8fab" opacity=".55"/>
    <circle cx="37" cy="40" r="12" fill="#fff" stroke="${P.ring}" stroke-width="2"/><circle cx="63" cy="40" r="12" fill="#fff" stroke="${P.ring}" stroke-width="2"/>
    <circle cx="${pupils[0][0]}" cy="${pupils[0][1]}" r="${pr}" fill="#2b2350"/><circle cx="${pupils[1][0]}" cy="${pupils[1][1]}" r="${pr}" fill="#2b2350"/>
    <circle cx="${pupils[0][0] + 2}" cy="${pupils[0][1] - 2}" r="1.8" fill="#fff"/><circle cx="${pupils[1][0] + 2}" cy="${pupils[1][1] - 2}" r="1.8" fill="#fff"/>
    ${brows}
    <path d="M45 50 L55 50 L50 58 Z" fill="#ffb703" stroke="#e09600" stroke-width="1" stroke-linejoin="round"/>
    <path d="M38 91 q2 -5 4 0 q2 -5 4 0 M54 91 q2 -5 4 0 q2 -5 4 0" stroke="#ffb703" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    ${tail}`;
}
function itemPreviewSVG(item) {
  const eq = { hat: null, glasses: null, neck: null, back: null, skin: null, pet: null, fx: null, mascot: null };
  if (item.cat !== 'mascot') eq.mascot = S.equipped.mascot;   // roupinha/cor nova no bicho que ela está usando
  eq[item.cat] = item.id === 'ms-owl' ? null : item.id;
  return mascotSVG(eq);
}

/* ---------- Fase 3: ovos, coleção e troca de mascote ---------- */
// Mascotes alternativos (desenhos originais no mesmo molde da coruja). O apelido aparece no app quando o mascote está em uso.
Object.assign(ANIMAL_COLORS, {
  'ms-bunny': { body: '#f1f3f5', dark: '#c9ced6', belly: '#ffffff', marks: '#ffc9de', ring: '#868e96' },
  'ms-fox': { body: '#f08c3a', dark: '#c25e12', belly: '#fff4e6', marks: '#3b2a20', ring: '#7a3b0c' },
  'ms-penguin': { body: '#34495e', dark: '#1f2d3a', belly: '#ffffff', marks: '#ffa94d', ring: '#1f2d3a' },
  'ms-dino': { body: '#69db7c', dark: '#2f9e44', belly: '#d3f9d8', marks: '#ffd43b', ring: '#2b8a3e' },
});
const smile = (mood, y = 55, c = INK) => mood === 'sad'
  ? `<path d="M45 ${y + 5} q5 -3 10 0" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
  : `<path d="M50 ${y} v2.5 M45 ${y + 2.5} q2.5 3 5 0 q2.5 3 5 0" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
Object.assign(ANIMALS, {
  'ms-bunny': (P, mood) => ({
    behind: `<ellipse cx="37" cy="6" rx="8" ry="19" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5" transform="rotate(-12 37 4)"/><ellipse cx="37" cy="7" rx="4" ry="13.5" fill="${P.marks}" transform="rotate(-12 37 5)"/>
      <ellipse cx="63" cy="6" rx="8" ry="19" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5" transform="rotate(12 63 4)"/><ellipse cx="63" cy="7" rx="4" ry="13.5" fill="${P.marks}" transform="rotate(12 63 5)"/>
      <circle cx="81" cy="80" r="8" fill="#fff" stroke="${P.dark}" stroke-width="1.2"/>`,
    arms: `<ellipse cx="23" cy="69" rx="6" ry="10" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2" transform="rotate(14 23 69)"/><ellipse cx="77" cy="69" rx="6" ry="10" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2" transform="rotate(-14 77 69)"/>`,
    belly: `<ellipse cx="50" cy="72" rx="17" ry="17" fill="${P.belly}" stroke="${P.dark}" stroke-width=".8" opacity=".95"/>`,
    face: `${animalEyes(mood, 6)}<path d="M47 50 Q50 48 53 50 Q50 54 47 50Z" fill="#f783ac"/>
      ${smile(mood, 52.5)}${mood === 'sad' ? '' : '<rect x="48" y="57" width="4" height="4" rx="1" fill="#fff" stroke="#adb5bd" stroke-width=".6"/>'}
      <path d="M33 52 h-12 M33 55 l-11 3 M67 52 h12 M67 55 l11 3" stroke="#868e96" stroke-width="1" opacity=".6" stroke-linecap="round"/>`,
    front: '',
    feet: `<ellipse cx="38" cy="90" rx="10" ry="5" fill="${P.belly}" stroke="${P.dark}" stroke-width="1.2"/><ellipse cx="62" cy="90" rx="10" ry="5" fill="${P.belly}" stroke="${P.dark}" stroke-width="1.2"/>`,
  }),
  'ms-fox': (P, mood) => ({
    behind: `<path d="M22 34 L20 3 L45 20Z" fill="${P.body}"/><path d="M21 12 L20 3 L29 9Z" fill="${P.marks}"/><path d="M78 34 L80 3 L55 20Z" fill="${P.body}"/><path d="M79 12 L80 3 L71 9Z" fill="${P.marks}"/>
      <path d="M74 84 Q102 84 98 54 Q96 40 86 44 Q92 52 89 62 Q86 74 72 74Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.4"/><path d="M93 46 Q97 41 98 50 Q98 56 95 58 Q90 52 93 46Z" fill="#fff"/>`,
    arms: `<ellipse cx="23" cy="69" rx="6" ry="10" fill="${P.dark}" transform="rotate(14 23 69)"/><ellipse cx="77" cy="69" rx="6" ry="10" fill="${P.dark}" transform="rotate(-14 77 69)"/>`,
    belly: `<ellipse cx="50" cy="73" rx="16" ry="16" fill="${P.belly}"/>`,
    face: `<path d="M22 50 Q30 63 50 64 Q70 63 78 50 Q66 56 50 49 Q34 56 22 50Z" fill="${P.belly}"/>${animalEyes(mood)}
      <ellipse cx="50" cy="51" rx="3.6" ry="2.6" fill="${INK}"/>${smile(mood, 54)}`,
    front: '',
    feet: `<ellipse cx="39" cy="90" rx="8" ry="4.5" fill="${P.marks}"/><ellipse cx="61" cy="90" rx="8" ry="4.5" fill="${P.marks}"/>`,
  }),
  'ms-penguin': (P, mood) => ({
    behind: `<path d="M46 20 Q50 10 54 20" stroke="${P.body}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    arms: `<ellipse cx="20" cy="64" rx="6.5" ry="16" fill="${P.dark}" transform="rotate(22 20 64)"/><ellipse cx="80" cy="64" rx="6.5" ry="16" fill="${P.dark}" transform="rotate(-22 80 64)"/>`,
    belly: `<path d="M50 30 Q60 28 66 32 Q78 36 77 50 Q80 62 72 78 Q64 92 50 92 Q36 92 28 78 Q20 62 23 50 Q22 36 34 32 Q40 28 50 30Z" fill="${P.belly}"/>`,
    face: `${animalEyes(mood)}<path d="M44.5 49 L55.5 49 L50 56Z" fill="${P.marks}" stroke="#e8590c" stroke-width=".9" stroke-linejoin="round"/>
      ${mood === 'sad' ? `<path d="M45 61 q5 -3 10 0" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` : ''}`,
    front: '',
    feet: `<path d="M31 88 l9 -2 l6 4 l-7 3Z M69 88 l-9 -2 l-6 4 l7 3Z" fill="${P.marks}" stroke="#e8590c" stroke-width=".8" stroke-linejoin="round"/>`,
  }),
  'ms-dino': (P, mood) => ({
    behind: `${[[27, 26], [36, 19], [46, 16], [56, 16], [66, 19], [74, 26]].map(([x, y]) => `<path d="M${x - 5} ${y + 6} L${x} ${y - 6} L${x + 5} ${y + 6}Z" fill="${P.marks}" stroke="#f08c00" stroke-width="1" stroke-linejoin="round"/>`).join('')}
      <path d="M74 80 Q96 86 102 70 Q94 76 80 70Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.4" stroke-linejoin="round"/>`,
    arms: `<ellipse cx="24" cy="66" rx="5.5" ry="8" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2" transform="rotate(30 24 66)"/><ellipse cx="76" cy="66" rx="5.5" ry="8" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2" transform="rotate(-30 76 66)"/>`,
    belly: `<ellipse cx="50" cy="72" rx="17" ry="18" fill="${P.belly}"/><path d="M36 66 h28 M34 73 h32 M36 80 h28" stroke="${P.dark}" stroke-width="1" opacity=".35"/>`,
    face: `${animalEyes(mood)}<circle cx="46" cy="51" r="1.2" fill="${P.dark}"/><circle cx="54" cy="51" r="1.2" fill="${P.dark}"/>
      ${mood === 'sad' ? `<path d="M42 60 q8 -4 16 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` : `<path d="M40 55 Q50 63 60 55" stroke="${INK}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`}
      <circle cx="30" cy="34" r="2" fill="${P.dark}" opacity=".35"/><circle cx="70" cy="30" r="2.5" fill="${P.dark}" opacity=".35"/>`,
    front: '',
    feet: `<ellipse cx="38" cy="90" rx="9" ry="5" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2"/><ellipse cx="62" cy="90" rx="9" ry="5" fill="${P.body}" stroke="${P.dark}" stroke-width="1.2"/><path d="M33 89 v2 M37 89 v2 M57 89 v2 M61 89 v2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`,
  }),
});
const MASCOTS = [
  { id: 'ms-owl', name: 'Corujinha', nick: 'Lumi' },
  { id: 'ms-dog', name: 'Cachorrinho', nick: 'Pipoca' },
  { id: 'ms-cat', name: 'Gatinho', nick: 'Mel' },
  { id: 'ms-panda', name: 'Pandinha', nick: 'Bambu' },
  { id: 'ms-bunny', name: 'Coelhinho', nick: 'Nina' },
  { id: 'ms-fox', name: 'Raposinha', nick: 'Faísca' },
  { id: 'ms-penguin', name: 'Pinguim', nick: 'Picolé' },
  { id: 'ms-dino', name: 'Dinossaurinho', nick: 'Brontinho' },
];
function mascotName(eq = S.equipped) { const m = MASCOTS.find(x => x.id === (eq && eq.mascot)); return m ? m.nick : 'Lumi'; }
// Amiguinhos: só por ovo. Raridade e chances (transparentes para a criança).
SHOP_ITEMS.push(
  { id: 'pt-hamster', cat: 'pet', name: 'Hamster', price: 0, emoji: '🐹' },
  { id: 'pt-ladybug', cat: 'pet', name: 'Joaninha', price: 0, emoji: '🐞' },
  { id: 'pt-snail', cat: 'pet', name: 'Caracol', price: 0, emoji: '🐌' },
  { id: 'pt-hedgehog', cat: 'pet', name: 'Porco-espinho', price: 0, emoji: '🦔' },
  { id: 'pt-parrot', cat: 'pet', name: 'Papagaio', price: 0, emoji: '🦜' },
  { id: 'pt-sloth', cat: 'pet', name: 'Bicho-preguiça', price: 0, emoji: '🦥' },
);
const RARITY = {
  common: { label: 'Comum', pct: 55, color: '#868e96' },
  rare: { label: 'Raro', pct: 28, color: '#1c7ed6' },
  epic: { label: 'Épico', pct: 14, color: '#9c36b5' },
  legendary: { label: 'Lendário', pct: 3, color: '#f08c00' },
};
const PET_RARITY = {
  common: ['pt-fish', 'pt-bunny', 'pt-turtle', 'pt-chick', 'pt-hamster', 'pt-snail', 'pt-ladybug', 'pt-octo'],
  rare: ['pt-cat', 'pt-dog', 'pt-penguin', 'pt-hedgehog', 'pt-parrot', 'pt-sloth'],
  epic: ['pt-fox', 'pt-koala', 'pt-dolphin', 'pt-pony', 'pt-panda'],
  legendary: ['pt-dragon', 'pt-unicorn'],
};
const petRarity = id => Object.keys(PET_RARITY).find(r => PET_RARITY[r].includes(id)) || 'common';
const ALL_PETS = Object.values(PET_RARITY).flat();
// Os ovos à venda (as categorias "Amiguinhos" e "Trocar de bicho" saem da compra direta)
SHOP_CATS.splice(0, SHOP_CATS.length, ...SHOP_CATS.filter(c => !['pet', 'mascot'].includes(c.id)));
SHOP_CATS.unshift({ id: 'egg', label: '🥚 Ovos' });
SHOP_CATS.forEach(c => { if (c.id === 'skin') c.label = '🎨 Cores'; });
SHOP_ITEMS.push(
  { id: 'egg-pet', cat: 'egg', name: 'Ovo de amiguinho', price: 250, egg: 'pet' },
  { id: 'egg-mascot', cat: 'egg', name: 'Ovo de mascote', price: 600, egg: 'mascot' },
);
function eggSVG(kind, cls = '') {
  const c = kind === 'mascot' ? ['#ffe066', '#f59f00', '#fff9db', '#ff922b'] : ['#a5d8ff', '#339af0', '#e7f5ff', '#ff8fab'];
  const id = 'e' + uid();
  const deco = kind === 'mascot'
    ? [[34, 40], [62, 30], [50, 66], [30, 72], [70, 66]].map(([x, y]) => `<path d="M${x} ${y - 6} l1.8 4 l4.2 .4 l-3.2 2.8 l1 4.2 l-3.8 -2.2 l-3.8 2.2 l1 -4.2 l-3.2 -2.8 l4.2 -.4Z" fill="${c[3]}" opacity=".85"/>`).join('')
    : [[36, 36, 5], [62, 28, 4], [56, 52, 6], [32, 64, 4], [68, 70, 5], [46, 80, 3.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c[3]}" opacity=".7"/>`).join('');
  const egg = `<path d="M50 6 C72 6 86 40 86 62 C86 84 70 96 50 96 C30 96 14 84 14 62 C14 40 28 6 50 6Z" fill="${c[0]}" stroke="${c[1]}" stroke-width="2"/>${deco}<path d="M32 26 Q38 16 46 14" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".6"/>`;
  const zz = '0,54 10,48 20,56 30,48 40,56 50,48 60,56 70,48 80,56 90,48 100,54';
  return `<svg class="egg ${cls}" viewBox="-6 -10 112 112" aria-hidden="true"><defs><clipPath id="${id}t"><polygon points="0,-10 100,-10 ${zz.split(' ').reverse().join(' ')}"/></clipPath><clipPath id="${id}b"><polygon points="${zz} 100,100 0,100"/></clipPath></defs>
    <ellipse cx="50" cy="98" rx="26" ry="4" fill="rgba(0,0,0,.12)"/>
    <g class="egg-bot" clip-path="url(#${id}b)">${egg}</g><g class="egg-top" clip-path="url(#${id}t)">${egg}</g>
    <polyline class="egg-crack" points="${zz}" fill="none" stroke="#5c3a1a" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
function rollPet() {
  const r = Math.random() * 100; let acc = 0; let rar = 'common';
  for (const k of Object.keys(RARITY)) { acc += RARITY[k].pct; if (r < acc) { rar = k; break; } }
  const list = PET_RARITY[rar];
  return list[Math.floor(Math.random() * list.length)];
}
function rollMascot() { const list = MASCOTS.filter(m => m.id !== 'ms-owl'); return list[Math.floor(Math.random() * list.length)].id; }
function collectionCount(id) { return (S.collection || {})[id] || 0; }
async function buyEgg(it) {
  if (S.coins < it.price) { say(`Faltam <b>${it.price - Math.max(0, S.coins)}</b> moedas para o ${esc(it.name.toLowerCase())}. Que tal uns exercícios extras? ⭐`, { mood: 'think' }); return; }
  const ok = await confirmBox('Comprar e chocar?', `${esc(it.name)} por <b>🪙 ${it.price}</b>?<br><span class="tiny muted">Sai um ${it.egg === 'mascot' ? 'mascote' : 'amiguinho'} surpresa. Pode vir repetido!</span>`, 'Comprar 🥚');
  if (!ok) return;
  const prize = it.egg === 'mascot' ? rollMascot() : rollPet();
  addCoins(-it.price, 'Lojinha: ' + it.name);
  S.collection = S.collection || {};
  const n = (S.collection[prize] || 0) + 1;
  S.collection[prize] = n;
  if (!S.owned.includes(prize)) S.owned.push(prize);
  S.eggsToday = S.eggsToday && S.eggsToday.date === today() ? { date: today(), n: S.eggsToday.n + 1 } : { date: today(), n: 1 };
  save();
  if (typeof questEvent === 'function') questEvent('buy', { cat: 'egg', price: it.price });
  if (currentScreen === 'shop') renderShop();
  hatchModal(it.egg, prize, n);
}
function prizeInfo(id) {
  const m = MASCOTS.find(x => x.id === id);
  if (m) return { name: `${m.name} “${m.nick}”`, pic: mascotSVG(Object.assign({}, S.equipped, { mascot: id, skin: null }), 'wow'), rar: null };
  const p = SHOP_ITEMS.find(x => x.id === id) || {};
  return { name: p.name || id, pic: `<span class="hatch-emoji">${p.emoji || '❓'}</span>`, rar: petRarity(id) };
}
function hatchModal(kind, prize, n) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const m = openModal(`<div class="modal-body hatch"><div class="egg-stage" id="egg-stage">${eggSVG(kind, 'shake')}</div>
    <h3 id="hatch-t">${kind === 'mascot' ? 'Chocando o ovo de mascote…' : 'Chocando o ovo…'} 🥚</h3><div id="hatch-r"></div></div>
    <div class="modal-foot" id="hatch-f" style="justify-content:center"></div>`);
  const stage = $('#egg-stage', m);
  const reveal = () => {
    const info = prizeInfo(prize);
    const rar = info.rar ? RARITY[info.rar] : null;
    stage.innerHTML = `<div class="hatch-prize ${info.rar || 'mascot'}">${info.pic}</div>`;
    $('#hatch-t', m).innerHTML = n > 1 ? `Repetido! ${esc(info.name)} <span class="dup">×${n}</span>` : `Nasceu: ${esc(info.name)}! 🎉`;
    $('#hatch-r', m).innerHTML = `${rar ? `<span class="rar-tag" style="--rar:${rar.color}">${rar.label}</span>` : '<span class="rar-tag" style="--rar:#f59f00">Mascote</span>'}
      <p class="tiny muted">${n > 1 ? 'Ele vai para a coleção como repetido. Continue caçando os que faltam! 🔎' : 'Novo na sua coleção! 📖'}</p>`;
    const isM = MASCOTS.some(x => x.id === prize);
    $('#hatch-f', m).innerHTML = `<button class="btn" data-col>📖 Ver coleção</button><button class="btn primary" data-use>${isM ? 'Usar este mascote' : 'Levar comigo'}</button>`;
    $('[data-col]', m).onclick = () => { closeModal(); show('collection'); };
    $('[data-use]', m).onclick = () => { equipCollectible(prize); closeModal(); };
    if (typeof celebrateFX === 'function') celebrateFX(info.rar === 'legendary' || isM ? 'big' : 'small');
  };
  if (reduce) { setTimeout(reveal, 400); return; }
  setTimeout(() => { const e = $('.egg', stage); if (e) e.classList.add('crack'); }, 1300);
  setTimeout(() => { const e = $('.egg', stage); if (e) e.classList.add('open'); }, 2100);
  setTimeout(reveal, 2700);
}
function equipCollectible(id) {
  if (MASCOTS.some(x => x.id === id)) S.equipped.mascot = id === 'ms-owl' ? null : id;
  else S.equipped.pet = S.equipped.pet === id ? null : id;
  save(); renderMascotMini(); renderCoins();
  if (currentScreen === 'collection') renderCollection(); else if (currentScreen === 'shop') renderShop();
  say(MASCOTS.some(x => x.id === id) ? `Oi! Agora eu sou ${esc(mascotName())}! Vamos estudar? 😄` : (S.equipped.pet ? 'Que amiguinho fofo! Ele vai ficar do meu lado. 💛' : 'Amiguinho guardado na coleção.'), { mood: 'wow' });
}
function renderCollection() {
  const el = $('#scr-collection');
  const pets = ALL_PETS.map(id => SHOP_ITEMS.find(x => x.id === id)).filter(Boolean);
  const havePets = pets.filter(p => collectionCount(p.id)).length;
  const haveM = MASCOTS.filter(m => m.id === 'ms-owl' || collectionCount(m.id)).length;
  const petCard = p => { const n = collectionCount(p.id); const r = RARITY[petRarity(p.id)];
    return n ? `<button type="button" class="col-card ${S.equipped.pet === p.id ? 'on' : ''}" data-col="${p.id}" style="--rar:${r.color}"><span class="col-emoji">${p.emoji}</span><b>${esc(p.name)}</b><span class="rar-mini">${r.label}</span>${n > 1 ? `<span class="dup">×${n}</span>` : ''}${S.equipped.pet === p.id ? '<span class="col-on">Comigo ✔</span>' : ''}</button>`
      : `<div class="col-card missing" style="--rar:${r.color}"><span class="col-emoji sil">${p.emoji}</span><b>???</b><span class="rar-mini">${r.label}</span></div>`; };
  const mCard = mm => { const n = mm.id === 'ms-owl' ? 1 : collectionCount(mm.id); const on = (S.equipped.mascot || 'ms-owl') === mm.id;
    const svg = mascotSVG({ hat: null, glasses: null, neck: null, back: null, skin: null, pet: null, fx: null, mascot: mm.id === 'ms-owl' ? null : mm.id });
    return n ? `<button type="button" class="col-card m ${on ? 'on' : ''}" data-col="${mm.id}"><span class="col-svg">${svg}</span><b>${esc(mm.nick)}</b><span class="rar-mini">${esc(mm.name)}</span>${n > 1 ? `<span class="dup">×${n}</span>` : ''}${on ? '<span class="col-on">No app ✔</span>' : ''}</button>`
      : `<div class="col-card m missing"><span class="col-svg sil">${svg}</span><b>???</b><span class="rar-mini">Mascote</span></div>`; };
  el.innerHTML = `<div class="collection">
    <div class="card"><div class="row wrap"><h3 class="grow" style="margin:0">📖 Minha coleção</h3><button class="btn small" data-act="toshop">🥚 Comprar ovos</button></div>
      <p class="tiny muted" style="margin:4px 0 0">Toque num amiguinho para levá-lo com você, ou num mascote para trocar quem aparece no app. As roupinhas servem em todos os mascotes.</p></div>
    <div class="card"><b>🦉 Mascotes <span class="col-count">${haveM}/${MASCOTS.length}</span></b><div class="col-grid">${MASCOTS.map(mCard).join('')}</div></div>
    <div class="card"><b>🐾 Amiguinhos <span class="col-count">${havePets}/${pets.length}</span></b>
      <div class="tiny muted">Chances no ovo: ${Object.values(RARITY).map(r => `<span style="color:${r.color};font-weight:800">${r.label} ${r.pct}%</span>`).join(' · ')}</div>
      <div class="col-grid">${pets.map(petCard).join('')}</div></div></div>`;
  $$('[data-col]', el).forEach(b => b.onclick = () => equipCollectible(b.dataset.col));
  $('[data-act=toshop]', el).onclick = () => { VIEW.shopCat = 'egg'; show('shop'); };
}

let bubbleTimer = null;
function say(text, opts = {}) {
  const b = $('#bubble');
  $('#bubble-text').innerHTML = text;
  const actions = $('#bubble-actions');
  actions.innerHTML = '';
  (opts.actions || []).forEach(a => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small ' + (a.primary ? 'primary' : '');
    btn.textContent = a.label;
    btn.onclick = e => { e.stopPropagation(); a.onClick(); };
    actions.appendChild(btn);
  });
  if (speechOK) { const sb = document.createElement('button'); sb.type = 'button'; sb.className = 'bubble-speak'; sb.title = 'Ouvir a Lumi'; sb.setAttribute('aria-label', 'Ouvir a Lumi'); sb.textContent = '🔊';
    sb.onclick = e => { e.stopPropagation(); lumiSpeak(text, opts.lang || 'pt'); }; actions.prepend(sb); }
  b.classList.remove('hidden');
  renderMascotMini(opts.mood || 'happy');
  const m = $('#mascot-btn');
  m.classList.remove('talking'); void m.offsetWidth; m.classList.add('talking');
  clearTimeout(bubbleTimer);
  if (!opts.sticky) bubbleTimer = setTimeout(hideBubble, opts.ms || Math.min(11000, 3500 + text.length * 45));
}
function hideBubble() { $('#bubble').classList.add('hidden'); renderMascotMini(); }
function renderMascotMini(mood = 'happy') { $('#mascot-btn').innerHTML = mascotSVG(S.equipped, mood); }

function tipsFor(screen) {
  const st = S.settings;
  const t = {
    home: [
      'Toque no dia de hoje para abrir sua tarefa! 📅',
      'Sábado e domingo têm um pouquinho mais de perguntas. ⭐',
      `Sexta é dia de entregar: semana completa vale até <b>+${st.reward}</b> moedas (proporcional aos dias da semana). 🪙`,
      `Se a semana não for entregue até sexta, a gente perde <b>${st.penalty}</b> moedas. Vamos caprichar! 💪`,
      `Perdeu algum dia? Dá para <b>recuperar</b> até a sexta seguinte, valendo metade. ⏳`,
      `Terminou? Os exercícios extras dão <b>${st.extraPerCorrect}</b> moedas por acerto.`,
      'Escreva o que aprendeu na escola em <b>Minha semana</b> para eu criar as tarefas.',
    ],
    setup: [
      'Escreva o que você aprendeu na escola em cada matéria. Pode ser curtinho!',
      'Em Ortografia e Spelling, coloque as palavras separadas por vírgula.',
      'Truque: escreva <b>pergunta = resposta</b> em uma linha e eu viro isso em flashcard!',
      'Em Math, escreva o assunto em inglês ou português: <i>fractions, times tables, perimeter…</i>',
      'Matéria em branco não entra na semana.',
    ],
    work: [
      'Toque no 💡 para uma dica, ou no ? para eu explicar o conteúdo.',
      'Nas respostas livres, escreva com suas palavras: eu corrijo e comento!',
      S.settings.gabaritoAfterFinish ? 'Quando terminar, aperte <b>Concluir</b> e o gabarito libera.' : 'O botão <b>Gabarito</b> mostra as respostas para você se corrigir.',
      'Prefere papel? Toque em 🖨️ Imprimir. Depois, em 📄 Corrigir folha, eu corrijo pela foto!',
    ],
    shop: ['Compre roupinhas para mim! 😍', 'Os vales são prêmios de verdade: os pais confirmam a entrega.', 'Experimente um fundo novo para o app!'],
    parents: ['Área dos pais: correção das respostas livres, moedas, vales e ajustes.'],
    welcome: ['Oi! Eu sou a Lumi, sua corujinha de estudos! 🦉'],
  };
  return t[screen] || t.home;
}
let tipIdx = 0;
function mascotClick() {
  if (!$('#bubble').classList.contains('hidden') && $('#bubble-actions').children.length) return;
  const tips = tipsFor(currentScreen);
  say(tips[tipIdx++ % tips.length]);
}

function runTour() {
  const st = S.settings;
  const steps = [
    `Oi, ${esc(S.name)}! Eu sou ${S.equipped && S.equipped.mascot ? '' : 'a '}<b>${mascotName()}</b> ${S.equipped && S.equipped.mascot ? '' : '🦉 '}e vou estudar com você!`,
    'Eu sou uma <b>inteligência artificial</b> (um programa de computador, feito com o Claude), não uma pessoa. Às vezes posso errar: se algo parecer estranho, mostre para um adulto. 💜',
    'Toda semana você escreve em <b>📝 Minha semana</b> o que está aprendendo na escola. Eu transformo isso em tarefas.',
    'Cada dia tem uma tarefa curtinha. <b>Sábado e domingo</b> têm um pouquinho mais.',
    `<b>Sexta-feira é dia de entrega!</b> Semana completa: <b>+${st.reward}</b> 🪙. Semana não entregue: <b>−${st.penalty}</b> 🪙 — mas os dias que faltaram ainda podem ser <b>recuperados</b> até a sexta seguinte, valendo metade. ⏳`,
    `Quer mais moedas? Faça os <b>⭐ Exercícios extras</b>: ${st.extraPerCorrect} moedas por acerto.`,
    'Gaste as moedas na <b>🛒 Lojinha</b>: roupinhas para mim, fundos e adesivos!',
    'Travou numa pergunta? Toque no <b>💡</b> ou em mim que eu ajudo. Vamos lá?',
  ];
  let i = 0;
  const step = () => {
    const last = i === steps.length - 1;
    say(steps[i], {
      sticky: true, mood: i === 3 ? 'wow' : 'happy',
      actions: [
        ...(last ? [] : [{ label: 'Pular', onClick: () => { finish(); } }]),
        { label: last ? 'Começar!' : 'Próximo ▸', primary: true, onClick: () => { if (last) finish(); else { i++; step(); } } },
      ],
    });
  };
  const finish = () => { S.tourDone = true; save(); hideBubble(); };
  step();
}

/* =========================================================================
   5. GERADOR DE PERGUNTAS
   Prioriza VOLUME e SIMPLICIDADE: muitas perguntas curtas e objetivas.
   Tipos: mc (múltipla escolha), short (resposta curta), num (número),
          listen (ditado com voz), open (resposta livre — pais corrigem)
   ========================================================================= */
const speechOK = typeof window !== 'undefined' && 'speechSynthesis' in window;
function speak(text, lang) {
  if (!speechOK || !S.settings.voice) { toast('🔇 Voz indisponível neste navegador'); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'pt' ? 'pt-BR' : 'en-GB';
    const v = bestVoice(lang); if (v) u.voice = v;
    u.rate = .85;
    speechSynthesis.speak(u);
  } catch (e) { /* ignora */ }
}
// A Lumi fala: escolhe a voz mais natural disponível e lê textos longos em pedaços (frase a frase).
function bestVoice(lang) {
  if (!speechOK) return null;
  const want = lang === 'en' ? ['en-GB', 'en-US', 'en'] : ['pt-BR', 'pt-PT', 'pt'];
  const vs = speechSynthesis.getVoices();
  for (const w of want) {
    const list = vs.filter(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(w.toLowerCase()));
    if (list.length) return list.find(v => /natural|neural|google|premium|enhanced|luciana|francisca|thalita|serena|libby|sonia/i.test(v.name)) || list[0];
  }
  return null;
}
function plainForSpeech(html) {
  const d = document.createElement('div'); d.innerHTML = String(html || '');
  return d.textContent.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
}
let talkId = 0;
function lumiSpeak(html, lang = 'pt', onEnd) {
  if (!speechOK) { toast('🔇 Voz indisponível neste navegador'); return; }
  const text = plainForSpeech(html); if (!text) return;
  const id = ++talkId;
  speechSynthesis.cancel();
  const parts = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text];
  const v = bestVoice(lang);
  let i = 0;
  const next = () => {
    if (id !== talkId) return;
    if (i >= parts.length) { onEnd && onEnd(); return; }
    const u = new SpeechSynthesisUtterance(parts[i++].trim());
    u.lang = lang === 'en' ? 'en-GB' : 'pt-BR'; if (v) u.voice = v; u.rate = .95; u.pitch = 1.1;
    u.onend = next; u.onerror = next;
    try { speechSynthesis.speak(u); } catch (e) { /* ignora */ }
  };
  next();
}
function lumiStop() { talkId++; if (speechOK) try { speechSynthesis.cancel(); } catch (e) { /* ignora */ } }
// Botão 🔊 que lê/para um trecho
function speakBtn(sel, lang) { return `<button type="button" class="btn small speak-btn" data-speak="${sel}" data-lang="${lang}" title="${lang === 'en' ? 'Listen' : 'Ouvir'}" aria-label="${lang === 'en' ? 'Listen' : 'Ouvir a Lumi'}">🔊</button>`; }
function bindSpeak(root) {
  $$('[data-speak]', root).forEach(b => b.onclick = e => {
    e.stopPropagation();
    if (b.classList.contains('on')) { lumiStop(); b.classList.remove('on'); return; }
    $$('.speak-btn.on').forEach(x => x.classList.remove('on'));
    const el = b.dataset.speak === '#bubble-text' ? $('#bubble-text') : $(b.dataset.speak, root) || $(b.dataset.speak);
    b.classList.add('on');
    lumiSpeak(el ? el.innerHTML : '', b.dataset.lang, () => b.classList.remove('on'));
  });
}
if (speechOK) try { speechSynthesis.onvoiceschanged = () => {}; speechSynthesis.getVoices(); } catch (e) { /* ignora */ }

function Q(type, q, answer, extra = {}) { return Object.assign({ type, q, answer: answer == null ? '' : String(answer) }, extra); }
function mcQ(q, answer, distractors, rng, extra = {}) {
  const opts = rng.shuffle([answer, ...rng.sample([...new Set(distractors.filter(d => norm(d) !== norm(answer)))], 3)].map(String));
  return Q('mc', q, answer, Object.assign({ options: opts }, extra));
}
// Intercala listas (uma de cada tipo) para variar as perguntas do dia.
function interleave(buckets) {
  const out = []; const bs = buckets.map(b => [...b]).filter(b => b.length);
  while (bs.some(b => b.length)) bs.forEach(b => { if (b.length) out.push(b.shift()); });
  return out;
}
// Separa o texto da matéria em linhas de tópico e "flashcards" (pergunta = resposta).
function parseTopic(text) {
  const lines = String(text || '').split(/\n/).map(l => l.trim()).filter(Boolean);
  const facts = []; const rest = [];
  lines.forEach(l => {
    const m = l.match(/^(.{2,}?)\s*(?:=|→|->)\s*(.+)$/);
    if (m) facts.push({ q: m[1].trim(), a: m[2].trim() }); else rest.push(l);
  });
  return { facts, lines: rest, text: rest.join('\n') };
}
function factQuestions(facts, subj, rng) {
  const pt = subj.lang === 'pt';
  const answers = facts.map(f => f.a);
  const out = [];
  facts.forEach(f => {
    const q = /[?]$/.test(f.q) ? f.q : (pt ? `${f.q}?` : `${f.q}?`);
    const hint = pt ? `Começa com "${f.a.charAt(0).toUpperCase()}" e tem ${f.a.length} caracteres.` : `It starts with "${f.a.charAt(0).toUpperCase()}" and has ${f.a.length} characters.`;
    if (answers.length >= 4) out.push(mcQ(q, f.a, answers, rng, { hint, src: 'fact' }));
    out.push(Q('short', q, f.a, { hint, src: 'fact' }));
  });
  return out;
}

/* ---------- Português / English: gramática ---------- */
const PT = {
  classes: {
    substantivo: ['casa', 'escola', 'cachorro', 'livro', 'árvore', 'cidade', 'amigo', 'janela', 'flor', 'professora', 'mesa', 'praia'],
    adjetivo: ['bonito', 'alto', 'feliz', 'rápido', 'azul', 'gelado', 'inteligente', 'pequeno', 'corajoso', 'macio', 'barulhento', 'gostoso'],
    verbo: ['correr', 'pular', 'estudar', 'cantar', 'escrever', 'brincar', 'comer', 'dormir', 'ler', 'nadar', 'desenhar', 'viajar'],
  },
  plural: [['animal', 'animais'], ['pão', 'pães'], ['mão', 'mãos'], ['flor', 'flores'], ['lápis', 'lápis'], ['papel', 'papéis'], ['limão', 'limões'], ['anel', 'anéis'], ['nariz', 'narizes'], ['jovem', 'jovens'], ['coração', 'corações'], ['caracol', 'caracóis'], ['cidadão', 'cidadãos'], ['mar', 'mares']],
  sin: [['feliz', 'alegre'], ['bonito', 'belo'], ['rápido', 'veloz'], ['começar', 'iniciar'], ['casa', 'lar'], ['medo', 'temor'], ['triste', 'chateado'], ['falar', 'conversar'], ['enorme', 'gigante'], ['esperto', 'inteligente'], ['olhar', 'observar'], ['caminho', 'trajeto']],
  ant: [['alto', 'baixo'], ['quente', 'frio'], ['alegre', 'triste'], ['grande', 'pequeno'], ['claro', 'escuro'], ['cheio', 'vazio'], ['rápido', 'lento'], ['abrir', 'fechar'], ['dia', 'noite'], ['forte', 'fraco'], ['subir', 'descer'], ['limpo', 'sujo']],
  fem: [['ator', 'atriz'], ['cavalo', 'égua'], ['boi', 'vaca'], ['rei', 'rainha'], ['pai', 'mãe'], ['homem', 'mulher'], ['galo', 'galinha'], ['leão', 'leoa'], ['professor', 'professora'], ['padrinho', 'madrinha'], ['herói', 'heroína'], ['cão', 'cadela']],
  punct: [['Que dia lindo', '!'], ['Você vai à escola amanhã', '?'], ['Eu gosto de maçã', '.'], ['Onde está meu lápis', '?'], ['Cuidado com o degrau', '!'], ['Hoje choveu muito', '.'], ['Qual é o seu nome', '?'], ['Que susto', '!'], ['Minha irmã tem dez anos', '.']],
  dim: [['casa', 'casinha'], ['pé', 'pezinho'], ['flor', 'florzinha'], ['livro', 'livrinho'], ['gato', 'gatinho'], ['mão', 'mãozinha'], ['bola', 'bolinha'], ['café', 'cafezinho'], ['pássaro', 'passarinho']],
  silabas: [['casa', 2], ['borboleta', 4], ['sol', 1], ['escola', 3], ['computador', 4], ['pássaro', 3], ['mar', 1], ['janela', 3], ['elefante', 4], ['chuva', 2], ['hipopótamo', 5], ['árvore', 3], ['pão', 1], ['abacaxi', 4]],
  acento: [['café', 'cafe', 'cafê'], ['lâmpada', 'lampada', 'lampáda'], ['ônibus', 'onibus', 'ônibús'], ['médico', 'medico', 'medíco'], ['sofá', 'sofa', 'sôfa'], ['árvore', 'arvore', 'arvóre'], ['você', 'voce', 'vocé'], ['pássaro', 'passaro', 'passáro'], ['avô', 'avo', 'ávo'], ['máquina', 'maquina', 'maquína']],
};
const EN = {
  classes: {
    noun: ['dog', 'city', 'pencil', 'garden', 'friend', 'window', 'ocean', 'teacher', 'castle', 'apple'],
    verb: ['run', 'write', 'swim', 'think', 'build', 'laugh', 'climb', 'read', 'jump', 'sing'],
    adjective: ['tall', 'bright', 'noisy', 'brave', 'cold', 'purple', 'enormous', 'tiny', 'gentle', 'shiny'],
    adverb: ['quickly', 'quietly', 'carefully', 'happily', 'slowly', 'loudly', 'bravely', 'gently', 'softly', 'often'],
  },
  past: [['go', 'went'], ['eat', 'ate'], ['see', 'saw'], ['run', 'ran'], ['swim', 'swam'], ['write', 'wrote'], ['buy', 'bought'], ['think', 'thought'], ['bring', 'brought'], ['catch', 'caught'], ['sing', 'sang'], ['take', 'took'], ['fly', 'flew'], ['play', 'played'], ['carry', 'carried'], ['stop', 'stopped']],
  plural: [['child', 'children'], ['mouse', 'mice'], ['box', 'boxes'], ['baby', 'babies'], ['leaf', 'leaves'], ['tooth', 'teeth'], ['bus', 'buses'], ['knife', 'knives'], ['foot', 'feet'], ['city', 'cities'], ['sheep', 'sheep'], ['potato', 'potatoes'], ['woman', 'women']],
  syn: [['big', 'large'], ['happy', 'glad'], ['small', 'tiny'], ['fast', 'quick'], ['begin', 'start'], ['angry', 'cross'], ['smart', 'clever'], ['scared', 'afraid'], ['shout', 'yell'], ['difficult', 'hard'], ['end', 'finish'], ['look', 'see']],
  ant: [['hot', 'cold'], ['early', 'late'], ['empty', 'full'], ['ancient', 'modern'], ['remember', 'forget'], ['push', 'pull'], ['generous', 'selfish'], ['shallow', 'deep'], ['rough', 'smooth'], ['brave', 'cowardly'], ['arrive', 'leave']],
  pron: [['Tom is my brother.', 'Tom', 'He'], ['The books are on the table.', 'The books', 'They'], ['Sarah and I love pizza.', 'Sarah and I', 'We'], ['Grandma bakes cakes.', 'Grandma', 'She'], ['The cat is sleeping.', 'The cat', 'It'], ['Leo and Ana are friends.', 'Leo and Ana', 'They']],
  contr: [['do not', "don't"], ['I am', "I'm"], ['cannot', "can't"], ['they are', "they're"], ['it is', "it's"], ['we will', "we'll"], ['she is', "she's"], ['would not', "wouldn't"], ['I have', "I've"], ['you are', "you're"]],
  prefix: [['happy', 'un'], ['possible', 'im'], ['agree', 'dis'], ['legal', 'il'], ['correct', 'in'], ['regular', 'ir'], ['kind', 'un'], ['appear', 'dis'], ['polite', 'im'], ['lock', 'un']],
  homo: [['I can ___ the sea from here.', 'see', ['sea']], ['They left ___ bags at school.', 'their', ['there', "they're"]], ['I have ___ apples.', 'two', ['too', 'to']], ['Can you ___ the music?', 'hear', ['here']], ['I ___ the answer!', 'know', ['no', 'now']], ['We ___ the race!', 'won', ['one']], ['The wind ___ the leaves away.', 'blew', ['blue']], ['Please ___ the letter.', 'write', ['right']]],
};
function grammarPool(subj, topicText, rng) {
  const pt = subj.lang === 'pt';
  const t = topicText.toLowerCase();
  const B = {};
  if (pt) {
    const allClassWords = Object.entries(PT.classes).flatMap(([c, ws]) => ws.map(w => [w, c]));
    B.classe = rng.sample(allClassWords, 10).map(([w, c]) => Q('mc', `A palavra "${w}" é um:`, c, { options: ['substantivo', 'adjetivo', 'verbo'], hint: 'Substantivo dá nome; adjetivo descreve; verbo é ação.' }));
    B.plural = rng.sample(PT.plural, 8).map(([a, b]) => Q('short', `Escreva o plural de "${a}".`, b, { strict: true, hint: 'Palavras em -ão podem virar -ões, -ães ou -ãos. Em -l, viram -is.' }));
    B.sinonimo = rng.sample(PT.sin, 8).map(([a, b]) => mcQ(`Qual é o sinônimo de "${a}"?`, b, PT.sin.map(p => p[1]), rng, { hint: 'Sinônimo = palavra com o MESMO sentido.' }));
    B.antonimo = rng.sample(PT.ant, 8).map(([a, b]) => mcQ(`Qual é o antônimo de "${a}"?`, b, PT.ant.map(p => p[1]), rng, { hint: 'Antônimo = palavra com sentido CONTRÁRIO.' }));
    B.feminino = rng.sample(PT.fem, 8).map(([a, b]) => Q('short', `Qual é o feminino de "${a}"?`, b, { strict: true, hint: 'Pense em uma menina ou uma fêmea.' }));
    B.pontuacao = rng.sample(PT.punct, 6).map(([f, p]) => Q('mc', `Qual sinal completa a frase: "${f}__"`, p, { options: ['.', '?', '!'], hint: '? = pergunta · ! = emoção/surpresa · . = afirmação' }));
    B.diminutivo = rng.sample(PT.dim, 6).map(([a, b]) => Q('short', `Qual é o diminutivo de "${a}"?`, b, { strict: true, hint: 'Diminutivo costuma terminar em -inho/-inha ou -zinho/-zinha.' }));
    B.silaba = rng.sample(PT.silabas, 6).map(([w, n]) => Q('num', `Quantas sílabas tem a palavra "${w}"?`, n, { hint: 'Bata palmas falando a palavra devagar.' }));
    B.acento = rng.sample(PT.acento, 6).map(([c, ...w]) => Q('mc', 'Qual palavra está escrita corretamente?', c, { options: rng.shuffle([c, ...w]), strict: true, hint: 'Leia em voz alta e veja onde a palavra é mais forte.' }));
    const map = [['classe', /substant|adjetiv|verbo|classe|classific/], ['plural', /plural/], ['sinonimo', /sin[oô]nim/], ['antonimo', /ant[oô]nim/], ['feminino', /femin|mascul|g[eê]nero/],
      ['pontuacao', /pontua/], ['diminutivo', /diminut|aumentat|grau/], ['silaba', /s[ií]laba|silab/], ['acento', /acent|t[oô]nica/]];
    return pickBuckets(B, map, t, ['classe', 'sinonimo', 'antonimo', 'pontuacao', 'plural']);
  }
  const allClassWords = Object.entries(EN.classes).flatMap(([c, ws]) => ws.map(w => [w, c]));
  B.classes = rng.sample(allClassWords, 10).map(([w, c]) => Q('mc', `"${w}" is a…`, c, { options: ['noun', 'verb', 'adjective', 'adverb'], hint: 'Noun = name · verb = action · adjective = describes a noun · adverb = describes a verb (often -ly).' }));
  B.past = rng.sample(EN.past, 8).map(([a, b]) => Q('short', `Write the past tense of "${a}".`, b, { strict: true, hint: 'Yesterday I…' }));
  B.plural = rng.sample(EN.plural, 8).map(([a, b]) => Q('short', `Write the plural of "${a}".`, b, { strict: true, hint: 'Some plurals are irregular: one foot, two feet.' }));
  B.syn = rng.sample(EN.syn, 8).map(([a, b]) => mcQ(`Which word is a synonym of "${a}"?`, b, EN.syn.map(p => p[1]), rng, { hint: 'Synonym = SAME meaning.' }));
  B.ant = rng.sample(EN.ant, 8).map(([a, b]) => mcQ(`Which word is the opposite of "${a}"?`, b, EN.ant.map(p => p[1]), rng, { hint: 'Antonym = OPPOSITE meaning.' }));
  B.pron = rng.sample(EN.pron, 6).map(([s, w, p]) => Q('mc', `Which pronoun can replace "${w}" in: "${s}"`, p, { options: ['He', 'She', 'It', 'We', 'They'], hint: 'One boy = he · one girl = she · a thing/animal = it · more than one = they/we.' }));
  B.contr = rng.sample(EN.contr, 7).map(([a, b]) => Q('short', `Write the contraction of "${a}".`, b, { strict: true, accept: [b.replace("'", '’')], hint: 'Use an apostrophe (\') where letters are missing.' }));
  B.prefix = rng.sample(EN.prefix, 7).map(([w, p]) => Q('mc', `Which prefix makes the opposite of "${w}"?`, p, { options: rng.shuffle([p, ...rng.sample(['un', 'dis', 'im', 'in', 'il', 'ir'].filter(x => x !== p), 3)]), hint: 'Try each prefix aloud: does it sound like a real word?' }));
  B.homo = rng.sample(EN.homo, 6).map(([s, a, wrong]) => Q('mc', `Choose the right word: "${s}"`, a, { options: rng.shuffle([a, ...wrong]), strict: true, hint: 'Homophones sound the same but have different meanings and spellings.' }));
  const map = [['classes', /noun|verb|adjective|adverb|word class/], ['past', /past|tense|irregular/], ['plural', /plural/], ['syn', /synonym/], ['ant', /antonym|opposite/],
    ['pron', /pronoun/], ['contr', /contraction|apostroph/], ['prefix', /prefix|suffix/], ['homo', /homophone/]];
  return pickBuckets(B, map, t, ['classes', 'syn', 'ant', 'past', 'plural']);
}
function pickBuckets(B, map, t, fallback) {
  const chosen = map.filter(([, re]) => re.test(t)).map(([k]) => k);
  return { buckets: (chosen.length ? chosen : fallback).map(k => B[k]), matched: chosen.length > 0 };
}

/* ---------- Caça-erros: parágrafo com palavras escritas errado ---------- */
// O texto é quebrado em pedaços: índices ímpares são palavras (tocáveis), pares são espaços/pontuação.
const WORD_RE = /([\p{L}\p{M}][\p{L}\p{M}'’-]*)/u;
function proofTokens(text) { return String(text || '').split(WORD_RE); }
const proofClean = s => String(s || '').replace(/[.,;:!?"“”()]/g, '');
const proofEq = (a, b) => norm(proofClean(a), true) === norm(proofClean(b), true);
// Localiza cada erro no texto; descarta os que não aparecem. Precisa de pelo menos 2 erros.
function proofPrepare(item, text, errors) {
  const tokens = proofTokens(text); const used = new Set(); const errs = [];
  (errors || []).forEach(e => {
    const wrong = String((e && e.wrong) || '').trim(), right = String((e && e.right) || '').trim();
    if (!wrong || !right || proofEq(wrong, right)) return;
    for (let t = 1; t < tokens.length; t += 2) {
      if (!used.has(t) && proofEq(tokens[t], wrong)) { used.add(t); errs.push({ idx: t, wrong: tokens[t], right }); return; }
    }
  });
  if (errs.length < 2) return null;
  item.text = String(text); item.errors = errs.sort((a, b) => a.idx - b.idx);
  item.q = String(item.q || '').replace(/\b\d\b/, String(errs.length));   // a instrução sempre bate com o número real de erros
  item.answer = item.errors.map(e => `${e.wrong} → ${e.right}`).join('; ');
  return item;
}
function proofAns(ans) {
  if (ans && typeof ans === 'object') return ans;
  try { const o = JSON.parse(ans); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function proofScore(q, ans) { const a = proofAns(ans); return q.errors.filter(e => a[e.idx] != null && proofEq(a[e.idx], e.right)).length; }
function proofHtml(q, ans, done) {
  const pt = q.lang !== 'en';
  const a = proofAns(ans); const tokens = proofTokens(q.text);
  const errAt = Object.fromEntries(q.errors.map(e => [e.idx, e]));
  const marked = Object.keys(a).length, n = q.errors.length;
  const html = tokens.map((tk, t) => {
    if (t % 2 === 0) return esc(tk);
    const fix = a[t], err = errAt[t];
    if (!done) return fix != null
      ? `<span class="w fixed" data-w="${t}" role="button" tabindex="0"><s>${esc(tk)}</s> <b>${esc(fix)}</b></span>`
      : `<span class="w" data-w="${t}" role="button" tabindex="0">${esc(tk)}</span>`;
    if (err) {
      if (fix != null && proofEq(fix, err.right)) return `<span class="w res-ok"><s>${esc(tk)}</s> <b>${esc(fix)}</b></span>`;
      return `<span class="w res-miss"><s>${esc(tk)}</s> <b>${esc(err.right)}</b>${fix != null ? ` <i>(${pt ? 'você' : 'you'}: ${esc(fix)})</i>` : ''}</span>`;
    }
    if (fix != null) return `<span class="w res-extra">${esc(tk)} <i>(${pt ? 'já estava certa' : 'was correct'})</i></span>`;
    return esc(tk);
  }).join('');
  const dots = Array.from({ length: n }, (_, k) => `<i class="${k < (done ? proofScore(q, ans) : marked) ? 'on' : ''}"></i>`).join('');
  const status = done
    ? `<b>${proofScore(q, ans)} ${pt ? 'de' : 'of'} ${n}</b> ${pt ? 'corrigidas' : 'fixed'}`
    : `🔎 <b>${marked} ${pt ? 'de' : 'of'} ${n}</b> ${pt ? 'marcadas' : 'marked'}`;
  const openBtn = `<button type="button" class="btn small primary proof-open">🔎 ${pt ? 'Caça-erros' : 'Spot the mistakes'} · ${done ? proofScore(q, ans) : marked}/${n} ${done ? '✓' : '▸'}</button>`;
  return `${openBtn}<div class="proof ${done ? 'done' : ''}">${html}</div>
    <div class="proof-bar"><span class="proof-dots">${dots}</span><span class="proof-count">${status}</span>
    ${done ? '' : `<span class="proof-help">${pt ? 'Toque na palavra errada e escreva certo.' : 'Tap a wrong word and fix it.'}</span><button type="button" class="proof-idk" data-idk>🤷 ${pt ? 'Não sei a regra' : 'I don\'t know the rule'}</button>`}</div>`;
}
// Edição no lugar: a palavra vira um campo já preenchido; a criança corrige e confirma.
function proofEdit(q, c, card, t) {
  const tokens = proofTokens(q.text);
  const span = $(`.w[data-w="${t}"]`, card);
  if (!span || span.querySelector('input')) return;
  const a = proofAns(c.answers[q.id]);
  const cur = a[t] != null ? a[t] : tokens[t];
  const pt = q.lang !== 'en';
  span.className = 'w editing';
  span.onclick = null; span.onkeydown = null;   // enquanto edita, a palavra não reabre a edição
  span.innerHTML = `<input class="w-in" value="${esc(cur)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${pt ? 'Escreva a palavra certa' : 'Type the correct word'}"><button type="button" class="w-ok" aria-label="OK">✓</button>`;
  const inp = $('input', span);
  const fit = () => { inp.style.width = `${Math.max(4, inp.value.length + 1.5)}ch`; };
  fit(); inp.focus(); inp.select();
  let closed = false;
  const close = save => {
    if (closed) return; closed = true;
    const ans = proofAns(c.answers[q.id]);
    if (save) { const v = inp.value.trim(); if (!v || proofEq(v, tokens[t])) delete ans[t]; else ans[t] = v; }
    c.answers[q.id] = ans; saveSoon(); updateProgress(c);
    $('.proof-wrap', card).innerHTML = proofHtml(q, ans, false);
    bindProof(q, c, card);
    requestAnimationFrame(() => fitGrid($('#sheet')));
    const n = q.errors.length, m = Object.keys(ans).length;
    if (save && m === n) say(pt ? `Você marcou ${n} palavras! Confira se escreveu todas certinho. ✨` : `You marked ${n} words! Check your spelling. ✨`, { mood: 'wow' });
  };
  inp.oninput = fit;
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); close(true); } else if (e.key === 'Escape') close(false); };
  inp.onclick = e => e.stopPropagation();
  inp.onblur = () => setTimeout(() => close(true), 120);
  $('.w-ok', span).onmousedown = e => e.preventDefault();
  $('.w-ok', span).onclick = e => { e.stopPropagation(); close(true); };
}
function bindProof(q, c, card) {
  const ob = $('.proof-open', card);
  if (ob) ob.onclick = () => openProofModal(q, c);
  if (c.done) return;
  const idk = $('[data-idk]', card);
  if (idk) idk.onclick = e => { e.stopPropagation(); notePractice(q.lang, q.errors.map(x => x.right)); save();
    const topic = weekTopicFor(q.subject);
    openLesson(q, c, { topic: (q.lang === 'en' ? 'Spelling rules for: ' : 'Regras de ortografia de: ') + (topic || q.errors.map(x => x.right).join(', ')), noMiss: true }); };
  $$('.w[data-w]', card).forEach(w => {
    w.onclick = () => proofEdit(q, c, card, Number(w.dataset.w));
    w.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); proofEdit(q, c, card, Number(w.dataset.w)); } };
  });
}
// Em telas muito pequenas o parágrafo abre em tela cheia (a folha continua sem rolagem).
function openProofModal(q, c) {
  const m = openModal(`<div class="modal-head"><h3>${esc(q.q)}</h3><button class="btn small primary" data-close>${q.lang === 'en' ? 'Done' : 'Pronto'}</button></div>
    <div class="modal-body proof-modal"><div class="proof-wrap">${proofHtml(q, c.answers[q.id], c.done)}</div></div>`, { wide: true, onClose: () => { if (currentScreen === 'work') renderWork(); } });
  bindProof(q, c, m);
}
// Textos-base para o modo sem servidor (o gerador local troca 4–5 palavras por grafias erradas).
const PROOF_BASE = {
  pt: [
    'No sábado, minha família foi passear no parque. O céu estava azul e o sol brilhava forte. Meu irmão levou a bicicleta nova e eu levei um caderno para desenhar os pássaros. Depois, comemos sorvete de chocolate e voltamos para casa felizes.',
    'A professora pediu que cada aluno trouxesse uma planta para a escola. Eu escolhi um girassol amarelo. Todos os dias, coloco água no vaso e deixo perto da janela. A planta cresceu bastante e agora já tem uma flor enorme.',
    'Ontem choveu muito na cidade. As ruas ficaram molhadas e as crianças brincaram com guarda-chuvas coloridos. À noite, a família assistiu a um filme engraçado e preparou pipoca quentinha. Foi um dia tranquilo e divertido.',
  ],
  en: [
    'Last weekend my friend and I went to the beach. The water was cold, but we decided to swim anyway. Afterwards we built a huge sandcastle and collected beautiful shells. It was one of the best days of the whole summer.',
    'Our class visited the science museum on Thursday. We learned about planets, dinosaurs and electricity. My favourite part was the giant model of the solar system. Before we left, the teacher bought everyone a small notebook.',
    'Every morning my grandmother walks her dog through the village. They stop at the bakery to buy fresh bread and say hello to the neighbours. In the afternoon she reads interesting books in the garden while the dog sleeps quietly.',
  ],
};
function localProof(subj, rng) {
  const pt = subj.lang === 'pt';
  let text = rng.pick(PROOF_BASE[subj.lang]);
  const tokens = proofTokens(text);
  const count = {}; for (let t = 1; t < tokens.length; t += 2) count[tokens[t].toLowerCase()] = (count[tokens[t].toLowerCase()] || 0) + 1;
  const cands = rng.shuffle([...Array(tokens.length).keys()].filter(t => t % 2 === 1 && tokens[t].length >= 5 && tokens[t] === tokens[t].toLowerCase() && count[tokens[t]] === 1));
  const errors = [];
  for (const t of cands) {
    if (errors.length >= rng.int(4, 5)) break;
    const bad = misspellings(tokens[t], subj.lang, rng).find(w => w.length > 2 && !count[w.toLowerCase()]);
    if (!bad) continue;
    errors.push({ wrong: bad, right: tokens[t] }); tokens[t] = bad;
  }
  text = tokens.join('');
  return proofPrepare(Q('proof', pt ? `Caça-erros: encontre e corrija as ${errors.length} palavras escritas errado.` : `Spot the mistakes: find and fix the ${errors.length} misspelled words.`, '',
    { strict: true, hint: pt ? 'Leia devagar, palavra por palavra. Procure letras trocadas, faltando ou sobrando.' : 'Read slowly, word by word. Look for swapped, missing or extra letters.' }), text, errors);
}

/* ---------- Ortografia / Spelling ---------- */
const MISSPELL = {
  pt: [[/ss/, 'ç'], [/ç/, 'ss'], [/ç/, 's'], [/([aeiouáéíóú])s([aeiou])/, '$1z$2'], [/z/, 's'], [/x/, 'ch'], [/ch/, 'x'], [/g(?=[ei])/, 'j'], [/j(?=[ei])/, 'g'],
    [/rr/, 'r'], [/([aeiou])r([aeiou])/, '$1rr$2'], [/^h/, ''], [/l$/, 'u'], [/u$/, 'l'], [/e$/, 'i'], [/o$/, 'u'], [/ão$/, 'am'], [/sc/, 's'], [/xc/, 'c'], [/s(?=[ei])/, 'c'], [/c(?=[ei])/, 's'], [/lh/, 'li'], [/nh/, 'ni']],
  en: [[/ie/, 'ei'], [/ei/, 'ie'], [/([a-z])\1/, '$1'], [/([aeiou])([bdgklmnprt])([aeiouy])/, '$1$2$2$3'], [/ph/, 'f'], [/f/, 'ph'], [/ck/, 'k'], [/tion$/, 'sion'], [/sion$/, 'tion'],
    [/c(?=[eiy])/, 's'], [/y$/, 'ey'], [/e$/, ''], [/ous$/, 'us'], [/ight/, 'ite'], [/wh/, 'w'], [/kn/, 'n'], [/able$/, 'ible'], [/ible$/, 'able'], [/ence$/, 'ance'], [/ance$/, 'ence'], [/au/, 'aw'], [/ue$/, 'oo']],
};
function misspellings(word, lang, rng) {
  const w = word;
  const out = new Set();
  rng.shuffle(MISSPELL[lang]).forEach(([re, rep]) => { const v = w.replace(re, rep); if (v !== w && v.length > 1) out.add(v); });
  const noAcc = w.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (lang === 'pt' && noAcc !== w) out.add(noAcc);
  let guard = 0;
  while (out.size < 3 && guard++ < 20 && w.length > 3) {
    const i = rng.int(1, w.length - 2);
    const v = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
    if (v !== w) out.add(v);
  }
  return rng.shuffle([...out]).slice(0, 3);
}
function spellingPool(subj, text, rng) {
  const pt = subj.lang === 'pt';
  const words = [...new Set(text.split(/[,;\n]+/).map(w => w.trim()).filter(w => w && w.length <= 30))];
  if (!words.length) return { buckets: [] };
  const L = { listen: [], missing: [], choose: [], scramble: [], sentence: [] };
  words.forEach(w => {
    const hint = pt ? `Começa com "${w[0]}" e tem ${w.length} letras.` : `It starts with "${w[0]}" and has ${w.length} letters.`;
    if (speechOK) L.listen.push(Q('listen', pt ? 'Ouça a palavra e escreva:' : 'Listen and write the word:', w, { say: w, strict: true, hint }));
    if (w.length >= 4 && !/\s/.test(w)) {
      const k = w.length >= 7 ? 2 : 1;
      const idx = rng.sample([...Array(w.length).keys()].slice(1), k).sort((a, b) => a - b);
      const shown = [...w].map((c, i) => idx.includes(i) ? '_' : c).join('');
      L.missing.push(Q('short', pt ? `Complete e escreva a palavra inteira: ${shown}` : `Fill the gaps and write the whole word: ${shown}`, w, { strict: true, hint }));
      let scr = w; let g = 0;
      while (scr === w && g++ < 10) scr = rng.shuffle([...w]).join('');
      L.scramble.push(Q('short', pt ? `Desembaralhe: ${scr.toUpperCase().split('').join(' ')}` : `Unscramble: ${scr.toUpperCase().split('').join(' ')}`, w, { strict: true, hint }));
    }
    const wrong = misspellings(w, subj.lang, rng);
    if (wrong.length >= 2) L.choose.push(Q('mc', pt ? 'Qual está escrita corretamente?' : 'Which spelling is correct?', w, { options: rng.shuffle([w, ...wrong]), strict: true, hint: pt ? 'Leia cada opção bem devagar.' : 'Read each option slowly — which one looks right?' }));
    L.sentence.push(Q('open', pt ? `Escreva uma frase usando a palavra "${w}".` : `Write a sentence using the word "${w}".`, '', { hint: pt ? 'Comece com letra maiúscula e termine com ponto.' : 'Start with a capital letter and end with a full stop.' }));
  });
  Object.values(L).forEach(arr => arr.splice(0, arr.length, ...rng.shuffle(arr)));
  const proof = [localProof(subj, rng), localProof(subj, rng)].filter(Boolean);
  return { buckets: [proof, L.listen, L.choose, L.missing, L.scramble, L.sentence] };
}

/* ---------- Leitura / Reading / Guided reading ---------- */
const READ_T = {
  pt: [
    'Quem são os personagens principais de {t}?', 'Resuma o que aconteceu em {t} em 2 ou 3 frases.', 'Qual foi a parte de que você mais gostou em {t}? Por quê?',
    'Escreva 2 palavras novas que você encontrou em {t} e o que significam.', 'Onde e quando acontece a história de {t}?', 'O que você acha que vai acontecer depois em {t}?',
    'Como o personagem principal de {t} se sentiu? Copie uma frase que mostra isso.', 'Qual é a mensagem (lição) de {t}?', 'Invente um novo título para {t} e explique.',
  ],
  en: [
    'Who are the main characters in {t}?', 'Summarise what happened in {t} in 2–3 sentences.', 'What was your favourite part of {t}? Why?',
    'Write 2 new words from {t} and what they mean.', 'Where and when does {t} take place?', 'What do you think will happen next in {t}?',
    'How did the main character in {t} feel? Copy a sentence that shows it.', 'What is the message of {t}?',
  ],
  guided: [
    'Vocabulary: choose 2 interesting words from {t}. What do they mean?', 'Infer: how does the main character feel in {t}? Give one clue from the text.',
    'Predict: what will happen next in {t}? Why do you think so?', 'Explain: why do you think the author chose this title for {t}?',
    'Retrieve: write 3 facts or events from {t}.', 'Sequence: put 3 main events from {t} in order (first, then, finally).',
    'Summarise {t} in 3 short sentences.', 'Explain: which word best describes the main character in {t}? Why?',
  ],
};
function clozeQuestions(passage, subj, rng) {
  const pt = subj.lang === 'pt';
  const sentences = passage.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => { const n = s.split(' ').length; return n >= 5 && n <= 28; });
  const out = [];
  rng.shuffle(sentences).slice(0, 10).forEach(s => {
    const words = s.split(' ');
    const cands = words.map((w, i) => [w.replace(/[^\p{L}'-]/gu, ''), i]).filter(([w, i]) => i > 0 && w.length >= 5);
    if (!cands.length) return;
    const [w, i] = rng.pick(cands);
    const shown = words.map((x, j) => j === i ? x.replace(w, '_____') : x).join(' ');
    out.push(Q('short', pt ? `Complete com a palavra do texto: "${shown}"` : `Complete with the word from the text: "${shown}"`, w,
      { hint: pt ? `Procure essa frase no texto. A palavra começa com "${w[0]}".` : `Find this sentence in the text. The word starts with "${w[0]}".` }));
  });
  return out;
}
function readingPool(subj, text, rng, guided) {
  const pt = subj.lang === 'pt';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { buckets: [] };
  const title = lines[0].length > 80 ? lines[0].slice(0, 77) + '…' : lines[0];
  const passage = lines.slice(1).join(' ');
  const t = pt ? `"${title}"` : `"${title}"`;
  const tpl = guided ? READ_T.guided : READ_T[subj.lang];
  const open = rng.shuffle(tpl).map(s => Q('open', s.replace('{t}', t), '', { hint: pt ? 'Volte ao texto e procure a parte que fala disso.' : 'Go back to the text and find the part about it.' }));
  const cloze = passage.length > 120 ? clozeQuestions(passage, subj, rng) : [];
  return { buckets: [cloze, open] };
}

/* ---------- Estudos sociais: BSS / IPC ---------- */
const BR_STATES = [ // [estado, capital, região, preposição]
  ['Acre', 'Rio Branco', 'Norte', 'do'], ['Amapá', 'Macapá', 'Norte', 'do'], ['Amazonas', 'Manaus', 'Norte', 'do'], ['Pará', 'Belém', 'Norte', 'do'], ['Rondônia', 'Porto Velho', 'Norte', 'de'], ['Roraima', 'Boa Vista', 'Norte', 'de'], ['Tocantins', 'Palmas', 'Norte', 'do'],
  ['Alagoas', 'Maceió', 'Nordeste', 'de'], ['Bahia', 'Salvador', 'Nordeste', 'da'], ['Ceará', 'Fortaleza', 'Nordeste', 'do'], ['Maranhão', 'São Luís', 'Nordeste', 'do'], ['Paraíba', 'João Pessoa', 'Nordeste', 'da'], ['Pernambuco', 'Recife', 'Nordeste', 'de'], ['Piauí', 'Teresina', 'Nordeste', 'do'], ['Rio Grande do Norte', 'Natal', 'Nordeste', 'do'], ['Sergipe', 'Aracaju', 'Nordeste', 'de'],
  ['Goiás', 'Goiânia', 'Centro-Oeste', 'de'], ['Mato Grosso', 'Cuiabá', 'Centro-Oeste', 'de'], ['Mato Grosso do Sul', 'Campo Grande', 'Centro-Oeste', 'de'], ['Distrito Federal', 'Brasília', 'Centro-Oeste', 'do'],
  ['Espírito Santo', 'Vitória', 'Sudeste', 'do'], ['Minas Gerais', 'Belo Horizonte', 'Sudeste', 'de'], ['Rio de Janeiro', 'Rio de Janeiro', 'Sudeste', 'do'], ['São Paulo', 'São Paulo', 'Sudeste', 'de'],
  ['Paraná', 'Curitiba', 'Sul', 'do'], ['Rio Grande do Sul', 'Porto Alegre', 'Sul', 'do'], ['Santa Catarina', 'Florianópolis', 'Sul', 'de'],
];
const BR_BIOMES = [['a maior floresta tropical do mundo', 'Amazônia'], ['clima semiárido e plantas que guardam água, como o mandacaru', 'Caatinga'], ['a maior planície alagável do mundo', 'Pantanal'],
  ['a floresta do litoral, a mais desmatada do Brasil', 'Mata Atlântica'], ['árvores de troncos tortos e o "berço das águas" no centro do país', 'Cerrado'], ['campos com vegetação rasteira no sul do Rio Grande do Sul', 'Pampa']];
const BR_HIST = [['Em que ano os portugueses chegaram ao Brasil?', '1500', 'num'], ['Quem comandava a frota portuguesa que chegou ao Brasil em 1500?', 'Pedro Álvares Cabral', 'short', ['Cabral']],
  ['Em que ano foi a Independência do Brasil?', '1822', 'num'], ['Quem declarou a Independência do Brasil?', 'Dom Pedro I', 'short', ['D. Pedro I', 'Pedro I']], ['Em que ano a escravidão foi abolida no Brasil?', '1888', 'num'],
  ['Qual lei aboliu a escravidão no Brasil?', 'Lei Áurea', 'short'], ['Em que ano foi proclamada a República no Brasil?', '1889', 'num'], ['Qual foi a primeira capital do Brasil?', 'Salvador', 'short'],
  ['Qual árvore deu nome ao Brasil?', 'Pau-brasil', 'short', ['pau brasil']], ['Desde que ano Brasília é a capital do Brasil?', '1960', 'num']];
const EN_SOCIAL = {
  continent: [['Brazil', 'South America'], ['Egypt', 'Africa'], ['Japan', 'Asia'], ['France', 'Europe'], ['Canada', 'North America'], ['Australia', 'Oceania'], ['Kenya', 'Africa'], ['India', 'Asia'], ['Argentina', 'South America'], ['Mexico', 'North America'], ['Italy', 'Europe'], ['China', 'Asia']],
  space: [['Which planet is closest to the Sun?', 'Mercury'], ['Which is the largest planet?', 'Jupiter'], ['Which planet is known as the Red Planet?', 'Mars'], ['Which planet has the most famous rings?', 'Saturn'], ['How many planets are in our Solar System?', '8'], ['What is at the centre of our Solar System?', 'The Sun'], ['What is the name of our galaxy?', 'The Milky Way'], ['What natural satellite orbits the Earth?', 'The Moon']],
  water: [['What do we call water turning into vapour when it is heated?', 'Evaporation'], ['What do we call water vapour cooling to form clouds?', 'Condensation'], ['What do we call rain, snow or hail falling from clouds?', 'Precipitation'], ['What do we call water gathering in rivers, lakes and seas?', 'Collection']],
  egypt: [['Ancient Egyptians wrote with pictures called…', 'Hieroglyphs'], ['Which river was vital to Ancient Egypt?', 'The Nile'], ['What were the kings of Ancient Egypt called?', 'Pharaohs'], ['What do we call preserved bodies from Ancient Egypt?', 'Mummies'], ['What huge stone tombs did Egyptians build?', 'Pyramids']],
  rome: [['What language did the Ancient Romans speak?', 'Latin'], ['What was the huge arena in Rome called?', 'The Colosseum'], ['Which volcano destroyed Pompeii?', 'Vesuvius'], ['Who was the first Roman emperor?', 'Augustus']],
  plants: [['Which part of a plant takes in water from the soil?', 'Roots'], ['Which part of a plant makes food using sunlight?', 'Leaves'], ['What is the process plants use to make food?', 'Photosynthesis'], ['Which gas do plants take in from the air?', 'Carbon dioxide'], ['Which gas do plants give out?', 'Oxygen'], ['Which part of the plant carries water up to the leaves?', 'Stem']],
  body: [['Which organ pumps blood around the body?', 'Heart'], ['Which organs help us breathe?', 'Lungs'], ['Which bone protects the brain?', 'Skull'], ['How many bones does an adult human have?', '206'], ['Which organ controls the whole body?', 'Brain']],
};
function socialPool(subj, text, rng) {
  const pt = subj.lang === 'pt';
  const t = text.toLowerCase();
  const topic = text.split('\n')[0].trim();
  const banks = [];
  if (pt) {
    if (/capita|estado/.test(t)) banks.push(rng.sample(BR_STATES.filter(x => x[0] !== x[1]), 10).map(([e, c, , pr]) => mcQ(`Qual é a capital ${pr} ${e}?`, c, BR_STATES.map(s => s[1]), rng, { hint: 'Lembre do mapa do Brasil que você estudou.' })));
    if (/regi/.test(t)) banks.push(rng.sample(BR_STATES, 10).map(([e, , r, pr]) => mcQ(`Em qual região do Brasil fica ${({ do: 'o ', da: 'a ' })[pr] || ''}${e}?`, r, ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'], rng, { hint: 'O Brasil tem 5 regiões: Norte, Nordeste, Centro-Oeste, Sudeste e Sul.' })));
    if (/bioma|vegeta|floresta/.test(t)) banks.push(BR_BIOMES.map(([d, b]) => mcQ(`Qual bioma tem ${d}?`, b, BR_BIOMES.map(x => x[1]), rng, { hint: 'Os biomas do Brasil: Amazônia, Cerrado, Caatinga, Mata Atlântica, Pantanal e Pampa.' })));
    if (/hist|descobr|independ|colon|rep[uú]bl|cabral|imp[eé]rio|escrav|aboli/.test(t)) banks.push(rng.shuffle(BR_HIST).map(([q, a, ty, acc]) => Q(ty, q, a, { accept: acc, hint: 'Pense na linha do tempo do Brasil: 1500 → 1822 → 1888 → 1889.' })));
  } else {
    const pairs = [['continent', /continent|countr|world|map/], ['space', /planet|solar|space|moon|star/], ['water', /water cycle|evapor|condens|rain/], ['egypt', /egypt/], ['rome', /roman|rome/], ['plants', /plant|seed|flower|photosynth/], ['body', /body|skeleton|heart|organ|bone/]];
    pairs.forEach(([k, re]) => {
      if (!re.test(t)) return;
      if (k === 'continent') banks.push(rng.shuffle(EN_SOCIAL.continent).map(([c, a]) => mcQ(`On which continent is ${c}?`, a, ['South America', 'North America', 'Africa', 'Asia', 'Europe', 'Oceania'], rng, { hint: 'There are 7 continents. Picture the world map!' })));
      else banks.push(rng.shuffle(EN_SOCIAL[k]).map(([q, a]) => (/^\d+$/.test(a) ? Q('num', q, a) : mcQ(q, a, EN_SOCIAL[k].map(x => x[1]).filter(x => !/^\d+$/.test(x)), rng)) ) .map(q => Object.assign(q, { hint: 'Think about what you learnt in class this week.' })));
    });
  }
  const O = pt
    ? ['O que você aprendeu esta semana sobre {t}?', 'Cite 3 fatos importantes sobre {t}.', 'Por que {t} é importante?', 'Explique uma palavra nova que você aprendeu em {t}.', 'Escreva 2 perguntas que você ainda tem sobre {t}.', 'Desenhe mentalmente e descreva em 2 frases: {t}.']
    : ['What did you learn this week about {t}?', 'Write 3 important facts about {t}.', 'Why is {t} important?', 'Explain a new word you learnt in {t}.', 'Write 2 questions you still have about {t}.', 'Describe {t} to a friend in 2 sentences.'];
  const open = topic ? rng.shuffle(O).map(s => Q('open', s.replace('{t}', `"${topic}"`), '', { hint: pt ? 'Lembre do que a professora explicou e do seu caderno.' : 'Look at your notes from class.' })) : [];
  return { buckets: [...banks, open] };
}

/* ---------- Math ---------- */
const NAMES = ['Leo', 'Sofia', 'Maya', 'Tom', 'Ana', 'Ben', 'Lucas', 'Julia'];
const fmtN = n => n.toLocaleString('en-GB');
const M = {
  add: r => { const a = r.int(120, 4999), b = r.int(50, 2999); return Q('num', `${fmtN(a)} + ${fmtN(b)} = ?`, a + b, { hint: 'Line up ones, tens, hundreds… and carry when you pass 9.' }); },
  sub: r => { const a = r.int(300, 9999), b = r.int(50, a - 20); return Q('num', `${fmtN(a)} − ${fmtN(b)} = ?`, a - b, { hint: 'Line up the digits. Exchange from the next column if you need to.' }); },
  mul: r => r.next() < .55
    ? (() => { const a = r.int(2, 12), b = r.int(2, 12); return Q('num', `${a} × ${b} = ?`, a * b, { hint: `Count in ${a}s, ${b} times.` }); })()
    : (() => { const a = r.int(12, 99), b = r.int(3, 9); return Q('num', `${a} × ${b} = ?`, a * b, { hint: `Split it: ${Math.floor(a / 10) * 10} × ${b} + ${a % 10} × ${b}.` }); })(),
  div: r => { const b = r.int(2, 12), q = r.int(2, 15); return Q('num', `${b * q} ÷ ${b} = ?`, q, { hint: `Which number × ${b} = ${b * q}?` }); },
  fracOf: r => { const den = r.pick([2, 3, 4, 5, 6, 8, 10]), num = r.int(1, den - 1), whole = den * r.int(2, 10); return Q('num', `What is ${num}/${den} of ${whole}?`, whole / den * num, { hint: `First find 1/${den}: ${whole} ÷ ${den}. Then multiply by ${num}.` }); },
  fracEq: r => { const den = r.pick([2, 3, 4, 5, 6]), num = r.int(1, den - 1), k = r.int(2, 5); return Q('num', `${num}/${den} = ?/${den * k}`, num * k, { hint: `The bottom was multiplied by ${k}. Do the same to the top!` }); },
  fracAdd: r => { const den = r.pick([5, 6, 7, 8, 9, 10, 12]), a = r.int(1, den - 2), b = r.int(1, den - 1 - a); return Q('num', `${a}/${den} + ${b}/${den} = ?`, `${a + b}/${den}`, { hint: 'Same denominator: add the tops, keep the bottom.' }); },
  fracCmp: r => { const opts = r.sample([[1, 2], [1, 3], [1, 4], [2, 3], [3, 4], [2, 5], [3, 5], [5, 8], [3, 10], [7, 10]], 4); const best = opts.reduce((m, f) => f[0] / f[1] > m[0] / m[1] ? f : m); return Q('mc', 'Which fraction is the biggest?', `${best[0]}/${best[1]}`, { options: opts.map(f => `${f[0]}/${f[1]}`), hint: 'Imagine each fraction as a slice of the same pizza.' }); },
  decAdd: r => { const a = r.int(11, 999), b = r.int(11, 999); return Q('num', `${(a / 10).toFixed(1)} + ${(b / 10).toFixed(1)} = ?`, ((a + b) / 10).toFixed(1), { hint: 'Line up the decimal points.' }); },
  decCmp: r => { const base = r.int(1, 9); const opts = r.shuffle([`0.${base}`, `0.${base}5`, `0.0${base}`, `0.${base}05`]); const best = opts.reduce((m, x) => Number(x) > Number(m) ? x : m); return Q('mc', 'Which decimal is the largest?', best, { options: opts, hint: 'Compare the tenths first, then the hundredths.' }); },
  place: r => { let n, d, pos; do { n = r.int(10000, 999999); const s = String(n); pos = r.int(0, s.length - 1); d = s[pos]; if (d !== '0' && s.split(d).length === 2) break; } while (true); const val = Number(d) * 10 ** (String(n).length - 1 - pos); return Q('num', `What is the value of the digit ${d} in ${fmtN(n)}?`, val, { hint: 'Ones, tens, hundreds, thousands, ten thousands…' }); },
  round: r => { const n = r.int(1000, 99999), to = r.pick([10, 100, 1000]); return Q('num', `Round ${fmtN(n)} to the nearest ${fmtN(to)}.`, Math.round(n / to) * to, { hint: 'Look at the digit to the right: 5 or more, round up.' }); },
  perim: r => { const w = r.int(3, 20), h = r.int(2, 15); return Q('num', `A rectangle is ${w} cm long and ${h} cm wide. What is its perimeter (cm)?`, 2 * (w + h), { hint: 'Perimeter = add all 4 sides.' }); },
  area: r => { const w = r.int(3, 15), h = r.int(2, 12); return Q('num', `A rectangle is ${w} cm long and ${h} cm wide. What is its area (cm²)?`, w * h, { hint: 'Area of a rectangle = length × width.' }); },
  time: r => r.next() < .5
    ? (() => { const h = r.int(1, 4), m = r.pick([5, 10, 15, 20, 30, 45]); return Q('num', `How many minutes are in ${h} hour${h > 1 ? 's' : ''} and ${m} minutes?`, h * 60 + m, { hint: '1 hour = 60 minutes.' }); })()
    : (() => { const h = r.int(1, 10), m = r.pick([0, 15, 30, 45]), add = r.pick([15, 20, 30, 45, 50]); const t = h * 60 + m + add; const ans = `${Math.floor(t / 60)}:${pad2(t % 60)}`; return Q('short', `It is ${h}:${pad2(m)}. What time will it be in ${add} minutes? (h:mm)`, ans, { accept: [pad2(Math.floor(t / 60)) + ':' + pad2(t % 60)], hint: 'Count on to the next hour first.' }); })(),
  money: r => { const p = r.int(105, 895); return Q('num', `You buy a book for £${(p / 100).toFixed(2)} and pay with a £10 note. How much change do you get (£)?`, ((1000 - p) / 100).toFixed(2), { hint: 'Count up from the price to £10.' }); },
  factor: r => { const n = r.pick([12, 18, 20, 24, 30, 36, 40, 48]); const fs = []; for (let i = 2; i < n; i++) if (n % i === 0) fs.push(i); const non = []; for (let i = 2; i < n; i++) if (n % i) non.push(i); return mcQ(`Which number is a factor of ${n}?`, r.pick(fs), non, r, { hint: `A factor divides ${n} exactly, with nothing left over.` }); },
  multiple: r => { const k = r.int(3, 9); const ans = k * r.int(3, 12); const non = []; for (let i = 10; i < 110; i++) if (i % k) non.push(i); return mcQ(`Which number is a multiple of ${k}?`, ans, non, r, { hint: `Count in ${k}s.` }); },
  prime: r => { const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37], comp = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 21, 22, 25, 27, 33, 35]; return mcQ('Which of these is a prime number?', r.pick(primes), comp, r, { hint: 'A prime number has only 2 factors: 1 and itself.' }); },
  square: r => { const n = r.int(2, 12); return Q('num', `What is ${n} squared (${n} × ${n})?`, n * n, { hint: `${n} rows of ${n}.` }); },
  neg: r => { const a = -r.int(1, 9), b = r.int(3, 15); return Q('num', `The temperature is ${a}°C and it rises by ${b}°C. What is the new temperature?`, a + b, { hint: 'Use a number line: count up from the negative number.' }); },
  word: r => {
    const n = r.pick(NAMES);
    return r.pick([
      () => { const a = r.int(3, 9), b = r.int(6, 12); return Q('num', `A box holds ${b} pencils. How many pencils are in ${a} boxes?`, a * b, { hint: 'Equal groups → multiply.' }); },
      () => { const a = r.int(40, 120), b = r.int(5, a - 5); return Q('num', `${n} has ${a} stickers and gives away ${b}. How many are left?`, a - b, { hint: 'Gives away → subtract.' }); },
      () => { const b = r.int(3, 8), q = r.int(3, 9); return Q('num', `${b * q} children are split equally into ${b} teams. How many children are in each team?`, q, { hint: 'Split equally → divide.' }); },
      () => { const a = r.int(20, 45), b = r.int(3, 12), c = r.int(2, 10); return Q('num', `A bus has ${a} passengers. At a stop, ${b} get off and ${c} get on. How many are on the bus now?`, a - b + c, { hint: 'Do it in two steps.' }); },
      () => { const a = r.int(8, 25), d = r.int(3, 7); return Q('num', `${n} reads ${a} pages a day. How many pages does ${n} read in ${d} days?`, a * d, { hint: 'Every day the same amount → multiply.' }); },
    ])();
  },
};
const MATH_TOPICS = [
  ['add', /add|soma|adi[cç]|plus|sum\b/], ['sub', /subtra|minus|take away/], ['mul', /multipl|times table|tabuada|\btimes\b/], ['div', /divi/],
  ['fracOf', /fraction|fra[cç]/], ['fracEq', /fraction|fra[cç]|equivalent/], ['fracAdd', /fraction|fra[cç]/], ['fracCmp', /fraction|fra[cç]|compar/],
  ['decAdd', /decimal/], ['decCmp', /decimal/], ['place', /place value|valor posicional|digit/], ['round', /round|arredond|estimat/],
  ['perim', /perimet|per[ií]metro/], ['area', /\barea\b|[aá]rea/], ['time', /\btime(?!s)|clock|hora|minute/], ['money', /money|dinheiro|change|coins|£/],
  ['factor', /factor|fator/], ['multiple', /multiple|m[uú]ltipl/], ['prime', /prime|primo/], ['square', /square|quadrad/], ['neg', /negativ/], ['word', /word problem|problem/],
];
function mathPool(subj, text, rng) {
  const t = text.toLowerCase();
  let keys = [...new Set(MATH_TOPICS.filter(([, re]) => re.test(t)).map(([k]) => k))];
  if (!keys.length) keys = ['add', 'sub', 'mul', 'div', 'fracOf', 'word'];
  const per = Math.max(6, Math.ceil(40 / keys.length));
  const buckets = keys.map(k => { const seen = new Set(); const arr = []; let g = 0; while (arr.length < per && g++ < per * 4) { const q = M[k](rng); if (!seen.has(q.q)) { seen.add(q.q); arr.push(q); } } return arr; });
  return { buckets };
}

/* ---------- Pool por matéria ---------- */
function buildPool(subjId, rawText, seed, imported = []) {
  const subj = SUBJ[subjId];
  const rng = makeRng(seed + '|' + subjId);
  const { facts, text } = parseTopic(rawText);
  let res = { buckets: [] };
  if (text.trim() || (subj.kind === 'math' && rawText.trim())) {
    if (subj.kind === 'grammar') res = grammarPool(subj, text, rng);
    else if (subj.kind === 'spelling') res = spellingPool(subj, text, rng);
    else if (subj.kind === 'reading') res = readingPool(subj, text, rng, false);
    else if (subj.kind === 'guided') res = readingPool(subj, text, rng, true);
    else if (subj.kind === 'social') res = socialPool(subj, text, rng);
    else if (subj.kind === 'math') res = mathPool(subj, text, rng);
  }
  const base = interleave([rng.shuffle(factQuestions(facts, subj, rng)), ...res.buckets]);
  const imp = imported.filter(q => q.subject === subjId);
  const all = [...imp, ...base].map(q => Object.assign({ subject: subjId, lang: subj.lang }, q));
  // remove duplicadas
  const seen = new Set();
  return all.filter(q => { const k = q.type + '|' + q.q; if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ---------- Importação de perguntas (JSON gerado pelo Claude ou pelos pais) ---------- */
function validateImported(data) {
  const arr = Array.isArray(data) ? data : (data && Array.isArray(data.questions) ? data.questions : null);
  if (!arr) throw new Error('O JSON precisa ter uma lista "questions".');
  const ok = []; const errs = [];
  arr.forEach((q, i) => {
    const subject = String(q.subject || '').trim();
    const type = String(q.type || '').trim();
    if (!SUBJ[subject]) { errs.push(`#${i + 1}: matéria "${subject}" desconhecida`); return; }
    if (!['mc', 'short', 'num', 'open', 'listen', 'proof'].includes(type)) { errs.push(`#${i + 1}: tipo "${type}" inválido`); return; }
    if (!q.q && type !== 'listen') { errs.push(`#${i + 1}: falta o texto "q"`); return; }
    const item = { subject, type, q: String(q.q || (SUBJ[subject].lang === 'pt' ? 'Ouça a palavra e escreva:' : 'Listen and write the word:')), answer: String(q.answer ?? ''), hint: q.hint ? String(q.hint) : '' , src: 'import' };
    if (type === 'mc') {
      if (!Array.isArray(q.options) || q.options.length < 2) { errs.push(`#${i + 1}: múltipla escolha precisa de "options"`); return; }
      item.options = q.options.map(String);
      if (!item.options.some(o => norm(o) === norm(item.answer))) { errs.push(`#${i + 1}: a resposta não está entre as opções`); return; }
    }
    if (type === 'listen') item.say = String(q.say || q.answer || '');
    if (type === 'proof') {
      item.strict = true;
      if (!proofPrepare(item, q.text, q.errors)) { errs.push(`#${i + 1}: caça-erros sem erros válidos no texto`); return; }
    }
    if (Array.isArray(q.accept)) item.accept = q.accept.map(String);
    if (q.strict) item.strict = true;
    if (q.day && CYCLE.includes(String(q.day))) item.day = String(q.day);
    ok.push(item);
  });
  return { ok, errs };
}
function claudePrompt(topics) {
  const lines = mySubjects().map(id => SUBJ[id]).map(s => `- ${s.id} (${s.name}, ${s.lang === 'pt' ? 'em português' : 'in English'}): ${(topics[s.id] || '').trim().replace(/\n/g, ' / ') || '(sem tópico esta semana)'}`).join('\n');
  return `Você gera exercícios para um estudante de escola internacional (currículo britânico + matérias brasileiras), ${S.settings.year ? yearLabel(S.settings.year) : 'por volta de 10 anos'}.
Use os tópicos abaixo (e o "Study Worksheet" da escola, se eu colar no final) para criar perguntas CURTAS e SIMPLES.
Regra: prefira muitas perguntas fáceis a poucas difíceis. Gere cerca de 6 perguntas por matéria que tenha tópico.
Matérias em português: perguntas em português. Matérias em inglês: perguntas em inglês.

Responda APENAS com JSON válido, sem comentários, neste formato:
{"questions":[
 {"subject":"math","type":"num","q":"7 × 8 = ?","answer":"56","hint":"7 × 8 = 7 × 4 × 2"},
 {"subject":"pt","type":"mc","q":"Qual é o antônimo de 'alto'?","options":["baixo","grande","forte","feliz"],"answer":"baixo","hint":"Antônimo é o contrário."},
 {"subject":"en_spell","type":"listen","say":"because","answer":"because","hint":"It starts with b."},
 {"subject":"ipc","type":"open","q":"Write 3 facts about the Solar System.","answer":""}
]}

Campos:
- subject: ${mySubjects().join(', ')}
- type: mc (múltipla escolha: "options" com 3–4 itens e "answer" igual a uma delas), short (resposta curta exata), num (resposta numérica), listen (ditado: "say" = palavra), open (resposta livre, "answer" vazio — os pais corrigem)
- hint: uma dica curta, sem entregar a resposta
- day (opcional): sab, dom, seg, ter, qua, qui, sex
- No máximo 1 em cada 4 perguntas pode ser "open".

Tópicos da semana:
${lines}

Study Worksheet (cole aqui, se tiver):
`;
}

/* =========================================================================
   6. SEMANA — planejamento, distribuição, entrega e penalidade
   ========================================================================= */
function createWeek(startDate, fromDate, topics, counts, imported) {
  const end = addDays(startDate, 6);
  const week = { id: startDate + '-' + uid(), start: startDate, end, created: today(), topics, counts, imported: imported || [], days: {}, settled: null, settledAt: null };
  CYCLE.forEach((dk, i) => {
    const date = addDays(startDate, i);
    week.days[date] = { date, dow: dk, required: date >= fromDate && (counts[dk] || 0) > 0, n: counts[dk] || 0, questions: [], answers: {}, status: 'todo', marks: {}, result: null };
  });
  regenerateDays(week, Object.keys(week.days));
  return week;
}
function activeSubjects(week) {
  return SUBJECTS.filter(s => (week.topics[s.id] || '').trim() || (week.imported || []).some(q => q.subject === s.id)).map(s => s.id);
}
// (Re)gera as perguntas dos dias indicados que ainda não foram começados.
function regenerateDays(week, dates, nonce = '') {
  const act = activeSubjects(week);
  const usedElsewhere = new Set();
  Object.values(week.days).forEach(d => { if (!dates.includes(d.date)) d.questions.forEach(q => usedElsewhere.add(q.type + '|' + q.q)); });
  const pools = {};
  act.forEach(id => {
    pools[id] = buildPool(id, week.topics[id] || '', week.id + nonce, (week.imported || []).filter(q => !q.day)).filter(q => !usedElsewhere.has(q.type + '|' + q.q));
  });
  const order = CYCLE.map((_, i) => addDays(week.start, i)).filter(d => dates.includes(d));
  order.forEach(date => {
    const day = week.days[date];
    if (!day.required) { day.questions = []; return; }
    const cycleIdx = CYCLE.indexOf(day.dow);
    const N = day.n;
    const qs = [];
    // perguntas importadas marcadas para este dia vêm primeiro
    (week.imported || []).filter(q => q.day === day.dow).forEach(q => { if (qs.length < N) qs.push(Object.assign({ lang: SUBJ[q.subject].lang }, q)); });
    if (act.length) {
      const k = act.length;   // todas as matérias todos os dias (~2 de cada)
      const start = (cycleIdx * k) % act.length;
      let daySubj = Array.from({ length: k }, (_, j) => act[(start + j) % act.length]);
      const openCap = Math.max(2, Math.ceil(N * 0.3));
      let openCount = qs.filter(q => q.type === 'open').length;
      let i = 0, stall = 0;
      while (qs.length < N && stall < act.length * 3) {
        const sid = daySubj[i % daySubj.length]; i++;
        const pool = pools[sid];
        if (!pool || !pool.length) {
          stall++;
          if (stall >= daySubj.length) { const extra = act.filter(a => !daySubj.includes(a) && pools[a] && pools[a].length); if (extra.length) { daySubj = daySubj.concat(extra.slice(0, 1)); stall = 0; } }
          continue;
        }
        let idx = 0;
        if (openCount >= openCap) { idx = pool.findIndex(q => q.type !== 'open'); if (idx < 0) { stall++; continue; } }
        const q = pool.splice(idx, 1)[0];
        if (q.type === 'open') openCount++;
        qs.push(q); stall = 0;
      }
    }
    // agrupa por matéria para a folha ficar organizada
    const ordered = qs.sort((a, b) => SUBJECTS.findIndex(s => s.id === a.subject) - SUBJECTS.findIndex(s => s.id === b.subject));
    day.questions = ordered.map((q, j) => Object.assign({}, q, { id: `${date}-${j}-${uid()}` }));
    day.answers = {}; day.status = 'todo'; day.result = null; day.marks = {};
  });
}
function dayStarted(day) { return Object.values(day.answers || {}).some(v => v != null && String(v).trim() !== ''); }
function dayState(day) {
  const t = today();
  if (!day.required) return 'off';
  if (day.status === 'done') return 'done';
  if (day.date > t) return 'locked';
  if (day.date === t) return 'today';
  return 'late';
}
// Recompensa e penalidade proporcionais aos dias obrigatórios: semana começada na sexta vale 1/7.
function weekFullDays() { return CYCLE.filter(dk => (S.settings.counts[dk] || 0) > 0).length || 7; }
function weekReward(w) { return Math.round(S.settings.reward * Math.min(1, requiredDays(w).length / weekFullDays())); }
function weekPenalty(w) { return Math.round(S.settings.penalty * Math.min(1, requiredDays(w).length / weekFullDays())); }
function weekAllDone(w) { return Object.values(w.days).filter(d => d.required).every(d => d.status === 'done'); }
function requiredDays(w) { return Object.values(w.days).filter(d => d.required); }

// Recuperação: os dias que faltaram numa semana não entregue ficam abertos até a sexta seguinte.
// Recuperar todos vale metade da recompensa da semana (S.settings.latePct), dividida entre os dias.
function latePct() { const v = Number(S.settings.latePct); return Number.isFinite(v) ? clamp(v, 0, 100) : 50; }
function openRecovery(w) {
  const left = requiredDays(w).filter(d => d.status !== 'done' && d.questions.length);
  if (!left.length) return null;
  const pass = w.passages || [];
  S.recovery = { start: w.start, end: w.end, until: addDays(w.end, 7), pot: Math.round(weekReward(w) * latePct() / 100), total: left.length, n: 0, earned: 0,
    topicsText: weekTopicsText(w),
    days: Object.fromEntries(left.map(d => [d.date, Object.assign(JSON.parse(JSON.stringify(d)), { rec: true, printed: false, recPassages: pass.filter(x => x.day === d.dow) })])) };
  return S.recovery;
}
function recoveryActive() {
  const r = S.recovery;
  return r && today() <= r.until && Object.values(r.days).some(d => d.status !== 'done') ? r : null;
}
function recoveryLeftCoins(r) { return r.pot - r.earned; }
// Dias desta semana concluídos antes das moedas diárias existirem (ex.: sábado 24/10) recebem as moedas uma vez.
function grantMissingDayCoins() {
  const w = S.week; const dc = Math.max(0, Number(S.settings.dayCoins ?? 10));
  if (!w || !dc) return 0;
  let got = 0;
  Object.values(w.days).forEach(d => {
    if (d.status !== 'done' || d.coinsAt || !d.result || d.rec) return;
    const doneOn = String(d.result.at || '').slice(0, 10);
    if (!doneOn) { d.coinsAt = today(); return; }
    const amt = doneOn && doneOn <= d.date ? dc : Math.round(dc / 2);
    if (addCoins(amt, `Tarefa de ${DOW_FULL[d.dow].toLowerCase()} ${fmtDM(d.date)}`, 'day-' + d.date)) { d.coinsAt = today(); d.coins = amt; got += amt; }
    else d.coinsAt = today();
  });
  return got;
}
// Liquidação: roda ao abrir o app. Depois da sexta, recompensa ou penalidade.
function settleIfNeeded() {
  const w = S.week;
  const back = grantMissingDayCoins();
  if (back) setTimeout(() => say(`Opa! Faltou te dar as moedas das tarefas que você já fez: <b>+${back}</b> 🪙. 🎉`, { mood: 'wow' }), 600);
  // semanas fechadas antes desta função existir também ganham a recuperação
  if (w && w.settled === 'missed' && (!S.recovery || S.recovery.start !== w.start) && today() <= addDays(w.end, 7)) { openRecovery(w); save(); }
  if (!w || w.settled) return null;
  if (today() <= w.end) return null;
  const done = requiredDays(w).filter(d => d.status === 'done').length;
  const total = requiredDays(w).length;
  if (total === 0) { w.settled = 'empty'; save(); return null; }
  if (done === total) {
    w.settled = 'delivered'; w.settledAt = today();
    addCoins(weekReward(w), `Semana ${fmtDM(w.start)}–${fmtDM(w.end)} entregue (${total} dia${total > 1 ? 's' : ''})`, 'week-' + w.start);
    return { type: 'good', msg: `A semana de ${fmtDM(w.start)} a ${fmtDM(w.end)} estava completa: <b>+${weekReward(w)}</b> 🪙!` };
  }
  w.settled = 'missed'; w.settledAt = today();
  const pen = weekPenalty(w);
  addCoins(-pen, `Semana ${fmtDM(w.start)}–${fmtDM(w.end)} não entregue (${done}/${total} dias)`, 'weekpen-' + w.start);
  const r = latePct() > 0 ? openRecovery(w) : null; save();
  return { type: 'bad', msg: `A semana de ${fmtDM(w.start)} a ${fmtDM(w.end)} não foi entregue (${done} de ${total} dias). <b>−${pen}</b> 🪙.`
    + (r ? ` Mas dá para <b>recuperar</b>: faça ${r.total === 1 ? 'o dia que faltou' : `os ${r.total} dias que faltaram`} até sexta ${fmtDM(r.until)} e ganhe metade da recompensa (<b>+${r.pot}</b> 🪙). ⏳` : ' Bora recuperar nesta semana!') };
}
function deliverWeek() {
  const w = S.week;
  if (!w || w.settled || !weekAllDone(w) || today() !== w.end) return;
  w.settled = 'delivered'; w.settledAt = today();
  const rw = weekReward(w);
  addCoins(rw, `Semana ${fmtDM(w.start)}–${fmtDM(w.end)} entregue (${requiredDays(w).length} dias)`, 'week-' + w.start);
  save();
  showCelebrate('Semana entregue! 🎉', `+${rw}`, 'Você completou todas as tarefas da semana. Que orgulho!');
}
function archiveWeek(w) {
  if (!w) return;
  const req = requiredDays(w);
  S.history.unshift({ start: w.start, end: w.end, settled: w.settled, done: req.filter(d => d.status === 'done').length, total: req.length });
  S.history = S.history.slice(0, 52);
}

/* =========================================================================
   7. TELAS
   ========================================================================= */
let currentScreen = 'home';
const VIEW = { setupTab: 'pt', setupCycle: null, setupMode: null, shopCat: 'egg', parentTab: 'review', parentsUnlocked: false, work: null, check: null, selfMarks: {} };

function show(screen) {
  if (currentScreen === 'parents' && screen !== 'parents' && VIEW.parentsUnlocked) {   // saiu da área dos pais: tranca de novo
    VIEW.parentsUnlocked = false;
    if (Server.me) apiCall('/api/auth/lock', { method: 'POST', data: {} }).catch(() => {});
  }
  currentScreen = screen;
  $('#app').dataset.mode = screen === 'login' ? 'auth' : 'app';
  document.body.dataset.screen = screen;   // posiciona o 💬 sem cobrir botões
  const fb = $('#fb-btn'); if (fb) { fb.hidden = ['login', 'welcome'].includes(screen); fb.onclick = openFeedback; }
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + screen));
  $$('.top-nav button').forEach(b => b.classList.toggle('active', b.dataset.nav === screen));
  const titles = { welcome: 'Bem-vinda!', login: 'Estudos com a Lumi', home: 'Estudos', setup: '📝 Minha semana', work: 'Tarefa', check: '📄 Corrigir folha', selfcheck: '✍️ Corrigir', shop: '🛒 Lojinha', parents: '🔒 Área dos pais', workshop: '✏️ Oficina de palavras', collection: '📖 Minha coleção', notes: '💌 Meus recadinhos' };
  $('#top-title').textContent = titles[screen] || 'Estudos';
  hideBubble();
  ({ welcome: renderWelcome, login: renderLogin, home: renderHome, setup: renderSetup, work: renderWork, check: renderCheck, selfcheck: renderSelfCheck, shop: renderShop, parents: renderParents, workshop: renderWorkshop, collection: renderCollection, notes: renderNotes })[screen]();
}
function renderCoins(pop) {
  $('#coin-count').textContent = S.coins;
  const pill = $('#coin-pill');
  pill.classList.toggle('negative', S.coins < 0);
  if (pop) { pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
}
function applyTheme() {
  const item = SHOP_ITEMS.find(i => i.id === S.equipped.bg);
  document.body.className = item ? item.theme : 'theme-default';
}

/* ---------- Modais e avisos ---------- */
function openModal(html, { wide = false, onClose } = {}) {
  const m = $('#modal'), c = $('#modal-card');
  c.className = 'modal-card' + (wide ? ' wide' : '');
  c.innerHTML = html;
  m.classList.remove('hidden');
  m.onclick = e => { if (e.target === m) closeModal(); };
  m._onClose = onClose;
  $$('[data-close]', c).forEach(b => b.onclick = closeModal);
  return c;
}
function closeModal() { const m = $('#modal'); m.classList.add('hidden'); if (m._onClose) { const f = m._onClose; m._onClose = null; f(); } }
function confirmBox(title, text, okLabel = 'Confirmar', danger = false) {
  return new Promise(res => {
    const c = openModal(`<div class="modal-head"><h3>${title}</h3></div><div class="modal-body"><p>${text}</p></div>
      <div class="modal-foot"><button class="btn" data-no>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${okLabel}</button></div>`, { onClose: () => res(false) });
    $('[data-no]', c).onclick = () => closeModal();
    $('[data-yes]', c).onclick = () => { $('#modal')._onClose = null; closeModal(); res(true); };
  });
}
let toastTimer = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2600); }
// opts.done: mostra "🏠 Voltar ao início" (principal) e "🔑 Ver gabarito" em vez de "Oba!"
function showCelebrate(title, big, text, mood = 'wow', opts = {}) {
  const foot = opts.done
    ? `<button class="btn" data-cgab>🔑 Ver gabarito</button><button class="btn primary big" data-chome>🏠 Voltar ao início</button>`
    : `<button class="btn primary big" data-close>Oba!</button>`;
  const m = openModal(`<div class="modal-body celebrate"><div class="owl-big">${mascotSVG(S.equipped, mood)}</div><h3 style="margin:4px 0">${title}</h3>
    ${big ? `<div class="big-num">${big} 🪙</div>` : ''}<p>${text}</p></div><div class="modal-foot celebrate-foot" style="justify-content:center">${foot}</div>`);
  const h = $('[data-chome]', m); if (h) h.onclick = () => { closeModal(); save(); show('home'); };
  const g = $('[data-cgab]', m); if (g) g.onclick = () => { closeModal(); const c = workCtx(); if (c) openGabarito(c); };
  return m;
}

/* ---------- Boas-vindas ---------- */
function renderWelcome() {
  const el = $('#scr-welcome');
  el.innerHTML = `<div class="welcome"><div class="owl-big">${mascotSVG(S.equipped, 'wow')}</div>
    <h1>Oi! Eu sou a ${MASCOT_NAME} 🦉</h1><p class="muted">Vou ser sua parceira de estudos. Como você se chama?</p>
    <input id="w-name" maxlength="24" placeholder="Seu nome" autocomplete="off">
    <button class="btn primary big wide" id="w-go">Vamos começar!</button></div>`;
  const go = () => { const n = $('#w-name').value.trim(); if (!n) { $('#w-name').focus(); return; } S.name = n; save(); show('home'); if (!S.tourDone) setTimeout(runTour, 350); };
  $('#w-go').onclick = go;
  $('#w-name').onkeydown = e => { if (e.key === 'Enter') go(); };
}

/* ---------- Início ---------- */
function renderHome() {
  const el = $('#scr-home');
  const w = S.week;
  const t = today();
  const settled = settleIfNeeded();
  if (settled) VIEW.homeNotice = settled;
  const notice = VIEW.homeNotice; VIEW.homeNotice = null;
  let body = '';
  const hero = `<div class="card home-hero span2"><div class="owl-big">${mascotSVG(S.equipped)}</div>
    <div class="grow">${Server.me && Server.me.children.length > 1 ? '<button class="btn small ghost switch-btn" data-act="switch">👤 Trocar</button>' : ''}<p class="home-hello">Oi, ${esc(S.name)}! 👋 ${S.streak && S.streak.n > 0 && (S.streak.last === today() || S.streak.last === addDays(today(), -1)) ? `<span class="streak" title="Dias seguidos">🔥 ${S.streak.n}</span>` : ''}</p>${w ? deadlineText(w) : '<div class="deadline">Vamos planejar a sua semana?</div>'}</div></div>`;
  const noticeHtml = notice ? `<div class="notice ${notice.type} span2">${notice.msg}</div>` : '';

  if (!w || (w.settled && w.end < t)) {
    body = `<div class="card span2"><h3 style="margin:0 0 6px">📝 Nova semana</h3>
      <p class="muted" style="margin:0 0 10px">Escreva o que você está aprendendo na escola e eu crio as tarefas de sábado a sexta.</p>
      <button class="btn primary big wide" data-act="setup">Planejar minha semana ✨</button></div>${recoveryHtml()}${questsHtml()}`;
  } else {
    const days = CYCLE.map((_, i) => w.days[addDays(w.start, i)]);
    const strip = days.map(d => {
      const st = dayState(d);
      const icon = { done: '✅', today: '📘', late: '⏰', locked: '🔒', off: '–' }[st];
      const isT = d.date === t;
      return `<button class="day-chip ${st} ${isT ? 'today' : ''} ${['sab', 'dom'].includes(d.dow) ? 'weekend' : ''}" data-day="${d.date}" ${st === 'off' || st === 'locked' ? 'aria-disabled="true"' : ''}>
        <span class="d">${DOW_LABEL[d.dow]}</span><span class="dt">${fmtDM(d.date)}</span><span class="st">${icon}</span><span class="n">${d.required ? d.questions.length + ' perg.' : ''}</span></button>`;
    }).join('');
    const late = days.filter(d => dayState(d) === 'late');
    const td = w.days[t];
    let main = '';
    if (w.settled === 'delivered') main = `<div class="notice good">🎉 Semana entregue! Quer adiantar a próxima?</div><button class="btn primary big wide" data-act="setup-next">Planejar a próxima semana</button>`;
    else if (w.settled === 'missed') main = `<button class="btn primary big wide" data-act="setup">Planejar nova semana</button>`;
    else if (late.length) main = `<button class="btn primary big wide" data-day="${late[0].date}">⏰ Fazer tarefa atrasada (${DOW_LABEL[late[0].dow]})</button>`;
    else if (td && dayState(td) === 'today' && td.printed) main = `<button class="btn gold big wide" data-check="${t}">📄 Corrigir a folha de hoje</button><button class="btn wide" data-day="${t}">📘 Fazer na tela</button>`;
    else if (td && dayState(td) === 'today') main = `<button class="btn primary big wide" data-day="${t}">📘 Abrir a tarefa de hoje (${td.questions.length} perguntas)</button>`;
    else if (weekAllDone(w) && t === w.end) main = `<button class="btn gold big wide" data-act="deliver">🎁 Entregar a semana (+${weekReward(w)} 🪙)</button>`;
    else if (td && td.status === 'done') main = `<div class="notice good">✅ Tarefa de hoje feita! Que tal uns extras?</div>`;
    else main = `<div class="notice info">Nenhuma tarefa para hoje. Aproveite para fazer extras!</div>`;
    if (weekAllDone(w) && t === w.end && !w.settled && !main.includes('deliver')) main += `<button class="btn gold big wide" data-act="deliver">🎁 Entregar a semana (+${weekReward(w)} 🪙)</button>`;

    const ex = S.extras[t] || { sets: 0 };
    const left = Math.max(0, S.settings.extraSetsPerDay - ex.sets);
    const sum = recoveryHtml() + ((w.summary || []).length ? `<div class="card span2 week-sum"><b>Esta semana</b>${w.summary.map(x => `<span>${SUBJ[x.subject] ? SUBJ[x.subject].icon : '•'} ${esc(x.summary)}</span>`).join('')}</div>` : '');
    body = `<div class="card span2"><div class="week-strip">${strip}</div></div>${sum}
      <div class="card actions">${main}</div>${questsHtml()}
      <div class="card actions">
        <button class="btn gold wide" data-act="extra">⭐ Exercícios extras ${left ? `(+${S.settings.extraPerCorrect} 🪙/acerto · ${left} hoje)` : '(sem moedas hoje)'}</button>
        <div class="actions-2"><button class="btn" data-act="setup">📝 Minha semana</button><button class="btn" data-act="shop">🛒 Lojinha</button></div>
      </div>`;
  }
  const stickers = S.owned.map(id => SHOP_ITEMS.find(i => i.id === id)).filter(i => i && i.cat === 'sticker');
  const shelf = `<div class="card span2"><div class="row"><b>Meu álbum</b><span class="muted tiny grow">adesivos da lojinha</span></div>
    <div class="sticker-shelf">${stickers.length ? stickers.map(s => `<span title="Adesivo">${s.emoji}</span>`).join('') : '<span class="empty">Ainda vazio — compre adesivos na lojinha! ⭐</span>'}</div></div>`;
  el.innerHTML = `<div class="home">${hero}${noticeHtml}${body}${shelf}</div>`;

  $$('[data-day]', el).forEach(b => b.onclick = () => openDay(b.dataset.day));
  $$('[data-claim]', el).forEach(b => b.onclick = () => { const [sc, id] = b.dataset.claim.split('|'); claimQuest(sc, id); });
  $$('[data-rec]', el).forEach(b => b.onclick = () => { VIEW.work = { kind: 'day', date: b.dataset.rec, rec: true }; show('work'); });
  $$('[data-check]', el).forEach(b => b.onclick = () => openCheck(b.dataset.check));
  $$('[data-act]', el).forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'setup') { VIEW.setupCycle = null; show('setup'); }
    else if (a === 'setup-next') { VIEW.setupCycle = 'next'; show('setup'); }
    else if (a === 'extra') openExtras();
    else if (a === 'shop') show('shop');
    else if (a === 'deliver') deliverWeek();
    else if (a === 'switch') switchProfile();
  });
  if (notice) say(notice.msg, { mood: notice.type === 'bad' ? 'sad' : 'wow' });
}
function recoveryHtml() {
  const r = recoveryActive(); if (!r) return '';
  const days = Object.values(r.days).sort((a, b) => a.date < b.date ? -1 : 1);
  const left = days.filter(d => d.status !== 'done').length;
  const per = Math.round(r.pot / r.total);
  return `<div class="card span2 recovery"><div class="rec-head"><b>⏳ Recuperação · semana ${fmtDM(r.start)}–${fmtDM(r.end)}</b><span class="rec-pot">+${recoveryLeftCoins(r)} 🪙</span></div>
      <div class="tiny muted">Vale metade · até sexta ${fmtDM(r.until)} · ${left} de ${r.total} dia${r.total > 1 ? 's' : ''} para fazer</div>
    <div class="rec-days">${days.map(d => d.status === 'done'
      ? `<button class="day-chip done" data-rec="${d.date}"><span class="d">${DOW_LABEL[d.dow]}</span><span class="dt">${fmtDM(d.date)}</span><span class="st">✅</span></button>`
      : `<button class="day-chip late" data-rec="${d.date}"><span class="d">${DOW_LABEL[d.dow]}</span><span class="dt">${fmtDM(d.date)}</span><span class="st">⏰</span><span class="n">≈ +${per} 🪙</span></button>`).join('')}</div></div>`;
}
function deadlineText(w) {
  const t = today();
  if (w.settled === 'delivered') return `<div class="deadline">Semana ${fmtDM(w.start)}–${fmtDM(w.end)}: <b>entregue ✔</b></div>`;
  if (w.settled === 'missed') return `<div class="deadline">A última semana não foi entregue.</div>`;
  const left = daysBetween(t, w.end);
  const req = requiredDays(w);
  const done = req.filter(d => d.status === 'done').length;
  return `<div class="deadline">Entrega: <b>sexta ${fmtDM(w.end)}</b> · ${left === 0 ? '<b>é hoje!</b>' : `faltam ${left} dia${left > 1 ? 's' : ''}`}</div>
    <div class="bonus-line">🎁 <b>+${weekReward(w)}</b> na sexta ${fmtDM(w.end)} se completar todos os dias (${done} de ${req.length} feitos)</div>`;
}
function openDay(date) {
  const w = S.week; if (!w) return;
  const d = w.days[date]; if (!d) return;
  const st = dayState(d);
  if (st === 'off') { say('Esse dia não tem tarefa nesta semana. 😉'); return; }
  if (st === 'locked') { say(`Calma! A tarefa de ${DOW_FULL[d.dow].toLowerCase()} abre no dia ${fmtDM(d.date)}. 🔒`); return; }
  if (w.settled && st === 'late') {
    const r = recoveryActive();
    if (r && r.start === w.start && r.days[date]) { VIEW.work = { kind: 'day', date, rec: true }; show('work'); return; }
    say('Essa semana já fechou e o prazo de recuperação acabou. Bora caprichar na próxima! 💪'); return;
  }
  VIEW.work = { kind: 'day', date };
  show('work');
}
// Extras: o estudante escolhe a matéria, entre as que ele faz. Math e English sempre aparecem se fizerem parte.
function extraGroups() {
  const mine = mySubjects();
  const has = id => mine.includes(id);
  const g = [{ id: 'mix', label: '🎲 Misturado', subjects: null }];
  const used = new Set();
  const add = (id, label, list) => { const subs = list.filter(has); if (subs.length) { g.push({ id, label, subjects: subs }); subs.forEach(x => used.add(x)); } };
  add('math', '➗ Math', ['math', 'fmath']);
  add('en', '🔤 English', ['en', 'en_spell', 'en_read', 'en_guided', 'en_lit']);
  add('pt', '📝 Português', ['pt', 'pt_ort', 'pt_leit', 'pt_lit', 'pt_red']);
  mine.filter(id => !used.has(id)).forEach(id => g.push({ id, label: `${SUBJ[id].icon} ${SUBJ[id].short}`, subjects: [id] }));
  return g;
}
// Assuntos de revisão quando a matéria não tem tópico na semana (gerador interno).
const EXTRA_DEFAULTS = {
  math: 'mixed', en: 'review', pt: 'revisão',
  en_spell: 'ancient, curiosity, determined, environment, familiar, guarantee, rhythm, sincere',
  pt_ort: 'exceção, cachorro, chuveiro, açúcar, girassol, enxergar, passeio, assobio',
  ipc: 'solar system, plants, water cycle, continents', bss: 'regiões e capitais do Brasil, biomas, história do Brasil',
  sci: 'cells, forces, states of matter, energy', bio: 'cells, photosynthesis, enzymes, the heart', chem: 'atoms, the periodic table, acids and alkalis',
  phys: 'forces, energy, electricity, waves', hist: 'the Tudors, World War I, World War II, the Cold War', geog: 'rivers, coasts, plate tectonics, climate',
  comp: 'binary, algorithms, networks', econ: 'supply and demand, inflation, market failure', bus: 'marketing mix, cash flow, stakeholders',
  psych: 'memory, social influence, research methods', fmath: 'complex numbers, matrices', spa: 'vocabulario: la familia, el colegio', fre: 'vocabulaire : la famille, l\'école',
  pt_lit: 'Romantismo, Realismo, Modernismo', pt_red: 'texto dissertativo-argumentativo, conectivos', en_lit: 'poetry, drama, prose',
};
function openExtras() {
  const t = today();
  if (S.extra && S.extra.date === t && S.extra.status !== 'done') { VIEW.work = { kind: 'extra' }; show('work'); return; }
  const ex = S.extras[t] || { sets: 0 };
  const left = Math.max(0, S.settings.extraSetsPerDay - ex.sets);
  const langs = bookLangs();
  const books = S.books || {};
  const missed = (S.missed || []).length;
  const c = openModal(`<div class="modal-head"><h3>⭐ Exercícios extras</h3><button class="btn small" data-close>Fechar</button></div>
    <div class="modal-body extras-menu"><p class="tiny muted" style="margin:0 0 6px">${left ? `Valem <b>${S.settings.extraPerCorrect} 🪙 por acerto</b> · ${left} rodada${left > 1 ? 's' : ''} com moedas hoje.` : 'As rodadas com moedas de hoje acabaram: agora é só treino. 💪'}</p>
    ${Server.ai && langs.length ? `<div class="xm-sec"><b>📖 Livro extra</b> <span class="tiny muted">um capítulo novo + resumo + perguntas</span>
      <div class="extra-grid">${langs.map(l => `<button class="btn big" data-book="${l}">${l === 'pt' ? '🇧🇷 Em português' : '🇬🇧 In English'}<span class="tiny muted">${books[l] && books[l].title ? `continua “${esc(books[l].title)}” · cap. ${books[l].chapters.length + 1}` : 'começa um livro novo'}</span></button>`).join('')}</div></div>` : ''}
    ${missed ? `<div class="xm-sec"><b>🧠 Reforço</b> <span class="tiny muted">${missed} pergunta${missed > 1 ? 's' : ''} que você errou ou não sabia</span>
      <div class="extra-grid one"><button class="btn big gold" data-review>🧠 Treinar o que eu errei</button></div></div>` : ''}
    <div class="xm-sec"><b>🎲 Quiz extra</b> <span class="tiny muted">escolha a matéria</span>
      <div class="extra-grid">${extraGroups().map(g => `<button class="btn big" data-g="${g.id}">${g.label}</button>`).join('')}</div></div>
    <div class="xm-sec"><div class="extra-grid one"><button class="btn big" data-workshop>✏️ Oficina de palavras <span class="tiny muted">caça-palavras, arco-íris e mais</span></button></div></div></div>`);
  $$('[data-g]', c).forEach(btn => btn.onclick = () => { closeModal(); startExtras(extraGroups().find(g => g.id === btn.dataset.g)); });
  $$('[data-book]', c).forEach(btn => btn.onclick = () => { closeModal(); startReading(btn.dataset.book); });
  const rv = $('[data-review]', c); if (rv) rv.onclick = () => { closeModal(); startReview(); };
  $('[data-workshop]', c).onclick = () => { closeModal(); show('workshop'); };
}
// Idiomas do livro extra: os das matérias de leitura do estudante (ou português e inglês).
function bookLangs() {
  const rs = mySubjects().filter(isRead).map(id => SUBJ[id].lang);
  const l = [...new Set(rs)];
  return l.length ? l.sort().reverse() : ['pt', 'en'];
}
function extraSlot() { const t = today(); const ex = S.extras[t] || { sets: 0 }; return { t, paid: ex.sets < S.settings.extraSetsPerDay }; }
// 📖 Livro extra: o Claude escreve o próximo capítulo do livro do estudante (um livro por idioma).
async function startReading(lang) {
  const { t, paid } = extraSlot();
  S.books = S.books || {};
  const book = S.books[lang] || null;
  const stop = showLoading(lang === 'en' ? ['Writing a new chapter… 📚', 'Inventing the characters… 🧚', 'Almost ready!'] : ['Escrevendo um capítulo novo… 📚', 'Imaginando os personagens… 🧚', 'Quase pronto!']);
  let r;
  try {
    r = await apiCall('/api/reading', { method: 'POST', timeout: 150000, data: { lang, level: S.settings.readLevel || 'at',
      bookTitle: book ? book.title : '', chapters: book ? book.chapters : [] } });
  } catch (e) { stop(); say(`Não consegui escrever o capítulo agora (${esc(e.message)}). Tente o quiz extra!`, { mood: 'sad' }); return; }
  stop();
  const subject = mySubjects().find(id => isRead(id) && SUBJ[id].lang === lang) || (lang === 'en' ? 'en_read' : 'pt_leit');
  const qs = validateImported({ questions: (r.questions || []).map(q => Object.assign({}, q, { subject })) }).ok;
  if (!r.text || qs.length < 2) { say('O capítulo veio incompleto. Tente de novo! 🙂', { mood: 'think' }); return; }
  const same = book && book.title === r.bookTitle;
  S.books[lang] = { title: r.bookTitle, chapters: (same ? book.chapters : []).concat([{ title: r.title, summary: r.summary }]).slice(-12) };
  S.extra = { date: t, paid, group: 'book', status: 'todo', passage: { subject, title: `${r.bookTitle} — ${r.title}`, text: r.text },
    questions: qs.map((q, j) => Object.assign({ lang: SUBJ[q.subject].lang }, q, { id: `x-${j}-${uid()}` })), answers: {}, result: null };
  save();
  VIEW.wp = null; VIEW.work = { kind: 'extra' };
  show('work');
  if (!paid) setTimeout(() => say('Você já usou as rodadas com moedas de hoje. Esta é só para treinar! 💪'), 300);
}
// 🧠 Reforço: perguntas novas parecidas com as que errou (ou as mesmas, sem servidor).
async function startReview() {
  const items = (S.missed || []).slice(0, 10);
  if (!items.length) return;
  const subjects = [...new Set(items.map(m => m.q.subject).filter(id => SUBJ[id]))];
  await startExtras({ id: 'review', label: '🧠 Reforço', subjects, focus: items.map(m => `${m.q.q}${m.q.answer ? ` (resposta: ${m.q.answer})` : ''}`), review: items.map(m => m.q.q) });
}
async function startExtras(group) {
  const t = today();
  const ex = S.extras[t] || { sets: 0 };
  const paid = ex.sets < S.settings.extraSetsPerDay;
  const size = S.settings.extraSetSize;
  let qs = [];
  if (Server.ai) {
    const stop = showLoading(['Inventando perguntas novas…', 'Afiando o lápis… ✏️', 'Quase lá!']);
    try {
      const r = await apiCall('/api/more', { method: 'POST', timeout: 90000, data: {
        name: S.name, n: size, objectiveOnly: true, topics: weekTopicsText(S.week),
        subjects: group.subjects || [], focus: group.focus || [], exclude: recentQuestionTexts(40) } });
      qs = validateImported(r).ok.filter(q => q.type !== 'open' && (!group.subjects || group.subjects.includes(q.subject)));
    } catch (e) { toast('Lumi offline: usei perguntas do próprio app.'); }
    finally { stop(); }
  }
  if (qs.length < 2 && group.review) qs = (S.missed || []).filter(m => group.review.includes(m.q.q) && m.q.type !== 'open').map(m => Object.assign({}, m.q));
  if (qs.length < 2) qs = localExtras(size, group.subjects);
  if (!qs.length) { say('Não consegui criar extras dessa matéria agora. Tente outra! 🙂', { mood: 'think' }); return; }
  S.extra = { date: t, paid, group: group.id, review: group.review || null, status: 'todo', questions: qs.slice(0, size).map((q, j) => Object.assign({ lang: SUBJ[q.subject].lang }, q, { id: `x-${j}-${uid()}` })), answers: {}, result: null };
  save();
  VIEW.wp = null; VIEW.work = { kind: 'extra' };
  show('work');
  if (!paid) setTimeout(() => say('Você já usou as rodadas com moedas de hoje. Esta é só para treinar! 💪'), 300);
}
function localExtras(size, subjects) {
  const t = today();
  const topics = (S.week ? S.week.topics : S.lastTopics) || {};
  const mine = mySubjects();
  let act = subjects || [...new Set([...['math', 'en'].filter(x => mine.includes(x)), ...mine.filter(id => (topics[id] || '').trim())])];
  if (!act.length) act = mine.slice(0, 4);
  const rng = makeRng('extra|' + t + '|' + uid());
  const pools = act.map(id => buildPool(id, (topics[id] || '').trim() || EXTRA_DEFAULTS[id] || '', 'x' + t + uid(), [])
    .filter(q => q.type !== 'open' && (q.type !== 'listen' || speechOK))).filter(p => p.length);
  const qs = []; let i = 0, g = 0;
  if (!pools.length) return qs;
  const order = rng.shuffle(pools.map((_, j) => j));
  while (qs.length < size && g++ < 200) { const p = pools[order[i++ % order.length]]; if (p.length) qs.push(p.splice(rng.int(0, Math.min(5, p.length - 1)), 1)[0]); }
  return qs;
}
function weekTopicsText(w) {
  if (!w) return Object.entries(S.lastTopics || {}).filter(([, v]) => v).map(([k, v]) => `${SUBJ[k] ? SUBJ[k].name : k}: ${v}`).join('\n');
  const lines = SUBJECTS.filter(s => (w.topics[s.id] || '').trim()).map(s => `${s.name}: ${w.topics[s.id].trim().replace(/\n/g, ' / ')}`);
  return (w.brief ? `O que o estudante contou: ${w.brief}\n` : '') + lines.join('\n');
}
function recentQuestionTexts(n) {
  const out = [];
  if (S.week) Object.values(S.week.days).forEach(d => d.questions.forEach(q => out.push(q.q)));
  if (S.extra) S.extra.questions.forEach(q => out.push(q.q));
  return out.slice(-n);
}

/* ---------- Minha semana (input semanal) ---------- */
function renderSetup() {
  if (Server.ai && VIEW.setupMode !== 'subjects') return renderSetupAI();
  const el = $('#scr-setup');
  const t = today();
  const w = S.week;
  const editing = w && !w.settled && VIEW.setupCycle !== 'next';
  const topics = VIEW.draftTopics || (editing ? w.topics : Object.assign({}, S.lastTopics));
  const counts = VIEW.draftCounts || (editing ? Object.assign({}, w.counts) : Object.assign({}, S.settings.counts));
  VIEW.draftTopics = topics; VIEW.draftCounts = counts;
  const subs = SUBJECTS.filter(s => s.group === VIEW.setupTab && mySubjects().includes(s.id));
  const nFill = mySubjects().filter(id => (topics[id] || '').trim()).length || 3;
  VIEW.autoShown = isAuto() ? autoCounts(nFill, false) : null;
  const fields = subs.map(s => `<div class="topic" style="--subj:${s.color}"><label for="tp-${s.id}">${s.icon} ${esc(s.name)}<span class="help">${esc(s.help)}</span></label>
      <textarea id="tp-${s.id}" data-sid="${s.id}" placeholder="${esc(s.ph)}">${esc(topics[s.id] || '')}</textarea></div>`).join('');
  const pending = (S.pendingImport || []).length;
  el.innerHTML = `<div class="setup">
    ${Server.ai ? '<div class="notice info">Modo por matéria (sem o Claude). <button class="btn small" data-act="ai">✨ Voltar ao modo Lumi</button></div>' : (Server.on ? '' : '<div class="notice info">📴 Sem conexão com o servidor: as perguntas vêm do próprio app.</div>')}
    <div class="row wrap"><div class="seg"><button data-tab="pt" class="${VIEW.setupTab === 'pt' ? 'on' : ''}">🇧🇷 Em português</button><button data-tab="en" class="${VIEW.setupTab === 'en' ? 'on' : ''}">🇬🇧 In English</button></div>
      <span class="muted tiny grow">O que você aprendeu na escola esta semana?</span></div>
    ${wandBarHtml()}
    <div class="topic-grid">${fields}</div>
    ${countsAndCycleHtml(editing, counts, VIEW.autoShown)}
    ${pending ? `<div class="notice info">📥 ${pending} perguntas importadas pelos pais serão incluídas.</div>` : ''}
    <div class="row"><button class="btn" data-act="cancel">Voltar</button><button class="btn primary grow big" data-act="gen">${editing ? 'Atualizar tarefas ✨' : 'Criar tarefas da semana ✨'}</button></div>
  </div>`;
  $$('[data-tab]', el).forEach(b => b.onclick = () => { collectDraft(); VIEW.setupTab = b.dataset.tab; renderSetup(); });
  $$('textarea[data-sid]', el).forEach(ta => ta.oninput = () => { VIEW.draftTopics[ta.dataset.sid] = ta.value; });
  bindCountsAndCycle(el, counts, () => { collectDraft(); renderSetup(); });
  bindWand(el);
  const ai = $('[data-act=ai]', el); if (ai) ai.onclick = () => { VIEW.setupMode = null; renderSetup(); };
  $('[data-act=cancel]', el).onclick = () => { resetDraft(); show('home'); };
  $('[data-act=gen]', el).onclick = () => generateFromSetup(editing);
}
function cleanPassages(list) { return (list || []).filter(x => x && SUBJ[x.subject] && CYCLE.includes(x.day) && x.text).map(x => ({ subject: x.subject, day: x.day, title: String(x.title || ''), text: String(x.text) })); }
function dayPassages(d) { if (d && d.passage) return [d.passage]; if (d && d.recPassages) return d.recPassages; return S.week && d ? (S.week.passages || []).filter(x => x.day === d.dow) : []; }
const ctxTopics = c => c.rec && S.recovery ? S.recovery.topicsText : weekTopicsText(S.week);
function resetDraft() { VIEW.wand = null; VIEW.draftOpt = null; VIEW.draftTopics = null; VIEW.draftCounts = null; VIEW.draftText = null; VIEW.draftSubj = null; VIEW.draftImages = null; VIEW.openSubj = null; VIEW.setupCycle = null; }
// Quantidade automática: ~2 perguntas de cada matéria por dia (+3 da leitura do dia). Fim de semana +2, sexta −2.
function autoCounts(nSubj, reading) {
  const per = clamp(Number(S.settings.perSubject) || 2, 1, 4);
  const base = per * Math.max(1, nSubj) + (reading ? 3 : 0);
  const out = {};
  CYCLE.forEach(dk => { out[dk] = clamp(base + (['sab', 'dom'].includes(dk) ? 2 : dk === 'sex' ? -2 : 0), S.settings.minPerDay, S.settings.maxPerDay); });
  return out;
}
// Leitura diária: qual matéria de leitura em cada dia (alterna português e inglês quando houver as duas).
function readingPlan() {
  if (!S.settings.dailyReading) return CYCLE.map(() => null);
  const rs = mySubjects().filter(isRead);
  const pt = rs.find(id => SUBJ[id].lang === 'pt'); const en = rs.find(id => SUBJ[id].lang === 'en');
  return CYCLE.map((dk, i) => (pt && en) ? (i % 2 ? en : pt) : (pt || en || null));
}
const isAuto = () => S.settings.countMode !== 'manual';
function setupCycleDefaults() {
  const t = today(); const w = S.week;
  const editing = w && !w.settled && VIEW.setupCycle !== 'next';
  const thisStart = cycleStartOf(t);
  if (!editing && !VIEW.setupCycle) VIEW.setupCycle = ['qui', 'sex'].includes(dowOf(t)) ? 'next' : 'this';
  if (w && w.settled === 'delivered' && w.start === thisStart) VIEW.setupCycle = 'next';
  return editing;
}
function countsAndCycleHtml(editing, counts, auto) {
  const t = today(); const w = S.week;
  const thisStart = cycleStartOf(t); const nextStart = addDays(thisStart, 7);
  const countBoxes = CYCLE.map(dk => {
    const lockedDay = editing && (() => { const d = Object.values(w.days).find(x => x.dow === dk); return d && (d.status === 'done' || dayStarted(d) || d.date < t); })();
    return `<div class="count-box"><div class="lbl">${DOW_LABEL[dk]}${['sab', 'dom'].includes(dk) ? ' ★' : ''}</div><div class="val">${counts[dk]}</div>
      <div class="pm"><button data-c="${dk}" data-d="-1" ${lockedDay ? 'disabled' : ''} aria-label="menos">−</button><button data-c="${dk}" data-d="1" ${lockedDay ? 'disabled' : ''} aria-label="mais">+</button></div></div>`;
  }).join('');
  const cycle = editing
    ? `<div class="notice info">Editando a semana ${fmtDM(w.start)}–${fmtDM(w.end)}. Só os dias <b>ainda não começados</b> serão refeitos.</div>`
    : `<div class="radio-row">
        <label><input type="radio" name="cyc" value="this" ${VIEW.setupCycle === 'this' ? 'checked' : ''} ${(w && w.start === thisStart && w.settled) ? 'disabled' : ''}> Esta semana (hoje → sex ${fmtDM(addDays(thisStart, 6))})</label>
        <label><input type="radio" name="cyc" value="next" ${VIEW.setupCycle === 'next' ? 'checked' : ''}> Próxima semana (sáb ${fmtDM(nextStart)} → sex ${fmtDM(addDays(nextStart, 6))})</label></div>`;
  if (auto) {
    return `<div class="row wrap"><b>Perguntas por dia</b> <span class="muted tiny grow">automático: ~${S.settings.perSubject || 2} de cada matéria${Server.ai && S.settings.dailyReading && readingPlan().some(Boolean) ? ' + 3 da leitura do dia' : ''} · fim de semana ★ um pouco mais</span>
        <button type="button" class="btn small ghost" data-act="manual">✋ Ajustar à mão</button></div>
      <div class="counts auto">${CYCLE.map(dk => `<div class="count-box"><div class="lbl">${DOW_LABEL[dk]}${['sab', 'dom'].includes(dk) ? ' ★' : ''}</div><div class="val">${auto[dk]}</div></div>`).join('')}</div>${cycle}`;
  }
  return `<div class="row wrap"><b>Perguntas por dia</b> <span class="muted tiny grow">(mín. ${S.settings.minPerDay}, máx. ${S.settings.maxPerDay} · fim de semana ★ um pouco mais)</span>
      <button type="button" class="btn small ghost" data-act="auto">↺ Automático</button></div>
    <div class="counts">${countBoxes}</div>${cycle}`;
}
function bindCountsAndCycle(el, counts, rerender) {
  $$('[data-c]', el).forEach(b => b.onclick = () => {
    const dk = b.dataset.c; const v = clamp((counts[dk] || 0) + Number(b.dataset.d), 0, S.settings.maxPerDay);
    counts[dk] = v > 0 && v < S.settings.minPerDay ? (Number(b.dataset.d) > 0 ? S.settings.minPerDay : 0) : v;
    rerender();
  });
  $$('input[name=cyc]', el).forEach(r => r.onchange = () => { VIEW.setupCycle = r.value; });
  const man = $('[data-act=manual]', el); if (man) man.onclick = () => { if (VIEW.autoShown) Object.assign(counts, VIEW.autoShown); S.settings.countMode = 'manual'; save(); rerender(); };
  const au = $('[data-act=auto]', el); if (au) au.onclick = () => { S.settings.countMode = 'auto'; save(); rerender(); };
}

// Planejamento em linguagem natural: ano escolar + uma seção (que abre e fecha) por matéria + fotos opcionais.
function renderSetupAI() {
  const el = $('#scr-setup');
  const w = S.week;
  const editing = setupCycleDefaults();
  if (!VIEW.draftSubj) VIEW.draftSubj = Object.assign({}, editing ? (w.subjectTexts || {}) : {});
  if (!VIEW.draftOpt) VIEW.draftOpt = Object.assign({}, editing ? (w.subjectOpts || {}) : (S.lastOpts || {}));
  if (!S.settings.year) { S.settings.year = 'Y5'; save(); }
  if (!VIEW.draftImages) VIEW.draftImages = [];
  if (!VIEW.openSubj) VIEW.openSubj = {};
  const counts = VIEW.draftCounts || (editing ? Object.assign({}, w.counts) : Object.assign({}, S.settings.counts));
  VIEW.draftCounts = counts;
  const thumbs = VIEW.draftImages.map((im, i) => `<div class="thumb"><img src="data:${im.type};base64,${im.data}" alt="Foto ${i + 1}"><button data-rm="${i}" aria-label="Remover foto">✕</button></div>`).join('');
  const mine = mySubjects().map(id => SUBJ[id]);
  const filled = mine.filter(sb => subjFilled(sb.id)).length;
  VIEW.autoShown = isAuto() ? autoCounts(mine.filter(sb => subjFilled(sb.id) && !(S.settings.dailyReading && isRead(sb.id))).length || 4, readingPlan().some(Boolean)) : null;
  const section = sb => {
    const txt = VIEW.draftSubj[sb.id] || '';
    const has = subjFilled(sb.id);
    const opt = VIEW.draftOpt[sb.id] || (isSpell(sb.id) ? 'list' : '');
    const chips = isSpell(sb.id)
      ? `<div class="chips">${SPELL_MODES.map(([k, l]) => `<button type="button" class="chip ${opt === k ? 'on' : ''}" data-opt="${sb.id}" data-v="${k}">${l}</button>`).join('')}</div>`
      : isRead(sb.id)
        ? `<div class="chips-lbl tiny muted">${sb.lang === 'pt' ? 'Nível do texto que a Lumi vai escrever:' : 'Level of the text Lumi will write:'}</div><div class="chips">${READ_LEVELS.map(([k, l]) => `<button type="button" class="chip ${opt === k ? 'on' : ''}" data-opt="${sb.id}" data-v="${k}">${l}</button>`).join('')}</div>`
        : '';
    const ph = isSpell(sb.id) ? SPELL_PH[sb.id][opt] : isRead(sb.id) ? (sb.lang === 'pt' ? `Opcional: ${sb.id === 'pt_lit' ? 'obra ou escola literária' : 'livro que está lendo'}, tema que você gosta…` : `Optional: ${sb.id === 'en_lit' ? 'set text, poem or play' : 'book you are reading'}, a topic you like…`) : (AI_PH[sb.id] || sb.ph);
    const preview = txt.trim() ? txt.trim().slice(0, 50) + (txt.trim().length > 50 ? '…' : '') : (isSpell(sb.id) && opt === 'auto') ? '🎲 a Lumi escolhe' : (isRead(sb.id) && opt) ? READ_LEVELS.find(x => x[0] === opt)[1] : (sb.lang === 'pt' ? 'toque para escrever' : 'tap to write');
    return `<details class="subj-acc" style="--subj:${sb.color}" data-sid="${sb.id}" ${VIEW.openSubj[sb.id] ? 'open' : ''}>
      <summary><span class="sa-ic">${sb.icon}</span><span class="sa-name">${esc(sb.name)}</span>
        <span class="sa-prev">${esc(preview)}</span>
        <span class="sa-st">${has ? '✅' : '＋'}</span></summary>
      ${chips}<textarea data-subj="${sb.id}" placeholder="${esc(ph)}">${esc(txt)}</textarea></details>`;
  };
  el.innerHTML = `<div class="setup">
    <div class="ai-box">
      <label class="ai-label" for="year">🎓 Ano escolar</label>
      <select id="year" class="year-sel">
        <option value="">Selecione o ano…</option>
        ${SCHOOL_YEARS.map(([id, uk, br, age]) => `<option value="${id}" ${S.settings.year === id ? 'selected' : ''}>${uk} · ${br} · ${age} anos</option>`).join('')}
      </select>
      <div class="row wrap tiny muted" style="margin-top:6px"><span class="grow">${S.settings.year ? `Etapa: <b>${STAGE_LABEL[stageOf(S.settings.year)]}</b> · ${mine.length} matérias${S.settings.subjectsCustom ? ' (escolhidas por você)' : ''}` : ''}</span>
        <button type="button" class="btn small" data-act="pick-subj">📚 Escolher matérias</button></div>
    </div>
    <div class="ai-box">
      <div class="ai-label">🏫 O que você está aprendendo em cada matéria? <span class="tiny muted">(${filled} de ${mine.length} preenchidas · pode escrever do seu jeito)</span></div>
      ${wandBarHtml()}
      ${['pt', 'en'].map(gp => { const l = mine.filter(x => x.group === gp); return l.length ? `<div class="acc-group"><div class="acc-title">${gp === 'pt' ? '🇧🇷 Em português' : '🇬🇧 In English'}</div>${l.map(section).join('')}</div>` : ''; }).join('')}
      <div class="row wrap tiny muted"><span>🎤 Dica: toque no microfone do teclado para falar em vez de escrever. Matéria em branco não entra na semana.</span></div>
      <div class="row wrap">
        <label class="btn small">📷 Foto do worksheet ou da agenda<input type="file" id="ph" accept="image/*" multiple hidden></label>
        <span class="tiny muted">opcional · até 4 fotos</span>
      </div>
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}
    </div>
    ${countsAndCycleHtml(editing, counts, VIEW.autoShown)}
    <div class="row"><button class="btn" data-act="cancel">Voltar</button><button class="btn primary grow big" data-act="gen">${editing ? '✨ Atualizar a semana' : '✨ Criar minha semana com a Lumi'}</button></div>
    <button class="btn ghost small" data-act="subjects">Prefiro o gerador do próprio app (sem o Claude)</button>
  </div>`;
  $('#year', el).onchange = e => { const before = stageOf(S.settings.year); S.settings.year = e.target.value; touch('settings'); save();
    if (Server.me && Server.childId) apiCall(`/api/family/children/${Server.childId}`, { method: 'PATCH', data: { year: e.target.value } }).then(refreshMe).catch(() => {});
    renderSetupAI();
    if (e.target.value && stageOf(e.target.value) !== before && !S.settings.subjectsCustom) say(`Mudei as matérias para as de <b>${STAGE_LABEL[stageOf(e.target.value)]}</b>. Toque em 📚 para ajustar. 🦉`); };
  $('[data-act=pick-subj]', el).onclick = () => pickSubjects(() => renderSetupAI());
  $$('details.subj-acc', el).forEach(d => d.addEventListener('toggle', () => {
    VIEW.openSubj[d.dataset.sid] = d.open;
  }));
  $$('[data-opt]', el).forEach(btn => btn.onclick = () => {
    const id = btn.dataset.opt; const v = btn.dataset.v;
    VIEW.draftOpt[id] = (isRead(id) && VIEW.draftOpt[id] === v) ? '' : v;   // toque de novo desmarca o nível
    VIEW.openSubj[id] = true; renderSetupAI();
  });
  $$('textarea[data-subj]', el).forEach(ta => {
    ta.oninput = () => { VIEW.draftSubj[ta.dataset.subj] = ta.value; };
    ta.onblur = () => { const d = ta.closest('details'); const has = subjFilled(ta.dataset.subj);
      $('.sa-st', d).textContent = has ? '✅' : '＋';
      if (isAuto()) {   // atualiza só os números (sem redesenhar a tela, para não perder o toque)
        VIEW.autoShown = autoCounts(mySubjects().filter(id => subjFilled(id) && !(S.settings.dailyReading && isRead(id))).length || 4, readingPlan().some(Boolean));
        $$('.counts.auto .val', el).forEach((v, i) => { v.textContent = VIEW.autoShown[CYCLE[i]]; });
      }
      if (ta.value.trim()) $('.sa-prev', d).textContent = ta.value.trim().slice(0, 50) + (ta.value.trim().length > 50 ? '…' : ''); };
  });
  $('#ph', el).onchange = async e => {
    const files = [...e.target.files].slice(0, 4 - VIEW.draftImages.length);
    for (const f of files) { try { VIEW.draftImages.push(await fileToJpeg(f, 1600)); } catch (err) { toast('Não consegui ler essa foto.'); } }
    renderSetupAI();
  };
  $$('[data-rm]', el).forEach(btn => btn.onclick = () => { VIEW.draftImages.splice(Number(btn.dataset.rm), 1); renderSetupAI(); });
  bindCountsAndCycle(el, counts, () => renderSetupAI());
  bindWand(el);
  $('[data-act=cancel]', el).onclick = () => { resetDraft(); show('home'); };
  $('[data-act=subjects]', el).onclick = () => { VIEW.setupMode = 'subjects'; renderSetup(); };
  $('[data-act=gen]', el).onclick = () => generateWithClaude(editing);
}
// Ortografia/Spelling: como escolher as palavras. Leitura: nível do texto que a Lumi escreve.
const SPELL_MODES = [['list', '📝 Lista'], ['theme', '🎯 Tema'], ['auto', '🎲 A Lumi escolhe']];
const READ_LEVELS = [['below', '⬇️ Mais fácil'], ['at', '🎯 No meu nível'], ['above', '⬆️ Acima'], ['way', '🚀 Bem acima']];
const SPELL_TXT = { list: 'lista de palavras', theme: 'tema', auto: 'a Lumi escolhe as palavras' };
const READ_TXT = { below: 'mais fácil (abaixo do ano dela)', at: 'no meu nível', above: 'acima do nível', way: 'bem acima do nível' };
const SPELL_PH = {
  pt_ort: { list: 'Ex.: exceção, cachorro, passeio, chuveiro', theme: 'Ex.: palavras com SS e Ç; palavras com X e CH', auto: '(opcional) algum detalhe? Ex.: palavras com acento' },
  en_spell: { list: 'e.g. because, friend, believe, island', theme: 'e.g. silent letters; words ending in -tion', auto: '(optional) anything specific? e.g. tricky words' },
};
const isSpell = id => id === 'pt_ort' || id === 'en_spell';
const isRead = id => ['pt_leit', 'en_read', 'en_guided', 'pt_lit', 'en_lit'].includes(id);
function subjFilled(id) {
  const t = ((VIEW.draftSubj || {})[id] || '').trim(); const o = (VIEW.draftOpt || {})[id];
  return !!t || (isSpell(id) && o === 'auto') || (isRead(id) && !!o);
}
// Escolher as matérias do estudante (cada um faz as suas, principalmente no IGCSE e no IB, com HL/SL).
function pickSubjects(after) {
  const sel = new Set(mySubjects());
  const stage = stageOf(S.settings.year);
  const ib = stage === 'ib';
  const lv = Object.assign({}, S.settings.ibLevels || {});
  const hl = id => `<span class="hlsl" data-hl="${id}"><button type="button" data-v="HL" class="${lv[id] === 'HL' ? 'on' : ''}">HL</button><button type="button" data-v="SL" class="${lv[id] === 'SL' ? 'on' : ''}">SL</button></span>`;
  const row = sb => `<label class="pick ${sel.has(sb.id) ? 'on' : ''}" style="--subj:${sb.color}"><input type="checkbox" value="${sb.id}" ${sel.has(sb.id) ? 'checked' : ''}><span>${sb.icon}</span> <span class="grow">${esc(sb.name)}${STAGE_SUBJECTS[stage].includes(sb.id) ? ' <i class="tiny muted">sugerida</i>' : ''}</span>${ib && sb.id !== 'tok' ? hl(sb.id) : ''}</label>`;
  const c = openModal(`<div class="modal-head"><h3>📚 Minhas matérias</h3><button class="btn small" data-close>Fechar</button></div>
    <div class="modal-body"><p class="tiny muted" style="margin:0 0 8px">Marque as matérias que você faz${S.settings.year ? ` (${esc((SCHOOL_YEARS.find(y => y[0] === S.settings.year) || [])[1] || '')} · ${STAGE_LABEL[stage]})` : ''}. Só elas aparecem no planejamento e nos extras.${ib ? ' No IB, marque também se é <b>HL</b> (Higher Level) ou <b>SL</b> (Standard Level) — a Lumi ajusta a dificuldade.' : ''}</p>
      <div class="acc-title">🇧🇷 Em português</div><div class="pick-grid">${SUBJECTS.filter(x => x.group === 'pt').map(row).join('')}</div>
      <div class="acc-title">🇬🇧 In English</div><div class="pick-grid">${SUBJECTS.filter(x => x.group === 'en').map(row).join('')}</div></div>
    <div class="modal-foot"><button class="btn" data-act="sugg">↺ Usar as sugeridas</button><button class="btn primary grow" data-act="ok">Salvar</button></div>`);
  $$('input[type=checkbox]', c).forEach(ch => ch.onchange = () => ch.closest('label').classList.toggle('on', ch.checked));
  $$('.hlsl button', c).forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    const box = b.parentElement; const id = box.dataset.hl;
    lv[id] = lv[id] === b.dataset.v ? '' : b.dataset.v;
    $$('button', box).forEach(x => x.classList.toggle('on', x.dataset.v === lv[id]));
    const ch = box.closest('label').querySelector('input'); if (lv[id] && !ch.checked) { ch.checked = true; ch.closest('label').classList.add('on'); }
  });
  $('[data-act=sugg]', c).onclick = () => { S.settings.subjectsCustom = false; delete S.settings.subjects; save(); closeModal(); toast('Matérias sugeridas para o ano.'); after && after(); };
  $('[data-act=ok]', c).onclick = () => {
    const ids = $$('input[type=checkbox]', c).filter(ch => ch.checked).map(ch => ch.value);
    if (!ids.length) { toast('Escolha pelo menos uma matéria.'); return; }
    S.settings.subjects = ids; S.settings.subjectsCustom = true; touch('settings');
    if (ib) S.settings.ibLevels = Object.fromEntries(Object.entries(lv).filter(([k, v]) => v && ids.includes(k)));
    save(); closeModal(); after && after();
  };
}
const AI_PH = {
  pt: 'Ex.: estamos estudando substantivos e adjetivos, e sinônimos.',
  pt_ort: 'Ex.: as palavras da semana são exceção, cachorro, passeio, chuveiro.',
  pt_leit: 'Ex.: estamos lendo O Pequeno Príncipe, capítulos 3 e 4.',
  bss: 'Ex.: estamos aprendendo sobre as bacias hidrográficas do Brasil.',
  en: 'e.g. we are learning about past tense and adjectives.',
  en_read: 'e.g. we are reading Charlotte\'s Web, chapters 5 and 6.',
  en_spell: 'e.g. this week\'s words: because, friend, believe, island.',
  en_guided: 'e.g. our guided reading book is The Iron Man, chapter 2.',
  ipc: 'e.g. our unit is The Solar System.',
  math: 'e.g. fractions and perimeter.',
};
async function generateWithClaude(editing) {
  const subjTexts = {}; const subjOpts = {};
  const mineList = mySubjects().map(id => SUBJ[id]);
  mineList.forEach(sb => {
    const v = ((VIEW.draftSubj || {})[sb.id] || '').trim(); if (v) subjTexts[sb.id] = v;
    const o = (VIEW.draftOpt || {})[sb.id]; if (o) subjOpts[sb.id] = o;
  });
  const text = mineList.filter(sb => subjFilled(sb.id)).map(sb => {
    const o = subjOpts[sb.id] || (isSpell(sb.id) ? 'list' : '');
    const tag = isSpell(sb.id) ? ` [modo: ${SPELL_TXT[o]}]` : (isRead(sb.id) && o) ? ` [nível do texto: ${READ_TXT[o]}]` : '';
    return `- ${sb.id} (${sb.name})${tag}: ${subjTexts[sb.id] || '(sem detalhes)'}`;
  }).join('\n');
  const images = VIEW.draftImages || [];
  if (!S.settings.year) { say('Primeiro escolha o <b>ano escolar</b> lá em cima. 🎓', { mood: 'think' }); $('#year').focus(); return; }
  if (!text && !images.length) { say('Abra pelo menos uma matéria e me conta o que você está aprendendo (ou manda uma foto do worksheet)! ✍️', { mood: 'think' }); return; }
  const readPlan = Server.ai ? readingPlan() : CYCLE.map(() => null);
  const nSubj = mineList.filter(sb => subjFilled(sb.id) && !(S.settings.dailyReading && isRead(sb.id))).length || 4;
  const counts = isAuto() ? autoCounts(nSubj, readPlan.some(Boolean)) : Object.assign({}, VIEW.draftCounts);
  const t = today();
  // Quais dias vão receber perguntas
  let start, from, redo = null;
  if (editing) {
    const w = S.week;
    redo = Object.values(w.days).filter(d => d.status !== 'done' && !dayStarted(d) && d.date >= t).map(d => d.date);
    start = w.start; from = w.created > w.start ? w.created : w.start;
  } else {
    const thisStart = cycleStartOf(t);
    start = VIEW.setupCycle === 'next' ? addDays(thisStart, 7) : thisStart;
    from = VIEW.setupCycle === 'next' ? start : t;
  }
  const dates = CYCLE.map((_, i) => addDays(start, i)).filter(d => d >= from && (!redo || redo.includes(d)));
  const days = dates.map(d => { const dk = dowOf(d); const rs = readPlan[CYCLE.indexOf(dk)];
    return { dow: dk, label: `${DOW_FULL[dk]} ${fmtDM(d)}`, n: counts[dk] || 0, read: rs ? { subject: rs, level: (VIEW.draftOpt || {})[rs] || S.settings.readLevel || 'at' } : null }; }).filter(d => d.n > 0);
  if (!days.length) { say('Nenhum dia com perguntas. Aumente a quantidade em algum dia. 🙂'); return; }
  const stop = showLoading(['Lendo o que você contou… 📖', 'Separando por matéria… 🗂️', 'Inventando perguntas… ✏️', 'Caprichando nas dicas… 💡', 'Organizando os dias da semana… 📅', 'Escrevendo os capítulos do livro da semana… 📚', 'Quase pronto! 🦉']);
  let res;
  try {
    res = await planInSteps({ name: S.name, text, images, days, perSubject: S.settings.perSubject || 2, previous: S.week && S.week.summary ? S.week.summary.map(x => `${x.subject}: ${x.summary}`).join(' | ') : '' });
  } catch (e) {
    stop();
    say(`Ops, não consegui falar com o Claude agora (${esc(e.message)}). Tente de novo em instantes, ou use o modo por matéria.`, { mood: 'sad', ms: 12000 });
    return;
  }
  stop();
  if (res.failedDays && res.failedDays.length) setTimeout(() => say(`${res.failedDays.length === 1 ? 'Um dia foi criado' : `${res.failedDays.length} dias foram criados`} pelo gerador do próprio app (o Claude demorou). Dá para refazer depois em Minha semana. 🙂`, { mood: 'think', ms: 9000 }), 9500);
  const valid = validateImported({ questions: (res.questions || []).map(q => Object.assign({}, q, { options: q.type === 'mc' ? q.options : undefined, accept: (q.accept || []).filter(Boolean) })) }).ok;
  const topics = {};
  (res.topics || []).forEach(x => { if (SUBJ[x.subject]) topics[x.subject] = (topics[x.subject] ? topics[x.subject] + '; ' : '') + x.summary; });
  if (editing) {
    const w = S.week;
    const redoDows = redo.map(dowOf);
    w.brief = text; w.subjectTexts = subjTexts; w.subjectOpts = subjOpts; w.summary = res.topics || []; w.topics = topics;
    w.passages = (w.passages || []).filter(x => !redoDows.includes(x.day)).concat(cleanPassages(res.passages));
    w.imported = (w.imported || []).filter(q => !q.day || !redoDows.includes(q.day)).concat(valid);
    redo.forEach(date => { const d = w.days[date]; d.n = counts[d.dow]; d.required = (d.n || 0) > 0 && date >= from; d.printed = false; d.passageSeen = false; });
    w.counts = counts;
    regenerateDays(w, redo, '|' + uid());
  } else {
    if (S.week) archiveWeek(S.week);
    S.week = createWeek(start, from, topics, counts, valid.concat(S.pendingImport || []));
    S.week.brief = text; S.week.subjectTexts = subjTexts; S.week.subjectOpts = subjOpts; S.week.summary = res.topics || []; S.week.ai = true;
    S.week.passages = cleanPassages(res.passages);
    S.pendingImport = [];
  }
  S.lastTopics = topics; S.lastOpts = subjOpts;
  resetDraft();
  save();
  const total = requiredDays(S.week).reduce((a, d) => a + d.questions.length, 0);
  show('home');
  say(`${esc(res.message || 'Prontinho!')} Criei <b>${total}</b> perguntas. ${S.week.start > t ? `Elas começam no sábado ${fmtDM(S.week.start)}.` : ''}`, { mood: 'wow', ms: 9000 });
}
// Planejamento em etapas: 1) roteiro da semana (assuntos, subtemas por dia, sinopse dos capítulos); 2) cada dia em paralelo.
// Assim cada chamada ao Claude é curta (sem tempo esgotado) e a criança vê o progresso.
async function planInSteps(base) {
  const prog = t => { const m = $('#ld-msg'); if (m) m.textContent = t; };
  const outline = await apiCall('/api/plan-outline', { method: 'POST', timeout: 150000, data: base });
  const dayLabel = d => d.label || d.dow;
  let done = 0; const total = base.days.length;
  const tick = () => prog(`Criando os dias com a Lumi… ${done} de ${total} prontos ✏️`);
  tick();
  const bookFor = d => { if (!d.read) return null; const b = (outline.books || []).find(x => x.subject === d.read.subject); if (!b) return null;
    const i = b.chapters.findIndex(c => c.day === d.dow); return { title: b.title, premise: b.premise, chapter: b.chapters[i] || { title: '', synopsis: '' }, before: i > 0 ? b.chapters.slice(0, i) : [] }; };
  const runDay = async d => {
    const data = { name: base.name, day: d, perSubject: base.perSubject, topics: outline.topics || [], modes: String(base.text || '').slice(0, 1500),
      focus: ((outline.focus || []).find(f => f.day === d.dow) || {}).items || [], book: bookFor(d) };
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const r = await apiCall('/api/plan-day', { method: 'POST', timeout: 180000, data }); done++; tick(); return { d, r }; }
      catch (e) { last = e; if (e.status === 429) break; }
    }
    done++; tick(); return { d, err: last };
  };
  const results = await Promise.all(base.days.map(runDay));
  const ok = results.filter(x => x.r);
  if (!ok.length) throw results[0].err || new Error('o Claude não respondeu');
  return {
    topics: outline.topics || [], message: outline.message || '',
    questions: ok.flatMap(x => (x.r.questions || []).map(q => Object.assign({}, q, { day: x.d.dow }))),
    passages: ok.filter(x => x.d.read && x.r.passage && x.r.passage.text).map(x => ({ subject: x.d.read.subject, day: x.d.dow, title: x.r.passage.title, text: x.r.passage.text })),
    failedDays: results.filter(x => x.err).map(x => dayLabel(x.d)),
  };
}
function collectDraft() { $$('#scr-setup textarea[data-sid]').forEach(ta => { VIEW.draftTopics[ta.dataset.sid] = ta.value; }); }
async function generateFromSetup(editing) {
  collectDraft();
  const topics = {}; SUBJECTS.forEach(s => { topics[s.id] = (VIEW.draftTopics[s.id] || '').trim(); });
  const counts = isAuto() ? autoCounts(mySubjects().filter(id => topics[id]).length || 3, false) : Object.assign({}, VIEW.draftCounts);
  const hasAny = Object.values(topics).some(Boolean) || (S.pendingImport || []).length || (editing && (S.week.imported || []).length);
  if (!hasAny) { say('Escreva pelo menos uma matéria para eu criar as tarefas! ✍️'); return; }
  const t = today();
  if (editing) {
    const w = S.week;
    w.topics = topics;
    if ((S.pendingImport || []).length) { w.imported = (w.imported || []).concat(S.pendingImport); S.pendingImport = []; }
    const redo = Object.values(w.days).filter(d => d.status !== 'done' && !dayStarted(d) && d.date >= t).map(d => d.date);
    redo.forEach(date => { const d = w.days[date]; d.n = counts[d.dow]; d.required = (d.n || 0) > 0 && date >= (w.created > w.start ? w.created : w.start); d.printed = false; });
    w.counts = counts;
    regenerateDays(w, redo, '|' + uid());
  } else {
    if (S.week) archiveWeek(S.week);
    const thisStart = cycleStartOf(t);
    const start = VIEW.setupCycle === 'next' ? addDays(thisStart, 7) : thisStart;
    const from = VIEW.setupCycle === 'next' ? start : t;
    S.week = createWeek(start, from, topics, counts, S.pendingImport || []);
    S.pendingImport = [];
  }
  S.lastTopics = topics;
  resetDraft();
  save();
  const total = requiredDays(S.week).reduce((a, d) => a + d.questions.length, 0);
  show('home');
  say(`Pronto! Criei <b>${total}</b> perguntas para a semana. 🎉 ${S.week.start > t ? `Elas começam no sábado ${fmtDM(S.week.start)}.` : 'Vamos começar pela de hoje?'}`, { mood: 'wow' });
}

/* ---------- Folha de exercícios (dia ou extras) — SEM ROLAGEM ---------- */
function workCtx() {
  const v = VIEW.work;
  if (!v) return null;
  if (v.kind === 'extra') {
    const x = S.extra; if (!x) return null;
    return { kind: 'extra', title: x.group === 'book' ? '📖 Livro extra' : x.group === 'review' ? '🧠 Reforço' : '⭐ Exercícios extras', obj: x, questions: x.questions, answers: x.answers, done: x.status === 'done', marks: {}, verdicts: x.verdicts || {} };
  }
  const d = v.rec ? (S.recovery && S.recovery.days[v.date]) : (S.week && S.week.days[v.date]); if (!d) return null;
  return { kind: 'day', rec: !!v.rec, title: `${v.rec ? '⏳ Recuperação · ' : ''}${DOW_FULL[d.dow]} ${fmtDM(d.date)}`, obj: d, questions: d.questions, answers: d.answers, done: d.status === 'done', marks: d.marks || {}, verdicts: d.verdicts || {} };
}
// Correção: usa o veredito da foto/autocorreção quando existir; senão compara com o gabarito.
function verdict(c, q) {
  const v = c.verdicts && c.verdicts[q.id];
  if (v === 'ok') return true;
  if (v === 'bad') return false;
  if (v === 'open') return null;
  return isCorrect(q, c.answers[q.id]);
}
// A tarefa é dividida em partes que cabem na tela (sem rolagem). O tamanho de cada parte depende da tela.
function pageSize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 600) return h < 700 ? 5 : 7;
  if (w < 1000) return h < 800 ? 8 : 10;
  return h < 760 ? 9 : 12;
}
function workPages(c) {
  const per = pageSize(); const pages = []; let cur = [], sum = 0;
  c.questions.forEach((q, i) => {
    const wt = q.type === 'proof' ? 3 : q.type === 'open' ? 1.5 : 1;
    if (cur.length && sum + wt > per) { pages.push(cur); cur = []; sum = 0; }
    cur.push(i); sum += wt;
  });
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}
function workKey(c) { return c.kind + '|' + (c.rec ? 'r' : '') + (c.obj.date || c.obj.started || ''); }
function renderWork() {
  const el = $('#scr-work');
  const c = workCtx();
  if (!c) { show('home'); return; }
  $('#top-title').textContent = c.kind === 'extra' ? '⭐ Extras' : `📘 ${c.title}`;
  const canQty = c.kind === 'day' && !c.rec && !c.done && !dayStarted(c.obj) && !c.obj.printed;
  const pages = workPages(c);
  if (!VIEW.wp || VIEW.wp.key !== workKey(c)) VIEW.wp = { key: workKey(c), page: 0 };
  const pg = VIEW.wp.page = clamp(VIEW.wp.page, 0, pages.length - 1);
  VIEW.curPages = pages;
  const cards = pages[pg].map(i => questionCard(c.questions[i], i, c)).join('');
  const last = pg === pages.length - 1;
  const pager = pages.length > 1 ? `<div class="pager"><button type="button" class="btn small" data-pg="-1" ${pg === 0 ? 'disabled' : ''} aria-label="Parte anterior">◂</button>
      <span class="pg-dots">${pages.map((p, j) => `<button type="button" data-pgi="${j}" class="${j === pg ? 'on' : ''}" aria-label="Parte ${j + 1}">${j + 1}</button>`).join('')}</span>
      <span class="pg-txt">Parte ${pg + 1} de ${pages.length}</span>
      <button type="button" class="btn small" data-pg="1" ${last ? 'disabled' : ''} aria-label="Próxima parte">▸</button></div>` : '';
  const paper = c.kind === 'day' && !c.rec && !c.done;
  el.innerHTML = `<div class="work">
    ${c.done ? `<div class="done-banner">✅ <b>${c.kind === 'extra' ? 'Extras concluídos!' : 'Tarefa concluída!'}</b><button type="button" class="btn small primary" data-act="home2">🏠 Voltar ao início</button></div>` : ''}
    <div class="work-head">
      <h2>${esc(c.title)}</h2>
      <div class="progress" aria-hidden="true"><i id="prog-bar"></i></div><span class="prog-txt" id="prog-txt"></span>
      ${canQty ? `<span class="qty" title="Quantas perguntas hoje?"><button data-qty="-1" aria-label="menos perguntas">−</button><span>${c.questions.length}</span><button data-qty="1" aria-label="mais perguntas">+</button></span>` : ''}
      ${dayPassages(c.obj).length ? `<button class="btn small read-btn" data-act="passage">📖 ${dayPassages(c.obj).length > 1 ? 'Textos' : 'Leitura'}</button>` : ''}
      ${paper && c.obj.printed ? '<button class="btn small gold" data-act="check">📄 Corrigir folha</button>' : ''}
    </div>
    <div class="sheet" id="sheet">${cards}</div>${pager}
    <div class="work-foot">
      <button class="btn home-btn" data-act="back" aria-label="Voltar ao início">🏠 <span class="lbl">Início</span></button>
      ${c.kind === 'day' && !c.rec ? '<button class="btn" data-act="print" aria-label="Imprimir">🖨️ <span class="lbl">Imprimir</span></button>' : ''}
      <button class="btn" data-act="key">🔑 Gabarito</button>
      ${c.done ? (last ? '' : '<button class="btn primary" data-pg="1">Próxima ▸</button>') : last ? '<button class="btn primary" data-act="finish">✔ Concluir</button>' : '<button class="btn primary" data-pg="1">Próxima parte ▸</button>'}
    </div></div>`;
  bindWork(el, c);
  updateProgress(c);
  requestAnimationFrame(() => fitGrid($('#sheet')));
  if (dayPassages(c.obj).length && !c.obj.passageSeen && !c.done) { c.obj.passageSeen = true; save(); setTimeout(() => showPassages(c.obj), 250); }
}
function goPage(n) { if (!VIEW.wp) return; VIEW.wp.page = n; save(); renderWork(); }
// Texto(s) de leitura escritos pela Lumi para o dia
function showPassages(d) {
  const ps = dayPassages(d);
  if (d && !d.readQ) { d.readQ = true; questEvent('read'); }
  const pt = ps[0] && SUBJ[ps[0].subject].lang === 'pt';
  const m = openModal(`<div class="modal-head"><h3>📖 ${pt ? 'Leitura do dia' : 'Today\'s reading'}</h3><button class="btn small" data-close>${pt ? 'Fechar' : 'Close'}</button></div>
    <div class="modal-body passage">${ps.map((x, k) => `<div class="pas" id="pas-${k}"><div class="pas-subj">${SUBJ[x.subject].icon} ${esc(SUBJ[x.subject].name)} ${speakBtn('#pas-' + k, SUBJ[x.subject].lang)}</div><h4>${esc(x.title)}</h4>${x.text.split(/\n+/).map(par => `<p>${esc(par)}</p>`).join('')}</div>`).join('')}</div>
    <div class="modal-foot"><button class="btn" data-ptext>🖨️ ${pt ? 'Imprimir só o texto' : 'Print the text only'}</button><button class="btn primary" data-close>${pt ? 'Li! Vamos às perguntas' : 'Done! To the questions'}</button></div>`, { wide: true, onClose: lumiStop });
  m.style.maxHeight = 'calc(100dvh - 24px)';
  bindSpeak(m);
  $('[data-ptext]', m).onclick = () => { lumiStop(); closeModal(); printPassages(ps); };
}
function passageContext(q, d) {
  const ps = d ? dayPassages(d).filter(x => x.subject === q.subject) : [];
  return ps.map(x => `Texto "${x.title}": ${x.text}`).join('\n');
}
function questionCard(q, i, c) {
  const s = SUBJ[q.subject] || { color: '#7b5cf0', icon: '❓', short: '' };
  const ans = c.answers[q.id];
  let control = '';
  const dis = c.done ? 'disabled' : '';
  const onPaper = c.done && !answered(q, ans) && c.verdicts[q.id];
  if (q.type === 'proof') control = `<div class="proof-wrap">${proofHtml(q, ans, c.done)}</div>`;
  else if (onPaper) control = `<div class="paper-note">📄 ${q.lang === 'pt' ? 'feita no papel' : 'done on paper'}</div>`;
  else if (q.type === 'mc') control = `<div class="opts">${q.options.map(o => `<button type="button" class="opt ${ans != null && norm(ans, true) === norm(o, true) ? 'sel' : ''}" data-opt="${esc(o)}" ${dis}>${esc(o)}</button>`).join('')}</div>`;
  else if (q.type === 'open') control = `<textarea data-in placeholder="${q.lang === 'pt' ? 'Sua resposta…' : 'Your answer…'}" ${dis}>${esc(ans || '')}</textarea>`;
  else control = `<input type="text" data-in ${q.type === 'num' ? 'inputmode="decimal"' : ''} autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(ans || '')}" placeholder="${q.lang === 'pt' ? 'Resposta' : 'Answer'}" ${dis}>`;
  let stateCls = '', mark = '', expected = '';
  if (c.done) {
    const ok = verdict(c, q);
    const note = c.obj.notes && c.obj.notes[q.id];
    if (ok === true) { stateCls = 'state-ok'; mark = '✓'; }
    else if (ok === false) { stateCls = 'state-bad'; mark = '✗'; expected = q.type === 'proof' ? (note ? `<div class="expected">🦉 ${esc(note)}</div>` : '') : `<div class="expected">${q.lang === 'pt' ? 'Resposta' : 'Answer'}: ${esc(q.answer)}${note ? ` · ${esc(note)}` : ''}</div>`; }
    else { const pm = c.marks[q.id]; mark = pm === 'ok' ? '✓ pais' : pm === 'no' ? '↺ pais' : '📝'; if (pm === 'ok') stateCls = 'state-ok'; }
    if (q.type === 'open' && ok !== null) {
      const pm = c.marks[q.id];
      if (pm) { mark = pm === 'ok' ? '✓ pais' : '↺ pais'; stateCls = pm === 'ok' ? 'state-ok' : 'state-bad'; }
      expected = note ? `<div class="expected lumi">🦉 ${esc(note)}</div>` : '';
    }
  }
  return `<div class="q ${stateCls} ${q.type === 'proof' ? 'wide' : ''}" style="--subj:${s.color}" data-qid="${q.id}">
    <div class="q-top"><span class="q-num">${i + 1}</span>
      <div class="q-text"><span class="q-subj">${s.icon} ${esc(s.short)}</span>${esc(q.q)}</div>
      <div class="q-tools">${q.type === 'listen' ? `<button type="button" data-say title="Ouvir">🔊</button>` : ''}<button type="button" class="qx" data-explain title="${q.lang === 'en' ? 'Mini-lesson' : 'Aulinha: não sei isso'}" aria-label="${q.lang === 'en' ? 'Mini-lesson' : 'Aulinha'}">?</button><button type="button" data-hint title="Dica">💡</button></div>
    </div>${control}${expected}${mark ? `<span class="mark">${mark}</span>` : ''}</div>`;
}
function bindWork(el, c) {
  $$('.q', el).forEach(card => {
    const q = c.questions.find(x => x.id === card.dataset.qid);
    $$('.opt', card).forEach(b => b.onclick = () => {
      if (c.done) return;
      c.answers[q.id] = b.dataset.opt;
      $$('.opt', card).forEach(x => x.classList.toggle('sel', x === b));
      saveSoon(); updateProgress(c);
    });
    const inp = $('[data-in]', card);
    if (inp) inp.oninput = () => { c.answers[q.id] = inp.value; saveSoon(); updateProgress(c); };
    const h = $('[data-hint]', card);
    if (h) h.onclick = () => showHint(q, c);
    const sp = $('[data-say]', card);
    if (sp) sp.onclick = () => speak(q.say || q.answer, q.lang);
    const ex = $('[data-explain]', card);
    if (ex) ex.onclick = () => openLesson(q, c);
    if (q.type === 'proof') bindProof(q, c, card);
  });
  $$('[data-qty]', el).forEach(b => b.onclick = () => changeQty(c, Number(b.dataset.qty)));
  $$('[data-pg]', el).forEach(b => b.onclick = () => goPage(VIEW.wp.page + Number(b.dataset.pg)));
  $$('[data-pgi]', el).forEach(b => b.onclick = () => goPage(Number(b.dataset.pgi)));
  $('[data-act=back]', el).onclick = () => { save(); show('home'); };
  const h2 = $('[data-act=home2]', el); if (h2) h2.onclick = () => { save(); show('home'); };
  $('[data-act=key]', el).onclick = () => openGabarito(c);
  const pr = $('[data-act=print]', el); if (pr) pr.onclick = () => openPrintDialog(c.obj.date);
  const ck = $('[data-act=check]', el); if (ck) ck.onclick = () => openCheck(c.obj.date);
  const ps = $('[data-act=passage]', el); if (ps) ps.onclick = () => showPassages(c.obj);
  const fin = $('[data-act=finish]', el);
  if (fin) fin.onclick = () => finishWork(c);
}
function showHint(q, c) {
  if (!q.hintQ) { q.hintQ = true; questEvent('hint'); }
  const base = q.hint || (q.lang === 'pt' ? 'Leia a pergunta de novo, com calma. Você consegue!' : 'Read the question again slowly. You can do it!');
  const actions = Server.ai && !c.done ? [{ label: q.lang === 'en' ? '🦉 Explain more' : '🦉 Me explica mais', primary: true, onClick: () => askTutor(q, c) }] : [];
  say(`💡 ${esc(base)}`, { mood: 'think', actions, sticky: actions.length > 0 });
}
async function askTutor(q, c) {
  say(q.lang === 'en' ? 'Thinking… 🤔' : 'Pensando… 🤔', { mood: 'think', sticky: true });
  try {
    const r = await apiCall('/api/tutor', { method: 'POST', timeout: 45000, data: {
      q: q.type === 'proof' ? `${q.q} Texto: "${q.text}"` : q.q, options: q.options || [], answer: q.answer, attempt: q.type === 'proof' ? `${Object.keys(proofAns(c.answers[q.id])).length} palavras marcadas` : (c.answers[q.id] || ''), lang: q.lang, subject: q.subject, subjectName: SUBJ[q.subject] && SUBJ[q.subject].name,
      context: passageContext(q, c.obj) } });
    say(`🦉 ${esc(r.text)}`, { mood: 'think', ms: 16000 });
  } catch (e) { say(q.lang === 'en' ? 'I could not think right now. Try the hint again later!' : 'Não consegui pensar agora. Tente de novo daqui a pouco!', { mood: 'sad' }); }
}
async function changeQty(c, delta) {
  const d = c.obj; const n = clamp(d.questions.length + delta, S.settings.minPerDay, S.settings.maxPerDay);
  if (n === d.questions.length) { say(`O mínimo é ${S.settings.minPerDay} e o máximo é ${S.settings.maxPerDay} perguntas por dia.`); return; }
  d.n = n;
  if (delta < 0) { d.questions = d.questions.slice(0, n); save(); renderWork(); return; }
  let added = [];
  if (Server.ai) {
    const subjects = [...new Set(d.questions.map(q => q.subject))];
    try {
      const r = await apiCall('/api/more', { method: 'POST', timeout: 60000, data: { name: S.name, n: n - d.questions.length, subjects, topics: weekTopicsText(S.week), exclude: recentQuestionTexts(60) } });
      added = validateImported(r).ok;
    } catch (e) { /* cai para o gerador local */ }
  }
  if (added.length) {
    d.questions = d.questions.concat(added.slice(0, n - d.questions.length).map((q, j) => Object.assign({ lang: SUBJ[q.subject].lang }, q, { id: `${d.date}-a${j}-${uid()}` })));
  } else {
    regenerateDays(S.week, [d.date], '|' + uid());
  }
  save(); renderWork();
}
function updateProgress(c) {
  const n = c.questions.length;
  const a = c.questions.filter(q => answered(q, c.answers[q.id])).length;
  const bar = $('#prog-bar'); if (bar) bar.style.width = (n ? a / n * 100 : 0) + '%';
  const tx = $('#prog-txt'); if (tx) tx.textContent = `${a}/${n}`;
  (VIEW.curPages || []).forEach((p, j) => { const b = $(`.pg-dots [data-pgi="${j}"]`); if (b) b.classList.toggle('full', p.every(i => c.questions[i] && answered(c.questions[i], c.answers[c.questions[i].id]))); });
}
// Ajusta fonte e colunas até tudo caber (tela ou página impressa) sem rolagem.
function fitGrid(grid, opts = {}) {
  if (!grid) return true;
  const { min = 11, max = 17, step = 0.5, colMin = 250, maxCols = 3, allowOverflow = true } = opts;
  const n = grid.children.length || 1;
  const W = grid.clientWidth;
  let possible = Math.max(1, Math.min(maxCols, Math.floor(W / colMin) || 1, n));
  grid.classList.remove('compact', 'overflow');
  $$('.q.wide.collapsed', grid).forEach(x => x.classList.remove('collapsed'));
  const attempt = (lo = min) => {
    for (let fs = max; fs >= lo; fs -= step) {
      for (let cols = 1; cols <= possible; cols++) {
        grid.style.setProperty('--fs', fs + 'px');
        grid.style.setProperty('--cols', cols);
        if (grid.scrollHeight <= grid.clientHeight + 1) return true;
      }
    }
    return false;
  };
  if (attempt()) return true;
  grid.classList.add('compact');
  if (attempt()) return true;
  possible = Math.max(possible, Math.min(maxCols, Math.floor(W / (colMin * 0.62)) || 1, n));
  if (attempt()) return true;
  if ($('.q.wide:not(.collapsed)', grid)) { $$('.q.wide', grid).forEach(x => x.classList.add('collapsed')); if (attempt()) return true; }
  if (allowOverflow && attempt(Math.max(9.5, min - 1.5))) return true;   // telas minúsculas: fonte um pouco menor antes de rolar
  grid.style.setProperty('--fs', min + 'px'); grid.style.setProperty('--cols', possible);
  if (allowOverflow) grid.classList.add('overflow'); // último recurso (tela minúscula)
  return false;
}
function openGabarito(c) {
  const locked = S.settings.gabaritoAfterFinish && !c.done;
  if (locked) { say('Primeiro termine e aperte <b>Concluir</b>. Aí o gabarito libera! 🔑', { mood: 'think' }); return; }
  const items = c.questions.map((q, i) => {
    const ans = c.answers[q.id];
    const ok = c.done ? verdict(c, q) : isCorrect(q, ans);
    const cls = ok === true ? 'ok' : ok === false && (answered(q, ans) || c.verdicts[q.id]) ? 'bad' : '';
    const note = c.obj.notes && c.obj.notes[q.id];
    const answerTxt = q.type === 'open' ? `<span class="free">[Resposta Livre]</span>${c.done && ok !== null ? ` <span class="yours">· 🦉 ${ok ? '✓' : '✗'} ${esc(note || '')}</span>` : ''}` : `<span class="ans">${esc(q.answer)}</span>`;
    const yours = !answered(q, ans) || q.type === 'open' ? '' : q.type === 'proof' ? `<span class="yours">· ${q.lang === 'en' ? 'you fixed' : 'você corrigiu'} ${proofScore(q, ans)} ${q.lang === 'en' ? 'of' : 'de'} ${q.errors.length}</span>` : `<span class="yours">· você: ${esc(ans)}</span>`;
    return `<div class="key ${cls}"><b>${i + 1}.</b><div>${answerTxt} ${yours}</div></div>`;
  }).join('');
  const m = openModal(`<div class="modal-head"><h3>🔑 Gabarito</h3><button class="btn small" data-close>Fechar</button></div>
    <div class="modal-body fit"><div class="key-grid" id="key-grid">${items}</div></div>
    <div class="modal-foot"><span class="muted tiny grow">[Resposta Livre] = resposta com suas palavras. A Lumi corrige e os pais podem conferir.</span></div>`, { wide: true });
  m.style.height = 'calc(100dvh - 24px)';
  requestAnimationFrame(() => fitGrid($('#key-grid'), { min: 11, max: 17, colMin: 200, maxCols: 3 }));
}
async function finishWork(c) {
  hideBubble();
  const missing = c.questions.filter(q => !answered(q, c.answers[q.id])).length;
  if (missing) {
    say(`Faltam <b>${missing}</b> pergunta${missing > 1 ? 's' : ''}. Toque no 💡 se precisar de ajuda!`, { mood: 'think' });
    const first = c.questions.find(q => !answered(q, c.answers[q.id]));
    const fi = c.questions.indexOf(first);
    const pi = (VIEW.curPages || []).findIndex(p => p.includes(fi));
    if (pi >= 0 && VIEW.wp && pi !== VIEW.wp.page) { VIEW.wp.page = pi; renderWork(); }
    const card = first && $(`.q[data-qid="${first.id}"]`);
    if (card) { card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 400 }); const i = $('[data-in]', card); if (i) i.focus(); }
    return;
  }
  await gradeOpenAnswers(c);
  completeWork(c, 'screen');
}
// A Lumi (Claude) corrige as respostas livres; sem servidor, ficam para os pais.
async function gradeOpenAnswers(c) {
  const opens = c.questions.map((q, i) => ({ q, i })).filter(x => x.q.type === 'open' && answered(x.q, c.answers[x.q.id]));
  if (!opens.length || !Server.ai) return;
  const stop = showLoading(['Lendo suas respostas… 📖', 'Pensando com carinho… 🦉', 'Escrevendo comentários… ✍️']);
  try {
    const r = await apiCall('/api/check-open', { method: 'POST', timeout: 90000, data: {
      context: ctxTopics(c) + '\n' + dayPassages(c.obj).map(x => `Texto "${x.title}": ${x.text}`).join('\n'),
      items: opens.map(x => ({ q: x.q.q, answer: c.answers[x.q.id], lang: x.q.lang, subject: x.q.subject, subjectName: SUBJ[x.q.subject] && SUBJ[x.q.subject].name })) } });
    c.obj.verdicts = c.obj.verdicts || {}; c.obj.notes = c.obj.notes || {};
    (r.results || []).forEach(res => { const x = opens[res.number - 1]; if (!x) return; c.obj.verdicts[x.q.id] = res.verdict === 'ok' ? 'ok' : 'bad'; if (res.note) c.obj.notes[x.q.id] = res.note; });
    c.verdicts = c.obj.verdicts;
  } catch (e) { toast('A Lumi não conseguiu corrigir as livres agora: ficam para os pais.'); }
  finally { stop(); }
}
/* ---------- Aulinha: explicação + exemplos + macete + treino na hora ---------- */
// Guarda perguntas erradas (ou em que pediu ajuda) para o 🧠 Reforço dos extras.
function noteMissed(q, why) {
  if (!q || !q.q || q.type === 'proof') return;
  S.missed = (S.missed || []).filter(m => m.q.q !== q.q);
  const copy = {}; ['subject', 'type', 'q', 'options', 'answer', 'accept', 'hint', 'lang', 'say', 'strict'].forEach(k => { if (q[k] != null) copy[k] = q[k]; });
  S.missed.unshift({ q: copy, why, at: today() });
  S.missed = S.missed.slice(0, 40);
}
// Palavras para a ✏️ Oficina (erros de ortografia ou "não sei").
function notePractice(lang, words) {
  const L = lang === 'en' ? 'en' : 'pt';
  S.practice = S.practice || { pt: [], en: [] };
  words.map(w => String(w || '').trim()).filter(w => w && w.length <= 24 && !/\s{2,}/.test(w)).forEach(w => {
    S.practice[L] = [w, ...S.practice[L].filter(x => x.toLowerCase() !== w.toLowerCase())].slice(0, 30);
  });
}
function weekTopicFor(subject) { const w = S.week; return (w && w.topics && w.topics[subject]) || ''; }
async function openLesson(q, c, opts = {}) {
  hideBubble();
  const lang = (q.lang || (SUBJ[q.subject] || {}).lang) === 'en' ? 'en' : 'pt';
  const pt = lang === 'pt';
  const done = !!(c && c.done);
  if (c && !done && !opts.noMiss) { noteMissed(q, 'nao-sei'); save(); }
  questEvent('lesson');
  const key = opts.topic ? 'lessonTopic' : done ? 'lessonDone' : 'lesson';
  if (q[key]) { showLesson(q[key], lang, q); return; }
  if (!Server.ai) { say(pt ? 'Para dar a aulinha eu preciso estar conectada ao servidor. Por enquanto, toque no 💡 para uma dica!' : 'I need the server for the mini-lesson. Try the 💡 hint for now!', { mood: 'think' }); return; }
  const stop = showLoading(pt ? ['Preparando sua aulinha… 🦉', 'Separando bons exemplos… 🔎', 'Criando um treino rapidinho… ✏️'] : ['Preparing your mini-lesson… 🦉', 'Finding good examples… 🔎', 'Making a quick practice… ✏️']);
  try {
    const wrong = done && c && verdict(c, q) === false && q.type !== 'proof' ? String(c.answers[q.id] || '') : '';
    const L = await apiCall('/api/lesson', { method: 'POST', timeout: 90000, data: {
      q: opts.topic ? '' : (q.type === 'proof' ? `${q.q} Texto: "${q.text}"` : q.q), options: q.options || [], answer: q.answer, done, wrong, lang, subject: q.subject,
      subjectName: SUBJ[q.subject] && SUBJ[q.subject].name, topic: opts.topic || '',
      context: (c ? ctxTopics(c) + '\n' + passageContext(q, c.obj) : weekTopicsText(S.week)).slice(0, 2500) } });
    stop();
    const practice = validateImported({ questions: (L.practice || []).filter(x => ['mc', 'short', 'num'].includes(x.type)) }).ok
      .map((x, j) => Object.assign({ lang: SUBJ[x.subject].lang }, x, { id: 'lp-' + j }));
    q[key] = { title: L.title, explanation: L.explanation || [], examples: L.examples || [], tip: L.tip || '', practice };
    save();
    showLesson(q[key], lang, q);
  } catch (e) { stop(); say(pt ? `Não consegui preparar a aulinha agora (${esc(e.message)}). Tente de novo daqui a pouco!` : 'I could not prepare the lesson right now. Try again soon!', { mood: 'sad' }); }
}
function showLesson(L, lang, q) {
  const pt = lang === 'pt';
  const learn = () => {
    const m = openModal(`<div class="modal-head"><div class="owl-mini">${mascotSVG(S.equipped, 'happy')}</div><h3>🎓 ${esc(L.title)}</h3><button class="btn small" data-close>${pt ? 'Fechar' : 'Close'}</button></div>
      <div class="modal-body lesson" id="lesson-body">
        ${L.explanation.map(p => `<p>${esc(p)}</p>`).join('')}
        ${L.examples.length ? `<div class="ex-box"><b>👀 ${pt ? 'Exemplos' : 'Examples'}</b><ul>${L.examples.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${L.tip ? `<div class="tip-box"><b>💡 ${pt ? 'Macete' : 'Trick'}:</b> ${esc(L.tip)}</div>` : ''}
      </div>
      <div class="modal-foot">${speakBtn('#lesson-body', lang)}${Server.me ? `<button class="btn small ghost" data-report>🚩</button>` : ''}<span class="grow"></span>
        ${L.practice.length ? `<button class="btn primary" data-practice>${pt ? 'Vamos treinar ▸' : 'Let\'s practise ▸'}</button>` : `<button class="btn primary" data-close>${pt ? 'Entendi!' : 'Got it!'}</button>`}</div>`, { wide: true, onClose: lumiStop });
    m.style.maxHeight = 'calc(100dvh - 24px)';
    bindSpeak(m);
    if (S.settings.autoVoice && speechOK) { const b = $('[data-speak]', m); if (b) b.click(); }
    const r = $('[data-report]', m); if (r) r.onclick = async () => {
      try { await apiCall('/api/report', { method: 'POST', data: { childId: Server.childId, kind: 'aulinha', text: `${q.q || ''}\n---\n${L.title}: ${L.explanation.join(' ')}` } }); toast(pt ? 'Obrigada! Avisei um adulto. 💜' : 'Thanks! An adult was told. 💜'); } catch (e) { toast(e.message); } };
    const pr = $('[data-practice]', m); if (pr) pr.onclick = () => { lumiStop(); practice(0, 0); };
  };
  const practice = (i, score) => {
    if (i >= L.practice.length) {
      const all = score === L.practice.length;
      if (all) questEvent('practice_perfect');
      openModal(`<div class="modal-body celebrate"><div class="owl-big">${mascotSVG(S.equipped, all ? 'wow' : 'happy')}</div>
        <h3>${all ? (pt ? 'Mandou bem! 🎉' : 'Brilliant! 🎉') : (pt ? 'Bom treino! 💪' : 'Good practice! 💪')}</h3>
        <p>${pt ? `Você acertou <b>${score} de ${L.practice.length}</b> no treino.` : `You got <b>${score} of ${L.practice.length}</b> right.`}${all ? '' : (pt ? ' Quer rever a explicação?' : ' Want to see the lesson again?')}</p></div>
        <div class="modal-foot" style="justify-content:center">${all ? '' : `<button class="btn" data-again>${pt ? '↺ Rever a aulinha' : '↺ See the lesson'}</button>`}<button class="btn primary" data-close>${pt ? 'Voltar' : 'Back'}</button></div>`);
      const ag = $('[data-again]'); if (ag) ag.onclick = learn;
      return;
    }
    const x = L.practice[i];
    const m = openModal(`<div class="modal-head"><h3>✏️ ${pt ? 'Treino' : 'Practice'} ${i + 1}/${L.practice.length}</h3><button class="btn small" data-close>${pt ? 'Fechar' : 'Close'}</button></div>
      <div class="modal-body lesson-q"><p class="lq">${esc(x.q)}</p>
        ${x.type === 'mc' ? `<div class="opts">${x.options.map(o => `<button type="button" class="opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>`
          : `<input type="text" id="lq-in" ${x.type === 'num' ? 'inputmode="decimal"' : ''} autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${pt ? 'Sua resposta' : 'Your answer'}">`}
        <div id="lq-fb" class="lq-fb"></div></div>
      <div class="modal-foot">${x.hint ? `<button class="btn small" data-h>💡</button>` : ''}<span class="grow"></span>${x.type === 'mc' ? '' : `<button class="btn primary" data-check>${pt ? 'Conferir' : 'Check'}</button>`}</div>`);
    let answered1 = false;
    const check = val => {
      if (answered1) return; answered1 = true;
      const ok = isCorrect(x, val);
      $('#lq-fb', m).innerHTML = ok ? `<b class="okc">✓ ${pt ? 'Isso!' : 'Yes!'}</b>` : `<b class="badc">✗ ${pt ? 'Quase!' : 'Not quite!'}</b> ${pt ? 'Resposta' : 'Answer'}: <b>${esc(x.answer)}</b>`;
      $$('.opt', m).forEach(b => { b.disabled = true; if (norm(b.dataset.o, true) === norm(x.answer, true)) b.classList.add('right'); else if (b.dataset.o === val) b.classList.add('wrong'); });
      const foot = $('.modal-foot', m); foot.innerHTML = `<span class="grow"></span><button class="btn primary" data-next>${i + 1 < L.practice.length ? (pt ? 'Próximo ▸' : 'Next ▸') : (pt ? 'Ver resultado' : 'See result')}</button>`;
      $('[data-next]', m).onclick = () => practice(i + 1, score + (ok ? 1 : 0));
    };
    $$('.opt', m).forEach(b => b.onclick = () => check(b.dataset.o));
    const inp = $('#lq-in', m); if (inp) { inp.focus(); inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) check(inp.value); }; }
    const ck = $('[data-check]', m); if (ck) ck.onclick = () => { if (inp && inp.value.trim()) check(inp.value); };
    const h = $('[data-h]', m); if (h) h.onclick = () => { $('#lq-fb', m).innerHTML = `💡 ${esc(x.hint)}`; };
  };
  learn();
}
// Compatibilidade: chamadas antigas do "?" abrem a aulinha
function explainContent(q, c) { return openLesson(q, c); }
// Marca o dia (ou extras) como concluído e comemora. via: screen | photo | self
function trackMistakes(c) {
  c.questions.forEach(q => {
    const v = verdict(c, q);
    if (q.type === 'proof') {
      const a = proofAns(c.answers[q.id]);
      const missedW = q.errors.filter(e => !(a[e.idx] != null && proofEq(a[e.idx], e.right))).map(e => e.right);
      if (missedW.length) notePractice(q.lang, missedW);
      return;
    }
    if (v === false) {
      noteMissed(q, 'errou');
      if (['pt_ort', 'en_spell'].includes(q.subject) && /^[\p{L}'’-]+$/u.test(String(q.answer || '').trim())) notePractice(q.lang, [q.answer]);
    } else if (v === true && S.missed) S.missed = S.missed.filter(m => m.q.q !== q.q);
  });
}
function completeWork(c, via, extraMsg = '') {
  c.verdicts = c.obj.verdicts || c.verdicts || {};
  try { trackMistakes(c); } catch (e) { console.warn(e); }
  const obj = c.questions.filter(q => verdict(c, q) !== null);   // objetivas + livres já corrigidas
  const correct = obj.filter(q => verdict(c, q) === true).length;
  const open = c.questions.length - obj.length;                  // livres que ficam para os pais
  c.obj.status = 'done';
  c.obj.via = via;
  c.obj.result = { correct, total: obj.length, open, at: new Date().toISOString() };
  if (c.kind === 'extra') {
    const t = today();
    const coins = c.obj.paid ? correct * S.settings.extraPerCorrect : 0;
    S.extras[t] = { sets: (S.extras[t] ? S.extras[t].sets : 0) + (c.obj.paid ? 1 : 0) };
    if (c.obj.review && obj.length && correct / obj.length >= 0.6) S.missed = (S.missed || []).filter(m => !c.obj.review.includes(m.q.q));
    questEvent('extra_done', { perfect: obj.length > 0 && correct === obj.length, book: c.obj.group === 'book' });
    if (obj.length > 0 && correct === obj.length) setTimeout(() => celebrateFX('perfect'), 350);
    save();
    if (coins) addCoins(coins, `Extras: ${correct}/${obj.length} acertos`);
    renderWork();
    showCelebrate('Extras concluídos! ⭐', coins ? `+${coins}` : '', `Você acertou <b>${correct} de ${obj.length}</b>.${c.obj.paid ? '' : ' (Rodada só de treino.)'} Abra o gabarito para ver as correções.`, 'wow', { done: true });
    return;
  }
  const perfect = obj.length > 0 && correct === obj.length;
  if (perfect) setTimeout(() => celebrateFX('perfect'), 350);   // gabaritou: o mascote joga confete (e dança/música, se tiver)
  if (c.rec) { questEvent('day_done', { onTime: false, perfect }); return completeRecovery(c, correct, obj.length, open, extraMsg); }
  const streakMsg = bumpStreak(c.obj.date);
  // Moedas do dia: na hora (no próprio dia, valor cheio; atrasada dentro da semana, metade)
  const dc = Math.max(0, Number(S.settings.dayCoins ?? 10));
  const onTime = c.obj.date === today();
  const dayAmt = onTime ? dc : Math.round(dc / 2);
  let dayGot = 0;
  questEvent('day_done', { onTime, perfect: obj.length > 0 && correct === obj.length });
  if (dayAmt > 0 && !c.obj.coinsAt && addCoins(dayAmt, `Tarefa de ${DOW_FULL[c.obj.dow].toLowerCase()} ${fmtDM(c.obj.date)}${onTime ? '' : ' (atrasada)'}`, 'day-' + c.obj.date)) { c.obj.coinsAt = today(); c.obj.coins = dayAmt; dayGot = dayAmt; }
  save();
  VIEW.work = { kind: 'day', date: c.obj.date };
  show('work');
  const w = S.week;
  const allDone = weekAllDone(w);
  const msg = (extraMsg ? extraMsg + '<br>' : '') + streakMsg + `Você acertou <b>${correct} de ${obj.length}</b>.${open ? ` ${open} resposta${open > 1 ? 's' : ''} livre${open > 1 ? 's' : ''} vai${open > 1 ? 'o' : ''} para os pais corrigirem.` : ''}`;
  const big = dayGot ? `+${dayGot}` : '';
  if (allDone && today() === w.end && !w.settled) {
    showCelebrate('Tudo pronto! 🎉', big, msg + `<br><br>Todas as tarefas da semana estão feitas. Volte ao início e toque em <b>Entregar a semana</b> para ganhar <b>+${weekReward(w)}</b> 🪙!`, 'wow', { done: true });
  } else if (allDone) {
    showCelebrate('Semana completa! 🎉', big, msg + `<br><br>Agora é só <b>entregar na sexta ${fmtDM(w.end)}</b> para ganhar <b>+${weekReward(w)}</b> 🪙.`, 'wow', { done: true });
  } else {
    const bonus = !w.settled ? `<br>🎁 Bônus da semana: <b>+${weekReward(w)}</b> na sexta ${fmtDM(w.end)} se completar todos os dias (${requiredDays(w).filter(d => d.status === 'done').length} de ${requiredDays(w).length} feitos).` : '';
    showCelebrate('Tarefa do dia concluída! ✅', big, msg + (dayGot ? ` Você ganhou <b>+${dayGot}</b> 🪙 pela tarefa${onTime ? '' : ' (atrasada vale metade)'}.` : '') + bonus, 'happy', { done: true });
  }
}

function completeRecovery(c, correct, total, open, extraMsg) {
  const r = S.recovery; const d = c.obj;
  r.n = Math.min(r.total, r.n + 1);
  const coins = Math.round(r.pot * r.n / r.total) - Math.round(r.pot * (r.n - 1) / r.total);
  r.earned += coins;
  // reflete na semana original (resumo dos pais e histórico)
  if (S.week && S.week.start === r.start && S.week.days[d.date]) Object.assign(S.week.days[d.date], { status: 'done', answers: d.answers, result: d.result, verdicts: d.verdicts, notes: d.notes, via: d.via, recovered: true });
  const h = S.history.find(x => x.start === r.start); if (h) { h.done = Math.min(h.total, h.done + 1); h.recovered = (h.recovered || 0) + 1; }
  save();
  if (coins) addCoins(coins, `Recuperação ${DOW_LABEL[d.dow]} ${fmtDM(d.date)} (vale metade)`, 'rec-' + d.date);
  VIEW.work = { kind: 'day', date: d.date, rec: true };
  show('work');
  const left = Object.values(r.days).filter(x => x.status !== 'done').length;
  const msg = (extraMsg ? extraMsg + '<br>' : '') + `Você acertou <b>${correct} de ${total}</b>.${open ? ` ${open} resposta${open > 1 ? 's' : ''} livre${open > 1 ? 's' : ''} vai${open > 1 ? 'o' : ''} para os pais.` : ''}`
    + (left ? `<br>Falta${left > 1 ? 'm' : ''} <b>${left}</b> dia${left > 1 ? 's' : ''} para recuperar até sexta ${fmtDM(r.until)} (+${recoveryLeftCoins(r)} 🪙).` : `<br><br>Você recuperou a semana toda: <b>+${r.earned}</b> 🪙 no total. Isso é que é não desistir! 💪`);
  showCelebrate(left ? 'Dia recuperado! ⏳' : 'Semana recuperada! 🎉', coins ? `+${coins}` : '', msg, 'happy', { done: true });
}
// Sequência de dias seguidos fazendo a tarefa no próprio dia. A cada 5 dias: +15 moedas.
const STREAK_BONUS = 15;
function bumpStreak(date) {
  const t = today();
  if (date !== t) return '';
  const st = S.streak || (S.streak = { n: 0, last: '', best: 0 });
  if (st.last === t) return '';
  st.n = st.last === addDays(t, -1) ? st.n + 1 : 1;
  st.last = t; st.best = Math.max(st.best || 0, st.n);
  if (st.n % 5 === 0) { addCoins(STREAK_BONUS, `Sequência de ${st.n} dias 🔥`, 'streak-' + t); return `🔥 <b>${st.n} dias seguidos!</b> Bônus de <b>+${STREAK_BONUS}</b> 🪙<br>`; }
  return `🔥 Sequência: <b>${st.n} dia${st.n > 1 ? 's' : ''}</b> (a cada 5 dias: +${STREAK_BONUS} 🪙)<br>`;
}

/* ---------- Impressão: uma página A4 por dia ---------- */
function openPrintDialog(date) {
  const w = S.week; if (!w) return;
  const printable = requiredDays(w).filter(d => d.status !== 'done' && d.questions.length);
  const c = openModal(`<div class="modal-head"><h3>🖨️ Imprimir tarefas</h3><button class="btn small" data-close>Fechar</button></div>
    <div class="modal-body"><div class="radio-col">
      <label><input type="radio" name="pw" value="day" checked> Só ${esc(DOW_FULL[w.days[date].dow].toLowerCase())} ${fmtDM(date)} (${dayPrintPages(w.days[date])} folha${dayPrintPages(w.days[date]) > 1 ? 's' : ''})</label>
      ${dayPassages(w.days[date]).length ? `<label><input type="radio" name="pw" value="text"> Só o texto de leitura de ${esc(DOW_FULL[w.days[date].dow].toLowerCase())}</label>` : ''}
      <label><input type="radio" name="pw" value="week" ${printable.length > 1 ? '' : 'disabled'}> A semana toda que falta (${printable.length} dias, ${printable.reduce((a, d) => a + dayPrintPages(d), 0)} folhas)</label>
      <label class="chk"><input type="checkbox" id="pkey"> Incluir gabarito em página separada (para os pais)</label></div>
      <p class="tiny muted">Depois de fazer no papel, abra o dia no app e toque em <b>📄 Corrigir folha</b>: tire uma foto e a Lumi corrige, ou corrija sozinha com o gabarito.</p></div>
    <div class="modal-foot"><button class="btn primary" id="pgo">🖨️ Imprimir</button></div>`);
  $('#pgo', c).onclick = () => {
    const which = $('input[name=pw]:checked', c).value;
    if (which === 'text') { closeModal(); printPassages(dayPassages(w.days[date])); return; }
    const days = which === 'week' ? printable : [w.days[date]];
    const withKey = $('#pkey', c).checked;
    closeModal();
    printDays(days, withKey);
  };
}
function printQuestionHtml(q, i) {
  const s = SUBJ[q.subject] || { short: '', icon: '' };
  let ans = '';
  if (q.type === 'mc') ans = `<div class="p-opts">${q.options.map((o, j) => `<span>◯ ${'abcd'[j] || ''}) ${esc(o)}</span>`).join('')}</div>`;
  else if (q.type === 'open') ans = '<div class="p-lines"><i></i><i></i><i></i></div>';
  else if (q.type === 'proof') ans = `<div class="p-proof">${esc(q.text)}</div>
    <div class="p-fix-lbl">${q.lang === 'pt' ? 'Circule as palavras erradas e escreva certo:' : 'Circle the wrong words and write them correctly:'}</div>
    <div class="p-fixes">${q.errors.map((e, k) => `<span>${k + 1}. ____________</span>`).join('')}</div>`;
  else if (q.type === 'listen') ans = `<div class="p-line">${q.lang === 'pt' ? 'Ditado: um adulto lê a palavra do gabarito.' : 'Dictation: an adult reads the word from the answer key.'}</div>`;
  else ans = '<div class="p-line"></div>';
  return `<div class="p-q"><div class="p-qt"><b>${i + 1}.</b> <span class="p-subj">${s.icon} ${esc(s.short)}</span> ${esc(q.q)}</div>${ans}</div>`;
}
// Divide as perguntas do dia em folhas A4 (o texto de leitura vai numa folha própria).
function printChunks(qs) {
  const out = []; let cur = [], sum = 0;
  qs.forEach((q, i) => { const wt = q.type === 'proof' ? 4 : q.type === 'open' ? 2 : q.type === 'mc' ? 1.4 : 1;
    if (cur.length && sum + wt > 15) { out.push(cur); cur = []; sum = 0; } cur.push(i); sum += wt; });
  if (cur.length) out.push(cur);
  return out;
}
function dayPrintPages(d) { return dayPassages(d).length + printChunks(d.questions).length; }
function passagePageHtml(x, sub) {
  return `<section class="page"><header class="p-head"><div><div class="p-brand">📖 ${SUBJ[x.subject].lang === 'en' ? 'Reading' : 'Leitura'}</div><div class="p-day">${esc(sub)}</div></div></header>
    <div class="p-passage long"><h2>${esc(x.title)}</h2>${x.text.split(/\n+/).map(par => `<p>${esc(par)}</p>`).join('')}</div></section>`;
}
function printPassages(ps) {
  const root = $('#print-root');
  root.innerHTML = ps.map(x => passagePageHtml(x, S.name)).join('');
  setTimeout(() => window.print(), 60);
}
function printDays(days, withKey) {
  const root = $('#print-root');
  const pages = [];
  days.forEach(d => {
    const obj = d.questions.filter(q => q.type !== 'open').length;
    const chunks = printChunks(d.questions);
    dayPassages(d).forEach(x => pages.push(passagePageHtml(x, `${DOW_FULL[d.dow]} ${fmtDM(d.date)} · ${S.name}`)));
    chunks.forEach((ch, k) => pages.push(`<section class="page"><header class="p-head">
        <div><div class="p-brand">🦉 Estudos com a Lumi</div><div class="p-day">${esc(DOW_FULL[d.dow])} ${fmtDM(d.date)} · ${esc(S.name)}${chunks.length > 1 ? ` · folha ${k + 1}/${chunks.length}` : ''}</div></div>
        ${k === 0 ? `<div class="p-score">Acertos: ____ / ${obj}</div>` : ''}</header>
      <div class="p-grid">${ch.map(i => printQuestionHtml(d.questions[i], i)).join('')}</div>
      ${k === chunks.length - 1 ? `<footer class="p-foot">Terminou? No app, abra ${esc(DOW_FULL[d.dow].toLowerCase())} e toque em “📄 Corrigir folha”.</footer>` : ''}</section>`));
    if (withKey) {
      pages.push(`<section class="page key-page"><header class="p-head"><div><div class="p-brand">🔑 Gabarito — para os pais</div><div class="p-day">${esc(DOW_FULL[d.dow])} ${fmtDM(d.date)}</div></div></header>
        <div class="p-grid">${d.questions.map((q, i) => `<div class="p-k"><b>${i + 1}.</b> ${q.type === 'open' ? '<i>[Resposta Livre]</i>' : esc(q.answer)}</div>`).join('')}</div></section>`);
    }
  });
  root.innerHTML = pages.join('');
  root.classList.add('measuring');
  $$('.p-grid', root).forEach(g => fitGrid(g, { min: 9, max: 15, step: 0.5, colMin: 320, maxCols: 2, allowOverflow: false }));
  root.classList.remove('measuring');
  days.forEach(d => { d.printed = true; });
  save();
  setTimeout(() => { window.print(); if (currentScreen === 'work') renderWork(); }, 60);
}

/* ---------- Corrigir folha feita no papel ---------- */
function openCheck(date) { VIEW.check = { date, images: [] }; show('check'); }
function renderCheck() {
  const el = $('#scr-check');
  const d = S.week && VIEW.check && S.week.days[VIEW.check.date];
  if (!d) { show('home'); return; }
  $('#top-title').textContent = `📄 Corrigir ${DOW_LABEL[d.dow]} ${fmtDM(d.date)}`;
  const imgs = VIEW.check.images;
  el.innerHTML = `<div class="check">
    ${Server.ai ? `<div class="card check-opt">
      <h3>📷 A Lumi corrige pela foto</h3>
      <p class="tiny muted">Tire uma foto de cada folha (${printChunks(d.questions).length > 1 ? `são ${printChunks(d.questions).length} folhas de perguntas` : 'a folha inteira'}), de cima, com boa luz.</p>
      <div class="row wrap"><label class="btn primary">📷 Tirar foto<input type="file" id="cph" accept="image/*" capture="environment" hidden></label>
        ${imgs.length ? `<span class="tiny">✔ ${imgs.length} foto${imgs.length > 1 ? 's' : ''}</span><label class="btn small">+ outra<input type="file" id="cph2" accept="image/*" hidden></label>` : ''}</div>
      ${imgs.length ? `<div class="thumbs">${imgs.map(im => `<div class="thumb"><img src="data:${im.type};base64,${im.data}" alt="Foto da folha"></div>`).join('')}</div>
        <button class="btn gold big wide" id="cgo">✨ Corrigir com a Lumi</button>` : ''}
    </div>` : ''}
    <div class="card check-opt">
      <h3>✍️ Corrigir sozinha com o gabarito</h3>
      <p class="tiny muted">Compare sua folha com as respostas e marque ✓ ou ✗.</p>
      <button class="btn wide" id="cself">Abrir o gabarito para corrigir</button>
    </div>
    <button class="btn ghost" id="cback">◂ Voltar</button>
  </div>`;
  const addPhoto = async e => { const f = e.target.files[0]; if (!f) return; try { VIEW.check.images.push(await fileToJpeg(f, 1800, 0.85)); } catch (err) { toast('Não consegui ler a foto.'); } renderCheck(); };
  const p1 = $('#cph', el); if (p1) p1.onchange = addPhoto;
  const p2 = $('#cph2', el); if (p2) p2.onchange = addPhoto;
  const go = $('#cgo', el); if (go) go.onclick = () => gradeByPhoto(d);
  $('#cself', el).onclick = () => { VIEW.selfMarks = {}; show('selfcheck'); };
  $('#cback', el).onclick = () => { VIEW.work = { kind: 'day', date: d.date }; show('work'); };
}
async function gradeByPhoto(d) {
  const stop = showLoading(['Olhando sua folha… 👀', 'Lendo sua letra… ✍️', 'Conferindo as respostas… ✔️', 'Quase lá! 🦉']);
  let r;
  try {
    r = await apiCall('/api/grade', { method: 'POST', timeout: 180000, data: {
      title: `${DOW_FULL[d.dow]} ${fmtDM(d.date)}`, images: VIEW.check.images,
      questions: d.questions.map(q => ({ type: q.type, q: q.type === 'proof' ? `${q.q} Texto impresso: "${q.text}"` : q.q, options: q.options || [], answer: q.answer, accept: q.accept || [] })) } });
  } catch (e) { stop(); say(`Não consegui corrigir agora (${esc(e.message)}). Tente de novo ou corrija sozinha com o gabarito.`, { mood: 'sad', ms: 12000 }); return; }
  stop();
  if (!r.legible) { VIEW.check.images = []; renderCheck(); say(`${esc(r.message || '')} Não consegui ler bem a folha. Tire outra foto, de cima e com mais luz. 📷`, { mood: 'think', ms: 12000 }); return; }
  d.verdicts = {}; d.notes = {};
  (r.results || []).forEach(x => {
    const q = d.questions[x.number - 1]; if (!q) return;
    if (x.read) d.answers[q.id] = x.read;
    d.verdicts[q.id] = x.verdict === 'ok' ? 'ok' : 'bad';
    if (x.note) d.notes[q.id] = x.note;
  });
  d.questions.forEach(q => { if (!d.verdicts[q.id]) d.verdicts[q.id] = 'bad'; });
  VIEW.check.images = [];
  const c = Object.assign(workCtxFor(d), {});
  completeWork(c, 'photo', esc(r.message || ''));
}
function workCtxFor(d) { return { kind: 'day', title: `${DOW_FULL[d.dow]} ${fmtDM(d.date)}`, obj: d, questions: d.questions, answers: d.answers, done: false, marks: d.marks || {}, verdicts: d.verdicts || {} }; }
function renderSelfCheck() {
  const el = $('#scr-selfcheck');
  const d = S.week && VIEW.check && S.week.days[VIEW.check.date];
  if (!d) { show('home'); return; }
  $('#top-title').textContent = `✍️ Corrigir ${DOW_LABEL[d.dow]} ${fmtDM(d.date)}`;
  const marks = VIEW.selfMarks;
  const items = d.questions.map((q, i) => {
    const s = SUBJ[q.subject] || { color: '#7b5cf0' };
    if (q.type === 'open') return `<div class="key" style="border-left:4px solid ${s.color}"><b>${i + 1}.</b><div class="grow"><span class="free">[Resposta Livre]</span> <span class="yours">· os pais corrigem</span></div></div>`;
    const m = marks[q.id];
    return `<div class="key ${m === 'ok' ? 'ok' : m === 'bad' ? 'bad' : ''}" style="border-left:4px solid ${s.color}"><b>${i + 1}.</b><div class="grow"><span class="ans">${esc(q.answer)}</span> <span class="yours">· ${esc(q.q.length > 70 ? q.q.slice(0, 67) + '…' : q.q)}</span></div>
      <span class="mk"><button data-m="ok" data-q="${q.id}" class="${m === 'ok' ? 'on-ok' : ''}" aria-label="Acertei">✓</button><button data-m="bad" data-q="${q.id}" class="${m === 'bad' ? 'on-bad' : ''}" aria-label="Errei">✗</button></span></div>`;
  }).join('');
  const need = d.questions.filter(q => q.type !== 'open' && !marks[q.id]).length;
  el.innerHTML = `<div class="work">
    <div class="work-head"><h2>Marque ✓ acertei ou ✗ errei</h2><span class="prog-txt">${need ? `faltam ${need}` : 'tudo marcado!'}</span></div>
    <div class="sheet key-grid" id="self-grid">${items}</div>
    <div class="work-foot"><button class="btn" id="sback">◂ Voltar</button><button class="btn primary" id="ssave" ${need ? 'disabled' : ''}>✔ Salvar correção</button></div></div>`;
  $$('[data-m]', el).forEach(b => b.onclick = () => { marks[b.dataset.q] = b.dataset.m; renderSelfCheck(); });
  $('#sback', el).onclick = () => show('check');
  $('#ssave', el).onclick = () => {
    d.verdicts = {};
    d.questions.forEach(q => { d.verdicts[q.id] = q.type === 'open' ? 'open' : marks[q.id]; });
    completeWork(workCtxFor(d), 'self');
  };
  requestAnimationFrame(() => fitGrid($('#self-grid'), { min: 12, max: 18, colMin: 220, maxCols: 3 }));
}

/* ---------- Lojinha ---------- */
function vouchersAsItems() { return (S.vouchers || []).map(v => ({ id: v.id, cat: 'voucher', name: v.name, price: Number(v.price) || 0 })); }
function renderShop() {
  const el = $('#scr-shop');
  if (!SHOP_CATS.some(c => c.id === VIEW.shopCat)) VIEW.shopCat = 'egg';
  const cat = VIEW.shopCat;
  const items = cat === 'note' ? [] : (cat === 'voucher' ? vouchersAsItems() : SHOP_ITEMS.filter(i => i.cat === cat)).slice().sort((a, b) => a.price - b.price);
  if (cat === 'note' && VIEW.noteFetched !== today() + Server.childId) { VIEW.noteFetched = today() + Server.childId; VIEW.noteAvail = Server.me ? null : 0; if (Server.me) refreshNoteStatus().then(() => { if (currentScreen === 'shop' && VIEW.shopCat === 'note') renderShop(); }); }
  const tryOn = VIEW.tryOn && SHOP_ITEMS.find(i => i.id === VIEW.tryOn);
  const previewEq = Object.assign({}, S.equipped);
  if (tryOn && WEAR.includes(tryOn.cat)) previewEq[tryOn.cat] = tryOn.id === 'ms-owl' ? null : tryOn.id;
  const cards = items.map(it => {
    const owned = S.owned.includes(it.id) || it.id === 'ms-owl';
    const equipped = it.id === 'ms-owl' ? !S.equipped.mascot : S.equipped[it.cat] === it.id;
    let pic = '';
    if (it.cat === 'egg') {
      const chances = it.egg === 'mascot' ? `${MASCOTS.length - 1} mascotes, chances iguais · você tem ${MASCOTS.filter(m => m.id !== 'ms-owl' && collectionCount(m.id)).length}/${MASCOTS.length - 1}`
        : `${Object.values(RARITY).map(r => `<span style="color:${r.color}">${r.label} ${r.pct}%</span>`).join(' · ')} · você tem ${ALL_PETS.filter(id => collectionCount(id)).length}/${ALL_PETS.length}`;
      return `<div class="item egg-item"><div class="pic">${eggSVG(it.egg, 'idle')}</div><div class="nm">${esc(it.name)}</div><div class="tiny egg-odds">${chances}</div><div class="pr">🪙 ${it.price}</div><div class="item-act"><button class="btn small primary" data-buy="${it.id}">Comprar e chocar 🥚</button></div></div>`;
    }
    if (WEAR.includes(it.cat)) pic = itemPreviewSVG(it);
    else if (it.cat === 'bg') pic = `<div class="swatch" style="background:${it.sw}"></div>`;
    else if (it.cat === 'sticker') pic = it.emoji;
    else pic = '🎟️';
    let btn;
    if (it.cat === 'voucher') btn = `<button class="btn small primary" data-buy="${it.id}">Resgatar</button>`;
    else if (it.cat === 'sticker') btn = owned ? '<span class="tiny muted">No álbum ✔</span>' : `<button class="btn small primary" data-buy="${it.id}">Comprar</button>`;
    else if (!owned) btn = `<button class="btn small" data-try="${it.id}">Provar</button><button class="btn small primary" data-buy="${it.id}">Comprar</button>`;
    else btn = equipped ? (it.cat === 'mascot' ? '<span class="btn small ok">Usando ✔</span>' : `<button class="btn small ok" data-unequip="${it.id}">Usando ✔</button>`) : `<button class="btn small" data-equip="${it.id}">Usar</button>`;
    btn = `<div class="item-act">${btn}</div>`;
    return `<div class="item ${owned && it.cat !== 'voucher' ? 'owned' : ''} ${it.price >= 1000 ? 'dream' : ''}">${it.price >= 1000 ? '<span class="dream-tag">✨ SONHO</span>' : ''}<div class="pic">${pic}</div><div class="nm">${esc(it.name)}</div><div class="pr">🪙 ${it.price}</div>${btn}</div>`;
  }).join('');
  const pend = (S.redemptions || []).filter(r => !r.delivered);
  el.innerHTML = `<div class="shop">
    <div class="shop-preview"><div>${mascotSVG(previewEq, tryOn ? 'wow' : 'happy')}</div>
      <div><b>Saldo: 🪙 ${S.coins}</b>${S.coins < 0 ? '<div class="tiny" style="color:var(--bad)">Saldo negativo: a lojinha volta quando ficar positivo.</div>' : ''}
      ${tryOn ? `<div class="tiny muted">Provando: ${esc(tryOn.name)}</div>` : ''}
      ${pend.length ? `<div class="tiny muted">🎟️ ${pend.length} vale(s) aguardando os pais</div>` : ''}
      <button class="btn small" data-act="collection" style="margin-top:4px">📖 Minha coleção</button>
      ${['hat', 'glasses', 'neck', 'back', 'skin'].includes(cat) ? '<div class="tiny muted">As roupinhas servem em todos os mascotes.</div>' : ''}</div></div>
    <div class="shop-main">
      <div class="tabs">${SHOP_CATS.map(c => `<button data-cat="${c.id}" class="${c.id === cat ? 'on' : ''}">${c.label}</button>`).join('')}</div>
      ${cat === 'react' ? `<div class="row wrap tiny muted react-head"><span class="grow">Equipe 1 dancinha, 1 musiquinha e 1 confete. Eles aparecem quando você gabarita! 🎉 (O confete colorido é grátis.)</span><button class="btn small" data-act="sound">${soundOn() ? '🔊 Som ligado' : '🔇 Som desligado'}</button></div>` : ''}
      <div class="items">${cat === 'note' ? noteShopHtml() : cat === 'react' ? items.map(reactCard).join('') : (cards || '<p class="muted">Nada aqui ainda.</p>')}</div>
    </div></div>`;
  $$('[data-cat]', el).forEach(b => b.onclick = () => { VIEW.shopCat = b.dataset.cat; VIEW.tryOn = null; renderShop(); });
  $('[data-act=collection]', el).onclick = () => show('collection');
  const nb = $('[data-note-buy]', el); if (nb) nb.onclick = buyNote;
  $$('[data-test]', el).forEach(b => b.onclick = () => { const it = SHOP_ITEMS.find(i => i.id === b.dataset.test); celebrateFX('test', it); });
  $$('[data-requip]', el).forEach(b => b.onclick = () => { const it = SHOP_ITEMS.find(i => i.id === b.dataset.requip); S.equipped[it.sub] = it.id; save(); renderShop(); celebrateFX('test', it); });
  $$('[data-runequip]', el).forEach(b => b.onclick = () => { const it = SHOP_ITEMS.find(i => i.id === b.dataset.runequip); S.equipped[it.sub] = null; save(); renderShop(); });
  const snd = $('[data-act=sound]', el); if (snd) snd.onclick = () => { S.settings.sound = !soundOn(); touch('settings'); save(); renderShop(); if (soundOn()) playMelody('default'); };
  const mn = $('[data-act=mynotes]', el); if (mn) mn.onclick = () => show('notes');
  $$('[data-try]', el).forEach(b => b.onclick = () => { VIEW.tryOn = b.dataset.try; renderShop(); });
  $$('[data-buy]', el).forEach(b => b.onclick = () => buy(b.dataset.buy));
  $$('[data-equip]', el).forEach(b => b.onclick = () => { const it = SHOP_ITEMS.find(i => i.id === b.dataset.equip); S.equipped[it.cat] = it.id === 'ms-owl' ? null : it.id; save(); applyTheme(); renderMascotMini(); renderShop(); });
  $$('[data-unequip]', el).forEach(b => b.onclick = () => { const it = SHOP_ITEMS.find(i => i.id === b.dataset.unequip); S.equipped[it.cat] = null; save(); applyTheme(); renderMascotMini(); renderShop(); });
}
async function buy(id) {
  const it = SHOP_ITEMS.find(i => i.id === id) || vouchersAsItems().find(v => v.id === id);
  if (!it) return;
  if (it.cat === 'egg') return buyEgg(it);
  if (S.coins < it.price) { say(`Faltam <b>${it.price - Math.max(0, S.coins)}</b> moedas para ${esc(it.name)}. Que tal uns exercícios extras? ⭐`, { mood: 'think' }); return; }
  const ok = await confirmBox(it.cat === 'voucher' ? 'Resgatar vale?' : 'Comprar?', `${esc(it.name)} por <b>🪙 ${it.price}</b>?${it.cat === 'voucher' ? '<br><span class="muted tiny">Os pais vão confirmar a entrega do prêmio.</span>' : ''}`, it.cat === 'voucher' ? 'Resgatar' : 'Comprar');
  if (!ok) return;
  addCoins(-it.price, (it.cat === 'voucher' ? 'Vale: ' : 'Lojinha: ') + it.name);
  questEvent('buy', { cat: it.cat, price: it.price });
  if (it.cat === 'voucher') {
    S.redemptions.unshift({ id: uid(), voucherId: it.id, name: it.name, price: it.price, date: today(), delivered: false });
  } else {
    S.owned.push(it.id);
    if (WEAR.includes(it.cat) || it.cat === 'bg') S.equipped[it.cat] = it.id;
    if (it.cat === 'react') { S.equipped[it.sub] = it.id; setTimeout(() => celebrateFX('test', it), 200); }
  }
  VIEW.tryOn = null;
  save(); applyTheme(); renderMascotMini(); renderShop();
  say(it.cat === 'sticker' ? `${it.emoji} foi para o seu álbum!` : it.cat === 'voucher' ? 'Vale resgatado! Mostre para os seus pais. 🎟️' : 'Amei! Obrigada! 😍', { mood: 'wow' });
}

/* ---------- ✏️ Oficina de palavras: treinar as palavras da semana e as que errou ---------- */
// Palavras da semana (Ortografia/Spelling) + caça-erros + as que o estudante errou ou marcou "não sei".
const WORD_OK = w => /^[\p{L}][\p{L}'’-]{1,22}$/u.test(w);
function weekWords(lang) {
  const sid = lang === 'en' ? 'en_spell' : 'pt_ort';
  const out = [];
  const w = S.week;
  if (w) {
    [w.topics && w.topics[sid], ...(w.summary || []).filter(x => x.subject === sid).map(x => x.summary), w.subjectTexts && w.subjectTexts[sid]]
      .filter(Boolean).forEach(t => String(t).replace(/^[^:]{0,40}:/, '').split(/[,;\n/]+/).map(x => x.trim().replace(/[.!?"“”()]/g, '')).filter(WORD_OK).forEach(x => out.push(x)));
    Object.values(w.days || {}).forEach(d => d.questions.forEach(q => { if (q.type === 'proof' && q.lang === lang) q.errors.forEach(e => out.push(e.right)); }));
  }
  return out;
}
function workshopWords(lang) {
  const seen = new Set(); const list = [];
  [...((S.practice || {})[lang] || []), ...weekWords(lang)].forEach(x => { const k = x.toLowerCase(); if (!seen.has(k) && WORD_OK(x)) { seen.add(k); list.push(x); } });
  return list.slice(0, 24);
}
const isPractice = (lang, w) => ((S.practice || {})[lang] || []).some(x => x.toLowerCase() === w.toLowerCase());
const WK_GAMES = [
  { id: 'search', icon: '🔍', pt: 'Caça-palavras', en: 'Word search', dpt: 'ache as palavras escondidas', den: 'find the hidden words' },
  { id: 'dict', icon: '🎧', pt: 'Ditado da Lumi', en: 'Lumi\'s dictation', dpt: 'ouça e escreva', den: 'listen and write', voice: true },
  { id: 'flash', icon: '⚡', pt: 'Pisca-pisca', en: 'Flash!', dpt: 'a palavra some: escreva de memória', den: 'the word disappears: write it from memory' },
  { id: 'scramble', icon: '🧩', pt: 'Embaralhadas', en: 'Scrambled', dpt: 'desembaralhe as letras', den: 'unscramble the letters' },
  { id: 'vowels', icon: '🕳️', pt: 'Vogais sumidas', en: 'Missing vowels', dpt: 'complete as letras que faltam', den: 'fill in the missing letters' },
];
// Atividades para imprimir (divertidas, para fixar a grafia). Cada uma vira um bloco numa folha A4.
const WK_PRINT = [
  { id: 'rainbow', icon: '🌈', pt: 'Palavras arco-íris', en: 'Rainbow words', dpt: 'escreva cada palavra 3 vezes, cada vez com uma cor', den: 'write each word 3 times in 3 colours' },
  { id: 'lscwc', icon: '👀', pt: 'Olhe, cubra, escreva, confira', en: 'Look, cover, write, check', dpt: 'o método das escolas inglesas', den: 'the classic spelling routine' },
  { id: 'trace', icon: '✍️', pt: 'Caligrafia', en: 'Handwriting', dpt: 'cubra o pontilhado e copie', den: 'trace the dotted word and copy it' },
  { id: 'search', icon: '🔍', pt: 'Caça-palavras', en: 'Word search', dpt: 'ache e pinte as palavras', den: 'find and colour the words' },
  { id: 'pyramid', icon: '🔺', pt: 'Pirâmide de letras', en: 'Word pyramid', dpt: 'monte a palavra letra por letra', den: 'build the word letter by letter' },
  { id: 'bubble', icon: '🫧', pt: 'Letras-bolha', en: 'Bubble letters', dpt: 'desenhe a palavra com letras gordinhas e pinte', den: 'draw the word in bubble letters and colour it' },
  { id: 'vowelcol', icon: '🎨', pt: 'Vogais coloridas', en: 'Colourful vowels', dpt: 'vogais de uma cor, consoantes de outra', den: 'vowels in one colour, consonants in another' },
  { id: 'code', icon: '🕵️', pt: 'Código secreto', en: 'Secret code', dpt: 'decifre as palavras com a chave', den: 'crack the words with the key' },
  { id: 'scramble', icon: '🧩', pt: 'Letras embaralhadas', en: 'Scrambled letters', dpt: 'desembaralhe e escreva certo', den: 'unscramble and write correctly' },
  { id: 'abc', icon: '🔤', pt: 'Ordem alfabética', en: 'ABC order', dpt: 'coloque as palavras em ordem', den: 'put the words in order' },
  { id: 'silly', icon: '🤪', pt: 'Frase maluca', en: 'Silly sentences', dpt: 'invente uma frase engraçada com duas palavras', den: 'make a funny sentence with two words' },
  { id: 'draw', icon: '🖍️', pt: 'Palavra-desenho', en: 'Picture words', dpt: 'desenhe a palavra e escreva embaixo', den: 'draw the word and write it underneath' },
];
function renderWorkshop() {
  const el = $('#scr-workshop');
  const langs = ['pt', 'en'].filter(l => mySubjects().some(id => SUBJ[id].lang === l));
  if (!VIEW.wkLang || !langs.includes(VIEW.wkLang)) VIEW.wkLang = langs.includes('pt') && (workshopWords('pt').length || !workshopWords('en').length) ? 'pt' : (langs[0] || 'pt');
  const L = VIEW.wkLang, pt = L === 'pt';
  const words = workshopWords(L);
  const t = today(); const used = (S.workshop || {})[t] || 0; const left = Math.max(0, (S.settings.workshopPerDay ?? 5) - used);
  const coin = S.settings.workshopCoins ?? 3;
  const pick = VIEW.wkPrint || (VIEW.wkPrint = ['rainbow', 'lscwc', 'search', 'code']);
  el.innerHTML = `<div class="workshop">
    <div class="card wk-words">
      <div class="row wrap"><b>✏️ ${pt ? 'Minhas palavras' : 'My words'}</b>
        ${langs.length > 1 ? `<div class="seg small"><button data-wl="pt" class="${pt ? 'on' : ''}">🇧🇷 PT</button><button data-wl="en" class="${!pt ? 'on' : ''}">🇬🇧 EN</button></div>` : ''}
        </div><div class="tiny muted">${pt ? 'Toque numa palavra para ouvir ou pedir uma aulinha.' : 'Tap a word to hear it or get a mini-lesson.'}</div>
      <div class="wk-chips">${words.length ? words.map(w => `<button type="button" class="wk-chip ${isPractice(L, w) ? 'hard' : ''}" data-word="${esc(w)}">${isPractice(L, w) ? '🔥 ' : ''}${esc(w)}</button>`).join('')
        : `<span class="tiny muted">${pt ? 'Ainda não tem palavras. Elas aparecem quando a semana tem Ortografia, ou escreva abaixo.' : 'No words yet. They appear when the week has Spelling, or add some below.'}</span>`}</div>
      <form class="row wk-add" autocomplete="off"><input id="wk-new" placeholder="${pt ? '+ escrever palavras (separe por vírgula)' : '+ add words (comma separated)'}" autocapitalize="off" spellcheck="false"><button class="btn small">${pt ? 'Adicionar' : 'Add'}</button></form>
      <div class="tiny muted">🔥 = ${pt ? 'palavras que você errou ou disse que não sabia' : 'words you got wrong or did not know'}</div>
    </div>
    <div class="card"><div class="row wrap"><b>🎮 ${pt ? 'Jogos' : 'Games'}</b><span class="tiny muted grow">${left ? (pt ? `+${coin} 🪙 por jogo terminado · ${left} hoje` : `+${coin} 🪙 per finished game · ${left} left today`) : (pt ? 'moedas de hoje já foram: agora é só treino 💪' : 'no more coins today: just practice 💪')}</span></div>
      <div class="wk-games">${WK_GAMES.filter(g => !g.voice || speechOK).map(g => `<button type="button" class="btn wk-game" data-game="${g.id}" ${words.length < 3 ? 'disabled' : ''}><span class="wg-ic">${g.icon}</span><b>${pt ? g.pt : g.en}</b><span class="tiny muted">${pt ? g.dpt : g.den}</span></button>`).join('')}</div>
      ${words.length < 3 ? `<div class="tiny muted">${pt ? 'Precisa de pelo menos 3 palavras.' : 'You need at least 3 words.'}</div>` : ''}</div>
    <div class="card"><div class="row wrap"><b>🖨️ ${pt ? 'Folhas para imprimir' : 'Printable sheets'}</b><span class="tiny muted grow">${pt ? 'marque as atividades' : 'pick the activities'}</span></div>
      <div class="wk-print">${WK_PRINT.map(a => `<label class="wk-pa ${pick.includes(a.id) ? 'on' : ''}"><input type="checkbox" value="${a.id}" ${pick.includes(a.id) ? 'checked' : ''}><span class="wg-ic">${a.icon}</span><span><b>${pt ? a.pt : a.en}</b><span class="tiny muted"> ${pt ? a.dpt : a.den}</span></span></label>`).join('')}</div>
      <div class="row"><button class="btn primary grow" data-act="wkprint" ${words.length < 3 ? 'disabled' : ''}>🖨️ ${pt ? 'Imprimir' : 'Print'} (${Math.min(10, words.length)} ${pt ? 'palavras' : 'words'})</button></div></div>
  </div>`;
  $$('[data-wl]', el).forEach(b => b.onclick = () => { VIEW.wkLang = b.dataset.wl; renderWorkshop(); });
  $$('[data-word]', el).forEach(b => b.onclick = () => wordMenu(b.dataset.word, L));
  $('.wk-add', el).onsubmit = e => { e.preventDefault(); const v = $('#wk-new', el).value.split(/[,;\n]+/).map(x => x.trim()).filter(WORD_OK); if (!v.length) return; notePractice(L, v); save(); renderWorkshop(); };
  $$('[data-game]', el).forEach(b => b.onclick = () => startWordGame(b.dataset.game, L));
  $$('.wk-pa input', el).forEach(ch => ch.onchange = () => { ch.closest('label').classList.toggle('on', ch.checked); VIEW.wkPrint = $$('.wk-pa input', el).filter(x => x.checked).map(x => x.value); });
  $('[data-act=wkprint]', el).onclick = () => { const acts = VIEW.wkPrint || []; if (!acts.length) { toast(pt ? 'Marque pelo menos uma atividade.' : 'Pick at least one activity.'); return; } printWorkshop(words, acts, L); };
}
function wordMenu(word, L) {
  const pt = L === 'pt';
  const hard = isPractice(L, word);
  const m = openModal(`<div class="modal-head"><h3 class="wk-big">${esc(word)}</h3><button class="btn small" data-close>${pt ? 'Fechar' : 'Close'}</button></div>
    <div class="modal-body"><div class="radio-col">
      ${speechOK ? `<button class="btn" data-hear>🔊 ${pt ? 'Ouvir' : 'Listen'}</button>` : ''}
      <button class="btn gold" data-idk>🤷 ${pt ? 'Não sei esse! Me ensina' : 'I don\'t know this one! Teach me'}</button>
      ${hard ? `<button class="btn ghost" data-ok>✅ ${pt ? 'Já aprendi (tirar do 🔥)' : 'I\'ve got it (remove 🔥)'}</button>` : ''}</div></div>`);
  const h = $('[data-hear]', m); if (h) h.onclick = () => speak(word, L);
  $('[data-idk]', m).onclick = () => {
    notePractice(L, [word]); save(); closeModal();
    const sid = L === 'en' ? 'en_spell' : 'pt_ort';
    openLesson({ subject: sid, lang: L, type: 'short', q: pt ? `Como se escreve "${word}"?` : `How do you spell "${word}"?`, answer: word },
      null, { topic: pt ? `A grafia da palavra "${word}": a regra de ortografia que ela segue (acento, letras, sílaba tônica…), outras palavras com a mesma regra e um jeito de lembrar.${weekTopicFor(sid) ? ` Tema da semana: ${weekTopicFor(sid)}.` : ''}`
        : `How to spell "${word}": the spelling rule or pattern it follows, other words with the same pattern and a trick to remember it.${weekTopicFor(sid) ? ` This week's topic: ${weekTopicFor(sid)}.` : ''}` });
    if (currentScreen === 'workshop') renderWorkshop();
  };
  const ok = $('[data-ok]', m); if (ok) ok.onclick = () => { S.practice[L] = S.practice[L].filter(x => x.toLowerCase() !== word.toLowerCase()); save(); closeModal(); renderWorkshop(); };
}
// Escolhe até n palavras, priorizando as 🔥
function gameWords(L, n) {
  const all = workshopWords(L);
  const hard = all.filter(w => isPractice(L, w)), rest = all.filter(w => !isPractice(L, w));
  const rng = makeRng('wk' + uid());
  return [...rng.shuffle(hard), ...rng.shuffle(rest)].slice(0, n);
}
function wkReward(pt) {
  questEvent('game');
  const t = today(); S.workshop = S.workshop || {};
  const used = S.workshop[t] || 0;
  if (used >= (S.settings.workshopPerDay ?? 5)) return 0;
  S.workshop[t] = used + 1;
  const c = S.settings.workshopCoins ?? 3;
  if (c) addCoins(c, pt ? 'Oficina de palavras' : 'Word workshop');
  return c;
}
/* Jogos na tela */
function startWordGame(id, L) {
  if (id === 'search') return wordSearchGame(L);
  const pt = L === 'pt';
  const words = gameWords(L, 6);
  const g = WK_GAMES.find(x => x.id === id);
  const rng = makeRng('g' + uid());
  let i = 0, score = 0;
  const vowels = /[aeiouáéíóúâêôãõàAEIOUÁÉÍÓÚÂÊÔÃÕÀ]/;
  const step = () => {
    if (i >= words.length) {
      const coins = score >= Math.ceil(words.length / 2) ? wkReward(pt) : 0;
      showCelebrate(score === words.length ? (pt ? 'Perfeito! 🎉' : 'Perfect! 🎉') : (pt ? 'Bom treino! 💪' : 'Good practice! 💪'), coins ? `+${coins}` : '',
        pt ? `Você acertou <b>${score} de ${words.length}</b>. As que você errou ficaram com 🔥 para treinar mais.` : `You got <b>${score} of ${words.length}</b>. The ones you missed got a 🔥 so you can practise again.`, score === words.length ? 'wow' : 'happy');
      if (currentScreen === 'workshop') renderWorkshop();
      return;
    }
    const w = words[i];
    let prompt = '';
    if (id === 'dict') prompt = `<button class="btn big" data-hear>🔊 ${pt ? 'Ouvir de novo' : 'Listen again'}</button>`;
    else if (id === 'flash') prompt = `<div class="wk-flash" id="wk-flash">${esc(w)}</div>`;
    else if (id === 'scramble') { let s = w; for (let k = 0; k < 6 && s.toLowerCase() === w.toLowerCase(); k++) s = rng.shuffle([...w.toLowerCase()]).join(''); prompt = `<div class="wk-tiles">${[...s].map(ch => `<span>${esc(ch)}</span>`).join('')}</div>`; }
    else if (id === 'vowels') prompt = `<div class="wk-gap">${[...w].map(ch => vowels.test(ch) ? '<span class="gap">_</span>' : `<span>${esc(ch)}</span>`).join('')}</div>`;
    const m = openModal(`<div class="modal-head"><h3>${g.icon} ${pt ? g.pt : g.en} · ${i + 1}/${words.length}</h3><button class="btn small" data-close>${pt ? 'Sair' : 'Exit'}</button></div>
      <div class="modal-body wk-play">${prompt}
        <input id="wk-in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${pt ? 'escreva a palavra' : 'type the word'}" ${id === 'flash' ? 'disabled' : ''}>
        <div class="lq-fb" id="wk-fb"></div></div>
      <div class="modal-foot"><span class="grow"></span><button class="btn primary" data-check ${id === 'flash' ? 'disabled' : ''}>${pt ? 'Conferir' : 'Check'}</button></div>`);
    const inp = $('#wk-in', m);
    if (id === 'dict') { setTimeout(() => speak(w, L), 250); $('[data-hear]', m).onclick = () => speak(w, L); }
    if (id === 'flash') setTimeout(() => { const f = $('#wk-flash', m); if (!f) return; f.classList.add('gone'); f.textContent = '❓'; inp.disabled = false; $('[data-check]', m).disabled = false; inp.focus(); }, Math.max(1800, 450 * w.length));
    else inp.focus();
    let done = false;
    const check = () => {
      if (done || !inp.value.trim()) return; done = true;
      const ok = proofEq(inp.value.trim(), w);
      if (ok) score++; else notePractice(L, [w]);
      save();
      $('#wk-fb', m).innerHTML = ok ? `<b class="okc">✓ ${pt ? 'Isso!' : 'Yes!'}</b> ${esc(w)}` : `<b class="badc">✗</b> ${pt ? 'Era' : 'It was'} <b class="wk-right">${esc(w)}</b>`;
      if (id === 'flash' || id === 'dict') { const f = $('#wk-flash', m); if (f) { f.textContent = w; f.classList.remove('gone'); } }
      $('.modal-foot', m).innerHTML = `<span class="grow"></span><button class="btn primary" data-next>${i + 1 < words.length ? (pt ? 'Próxima ▸' : 'Next ▸') : (pt ? 'Ver resultado' : 'See result')}</button>`;
      $('[data-next]', m).onclick = () => { i++; step(); }; $('[data-next]', m).focus();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
    $('[data-check]', m).onclick = check;
  };
  step();
}
// Caça-palavras: grade gerada na hora. Toque na primeira e na última letra da palavra.
function makeWordSearch(words, rng, big, lang) {
  const W = words.map(w => w.toUpperCase().replace(/[^\p{L}]/gu, ''));
  const size = clamp(Math.max(...W.map(w => w.length)) + 2, big ? 10 : 8, 13);
  const g = Array.from({ length: size }, () => Array(size).fill(''));
  const dirs = big ? [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1]] : [[0, 1], [1, 0], [1, 1]];
  const placed = [];
  W.forEach((w, wi) => {
    for (let tries = 0; tries < 200; tries++) {
      const [dr, dc] = rng.pick(dirs);
      const r0 = rng.int(0, size - 1), c0 = rng.int(0, size - 1);
      const r1 = r0 + dr * (w.length - 1), c1 = c0 + dc * (w.length - 1);
      if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;
      let ok = true;
      for (let k = 0; k < w.length; k++) { const ch = g[r0 + dr * k][c0 + dc * k]; if (ch && ch !== w[k]) { ok = false; break; } }
      if (!ok) continue;
      for (let k = 0; k < w.length; k++) g[r0 + dr * k][c0 + dc * k] = w[k];
      placed.push({ word: words[wi], up: w, r0, c0, r1, c1 }); return;
    }
  });
  // letras de enchimento: em português também entram letras com acento (senão o acento entrega onde está a palavra)
  const used = [...new Set(W.join(''))].filter(ch => /[^A-Z]/.test(ch));
  const abc = 'ABCDEFGHIJLMNOPRSTUVZ'.repeat(3) + (lang === 'pt' ? 'ÁÉÊÍÓÔÃÕÇ' + used.join('') : used.join(''));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!g[r][c]) g[r][c] = abc[rng.int(0, abc.length - 1)];
  return { size, g, placed };
}
function wordSearchGame(L) {
  const pt = L === 'pt';
  const words = gameWords(L, 7).filter(w => w.length <= 11);
  const rng = makeRng('ws' + uid());
  const P = makeWordSearch(words, rng, false, L);
  const found = new Set(); let start = null;
  const m = openModal(`<div class="modal-head"><h3>🔍 ${pt ? 'Caça-palavras' : 'Word search'}</h3><button class="btn small" data-close>${pt ? 'Sair' : 'Exit'}</button></div>
    <div class="modal-body ws-body"><p class="tiny muted" style="margin:0">${pt ? 'Toque na <b>primeira</b> e na <b>última</b> letra de cada palavra.' : 'Tap the <b>first</b> and the <b>last</b> letter of each word.'}</p>
      <div class="ws-grid" style="--n:${P.size}">${P.g.map((row, r) => row.map((ch, c) => `<button type="button" class="ws-c" data-r="${r}" data-c="${c}">${ch}</button>`).join('')).join('')}</div>
      <div class="ws-list">${P.placed.map((p, k) => `<span data-k="${k}">${esc(p.word)}</span>`).join('')}</div></div>`, { wide: true });
  const cell = (r, c) => $(`.ws-c[data-r="${r}"][data-c="${c}"]`, m);
  const line = (a, b) => {
    const dr = Math.sign(b.r - a.r), dc = Math.sign(b.c - a.c);
    const len = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c));
    if (!(a.r === b.r || a.c === b.c || Math.abs(b.r - a.r) === Math.abs(b.c - a.c))) return null;
    return Array.from({ length: len + 1 }, (_, k) => [a.r + dr * k, a.c + dc * k]);
  };
  $$('.ws-c', m).forEach(b => b.onclick = () => {
    const p = { r: Number(b.dataset.r), c: Number(b.dataset.c) };
    if (!start) { start = p; b.classList.add('sel'); return; }
    const cells = line(start, p); cell(start.r, start.c).classList.remove('sel');
    const s0 = start; start = null;
    if (!cells) { b.classList.add('sel'); start = p; return; }
    const k = P.placed.findIndex((x, j) => !found.has(j) && ((x.r0 === s0.r && x.c0 === s0.c && x.r1 === p.r && x.c1 === p.c) || (x.r1 === s0.r && x.c1 === s0.c && x.r0 === p.r && x.c0 === p.c)));
    if (k < 0) { cells.forEach(([r, c]) => { const e = cell(r, c); e.classList.add('miss'); setTimeout(() => e.classList.remove('miss'), 350); }); return; }
    found.add(k);
    cells.forEach(([r, c]) => cell(r, c).classList.add('found', 'f' + (k % 6)));
    $(`.ws-list [data-k="${k}"]`, m).classList.add('done');
    if (speechOK) speak(P.placed[k].word, L);
    if (found.size === P.placed.length) setTimeout(() => {
      const coins = wkReward(pt);
      showCelebrate(pt ? 'Achou todas! 🔍🎉' : 'You found them all! 🔍🎉', coins ? `+${coins}` : '', pt ? 'Agora tente escrever cada uma sem olhar. ✍️' : 'Now try writing each one without looking. ✍️', 'wow');
      if (currentScreen === 'workshop') renderWorkshop();
    }, 500);
  });
}
/* Folhas para imprimir */
function printWorkshop(allWords, acts, L) {
  const pt = L === 'pt';
  const words = allWords.slice(0, 10);
  const rng = makeRng('pw' + uid());
  const T = id => { const a = WK_PRINT.find(x => x.id === id); return `<h3 class="wk-h">${a.icon} ${pt ? a.pt : a.en} <span>— ${pt ? a.dpt : a.den}</span></h3>`; };
  const blocks = {
    rainbow: () => `${T('rainbow')}<div class="wk-tbl rainbow">${words.map(w => `<div class="wr"><b>${esc(w)}</b>${['#e03131', '#f08c00', '#2f9e44'].map(c => `<i style="border-color:${c}"><em style="background:${c}"></em></i>`).join('')}</div>`).join('')}</div>`,
    lscwc: () => `${T('lscwc')}<div class="wk-tbl lscwc"><div class="wr hd"><span>${pt ? 'Olhe 👀' : 'Look 👀'}</span><span>${pt ? 'Escreva ✍️' : 'Write ✍️'}</span><span>${pt ? 'Confira ✔' : 'Check ✔'}</span><span>${pt ? 'De novo ✍️' : 'Again ✍️'}</span><span>✔</span></div>${words.map(w => `<div class="wr"><b>${esc(w)}</b><i></i><i class="sm"></i><i></i><i class="sm"></i></div>`).join('')}</div>`,
    trace: () => `${T('trace')}<div class="wk-trace">${words.slice(0, 6).map(w => `<div class="tr"><span class="dot">${esc(w)}</span><span class="dot">${esc(w)}</span><i></i></div>`).join('')}</div>`,
    search: () => { const P = makeWordSearch(words.filter(w => w.length <= 12).slice(0, 8), rng, true, L);
      return `${T('search')}<div class="wk-ws"><div class="g" style="--n:${P.size}">${P.g.flat().map(ch => `<span>${ch}</span>`).join('')}</div><div class="l">${P.placed.map(p => `<span>☐ ${esc(p.word)}</span>`).join('')}</div></div>`; },
    pyramid: () => `${T('pyramid')}<div class="wk-pyr">${words.slice(0, 4).map(w => `<div class="py"><b>${esc(w)}</b>${[...w].map((_, k) => `<i style="width:${(k + 1) * 1.15 + 1}em"></i>`).join('')}</div>`).join('')}</div>`,
    bubble: () => `${T('bubble')}<div class="wk-bub">${words.slice(0, 3).map(w => `<div class="bb"><span class="ex">${esc(w)}</span><i></i></div>`).join('')}</div>`,
    vowelcol: () => `${T('vowelcol')}<div class="wk-tbl vowelcol"><div class="leg">${pt ? 'Vogais' : 'Vowels'}: 🟥 · ${pt ? 'Consoantes' : 'Consonants'}: 🟦</div>${words.map(w => `<div class="wr"><b>${esc(w)}</b><i></i></div>`).join('')}</div>`,
    code: () => { const syms = rng.shuffle(['★', '♥', '◆', '●', '▲', '■', '☀', '☾', '♣', '♠', '✿', '⚡', '☂', '♪', '✚', '⬟', '❄', '✈', '⚑', '☯', '⌘', '✦', '♞', '☘', '⚓', '♛', '✪', '☎', '✂', '⌛', '⚙', '✉', '☕', '⚘', '♻', '⚖']);
      const letters = [...new Set(words.slice(0, 6).join('').toUpperCase().replace(/[^\p{L}]/gu, ''))].sort();
      const key = Object.fromEntries(letters.map((ch, k) => [ch, syms[k % syms.length] + (k >= syms.length ? "'" : '')]));
      return `${T('code')}<div class="wk-key">${letters.map(ch => `<span><b>${key[ch]}</b>=${ch}</span>`).join('')}</div><div class="wk-codes">${words.slice(0, 6).map(w => `<div class="cd"><span class="sy">${[...w.toUpperCase()].map(ch => key[ch] || ch).join(' ')}</span><i></i></div>`).join('')}</div>`; },
    scramble: () => `${T('scramble')}<div class="wk-tbl scr">${words.map(w => { let s = w.toLowerCase(); for (let k = 0; k < 6 && s === w.toLowerCase(); k++) s = rng.shuffle([...w.toLowerCase()]).join(''); return `<div class="wr"><b class="mono">${esc(s.split('').join(' '))}</b><i></i></div>`; }).join('')}</div>`,
    abc: () => `${T('abc')}<div class="wk-abc"><div class="ws">${rng.shuffle(words).map(w => `<span>${esc(w)}</span>`).join('')}</div><ol>${words.map(() => '<li><i></i></li>').join('')}</ol></div>`,
    silly: () => { const sh = rng.shuffle(words); const pairs = []; for (let k = 0; k + 1 < sh.length && pairs.length < 3; k += 2) pairs.push([sh[k], sh[k + 1]]);
      return `${T('silly')}<div class="wk-silly">${pairs.map(([a, b]) => `<div class="sl"><b>${esc(a)} + ${esc(b)}</b><i></i><i></i></div>`).join('')}</div>`; },
    draw: () => `${T('draw')}<div class="wk-draw">${words.slice(0, 4).map(w => `<div class="dw"><div class="box"></div><b>${esc(w)}</b><i></i></div>`).join('')}</div>`,
  };
  // monta as folhas medindo de verdade: cada atividade entra na folha atual se couber; senão abre outra
  const root = $('#print-root'); root.innerHTML = '';
  const head = k => `<header class="p-head"><div><div class="p-brand">✏️ ${pt ? 'Oficina de palavras' : 'Word workshop'}</div><div class="p-day">${esc(S.name)} · ${fmtDM(today())}<span class="pg-n"></span></div></div><div class="p-score">${pt ? 'Lápis de cor 🖍️' : 'Colour pencils 🖍️'}</div></header>`;
  let page = null;
  const newPage = () => { page = document.createElement('section'); page.className = 'page wk-page'; page.innerHTML = head(); root.appendChild(page); };
  acts.filter(a => blocks[a]).forEach(a => {
    if (!page) newPage();
    const blk = document.createElement('div'); blk.className = 'wk-blk'; blk.innerHTML = blocks[a]();
    page.appendChild(blk);
    if (page.scrollHeight > page.clientHeight + 1 && page.querySelectorAll('.wk-blk').length > 1) { page.removeChild(blk); newPage(); page.appendChild(blk); }
  });
  const all = $$('.wk-page', root);
  if (all.length > 1) all.forEach((pg, k) => { $('.pg-n', pg).textContent = ` · ${k + 1}/${all.length}`; });
  setTimeout(() => window.print(), 60);
}

/* ---------- Fase 4: 📜 Missões (3 do dia + 2 da semana, sorteadas com semente) ---------- */
const QDIFF = { easy: { label: 'Fácil', min: 5, max: 10 }, medium: { label: 'Média', min: 20, max: 30 }, hard: { label: 'Difícil', min: 50, max: 80 } };
// ev: evento que conta; target: quantas vezes; when: só sorteia se fizer sentido para este perfil
const QUEST_POOL = [
  // do dia
  { id: 'd-day', scope: 'day', diff: 'easy', icon: '📘', text: 'Conclua a tarefa de hoje', ev: 'day_ontime', target: 1, when: () => !!(S.week && S.week.days[today()] && S.week.days[today()].required && S.week.days[today()].status !== 'done') },
  { id: 'd-lesson', scope: 'day', diff: 'easy', icon: '❓', text: 'Use o ? para aprender algo novo', ev: 'lesson', target: 1, when: () => Server.ai },
  { id: 'd-read', scope: 'day', diff: 'easy', icon: '📖', text: 'Leia o texto do dia', ev: 'read', target: 1, when: () => !!(S.week && dayPassages(S.week.days[today()]).length) },
  { id: 'd-hint', scope: 'day', diff: 'easy', icon: '💡', text: 'Peça uma dica 💡 numa pergunta difícil', ev: 'hint', target: 1 },
  { id: 'd-extra1', scope: 'day', diff: 'easy', icon: '⭐', text: 'Faça 1 rodada de extras', ev: 'extra', target: 1 },
  { id: 'd-extra2', scope: 'day', diff: 'medium', icon: '⭐', text: 'Faça 2 rodadas de extras', ev: 'extra', target: 2 },
  { id: 'd-game2', scope: 'day', diff: 'medium', icon: '✏️', text: 'Jogue 2 jogos da Oficina de palavras', ev: 'game', target: 2 },
  { id: 'd-practice', scope: 'day', diff: 'medium', icon: '🎓', text: 'Acerte todo o treino de uma aulinha', ev: 'practice_perfect', target: 1, when: () => Server.ai },
  { id: 'd-book', scope: 'day', diff: 'medium', icon: '📚', text: 'Leia um capítulo do Livro extra', ev: 'book', target: 1, when: () => Server.ai },
  { id: 'd-perfect-x', scope: 'day', diff: 'hard', icon: '💯', text: 'Acerte 100% numa rodada de extras', ev: 'perfect_extra', target: 1 },
  { id: 'd-perfect-d', scope: 'day', diff: 'hard', icon: '🏆', text: 'Gabarite a tarefa de hoje (100%)', ev: 'perfect_day', target: 1, when: () => !!(S.week && S.week.days[today()] && S.week.days[today()].required && S.week.days[today()].status !== 'done') },
  { id: 'd-extra3', scope: 'day', diff: 'hard', icon: '🔥', text: 'Faça 3 rodadas de extras', ev: 'extra', target: 3 },
  // da semana
  { id: 'w-streak', scope: 'week', diff: 'medium', icon: '🔥', text: 'Mantenha a sequência por 3 dias', ev: 'streak', target: 3 },
  { id: 'w-lessons', scope: 'week', diff: 'medium', icon: '🎓', text: 'Faça 3 aulinhas', ev: 'lesson', target: 3, when: () => Server.ai },
  { id: 'w-games', scope: 'week', diff: 'medium', icon: '✏️', text: 'Jogue 5 jogos da Oficina de palavras', ev: 'game', target: 5 },
  { id: 'w-read', scope: 'week', diff: 'medium', icon: '📖', text: 'Leia 4 textos (do dia ou do Livro extra)', ev: 'read', target: 4 },
  { id: 'w-days', scope: 'week', diff: 'hard', icon: '📅', text: 'Conclua 5 tarefas no dia certo', ev: 'day_ontime', target: 5 },
  { id: 'w-extras', scope: 'week', diff: 'hard', icon: '⭐', text: 'Faça 6 rodadas de extras na semana', ev: 'extra', target: 6 },
  { id: 'w-perfect', scope: 'week', diff: 'hard', icon: '💯', text: 'Gabarite 2 tarefas ou rodadas de extras', ev: 'perfect_any', target: 2 },
];
const questsOn = () => S.settings.questsOn !== false;
function questSeed(scope) { return `${scope === 'day' ? today() : cycleStartOf(today())}|${Server.childId || S.name || 'eu'}`; }
function makeQuest(def, rng) {
  const d = QDIFF[def.diff];
  return { id: def.id, target: def.target, reward: rng.int(d.min, d.max), progress: 0, claimed: false };
}
// Missão de compra: "Compre N ovos hoje" — recompensa = valor gasto + 50 (a criança sempre sai ganhando)
function makeBuyQuest(rng) {
  const n = rng.int(1, 3);
  return { id: 'd-buy', buy: true, target: n, reward: 50, progress: 0, spent: 0, claimed: false, text: `Compre ${n} ovo${n > 1 ? 's' : ''} hoje (ganha o valor de volta + 50)` };
}
function ensureQuests() {
  if (!questsOn()) return null;
  S.quests = S.quests || {};
  const t = today(), ws = cycleStartOf(t);
  if (!S.quests.day || S.quests.day.date !== t) {
    const rng = makeRng('qd|' + questSeed('day'));
    const ok = QUEST_POOL.filter(q => q.scope === 'day' && (!q.when || q.when()));
    const pick = diff => { const l = ok.filter(q => q.diff === diff); return l.length ? rng.pick(l) : null; };
    const list = [pick('easy'), pick('medium'), pick('hard')].filter(Boolean).map(q => makeQuest(q, rng));
    if (S.settings.buyQuests !== false && rng.next() < 0.35 && list.length > 1) list[1] = makeBuyQuest(rng);
    S.quests.day = { date: t, list };
  }
  if (!S.quests.week || S.quests.week.start !== ws) {
    const rng = makeRng('qw|' + questSeed('week'));
    const ok = QUEST_POOL.filter(q => q.scope === 'week' && (!q.when || q.when()));
    const m = ok.filter(q => q.diff === 'medium'), h = ok.filter(q => q.diff === 'hard');
    S.quests.week = { start: ws, list: [m.length && rng.pick(m), h.length && rng.pick(h)].filter(Boolean).map(q => makeQuest(q, rng)) };
  }
  return S.quests;
}
const questDef = q => QUEST_POOL.find(x => x.id === q.id) || {};
function questText(q) { return q.text || questDef(q).text || q.id; }
function questProgress(q) { return questDef(q).ev === 'streak' ? Math.min(q.target, (S.streak && (S.streak.last === today() || S.streak.last === addDays(today(), -1))) ? S.streak.n : 0) : Math.min(q.target, q.progress || 0); }
function questReward(q) { return q.buy ? (q.spent || 0) + 50 : q.reward; }
// Chamado pelos pontos do app em que algo acontece (tarefa, extras, aulinha, leitura, jogos, compras).
function questEvent(ev, data = {}) {
  if (!questsOn()) return;
  const Q = ensureQuests(); if (!Q) return;
  const evs = [ev];
  if (ev === 'day_done') { if (data.onTime) evs.push('day_ontime'); if (data.perfect) evs.push('perfect_day', 'perfect_any'); }
  if (ev === 'extra_done') { evs.push('extra'); if (data.perfect) evs.push('perfect_extra', 'perfect_any'); if (data.book) evs.push('book', 'read'); }
  const done = [];
  [...Q.day.list, ...Q.week.list].forEach(q => {
    if (q.claimed) return;
    const before = questProgress(q);
    if (q.buy) { if (ev === 'buy' && data.cat === 'egg') { q.progress = (q.progress || 0) + 1; q.spent = (q.spent || 0) + (data.price || 0); } }
    else if (evs.includes(questDef(q).ev)) q.progress = (q.progress || 0) + 1;
    if (before < q.target && questProgress(q) >= q.target) done.push(q);
  });
  save();
  done.forEach(q => toast(`📜 Missão completa: ${questText(q)}! Resgate na tela inicial.`));
}
function claimQuest(scope, id) {
  const Q = ensureQuests(); const list = scope === 'day' ? Q.day.list : Q.week.list;
  const q = list.find(x => x.id === id); if (!q || q.claimed || questProgress(q) < q.target) return;
  const amt = questReward(q);
  q.claimed = true;
  addCoins(amt, `Missão: ${questText(q)}`, `quest-${scope}-${scope === 'day' ? Q.day.date : Q.week.start}-${q.id}`);
  save();
  if (typeof celebrateFX === 'function') celebrateFX('small');
  showCelebrate('Missão cumprida! 📜', `+${amt}`, `${esc(questText(q))}`, 'wow');
  if (currentScreen === 'home') renderHome();
}
function questsHtml() {
  const Q = ensureQuests(); if (!Q) return '';
  const row = (q, scope) => { const p = questProgress(q), d = questDef(q); const ready = !q.claimed && p >= q.target; const diff = q.buy ? 'medium' : d.diff;
    return `<div class="quest ${q.claimed ? 'claimed' : ''} ${ready ? 'ready' : ''}"><span class="q-ic">${q.buy ? '🥚' : d.icon || '📜'}</span>
      <div class="q-main"><div class="q-t">${esc(questText(q))}</div><div class="q-bar"><i style="width:${Math.round(p / q.target * 100)}%"></i></div></div>
      <div class="q-side"><span class="q-rw d-${diff}">+${q.buy ? `${(q.spent || 0) + 50}` : q.reward} 🪙</span>
      ${q.claimed ? '<span class="tiny muted">✔ resgatada</span>' : ready ? `<button class="btn small gold" data-claim="${scope}|${q.id}">Resgatar</button>` : `<span class="tiny muted">${p}/${q.target}</span>`}</div></div>`; };
  return `<div class="card span2 quests"><div class="row"><b>📜 Missões</b><span class="tiny muted grow">fácil +5–10 · média +20–30 · difícil +50–80</span></div>
    <div class="q-sec">Hoje</div>${Q.day.list.map(q => row(q, 'day')).join('')}
    <div class="q-sec">Esta semana</div>${Q.week.list.map(q => row(q, 'week')).join('')}</div>`;
}

/* ---------- Fase 5: 💌 Recadinhos secretos dos pais ---------- */
// Os textos ficam no servidor, fora do estado da criança: ela só recebe um recadinho quando compra o envelope.
SHOP_CATS.splice(SHOP_CATS.findIndex(c => c.id === 'voucher'), 0, { id: 'note', label: '💌 Recadinho secreto' });
const notePrice = () => Math.max(1, Number(S.settings.notePrice) || 500);
function envelopeSVG(cls = '') {
  return `<div class="env ${cls}"><div class="env-back"></div><div class="env-letter"><span>💌</span></div><div class="env-front"></div><div class="env-flap"></div><div class="env-heart">❤</div></div>`;
}
async function refreshNoteStatus() {
  if (!Server.me || !Server.childId) { VIEW.noteAvail = 0; return 0; }
  try { VIEW.noteAvail = (await apiCall(`/api/children/${Server.childId}/notes/status`)).available; } catch (e) { VIEW.noteAvail = VIEW.noteAvail ?? 0; }
  return VIEW.noteAvail;
}
function noteShopHtml() {
  const n = VIEW.noteAvail;
  const opened = (S.notesOpened || []).length;
  const soon = n === 0;
  return `<div class="item note-item ${soon ? 'soon' : ''}"><div class="pic">${envelopeSVG('idle')}</div><div class="nm">Recadinho secreto</div>
    <div class="tiny muted">${n == null ? 'Procurando recadinhos…' : soon ? 'Em breve! Seus pais ainda vão escrever.' : 'Um recadinho dos seus pais, só para você. Nunca repete.'}</div>
    <div class="pr">🪙 ${notePrice()}</div>
    <div class="item-act">${soon ? '<button class="btn small" disabled>Em breve 💌</button>' : `<button class="btn small primary" data-note-buy ${n == null ? 'disabled' : ''}>Comprar envelope</button>`}</div></div>
    <div class="item note-item mine"><div class="pic" style="font-size:42px">📬</div><div class="nm">Meus recadinhos</div><div class="tiny muted">${opened ? `${opened} aberto${opened > 1 ? 's' : ''}` : 'Ainda nenhum'}</div><div class="item-act"><button class="btn small" data-act="mynotes">Ler de novo</button></div></div>`;
}
async function buyNote() {
  const price = notePrice();
  if (S.coins < price) { say(`Faltam <b>${price - Math.max(0, S.coins)}</b> moedas para o recadinho secreto. 💌`, { mood: 'think' }); return; }
  const ok = await confirmBox('Comprar o recadinho?', `Um envelope secreto por <b>🪙 ${price}</b>?`, 'Comprar 💌');
  if (!ok) return;
  let r;
  try { r = await apiCall(`/api/children/${Server.childId}/notes/open`, { method: 'POST', data: {} }); }
  catch (e) { toast(e.status === 404 ? 'Os recadinhos acabaram por enquanto. 💌' : 'Não consegui abrir agora. Tente de novo.'); refreshNoteStatus().then(() => currentScreen === 'shop' && renderShop()); return; }
  addCoins(-price, 'Lojinha: Recadinho secreto', 'note-' + r.note.id);
  S.notesOpened = [Object.assign({}, r.note), ...(S.notesOpened || []).filter(x => x.id !== r.note.id)];
  save();
  questEvent('buy', { cat: 'note', price });
  VIEW.noteAvail = Math.max(0, (VIEW.noteAvail || 1) - 1);
  if (currentScreen === 'shop') renderShop();
  openEnvelope(r.note);
}
function noteCard(n) {
  return `<div class="note-paper"><div class="note-text">${esc(n.text).replace(/\n/g, '<br>')}</div><div class="note-from">💛 ${esc(n.from || 'Seus pais')} · ${new Date(n.openedAt || Date.now()).toLocaleDateString('pt-BR')}</div></div>`;
}
function openEnvelope(n) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const m = openModal(`<div class="modal-body env-stage">${envelopeSVG('closed')}<div class="env-reveal hidden">${noteCard(n)}</div></div>
    <div class="modal-foot" style="justify-content:center"><button class="btn" data-mine>📬 Meus recadinhos</button><button class="btn primary" data-close>💛 Guardar</button></div>`);
  const env = $('.env', m);
  const show2 = () => { env.classList.add('gone'); $('.env-reveal', m).classList.remove('hidden'); if (typeof celebrateFX === 'function') celebrateFX('hearts'); };
  $('[data-mine]', m).onclick = () => { closeModal(); show('notes'); };
  if (reduce) { show2(); return; }
  setTimeout(() => env.classList.add('open'), 500);
  setTimeout(() => env.classList.add('rise'), 1200);
  setTimeout(show2, 2000);
}
function renderNotes() {
  const el = $('#scr-notes');
  const list = S.notesOpened || [];
  el.innerHTML = `<div class="collection"><div class="card"><div class="row wrap"><h3 class="grow" style="margin:0">💌 Meus recadinhos</h3><button class="btn small" data-act="toshop">💌 Comprar envelope</button></div>
    <p class="tiny muted" style="margin:4px 0 0">Os recadinhos que você já abriu ficam guardados aqui.</p></div>
    ${list.length ? list.map(n => `<div class="card">${noteCard(n)}</div>`).join('') : '<div class="card"><p class="muted">Você ainda não abriu nenhum recadinho. Eles ficam na lojinha, em 💌 Recadinho secreto.</p></div>'}</div>`;
  $('[data-act=toshop]', el).onclick = () => { VIEW.shopCat = 'note'; show('shop'); };
}
// Aba dos pais: um recadinho por vez, cada filho com os seus
async function pNotes(box) {
  const kids = (Server.me && Server.me.children) || [];
  if (!kids.length) { box.innerHTML = '<p class="muted">Os recadinhos precisam do servidor (conta da família).</p>'; return; }
  if (!VIEW.noteKid || !kids.some(k => k.id === VIEW.noteKid)) VIEW.noteKid = Server.childId || kids[0].id;
  box.innerHTML = '<p class="muted">Carregando…</p>';
  let notes = [];
  try { notes = (await apiCall(`/api/children/${VIEW.noteKid}/notes`)).notes; }
  catch (e) { box.innerHTML = `<div class="notice bad">${esc(e.message)}</div><button class="btn" id="nrel">Digitar a senha de novo</button>`; $('#nrel', box).onclick = () => { VIEW.parentsUnlocked = false; show('parents'); }; return; }
  const kid = kids.find(k => k.id === VIEW.noteKid);
  const waiting = notes.filter(n => !n.openedAt).length;
  box.innerHTML = `<div class="card"><b>💌 Recadinhos secretos</b>
      <p class="tiny muted" style="margin:4px 0">Escreva recadinhos para cada filho. Eles ficam guardados em segredo: a criança só lê quando compra o envelope na lojinha (🪙 ${notePrice()}, ajustável em Ajustes). Cada compra sorteia um recadinho ainda não lido, sem repetir.</p>
      ${kids.length > 1 ? `<div class="seg small">${kids.map(k => `<button data-nk="${k.id}" class="${k.id === VIEW.noteKid ? 'on' : ''}">${k.avatar || '🦉'} ${esc(k.name)}</button>`).join('')}</div>` : ''}
      <div style="margin-top:8px"><textarea id="n-text" maxlength="1000" rows="3" placeholder="Para ${esc(kid.name)}: ex.: Tenho muito orgulho de você! Vale um sorvete comigo no sábado. 🍦" style="width:100%;padding:8px;border-radius:10px;border:1.5px solid var(--line);font:inherit"></textarea>
      <div class="row"><span class="tiny muted grow">${waiting} guardado${waiting === 1 ? '' : 's'} · ${notes.length - waiting} já aberto${notes.length - waiting === 1 ? '' : 's'}</span><button class="btn small primary" id="n-add">Guardar recadinho</button></div></div></div>
    <div class="card"><b>Recadinhos de ${esc(kid.name)}</b><div style="display:grid;gap:6px;margin-top:6px">
      ${notes.length ? notes.slice().reverse().map(n => `<div class="pnote ${n.openedAt ? 'opened' : ''}"><div class="grow">${esc(n.text).replace(/\n/g, '<br>')}<div class="tiny muted">${n.openedAt ? `✅ Comprado e lido em ${new Date(n.openedAt).toLocaleDateString('pt-BR')} ${new Date(n.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '🔒 Guardado (ainda não comprado)'} · por ${esc(n.from || '')}</div></div>
        ${n.openedAt ? '' : `<button class="btn small" data-ndel="${n.id}" aria-label="Apagar">✕</button>`}</div>`).join('') : '<p class="muted">Nenhum recadinho ainda.</p>'}</div></div>`;
  $$('[data-nk]', box).forEach(b => b.onclick = () => { VIEW.noteKid = b.dataset.nk; pNotes(box); });
  $('#n-add', box).onclick = async () => { const t = $('#n-text', box).value; if (!t.trim()) return;
    try { await apiCall(`/api/children/${VIEW.noteKid}/notes`, { method: 'POST', data: { text: t } }); toast('Recadinho guardado 💌'); pNotes(box); } catch (e) { toast(e.message); } };
  $$('[data-ndel]', box).forEach(b => b.onclick = async () => { if (!(await confirmBox('Apagar recadinho?', 'Ele ainda não foi lido.', 'Apagar', true))) return;
    try { await apiCall(`/api/children/${VIEW.noteKid}/notes/${b.dataset.ndel}`, { method: 'DELETE' }); pNotes(box); } catch (e) { toast(e.message); } });
}

/* ---------- Fase 6: confete ao gabaritar + 🎉 Reações (dancinhas, musiquinhas, confetes) ---------- */
SHOP_CATS.splice(SHOP_CATS.findIndex(c => c.id === 'bg'), 0, { id: 'react', label: '🎉 Reações' });
SHOP_ITEMS.push(
  // dancinhas do mascote (só movimentos)
  { id: 're-dance-jump', cat: 'react', sub: 'dance', name: 'Pulinhos', price: 300, emoji: '🦘' },
  { id: 're-dance-spin', cat: 'react', sub: 'dance', name: 'Giro', price: 400, emoji: '🌀' },
  { id: 're-dance-robot', cat: 'react', sub: 'dance', name: 'Dança do robô', price: 500, emoji: '🤖' },
  { id: 're-dance-macarena', cat: 'react', sub: 'dance', name: 'Dancinha estilo Macarena', price: 600, emoji: '💃' },
  { id: 're-dance-moon', cat: 'react', sub: 'dance', name: 'Moonwalk', price: 800, emoji: '🕺' },
  // musiquinhas originais (Web Audio)
  { id: 're-mus-fanfare', cat: 'react', sub: 'music', name: 'Fanfarra da vitória', price: 250, emoji: '🎺' },
  { id: 're-mus-bells', cat: 'react', sub: 'music', name: 'Sininhos mágicos', price: 250, emoji: '🔔' },
  { id: 're-mus-arcade', cat: 'react', sub: 'music', name: 'Fliperama', price: 300, emoji: '🕹️' },
  { id: 're-mus-robot', cat: 'react', sub: 'music', name: 'Bip-bop do robô', price: 300, emoji: '📟' },
  { id: 're-mus-harp', cat: 'react', sub: 'music', name: 'Harpa das estrelas', price: 400, emoji: '🪕' },
  // confetes
  { id: 're-conf-stars', cat: 'react', sub: 'confetti', name: 'Chuva de estrelas', price: 300, emoji: '⭐' },
  { id: 're-conf-hearts', cat: 'react', sub: 'confetti', name: 'Corações', price: 300, emoji: '💖' },
  { id: 're-conf-rainbow', cat: 'react', sub: 'confetti', name: 'Arco-íris', price: 400, emoji: '🌈' },
  { id: 're-conf-fireworks', cat: 'react', sub: 'confetti', name: 'Fogos de artifício', price: 500, emoji: '🎆' },
);
const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const soundOn = () => S.settings.sound !== false;
/* Confete em canvas, saindo do mascote */
function confettiBurst(style = 'classic', origin = null, amount = 1) {
  if (reducedMotion()) return;
  const cv = document.createElement('canvas'); cv.className = 'fx-canvas';
  const W = cv.width = innerWidth * (devicePixelRatio || 1), H = cv.height = innerHeight * (devicePixelRatio || 1);
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  document.body.appendChild(cv);
  const g = cv.getContext('2d'); const k = devicePixelRatio || 1;
  const o = origin || (() => { const el = $('#modal:not(.hidden) .owl-big svg') || $('#mascot-btn'); const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 }; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })();
  const COLORS = ['#ff6b6b', '#ffd43b', '#51cf66', '#339af0', '#cc5de8', '#ff922b', '#f783ac'];
  const RAIN = ['#ff6b6b', '#ff922b', '#ffd43b', '#51cf66', '#339af0', '#5c7cfa', '#cc5de8'];
  const P = []; const N = Math.round((style === 'fireworks' ? 0 : 90) * amount);
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.3, sp = (6 + Math.random() * 9) * k;
    P.push({ x: o.x * k, y: o.y * k, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: (5 + Math.random() * 6) * k, rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
      c: style === 'rainbow' ? RAIN[i % RAIN.length] : style === 'stars' ? ['#ffd43b', '#fcc419', '#fff3bf', '#ffe066'][i % 4] : style === 'hearts' ? ['#ff6b9a', '#f06595', '#e64980', '#ffa8c5'][i % 4] : COLORS[i % COLORS.length], life: 1 });
  }
  if (style === 'fireworks') for (let b = 0; b < 4; b++) { const cx = (.2 + Math.random() * .6) * W, cy = (.15 + Math.random() * .35) * H, col = COLORS[b * 2 % COLORS.length], delay = b * 18;
    for (let i = 0; i < 40 * amount; i++) { const a = i / 40 * Math.PI * 2, sp = (3 + Math.random() * 4) * k; P.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3 * k, c: col, life: 1, delay, spark: true }); } }
  const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  const heart = (x, y, r) => { g.beginPath(); g.moveTo(x, y + r * .7); g.bezierCurveTo(x - r * 1.4, y - r * .2, x - r * .6, y - r * 1.2, x, y - r * .4); g.bezierCurveTo(x + r * .6, y - r * 1.2, x + r * 1.4, y - r * .2, x, y + r * .7); g.fill(); };
  let frame = 0;
  const tick = () => {
    frame++; g.clearRect(0, 0, W, H); let alive = 0;
    P.forEach(p => {
      if (p.delay && frame < p.delay) { alive++; return; }
      p.vy += (p.spark ? .06 : .32) * k; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.rot += p.vr || 0; p.life -= p.spark ? .018 : .006;
      if (p.life <= 0 || p.y > H + 40) return; alive++;
      g.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6)); g.fillStyle = p.c;
      if (style === 'stars') star(p.x, p.y, p.r); else if (style === 'hearts') heart(p.x, p.y, p.r);
      else if (p.spark) { g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.3); g.fill(); }
      else { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); g.restore(); }
    });
    if (alive && frame < 260) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}
/* Musiquinhas originais (melodias próprias, 2–4 s) */
let AC = null;
const MELODIES = {
  // [frequência em Hz (0 = pausa), duração em batidas]
  're-mus-fanfare': { wave: 'triangle', bpm: 300, notes: [[523, 1], [659, 1], [784, 1], [1047, 2], [784, 1], [1047, 3]] },
  're-mus-bells': { wave: 'sine', bpm: 360, notes: [[1319, 1], [1568, 1], [2093, 1], [1568, 1], [1760, 1], [2349, 1], [2637, 3]] },
  're-mus-arcade': { wave: 'square', bpm: 420, notes: [[392, 1], [523, 1], [659, 1], [784, 1], [659, 1], [784, 1], [1047, 1], [1319, 3]] },
  're-mus-robot': { wave: 'square', bpm: 260, notes: [[220, 1], [0, 1], [330, 1], [220, 1], [440, 1], [0, 1], [660, 2]] },
  're-mus-harp': { wave: 'sine', bpm: 480, notes: [[523, 1], [659, 1], [784, 1], [988, 1], [1175, 1], [1319, 1], [1568, 1], [1976, 1], [2093, 4]] },
  default: { wave: 'triangle', bpm: 340, notes: [[659, 1], [784, 1], [1047, 2]] },
};
function playMelody(id) {
  if (!soundOn()) return;
  const m = MELODIES[id] || MELODIES.default;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    let t = AC.currentTime + .05; const beat = 60 / m.bpm;
    m.notes.forEach(([f, d]) => {
      if (f) { const o = AC.createOscillator(), gn = AC.createGain(); o.type = m.wave; o.frequency.value = f;
        gn.gain.setValueAtTime(.0001, t); gn.gain.exponentialRampToValueAtTime(.18, t + .02); gn.gain.exponentialRampToValueAtTime(.0001, t + d * beat * .95);
        o.connect(gn).connect(AC.destination); o.start(t); o.stop(t + d * beat); }
      t += d * beat;
    });
  } catch (e) { /* sem áudio */ }
}
/* Dancinhas: classes CSS no SVG do mascote (braços são grupos .arm-l/.arm-r) */
const DANCE_CLASS = { 're-dance-jump': 'dance-jump', 're-dance-spin': 'dance-spin', 're-dance-robot': 'dance-robot', 're-dance-macarena': 'dance-macarena', 're-dance-moon': 'dance-moon' };
function danceOn(svg, id) {
  if (!svg || !DANCE_CLASS[id] || reducedMotion()) return;
  const cls = DANCE_CLASS[id];
  svg.classList.remove(...Object.values(DANCE_CLASS)); void svg.getBoundingClientRect(); svg.classList.add(cls);
  setTimeout(() => svg.classList.remove(cls), 4200);
}
// kind: 'perfect' (gabaritou: confete equipado + dança + música), 'small'/'big' (missões, ovos), 'hearts' (recadinho)
function celebrateFX(kind = 'small', only = null) {
  const eq = S.equipped || {};
  const conf = only ? (only.sub === 'confetti' ? only.id : null) : eq.confetti;
  const style = kind === 'hearts' ? 'hearts' : ({ 're-conf-stars': 'stars', 're-conf-hearts': 'hearts', 're-conf-rainbow': 'rainbow', 're-conf-fireworks': 'fireworks' })[conf] || 'classic';
  if (!only || only.sub === 'confetti') confettiBurst(style, null, kind === 'small' ? .6 : kind === 'big' || kind === 'perfect' ? 1.3 : 1);
  if (kind === 'perfect' || (only && only.sub === 'dance')) danceOn($('#modal:not(.hidden) .owl-big svg') || $('.shop-preview svg') || $('#mascot-btn svg'), only ? only.id : eq.dance);
  if (kind === 'perfect' || (only && only.sub === 'music')) playMelody(only ? only.id : eq.music);
}
function reactCard(it) {
  const owned = S.owned.includes(it.id); const on = (S.equipped || {})[it.sub] === it.id;
  const subL = { dance: 'Dancinha', music: 'Musiquinha', confetti: 'Confete' }[it.sub];
  return `<div class="item react-item ${owned ? 'owned' : ''}"><div class="pic react-pic">${it.emoji}</div><div class="nm">${esc(it.name)}</div><div class="tiny muted">${subL}</div><div class="pr">🪙 ${it.price}</div>
    <div class="item-act"><button class="btn small" data-test="${it.id}">▶ Testar</button>${!owned ? `<button class="btn small primary" data-buy="${it.id}">Comprar</button>` : on ? `<button class="btn small ok" data-runequip="${it.id}">Usando ✔</button>` : `<button class="btn small" data-requip="${it.id}">Usar</button>`}</div></div>`;
}

/* ---------- Fase 7: 🪄 Varinha mágica — preencher a semana pelo currículo de referência ---------- */
// Calendário letivo: início do ano e semanas de férias (os pais ajustam em Ajustes). Semanas de férias não contam.
const DEFAULT_SCHOOL_START = '2026-08-03';
const DEFAULT_HOLIDAYS = [
  { from: '2026-10-12', to: '2026-10-16', label: 'Feriado de outubro / half-term' },
  { from: '2026-12-14', to: '2027-01-29', label: 'Férias de verão' },
  { from: '2027-02-08', to: '2027-02-12', label: 'Carnaval' },
  { from: '2027-03-29', to: '2027-04-02', label: 'Semana Santa' },
];
function mondayOf(d) { const dt = new Date(d + 'T12:00:00'); const wd = (dt.getDay() + 6) % 7; return addDays(d, -wd); }
function isHolidayWeek(mon, hol) { const mid = addDays(mon, 2); return (hol || []).some(h => h.from && h.to && mid >= h.from && mid <= h.to); }
function academicWeekOf(date) {
  const start = mondayOf(S.settings.schoolStart || DEFAULT_SCHOOL_START);
  const hol = S.settings.holidays || DEFAULT_HOLIDAYS;
  const mon = mondayOf(date);
  if (mon < start) return 1;
  let w = 0;
  for (let d = start; d <= mon; d = addDays(d, 7)) if (!isHolidayWeek(d, hol)) w++;
  return clamp(w || 1, 1, 37);
}
// semana letiva da semana que está sendo planejada (o ciclo do app vai de sábado a sexta)
function planningAcademicWeek() {
  const t = today(); const start = VIEW.setupCycle === 'next' ? addDays(cycleStartOf(t), 7) : cycleStartOf(t);
  return academicWeekOf(addDays(start, 2));
}
const stageDir = y => ({ primary: 'primary', ks3: 'ks3', igcse: 'igcse', ib: 'ib' })[stageOf(y)];
async function curriculumRows(year, week, subs) {
  const spec = subs.map(id => `${id}${stageOf(year) === 'ib' && id !== 'tok' ? ':' + ((S.settings.ibLevels || {})[id] || 'sl').toLowerCase() : ''}`);
  if (Server.on) {
    try { return (await apiCall(`/api/curriculum?year=${year}&week=${week}&subjects=${encodeURIComponent(spec.join(','))}`)).rows; } catch (e) { /* cai para os arquivos estáticos */ }
  }
  VIEW.curCache = VIEW.curCache || {};
  const st = stageDir(year);
  if (!VIEW.curCache[st]) VIEW.curCache[st] = await (await fetch(`curriculum/${st}.json`)).json();
  return spec.map(x => { const [subject, level] = x.split(':');
    const f = VIEW.curCache[st].find(f => f.year === year && f.subject === subject && (f.level || '') === (level || '')) || VIEW.curCache[st].find(f => f.year === year && f.subject === subject);
    const w = f && f.weeks.find(w => w.academic_week === week);
    return w ? Object.assign({ year, subject, level: f.level || null, source: f.source }, w) : null; }).filter(Boolean);
}
function wandText(row, sid) {
  const pt = SUBJ[sid].lang === 'pt';
  const head = row.type === 'review' ? (pt ? '🔁 Revisão: ' : '🔁 Review: ') : row.type === 'exam' ? (pt ? '📝 Semana de provas: ' : '📝 Exam week: ') : '';
  if (isSpell(sid) && (row.spelling || []).length) return `${row.spelling.join(', ')}\n(${pt ? 'Tema' : 'Pattern'}: ${head}${row.topic})`;
  return `${head}${row.topic}\n${pt ? 'Objetivos' : 'Objectives'}: ${row.objectives.join('; ')}\n${pt ? 'Palavras-chave' : 'Key words'}: ${row.keywords.join(', ')}`;
}
async function useWand(week) {
  const year = S.settings.year;
  if (!year) { say('Primeiro escolha o <b>ano escolar</b>. 🎓', { mood: 'think' }); return; }
  const w = clamp(week || planningAcademicWeek(), 1, 37);
  const subs = mySubjects();
  const stop = showLoading(['Agitando a varinha… 🪄', 'Procurando a semana no currículo… 📚']);
  let rows = [];
  try { rows = await curriculumRows(year, w, subs); } catch (e) { stop(); say('Não consegui abrir o currículo agora. Tente de novo. 🙂', { mood: 'sad' }); return; }
  stop();
  const ai = currentScreen === 'setup' && Server.ai && VIEW.setupMode !== 'subjects';
  if (!ai && $('#scr-setup textarea[data-sid]')) collectDraft();
  const filled = [];
  rows.forEach(r => {
    const sid = r.subject; if (!SUBJ[sid]) return;
    const txt = wandText(r, sid);
    if (ai) { VIEW.draftSubj = VIEW.draftSubj || {}; VIEW.draftSubj[sid] = txt; VIEW.draftOpt = VIEW.draftOpt || {}; if (isSpell(sid) && (r.spelling || []).length) VIEW.draftOpt[sid] = 'list'; }
    else { if (!VIEW.draftTopics) VIEW.draftTopics = {}; VIEW.draftTopics[sid] = txt; }
    filled.push(sid);
  });
  const r0 = rows[0];
  VIEW.wand = { week: w, filled, missing: subs.filter(id => !filled.includes(id)), term: r0 && r0.term, wot: r0 && r0.week_of_term, auto: w === planningAcademicWeek() };
  if (ai) { VIEW.openSubj = {}; renderSetupAI(); } else renderSetup();
  if (!filled.length) say('Não achei essa semana no currículo de referência para as suas matérias. 🤔', { mood: 'think' });
}
function wandBarHtml() {
  const v = VIEW.wand;
  const btn = `<button type="button" class="btn small wand-btn" data-act="wand">🪄 Preencher pela varinha</button>`;
  if (!v) return `<div class="wand-bar">${btn}<span class="tiny muted">Preenche cada matéria com o conteúdo da semana letiva ${S.settings.year ? planningAcademicWeek() : ''} (currículo de referência).</span></div>`;
  return `<div class="wand-bar on"><div class="row wrap"><b>🪄 Semana letiva</b>
      <span class="wk-nav"><button type="button" class="btn small" data-wk="-1" aria-label="Semana anterior" ${v.week <= 1 ? 'disabled' : ''}>◂</button><b>semana ${v.week}</b><button type="button" class="btn small" data-wk="1" aria-label="Próxima semana" ${v.week >= 37 ? 'disabled' : ''}>▸</button></span>
      <span class="tiny muted">${v.term ? `term ${v.term}, semana ${v.wot}` : ''}${v.auto ? ' · pelo calendário' : ''}</span></div>
    <div class="tiny">É um <b>currículo de referência</b>: confira e ajuste ao que a escola realmente passou. Escola adiantada ou atrasada? Use ◂ ▸.${v.missing.length ? ` <span class="muted">Sem referência para: ${v.missing.map(id => SUBJ[id].short).join(', ')}.</span>` : ''}</div></div>`;
}
function bindWand(el) {
  const b = $('[data-act=wand]', el); if (b) b.onclick = () => useWand();
  $$('[data-wk]', el).forEach(x => x.onclick = () => useWand((VIEW.wand ? VIEW.wand.week : planningAcademicWeek()) + Number(x.dataset.wk)));
}
// Ajustes dos pais: calendário escolar
function calendarSettingsHtml(st) {
  const hol = st.holidays || DEFAULT_HOLIDAYS;
  return `<div class="card"><b>📅 Calendário escolar (para a 🪄 varinha)</b>
    <div class="form-grid" style="margin-top:6px"><label class="field">Início do ano letivo<input type="date" id="s-sstart" value="${esc(st.schoolStart || DEFAULT_SCHOOL_START)}"></label></div>
    <div class="tiny muted" style="margin:4px 0">Semanas de férias (não contam como semana letiva). Hoje: <b>semana letiva ${academicWeekOf(today())}</b>.</div>
    <div id="hol-list" style="display:grid;gap:6px">${hol.map((h, i) => `<div class="row wrap hol-row"><input type="date" data-hf="${i}" value="${esc(h.from)}"><span>até</span><input type="date" data-ht="${i}" value="${esc(h.to)}"><input data-hl="${i}" value="${esc(h.label || '')}" placeholder="nome" class="grow"><button class="btn small" data-hdel="${i}" aria-label="Remover">✕</button></div>`).join('')}</div>
    <div class="row" style="margin-top:6px"><button class="btn small" id="hol-add">+ Semana de férias</button><button class="btn small" id="hol-reset">↺ Padrão 2026–27</button></div></div>`;
}
function readHolidays(box) {
  return $$('.hol-row', box).map(r => ({ from: $('[data-hf]', r).value, to: $('[data-ht]', r).value, label: $('[data-hl]', r).value.trim() })).filter(h => h.from && h.to && h.from <= h.to);
}
function bindCalendarSettings(box, rerender) {
  $$('[data-hdel]', box).forEach(b => b.onclick = () => { S.settings.holidays = readHolidays(box).filter((_, i) => i !== Number(b.dataset.hdel)); touch('settings'); save(); rerender(); });
  $('#hol-add', box).onclick = () => { S.settings.holidays = [...readHolidays(box), { from: today(), to: addDays(today(), 4), label: 'Férias' }]; touch('settings'); save(); rerender(); };
  $('#hol-reset', box).onclick = () => { S.settings.holidays = DEFAULT_HOLIDAYS.map(h => Object.assign({}, h)); S.settings.schoolStart = DEFAULT_SCHOOL_START; touch('settings'); save(); rerender(); };
}
// Admin: currículo no SQLite (recarregar, ver e editar uma linha)
async function adminCurriculumHtml() {
  let st = {}; try { st = await apiCall('/api/admin/curriculum'); } catch (e) { st = { error: e.message }; }
  return `<div class="card" id="cur-admin"><b>📚 Currículo de referência (varinha)</b>
    <div class="tiny muted" style="margin:4px 0">${st.error ? esc(st.error) : `${st.rows} semanas · ${st.files} arquivos · versão ${esc(st.version || '—')} · ${st.edited || 0} editadas no admin${st.seededAt ? ` · carregado em ${new Date(st.seededAt).toLocaleString('pt-BR')}` : ''}`}</div>
    <div class="row wrap"><button class="btn small" id="cur-seed">🔄 Recarregar currículo</button><span class="tiny muted">(não apaga as linhas editadas aqui)</span></div>
    <div class="row wrap" style="margin-top:8px"><select id="cur-y">${SCHOOL_YEARS.map(y => `<option value="${y[0]}" ${y[0] === (VIEW.curY || 'Y5') ? 'selected' : ''}>${y[1]}</option>`).join('')}</select>
      <select id="cur-s"><option>…</option></select><input type="number" id="cur-w" min="1" max="37" value="${VIEW.curW || 1}" style="width:64px"><button class="btn small" id="cur-load">Ver</button></div>
    <div id="cur-row" style="margin-top:6px"></div></div>`;
}
function bindAdminCurriculum(box) {
  const loadSubs = async () => { VIEW.curY = $('#cur-y', box).value; let r = { subjects: [] }; try { r = await apiCall(`/api/admin/curriculum?year=${VIEW.curY}`); } catch (e) { /* ignora */ }
    $('#cur-s', box).innerHTML = r.subjects.map(s => `<option value="${s.subject}:${s.level || ''}">${SUBJ[s.subject] ? SUBJ[s.subject].name : s.subject}${s.level ? ' ' + s.level.toUpperCase() : ''}</option>`).join(''); };
  $('#cur-y', box).onchange = loadSubs; loadSubs();
  $('#cur-seed', box).onclick = async () => { try { const r = await apiCall('/api/admin/curriculum/seed', { method: 'POST', data: {}, timeout: 120000 }); toast(`Currículo recarregado: ${r.rows} semanas`); pAdmin($('#pbody')); } catch (e) { toast(e.message); } };
  $('#cur-load', box).onclick = async () => {
    const [subject, level] = $('#cur-s', box).value.split(':'); VIEW.curW = Number($('#cur-w', box).value) || 1;
    let r; try { r = await apiCall(`/api/admin/curriculum?year=${VIEW.curY}&subject=${subject}&level=${level || ''}&week=${VIEW.curW}`); } catch (e) { toast(e.message); return; }
    const row = r.row; const out = $('#cur-row', box);
    if (!row) { out.innerHTML = '<p class="muted">Semana não encontrada.</p>'; return; }
    out.innerHTML = `<div class="tiny muted">${esc(row.source || '')} · term ${row.term}, semana ${row.week_of_term} · ${row.type}${row.edited ? ' · ✏️ editada' : ''}</div>
      <label class="field">Tópico<input id="cr-topic" value="${esc(row.topic)}"></label>
      <label class="field">Objetivos (um por linha)<textarea id="cr-obj" rows="3">${esc(row.objectives.join('\n'))}</textarea></label>
      <label class="field">Palavras-chave (uma por linha)<textarea id="cr-kw" rows="2">${esc(row.keywords.join('\n'))}</textarea></label>
      <label class="field">Spelling (uma por linha)<textarea id="cr-sp" rows="2">${esc((row.spelling || []).join('\n'))}</textarea></label>
      <button class="btn small primary" id="cr-save">Salvar linha</button>`;
    $('#cr-save', box).onclick = async () => { try { await apiCall('/api/admin/curriculum', { method: 'PUT', data: { year: VIEW.curY, subject, level: level || '', week: VIEW.curW, topic: $('#cr-topic', box).value,
      objectives: $('#cr-obj', box).value.split('\n'), keywords: $('#cr-kw', box).value.split('\n'), spelling: $('#cr-sp', box).value.split('\n') } }); toast('Linha salva ✏️'); } catch (e) { toast(e.message); } };
  };
}

/* ---------- Fase 8: 💬 botão discreto de dúvida / sugestão / problema ---------- */
const APP_VERSION = '2026.10.24';
const FB_KINDS = [['duvida', '❓ Dúvida'], ['sugestao', '💡 Sugestão'], ['problema', '🐞 Problema']];
function openFeedback() {
  if (!VIEW.fbKind) VIEW.fbKind = 'duvida';
  const m = openModal(`<div class="modal-head"><h3>💬 Fale com a gente</h3><button class="btn small" data-close>Fechar</button></div>
    <div class="modal-body fb-body">
      <div class="seg fb-kinds">${FB_KINDS.map(([k, l]) => `<button type="button" data-fk="${k}" class="${VIEW.fbKind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <textarea id="fb-text" maxlength="2000" rows="6" placeholder="Conte o que aconteceu, a sua dúvida ou a sua ideia…"></textarea>
      <div class="row tiny muted"><span class="grow">${Server.me ? 'A mensagem vai para o administrador do app.' : 'Sem servidor: vamos abrir o seu e-mail.'}</span><span id="fb-count">0/2000</span></div>
    </div>
    <div class="modal-foot"><span class="grow"></span><button class="btn primary" id="fb-send">Enviar</button></div>`);
  const ta = $('#fb-text', m); ta.focus();
  ta.oninput = () => { $('#fb-count', m).textContent = `${ta.value.length}/2000`; };
  $$('[data-fk]', m).forEach(b => b.onclick = () => { VIEW.fbKind = b.dataset.fk; $$('[data-fk]', m).forEach(x => x.classList.toggle('on', x === b)); });
  $('#fb-send', m).onclick = async () => {
    const text = ta.value.trim();
    if (text.length < 3) { toast('Escreva a sua mensagem. 🙂'); return; }
    if (!Server.me) { location.href = `mailto:carloscurioni@gmail.com?subject=${encodeURIComponent('[Lumi] ' + FB_KINDS.find(k => k[0] === VIEW.fbKind)[1])}&body=${encodeURIComponent(text)}`; closeModal(); return; }
    const btn = $('#fb-send', m); btn.disabled = true;
    try {
      await apiCall('/api/feedback', { method: 'POST', data: { kind: VIEW.fbKind, text, screen: currentScreen, version: APP_VERSION, childId: Server.childId || null } });
      closeModal(); toast('Mensagem enviada. Obrigado! 💜');
    } catch (e) { btn.disabled = false; toast(e.message); }
  };
}
// Admin: aba 💬 Mensagens (marcar como resolvida) + e-mail de atendimento
async function pMessages(box) {
  box.innerHTML = '<p class="muted">Carregando…</p>';
  let r, st;
  try { [r, st] = await Promise.all([apiCall(`/api/admin/feedback${VIEW.fbAll ? '?all=1' : ''}`), apiCall('/api/admin/settings')]); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const label = Object.fromEntries(FB_KINDS);
  box.innerHTML = `<div class="card"><b>📮 E-mail de atendimento</b>
      <div class="row wrap" style="margin-top:6px"><input id="fb-mail" type="email" value="${esc(st.support_email)}" class="grow" style="padding:6px;border-radius:8px;border:1.5px solid var(--line)"><button class="btn small primary" id="fb-mail-save">Salvar</button></div>
      <div class="tiny muted">${r.resend ? '✅ Envio de e-mail ligado (Resend).' : '⚠️ Sem RESEND_API_KEY: as mensagens ficam só aqui. Veja o README para ligar o e-mail.'}</div></div>
    <div class="card"><div class="row"><b class="grow">💬 Mensagens (${r.items.length})</b><label class="tiny"><input type="checkbox" id="fb-all" ${VIEW.fbAll ? 'checked' : ''}> mostrar resolvidas</label></div>
      ${r.items.map(f => `<div class="review-item ${f.resolved ? 'fb-done' : ''}"><div class="meta">${new Date(f.created).toLocaleString('pt-BR')} · ${label[f.kind] || f.kind} · ${esc(f.family_name || '')} · ${esc(f.who || '')} · tela ${esc(f.screen || '')} · v${esc(f.app_version || '')}${f.emailed ? ' · 📧 enviado' : ''}</div>
        <div class="ans" style="white-space:pre-wrap">${esc(f.text)}</div>
        <div class="row"><button class="btn small" data-fbres="${f.id}" data-v="${f.resolved ? 0 : 1}">${f.resolved ? '↺ Reabrir' : '✔ Resolvida'}</button></div></div>`).join('') || '<p class="tiny muted">Nenhuma mensagem.</p>'}</div>`;
  $('#fb-all', box).onchange = e => { VIEW.fbAll = e.target.checked; pMessages(box); };
  $('#fb-mail-save', box).onclick = async () => { try { await apiCall('/api/admin/settings', { method: 'PUT', data: { support_email: $('#fb-mail', box).value } }); toast('E-mail salvo'); } catch (e) { toast(e.message); } };
  $$('[data-fbres]', box).forEach(b => b.onclick = async () => { try { await apiCall(`/api/admin/feedback/${b.dataset.fbres}`, { method: 'POST', data: { resolved: b.dataset.v === '1' } }); pMessages(box); } catch (e) { toast(e.message); } });
}

/* ---------- Área dos pais ---------- */
function renderParents() {
  const el = $('#scr-parents');
  if (!VIEW.parentsUnlocked && Server.me) {
    el.innerHTML = `<div class="parents"><div class="card" style="max-width:380px;margin:20px auto;width:100%;text-align:center"><h3 style="margin:4px 0 8px">🔒 Área dos pais</h3>
      <p class="muted tiny">Digite a senha do responsável (${esc(Server.me.parent.email)}).</p>
      <input class="pin-input" id="ppw" type="password" autocomplete="current-password" style="letter-spacing:normal;font-size:18px">
      <button class="btn primary wide" style="margin-top:10px" id="ppw-go">Entrar</button></div></div>`;
    const go = async () => {
      try { const r = await apiCall('/api/auth/verify', { method: 'POST', data: { password: $('#ppw').value } });
        if (r.ok) { VIEW.parentsUnlocked = true; renderParents(); } else { toast('Senha incorreta'); $('#ppw').value = ''; } }
      catch (e) { toast(e.message); }
    };
    $('#ppw-go').onclick = go; $('#ppw').onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => $('#ppw') && $('#ppw').focus(), 50);
    return;
  }
  if (!VIEW.parentsUnlocked) {
    el.innerHTML = `<div class="parents"><div class="card" style="max-width:360px;margin:20px auto;width:100%;text-align:center">
      <h3 style="margin:4px 0 8px">🔒 Área dos pais</h3><p class="muted tiny">Digite o PIN (padrão: 1234 — troque em Ajustes).</p>
      <input class="pin-input" id="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off">
      <button class="btn primary wide" style="margin-top:10px" id="pin-go">Entrar</button></div></div>`;
    const go = () => { if ($('#pin').value === String(S.settings.pin)) { VIEW.parentsUnlocked = true; renderParents(); } else { toast('PIN incorreto'); $('#pin').value = ''; } };
    $('#pin-go').onclick = go; $('#pin').onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => $('#pin') && $('#pin').focus(), 50);
    return;
  }
  const tabs = [['review', '📝 Correção'], ['coins', '🪙 Moedas'], ['vouchers', '🎟️ Vales'], ['settings', '⚙️ Ajustes'], ['data', '📥 Dados']];
  if (Server.me) tabs.push(['notes', '💌 Recadinhos'], ['family', '👨‍👩‍👧 Família']);
  if (Server.me && Server.me.parent.role === 'admin') tabs.push(['admin', '🛠️ Admin'], ['msgs', '💬 Mensagens']);
  if (!tabs.some(t => t[0] === VIEW.parentTab)) VIEW.parentTab = 'review';
  const kid = currentChild();
  el.innerHTML = `<div class="parents">${kid ? `<div class="tiny muted">Perfil aberto: <b>${kid.avatar || ''} ${esc(kid.name)}</b> — Correção, Moedas, Vales, Ajustes e Dados valem para este perfil.</div>` : ''}<div class="row wrap"><div class="tabs grow">${tabs.map(([k, l]) => `<button data-ptab="${k}" class="${VIEW.parentTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <button class="btn small" id="lock">Sair</button></div><div class="parents-body" id="pbody"></div></div>`;
  $$('[data-ptab]', el).forEach(b => b.onclick = () => { VIEW.parentTab = b.dataset.ptab; renderParents(); });
  $('#lock').onclick = () => { VIEW.parentsUnlocked = false; show('home'); };
  ({ review: pReview, coins: pCoins, vouchers: pVouchers, settings: pSettings, data: pData, family: pFamily, admin: pAdmin, notes: pNotes, msgs: pMessages })[VIEW.parentTab]($('#pbody'));
}
function pReview(box) {
  const w = S.week;
  if (!w) { box.innerHTML = '<p class="muted">Nenhuma semana planejada ainda.</p>'; return; }
  const req = requiredDays(w);
  const summary = req.map(d => {
    const r = d.result;
    return `<div class="row"><b style="width:90px">${DOW_LABEL[d.dow]} ${fmtDM(d.date)}</b><span class="grow">${d.status === 'done' ? `${d.recovered ? '⏳ recuperada' : '✅'} ${r.correct}/${r.total} objetivas${r.open ? ` · ${r.open} livres` : ''}` : dayState(d) === 'late' ? '⏰ atrasada' : dayState(d) === 'locked' ? '🔒 ainda não abriu' : '📘 pendente'}</span></div>`;
  }).join('');
  const opens = [];
  req.forEach(d => d.questions.forEach(q => { if (q.type === 'open' && (answered(q, d.answers[q.id]) || (d.verdicts && d.verdicts[q.id] === 'open'))) opens.push({ d, q }); }));
  const list = opens.map(({ d, q }) => {
    const mk = (d.marks || {})[q.id];
    return `<div class="review-item"><div class="meta">${DOW_LABEL[d.dow]} ${fmtDM(d.date)} · ${SUBJ[q.subject].icon} ${esc(SUBJ[q.subject].name)}</div>
      <div><b>${esc(q.q)}</b></div><div class="ans">${answered(q, d.answers[q.id]) ? esc(d.answers[q.id]) : '<i>(feita no papel — confira a folha)</i>'}${d.via === 'photo' && answered(q, d.answers[q.id]) ? ' <span class="tiny muted">(lido da foto)</span>' : ''}</div>
      ${d.verdicts && ['ok', 'bad'].includes(d.verdicts[q.id]) ? `<div class="tiny"><b>🦉 Lumi: ${d.verdicts[q.id] === 'ok' ? '✓ certo' : '✗ precisa melhorar'}</b>${d.notes && d.notes[q.id] ? ` — ${esc(d.notes[q.id])}` : ''}</div>` : ''}
      <div class="row"><button class="btn small ${mk === 'ok' ? 'ok' : ''}" data-mark="ok" data-d="${d.date}" data-q="${q.id}">✓ Certo</button>
      <button class="btn small ${mk === 'no' ? 'danger' : ''}" data-mark="no" data-d="${d.date}" data-q="${q.id}">↺ Refazer/conversar</button></div></div>`;
  }).join('');
  box.innerHTML = `<div class="card"><b>Semana ${fmtDM(w.start)}–${fmtDM(w.end)}</b> ${w.settled ? `· ${w.settled === 'delivered' ? 'entregue ✔' : w.settled === 'missed' ? 'não entregue ✗' : ''}` : ''}<div style="margin-top:6px;display:grid;gap:3px">${summary}</div></div>
    <h3 style="margin:6px 0 0">Respostas livres (${opens.length}) <span class="tiny muted">— a Lumi corrige; vocês podem confirmar ou mudar</span></h3>${list || '<p class="muted">Nada para corrigir ainda.</p>'}
    ${S.history.length ? `<div class="card"><b>Histórico</b>${S.history.slice(0, 8).map(h => `<div class="tiny">${fmtDM(h.start)}–${fmtDM(h.end)}: ${h.done}/${h.total} dias · ${h.settled === 'delivered' ? 'entregue' : h.settled === 'missed' ? 'não entregue' : '—'}${h.recovered ? ` · ${h.recovered} recuperado${h.recovered > 1 ? 's' : ''}` : ''}</div>`).join('')}</div>` : ''}`;
  $$('[data-mark]', box).forEach(b => b.onclick = () => { const d = S.week.days[b.dataset.d]; d.marks = d.marks || {}; d.marks[b.dataset.q] = b.dataset.mark; save(); pReview(box); });
}
function pCoins(box) {
  box.innerHTML = `<div class="card"><div class="row"><b class="grow">Saldo atual: 🪙 ${S.coins}</b></div>
    <div class="form-grid" style="margin-top:8px"><label class="field">Quantidade (+ ou −)<input id="adj-n" type="number" step="1" value="10"></label>
    <label class="field">Motivo<input id="adj-r" placeholder="Ex.: ajudou em casa"></label></div>
    <button class="btn primary" id="adj-go" style="margin-top:8px">Lançar</button></div>
    <div class="card"><b>Extrato</b><div class="ledger" style="margin-top:6px">${S.ledger.slice(0, 40).map(l => `<div><span class="tiny muted" style="min-width:82px">${new Date(l.date).toLocaleDateString('pt-BR')}</span><span class="grow">${esc(l.reason)}</span><span class="amt ${l.amount >= 0 ? 'plus' : 'minus'}">${l.amount >= 0 ? '+' : ''}${l.amount}</span></div>`).join('') || '<span class="muted">Sem lançamentos.</span>'}</div></div>`;
  $('#adj-go').onclick = () => { const n = Math.round(Number($('#adj-n').value)); if (!n) return; addCoins(n, 'Pais: ' + ($('#adj-r').value.trim() || 'ajuste')); toast('Lançado'); pCoins(box); };
}
function pVouchers(box) {
  const pend = S.redemptions.filter(r => !r.delivered);
  box.innerHTML = `<div class="card"><b>Vales resgatados aguardando entrega (${pend.length})</b>${pend.map(r => `<div class="row" style="margin-top:6px"><span class="grow">${fmtDM(r.date)} · ${esc(r.name)} (🪙 ${r.price})</span><button class="btn small ok" data-deliv="${r.id}">Entregue ✔</button></div>`).join('') || '<p class="muted tiny">Nenhum.</p>'}</div>
    <div class="card"><b>Vales da lojinha</b><p class="muted tiny" style="margin:2px 0 6px">Prêmios reais que vocês combinam. Edite nome e preço.</p>
    <div id="vlist" style="display:grid;gap:6px">${S.vouchers.map((v, i) => `<div class="row"><input class="grow" data-vn="${i}" value="${esc(v.name)}" style="padding:6px;border-radius:8px;border:1.5px solid var(--line)"><input type="number" data-vp="${i}" value="${v.price}" style="width:80px;padding:6px;border-radius:8px;border:1.5px solid var(--line)"><button class="btn small" data-vdel="${i}">✕</button></div>`).join('')}</div>
    <div class="row" style="margin-top:8px"><button class="btn small" id="vadd">+ Novo vale</button><button class="btn small primary" id="vsave">Salvar vales</button></div></div>`;
  $$('[data-deliv]', box).forEach(b => b.onclick = () => { const r = S.redemptions.find(x => x.id === b.dataset.deliv); r.delivered = true; save(); pVouchers(box); });
  const collect = () => { $$('[data-vn]', box).forEach(inp => { S.vouchers[inp.dataset.vn].name = inp.value.trim() || 'Vale'; }); $$('[data-vp]', box).forEach(inp => { S.vouchers[inp.dataset.vp].price = Math.max(1, Math.round(Number(inp.value) || 1)); }); };
  $$('[data-vdel]', box).forEach(b => b.onclick = () => { collect(); S.vouchers.splice(Number(b.dataset.vdel), 1); touch('vouchers'); save(); pVouchers(box); });
  $('#vadd').onclick = () => { collect(); S.vouchers.push({ id: 'v-' + uid(), name: 'Novo vale', price: 200 }); touch('vouchers'); save(); pVouchers(box); };
  $('#vsave').onclick = () => { collect(); touch('vouchers'); save(); toast('Vales salvos'); };
}
function pSettings(box) {
  const st = S.settings;
  box.innerHTML = `<div class="card"><b>Economia de moedas</b><div class="form-grid" style="margin-top:6px">
      <label class="field">Recompensa da semana entregue<input type="number" id="s-reward" value="${st.reward}"></label>
      <label class="field">Penalidade (semana não entregue)<input type="number" id="s-penalty" value="${st.penalty}"></label>
      <label class="field">Recuperação atrasada vale (% da recompensa)<input type="number" id="s-late" value="${latePct()}"></label>
      <label class="field">Moedas por tarefa do dia (0 desliga)<input type="number" id="s-dayc" value="${st.dayCoins ?? 10}"></label>
      <label class="field">Som das musiquinhas<select id="s-sound"><option value="1" ${st.sound !== false ? 'selected' : ''}>🔊 Ligado</option><option value="0" ${st.sound === false ? 'selected' : ''}>🔇 Desligado</option></select></label>
      <label class="field">💌 Preço do recadinho secreto<input type="number" id="s-notep" value="${notePrice()}"></label>
      <label class="field">📜 Missões<select id="s-quests"><option value="1" ${st.questsOn !== false ? 'selected' : ''}>Ligadas</option><option value="0" ${st.questsOn === false ? 'selected' : ''}>Desligadas</option></select></label>
      <label class="field">Missões de compra (ganha o gasto + 50)<select id="s-bquests"><option value="1" ${st.buyQuests !== false ? 'selected' : ''}>Ligadas</option><option value="0" ${st.buyQuests === false ? 'selected' : ''}>Desligadas</option></select></label>
      <label class="field">Moedas por acerto nos extras<input type="number" id="s-xpc" value="${st.extraPerCorrect}"></label>
      <label class="field">Perguntas por rodada de extras<input type="number" id="s-xsize" value="${st.extraSetSize}"></label>
      <label class="field">Rodadas de extras com moedas/dia<input type="number" id="s-xsets" value="${st.extraSetsPerDay}"></label>
      <label class="field">Moedas por jogo da Oficina de palavras<input type="number" id="s-wkc" value="${st.workshopCoins ?? 3}"></label>
      <label class="field">Jogos da Oficina com moedas/dia<input type="number" id="s-wkd" value="${st.workshopPerDay ?? 5}"></label></div>
      <p class="tiny muted">Valores de uma semana completa (7 dias): se a semana começar no meio, a recompensa e a penalidade são proporcionais aos dias obrigatórios. A penalidade precisa ser maior que a recompensa. Dias não feitos podem ser recuperados até a sexta seguinte: recuperar todos vale essa % da recompensa (0 = sem recuperação).</p></div>
    <div class="card"><b>Tarefas</b><div class="form-grid" style="margin-top:6px">
      ${Server.me ? '' : `<label class="field">Nome<input id="s-name" value="${esc(S.name)}"></label>`}
      <label class="field">Quantidade por dia<select id="s-cmode"><option value="auto" ${st.countMode !== 'manual' ? 'selected' : ''}>Automática (por matéria)</option><option value="manual" ${st.countMode === 'manual' ? 'selected' : ''}>Manual (números abaixo)</option></select></label>
      <label class="field">Perguntas de cada matéria por dia (automático)<input type="number" id="s-per" value="${st.perSubject || 2}"></label>
      <label class="field">Leitura diária (capítulo do livro da semana)<select id="s-dread"><option value="1" ${st.dailyReading ? 'selected' : ''}>Ligada</option><option value="0" ${!st.dailyReading ? 'selected' : ''}>Desligada</option></select></label>
      <label class="field">Nível padrão da leitura<select id="s-rlevel">${READ_LEVELS.map(([k, l]) => `<option value="${k}" ${(st.readLevel || 'at') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">A Lumi lê as aulinhas em voz alta<select id="s-avoice"><option value="1" ${st.autoVoice ? 'selected' : ''}>Sim, sozinha</option><option value="0" ${!st.autoVoice ? 'selected' : ''}>Só no 🔊</option></select></label>
      <label class="field">Mínimo de perguntas/dia<input type="number" id="s-min" value="${st.minPerDay}"></label>
      <label class="field">Máximo de perguntas/dia<input type="number" id="s-max" value="${st.maxPerDay}"></label>
      <label class="field">Gabarito<select id="s-gab"><option value="1" ${st.gabaritoAfterFinish ? 'selected' : ''}>Libera depois de concluir</option><option value="0" ${!st.gabaritoAfterFinish ? 'selected' : ''}>Sempre disponível</option></select></label>
      <label class="field">Voz (ditado)<select id="s-voice"><option value="1" ${st.voice ? 'selected' : ''}>Ligada</option><option value="0" ${!st.voice ? 'selected' : ''}>Desligada</option></select></label>
      ${Server.me ? '' : '<label class="field">Novo PIN dos pais<input id="s-pin" inputmode="numeric" maxlength="8" placeholder="(manter)"></label>'}</div>
      <div style="margin-top:6px"><b class="tiny">Perguntas padrão por dia</b><div class="counts" style="margin-top:4px">${CYCLE.map(dk => `<label class="count-box"><div class="lbl">${DOW_LABEL[dk]}</div><input type="number" data-dc="${dk}" value="${st.counts[dk]}" style="width:44px;text-align:center;border:1.5px solid var(--line);border-radius:6px"></label>`).join('')}</div></div></div>
    ${calendarSettingsHtml(st)}
    <button class="btn primary" id="s-save">Salvar ajustes</button>
    <button class="btn" id="s-tour">Rever o tutorial da Lumi</button>`;
  $('#s-save').onclick = () => {
    const num = (id, d) => { const v = Math.round(Number($(id).value)); return Number.isFinite(v) ? v : d; };
    const reward = Math.max(0, num('#s-reward', st.reward)), penalty = num('#s-penalty', st.penalty);
    if (penalty <= reward) { toast('A penalidade precisa ser MAIOR que a recompensa.'); return; }
    Object.assign(st, {
      reward, penalty, latePct: clamp(num('#s-late', latePct()), 0, 100), dayCoins: clamp(num('#s-dayc', st.dayCoins ?? 10), 0, 100), questsOn: $('#s-quests').value === '1', notePrice: clamp(num('#s-notep', notePrice()), 1, 100000), sound: $('#s-sound').value === '1', buyQuests: $('#s-bquests').value === '1', extraPerCorrect: Math.max(0, num('#s-xpc', st.extraPerCorrect)), extraSetSize: clamp(num('#s-xsize', st.extraSetSize), 3, 12),
      extraSetsPerDay: clamp(num('#s-xsets', st.extraSetsPerDay), 0, 10), minPerDay: clamp(num('#s-min', st.minPerDay), 1, 15), maxPerDay: clamp(num('#s-max', st.maxPerDay), 3, 40),
      workshopCoins: clamp(num('#s-wkc', st.workshopCoins ?? 3), 0, 50), workshopPerDay: clamp(num('#s-wkd', st.workshopPerDay ?? 5), 0, 20),
      countMode: $('#s-cmode').value, perSubject: clamp(num('#s-per', st.perSubject || 2), 1, 4), dailyReading: $('#s-dread').value === '1',
      readLevel: $('#s-rlevel').value, autoVoice: $('#s-avoice').value === '1',
      gabaritoAfterFinish: $('#s-gab').value === '1', voice: $('#s-voice').value === '1',
    });
    if (st.maxPerDay < st.minPerDay) st.maxPerDay = st.minPerDay;
    $$('[data-dc]', box).forEach(inp => { st.counts[inp.dataset.dc] = clamp(Math.round(Number(inp.value) || 0), 0, st.maxPerDay); });
    const pin = ($('#s-pin') || { value: '' }).value.trim(); if (pin) st.pin = pin;
    const nm = ($('#s-name') || { value: '' }).value.trim(); if (nm) S.name = nm;
    if ($('#s-sstart').value) st.schoolStart = $('#s-sstart').value;
    st.holidays = readHolidays(box);
    touch('settings'); save(); toast('Ajustes salvos');
  };
  $('#s-tour').onclick = () => { show('home'); setTimeout(runTour, 300); };
  bindCalendarSettings(box, () => pSettings(box));
}
function pData(box) {
  const topics = S.week ? S.week.topics : S.lastTopics;
  const st = { ok: '🟢 Conectado ao servidor', offline: '🟠 Servidor fora do ar — salvando só neste aparelho', auth: '🔴 Sessão expirada', local: '⚪ Sem servidor — dados só neste aparelho' }[Server.me ? Server.status : 'local'];
  box.innerHTML = `<div class="card"><b>Servidor</b><div style="margin:4px 0">${st}</div>
      ${Server.me ? `<div class="tiny">Conta: ${esc(Server.me.parent.email)} · família ${esc(Server.me.family.name)} · Claude ${Server.ai ? '✅ ligado' : '❌ sem chave'}</div>
      <div class="row wrap" style="margin-top:6px"><button class="btn small" id="sv-sync">🔄 Sincronizar agora</button><button class="btn small" id="sv-switch">👤 Trocar de perfil</button></div>` : ''}</div>
    <div class="card"><b>1. Importar perguntas prontas (opcional)</b>
      <p class="tiny muted" style="margin:2px 0 6px">Copie o prompt (já com os tópicos da semana), cole no Claude junto com o Study Worksheet, e cole aqui o JSON que ele devolver.
      As perguntas importadas entram primeiro; o gerador do app completa o resto.</p>
      <button class="btn small" id="cp-prompt">📋 Copiar prompt para o Claude</button>
      <label class="field" style="margin-top:8px">JSON das perguntas<textarea id="imp-json" placeholder='{"questions":[ ... ]}'></textarea></label>
      <button class="btn primary small" id="imp-go">Importar perguntas</button><div id="imp-msg" class="tiny" style="margin-top:6px"></div></div>
    <div class="card"><b>2. Backup</b><p class="tiny muted" style="margin:2px 0 6px">${Server.me ? 'Cópia dos dados deste perfil (os dados já ficam guardados no servidor).' : 'Os dados ficam só neste navegador. Faça backup para trocar de aparelho.'}</p>
      <div class="row wrap"><button class="btn small" id="bk-exp">⬇️ Baixar backup</button><label class="btn small">⬆️ Restaurar backup<input type="file" id="bk-imp" accept="application/json,.json" hidden></label></div></div>
    <div class="card"><b>3. Zerar</b><div class="row wrap" style="margin-top:6px"><button class="btn small" id="rs-week">Apagar a semana atual</button><button class="btn small danger" id="rs-all">Apagar TUDO</button></div></div>`;
  if (Server.me) {
    $('#sv-sync').onclick = async () => { await pushState(); toast(Server.status === 'ok' ? 'Sincronizado ✔' : 'Não consegui sincronizar'); pData(box); };
    $('#sv-switch').onclick = () => switchProfile();
  }
  $('#cp-prompt').onclick = async () => {
    const p = claudePrompt(topics || {});
    try { await navigator.clipboard.writeText(p); toast('Prompt copiado!'); }
    catch (e) { $('#imp-json').value = p; toast('Copie o texto da caixa abaixo'); }
  };
  $('#imp-go').onclick = () => {
    const msg = $('#imp-msg');
    let data;
    try { const raw = $('#imp-json').value.trim().replace(/^```(json)?/i, '').replace(/```$/, ''); data = JSON.parse(raw); }
    catch (e) { msg.innerHTML = '<span style="color:var(--bad)">JSON inválido. Confira se copiou tudo, do { ao }.</span>'; return; }
    let res;
    try { res = validateImported(data); } catch (e) { msg.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; return; }
    if (!res.ok.length) { msg.innerHTML = `<span style="color:var(--bad)">Nenhuma pergunta válida.</span> ${esc(res.errs.slice(0, 5).join('; '))}`; return; }
    const w = S.week;
    if (w && !w.settled) {
      w.imported = (w.imported || []).concat(res.ok);
      const redo = Object.values(w.days).filter(d => d.required && d.status !== 'done' && !dayStarted(d) && d.date >= today()).map(d => d.date);
      regenerateDays(w, redo, '|' + uid());
      msg.innerHTML = `✅ ${res.ok.length} perguntas importadas. ${redo.length} dia(s) ainda não começados foram refeitos.` + (res.errs.length ? ` <span class="muted">${res.errs.length} ignorada(s).</span>` : '');
    } else {
      S.pendingImport = (S.pendingImport || []).concat(res.ok);
      msg.innerHTML = `✅ ${res.ok.length} perguntas guardadas. Elas entram quando a próxima semana for planejada.` + (res.errs.length ? ` <span class="muted">${res.errs.length} ignorada(s).</span>` : '');
    }
    save();
  };
  $('#bk-exp').onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `lumi-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#bk-imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const s = JSON.parse(await f.text()); if (typeof s !== 'object' || !('coins' in s)) throw new Error(); if (!(await confirmBox('Restaurar backup?', 'Isso substitui todos os dados atuais.', 'Restaurar', true))) return; const rev = S.rev; S = normalizeState(s); S.rev = rev; if (Server.me) { const k = currentChild(); if (k) S.name = k.name; } save(); applyTheme(); renderCoins(); toast('Backup restaurado'); renderParents(); }
    catch (err) { toast('Arquivo de backup inválido'); }
  };
  $('#rs-week').onclick = async () => { if (await confirmBox('Apagar a semana atual?', 'As tarefas e respostas desta semana serão perdidas. As moedas ficam.', 'Apagar', true)) { S.week = null; save(); toast('Semana apagada'); } };
  $('#rs-all').onclick = async () => {
    const kid = currentChild();
    const what = kid ? `Moedas, compras, semanas e ajustes de <b>${esc(kid.name)}</b> serão apagados (o perfil continua).` : 'Moedas, compras, semanas e ajustes serão apagados deste navegador.';
    if (!(await confirmBox('Apagar TUDO?', `${what} Não dá para desfazer.`, 'Apagar tudo', true))) return;
    if (kid) {
      try { clearTimeout(Server.timer); Server.dirty = false; await apiCall(`/api/children/${kid.id}/state`, { method: 'DELETE' }); }
      catch (e) { toast(`Não consegui apagar no servidor: ${e.message}`); return; }
      try { localStorage.removeItem(localKey(kid.id)); } catch (e) { /* ignora */ }
      VIEW.parentsUnlocked = false; enterChild(kid.id); return;
    }
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignora */ }
    location.reload();
  };
}

/* ---------- Área dos pais: Família (contas) e Admin ---------- */
const usd = n => 'US$ ' + (Number(n) || 0).toFixed(2);
async function pFamily(box) {
  box.innerHTML = '<p class="muted">Carregando…</p>';
  let fam;
  try { await refreshMe(); fam = await apiCall('/api/family'); } catch (e) { box.innerHTML = `<p class="muted">Sem conexão com o servidor (${esc(e.message)}).</p>`; return; }
  const me = Server.me;
  const usageOf = id => fam.usage.find(u => u.id === id) || { today_usd: 0, month_usd: 0, month_calls: 0 };
  box.innerHTML = `
    <div class="card"><b>👧 Crianças da família ${esc(me.family.name)}</b>
      <div class="kid-list">${me.children.map(c => { const u = usageOf(c.id); return `<details class="kid" data-id="${c.id}">
        <summary><span class="pf-av">${c.avatar || '🦉'}</span><b>${esc(c.name)}</b><span class="tiny muted grow">${esc((SCHOOL_YEARS.find(y => y[0] === c.year) || [])[1] || '')} · Lumi hoje ${usd(u.today_usd)} · mês ${usd(u.month_usd)}</span><span class="tiny">editar ▾</span></summary>
        <div class="form-grid"><label class="field">Nome<input data-f="name" value="${esc(c.name)}" maxlength="30"></label>
        <label class="field">Ano escolar<select data-f="year">${yearOptions(c.year)}</select></label>
        <label class="field">Novo PIN <span class="tiny muted">(deixe vazio para manter)</span><input data-f="pin" inputmode="numeric" maxlength="4" autocomplete="off"></label></div>
        ${avatarPicker(c.avatar)}
        <div class="row wrap"><button class="btn small primary" data-save>Salvar</button><button class="btn small danger" data-del>Apagar perfil e dados</button></div></details>`; }).join('')}</div>
      <button class="btn small" id="f-add">＋ Adicionar criança</button></div>
    <div class="card"><b>👨‍👩‍👧 Responsáveis</b>
      ${fam.parents.map(p => `<div class="row tiny"><span class="grow"><b>${esc(p.name)}</b> · ${esc(p.email)}${p.role === 'admin' ? ' · admin' : ''}</span><span class="muted">${p.last_login ? 'último acesso ' + new Date(p.last_login).toLocaleDateString('pt-BR') : ''}</span></div>`).join('')}
      <button class="btn small" id="f-invite" style="margin-top:6px">✉️ Convidar outro responsável</button><div id="f-invite-out"></div></div>
    <div class="card"><b>🔑 Minha senha</b><div class="form-grid" style="margin-top:6px">
      <label class="field">Senha atual<input id="f-old" type="password" autocomplete="current-password"></label>
      <label class="field">Nova senha (mín. 8)<input id="f-new" type="password" autocomplete="new-password"></label></div>
      <button class="btn small primary" id="f-pw">Trocar senha</button></div>
    <div class="card"><b>🚩 Relatar um problema</b><p class="tiny muted" style="margin:2px 0 6px">Viu alguma resposta estranha ou inadequada da Lumi? Conte aqui: o administrador recebe o aviso.</p>
      <textarea id="f-rep" class="report-ta" placeholder="O que aconteceu?"></textarea><button class="btn small" id="f-rep-go">Enviar aviso</button></div>
    <div class="card"><b>🔐 Privacidade</b>
      <p class="tiny muted" style="margin:2px 0 6px">Os dados de cada criança ficam num cofre separado no servidor. Veja o <a href="/privacidade.html" target="_blank" rel="noopener">Aviso de Privacidade</a>.</p>
      <div class="row wrap"><button class="btn small" id="f-export">⬇️ Baixar todos os dados da família</button><button class="btn small" id="f-switch">👤 Trocar de perfil</button><button class="btn small" id="f-logout">Sair da conta</button>
      ${me.parent.role === 'admin' ? '' : '<button class="btn small danger" id="f-delete">Apagar a conta da família</button>'}</div></div>`;
  $$('details.kid', box).forEach(d => {
    const st = { avatar: (me.children.find(c => c.id === d.dataset.id) || {}).avatar };
    bindAvatar(d, st);
    $('[data-save]', d).onclick = async () => {
      const data = { name: $('[data-f=name]', d).value, year: $('[data-f=year]', d).value, avatar: st.avatar };
      const pin = $('[data-f=pin]', d).value.trim(); if (pin) data.pin = pin;
      try { await apiCall(`/api/family/children/${d.dataset.id}`, { method: 'PATCH', data }); toast('Salvo ✔');
        if (d.dataset.id === Server.childId) { S.name = data.name.trim() || S.name; S.settings.year = data.year; save(); }
        pFamily(box); } catch (e) { toast(e.message); }
    };
    $('[data-del]', d).onclick = async () => {
      const kid = me.children.find(c => c.id === d.dataset.id);
      if (!(await confirmBox(`Apagar ${esc(kid.name)}?`, 'O perfil e TODOS os dados desta criança (semanas, moedas, compras) serão apagados para sempre.', 'Continuar', true))) return;
      const pw = await promptPassword(); if (!pw) return;
      try { await apiCall(`/api/family/children/${kid.id}`, { method: 'DELETE', data: { password: pw } }); toast('Perfil apagado');
        try { localStorage.removeItem(localKey(kid.id)); } catch (e) { /* ignora */ }
        if (kid.id === Server.childId) { Server.childId = null; rememberChild(''); await refreshMe(); afterLogin(); return; }
        pFamily(box); } catch (e) { toast(e.message); }
    };
  });
  $('#f-add').onclick = () => { VIEW.parentsUnlocked = false; VIEW.auth = { mode: 'addchild' }; show('login'); };
  $('#f-invite').onclick = async () => {
    try { const r = await apiCall('/api/family/invite-parent', { method: 'POST', data: {} });
      $('#f-invite-out').innerHTML = linkBox(r.link, r.expires, `Convite para entrar na família ${me.family.name} no app Estudos com a Lumi`); bindShare(box); } catch (e) { toast(e.message); }
  };
  $('#f-pw').onclick = async () => {
    try { await apiCall('/api/auth/password', { method: 'POST', data: { old: $('#f-old').value, new: $('#f-new').value } }); toast('Senha trocada ✔'); $('#f-old').value = $('#f-new').value = ''; }
    catch (e) { toast(e.message); }
  };
  $('#f-rep-go').onclick = async () => {
    const t = $('#f-rep').value.trim(); if (!t) return;
    try { await apiCall('/api/report', { method: 'POST', data: { childId: Server.childId, kind: 'pais', text: t } }); $('#f-rep').value = ''; toast('Aviso enviado. Obrigado!'); } catch (e) { toast(e.message); }
  };
  $('#f-export').onclick = async () => {
    try { const data = await apiCall('/api/family/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `lumi-familia-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast(e.message); }
  };
  $('#f-switch').onclick = () => switchProfile();
  $('#f-logout').onclick = () => logout();
  const del = $('#f-delete');
  if (del) del.onclick = async () => {
    if (!(await confirmBox('Apagar a conta da família?', 'Todos os responsáveis, crianças e dados serão apagados para sempre. Não dá para desfazer.', 'Continuar', true))) return;
    const pw = await promptPassword(); if (!pw) return;
    try { await apiCall('/api/family', { method: 'DELETE', data: { password: pw } });
      try { Object.keys(localStorage).filter(k => k.startsWith(STORE_KEY)).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignora */ }
      Server.me = null; Server.childId = null; rememberChild(''); VIEW.parentsUnlocked = false; VIEW.auth = { mode: 'login' }; show('login'); toast('Conta apagada.');
    } catch (e) { toast(e.message); }
  };
}
function promptPassword() {
  return new Promise(res => {
    const c = openModal(`<div class="modal-head"><h3>Confirme com a sua senha</h3></div><div class="modal-body"><input class="pin-input" id="pp2" type="password" autocomplete="current-password" style="letter-spacing:normal;font-size:18px"></div>
      <div class="modal-foot"><button class="btn" data-no>Cancelar</button><button class="btn danger" data-yes>Apagar</button></div>`, { onClose: () => res('') });
    $('[data-no]', c).onclick = () => closeModal();
    $('[data-yes]', c).onclick = () => { const v = $('#pp2', c).value; $('#modal')._onClose = null; closeModal(); res(v); };
    setTimeout(() => $('#pp2', c) && $('#pp2', c).focus(), 50);
  });
}
async function pAdmin(box) {
  box.innerHTML = '<p class="muted">Carregando…</p>';
  let o;
  try { o = await apiCall('/api/admin/overview'); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const pct = Math.min(100, (o.monthUsd / o.monthCap) * 100);
  box.innerHTML = `
    <div class="card"><b>💳 Gasto com o Claude neste mês</b>
      <div class="spend"><div class="spend-bar"><i style="width:${pct}%"></i></div><span><b>${usd(o.monthUsd)}</b> de ${usd(o.monthCap)}</span></div>
      <p class="tiny muted" style="margin:4px 0 0">Limite padrão: ${usd(o.childCap)} por criança por dia. Os valores são estimativas pelos tokens usados. Para mudar os limites padrão, edite CHILD_DAILY_USD e MONTHLY_USD no wrangler.jsonc.</p></div>
    <div class="card"><b>✉️ Convidar uma nova família</b>
      <div class="row wrap" style="margin-top:6px"><input id="ad-note" placeholder="Para quem? (ex.: Família Silva)" class="grow input"><button class="btn small primary" id="ad-inv">Gerar convite</button></div>
      <div id="ad-inv-out"></div>
      ${o.invites.length ? `<div class="tiny" style="margin-top:8px"><b>Convites</b>${o.invites.map(i => `<div class="row"><span class="grow">${esc(i.note || '(sem nome)')} · ${new Date(i.created).toLocaleDateString('pt-BR')}</span>
        <span class="muted">${i.used_at ? '✅ usado' : i.expires < new Date().toISOString() ? 'expirado' : 'pendente'}</span>${!i.used_at && i.expires >= new Date().toISOString() ? `<button class="btn small" data-revoke="${i.id}">Cancelar</button>` : ''}</div>`).join('')}</div>` : ''}</div>
    <div class="card"><b>👨‍👩‍👧 Famílias (${o.families.length})</b>
      ${o.families.map(f => `<div class="fam ${f.status !== 'active' ? 'paused' : ''}" data-fam="${f.id}">
        <div class="row wrap"><b class="grow">${esc(f.name)}${f.status !== 'active' ? ' · ⏸️ pausada' : ''}</b><span class="tiny">hoje ${usd(f.today_usd)} · mês <b>${usd(f.month_usd)}</b> (${f.month_calls} chamadas)</span></div>
        <div class="tiny">${f.children.map(c => `${c.avatar || '🦉'} ${esc(c.name)}`).join(' · ') || '<span class="muted">sem crianças</span>'}</div>
        ${f.parents.map(p => `<div class="row tiny"><span class="grow">${esc(p.name)} · ${esc(p.email)}${p.last_login ? ' · ' + new Date(p.last_login).toLocaleDateString('pt-BR') : ''}</span><button class="btn small" data-reset="${p.id}" data-email="${esc(p.email)}">🔑 Link de nova senha</button></div>`).join('')}
        <div class="row wrap tiny" style="margin-top:4px"><label>Limite por criança/dia (US$) <input type="number" step="0.1" min="0" data-cap value="${f.child_daily_usd ?? ''}" placeholder="${o.childCap}" style="width:70px"></label>
          <button class="btn small" data-capsave>Salvar limite</button>
          ${f.id !== Server.me.family.id ? `<button class="btn small" data-status="${f.status === 'active' ? 'paused' : 'active'}">${f.status === 'active' ? '⏸️ Pausar' : '▶️ Reativar'}</button><button class="btn small danger" data-famdel>Apagar</button>` : '<span class="muted">(sua família)</span>'}</div>
        <div data-out></div></div>`).join('')}</div>
    <div class="card"><b>🚩 Avisos de problema (${o.reports.length})</b>
      ${o.reports.map(r => `<div class="review-item"><div class="meta">${new Date(r.created).toLocaleString('pt-BR')} · ${esc(r.family_name || '')}${r.child_name ? ' · ' + esc(r.child_name) : ''} · ${esc(r.kind || '')}</div><div class="ans">${esc(r.text)}</div>
        <button class="btn small" data-resolve="${r.id}">✔ Resolvido</button></div>`).join('') || '<p class="tiny muted">Nenhum aviso.</p>'}</div>
    ${await adminCurriculumHtml()}`;
  bindAdminCurriculum(box);
  $('#ad-inv').onclick = async () => {
    try { const r = await apiCall('/api/admin/invites', { method: 'POST', data: { note: $('#ad-note').value } });
      $('#ad-inv-out').innerHTML = linkBox(r.link, r.expires, 'Convite para o app de estudos Estudos com a Lumi'); bindShare(box); } catch (e) { toast(e.message); }
  };
  $$('[data-revoke]', box).forEach(b => b.onclick = async () => { await apiCall(`/api/admin/invites/${b.dataset.revoke}`, { method: 'DELETE' }); pAdmin(box); });
  $$('[data-resolve]', box).forEach(b => b.onclick = async () => { await apiCall(`/api/admin/reports/${b.dataset.resolve}`, { method: 'POST', data: {} }); pAdmin(box); });
  $$('.fam', box).forEach(f => {
    const id = f.dataset.fam;
    $$('[data-reset]', f).forEach(b => b.onclick = async () => {
      try { const r = await apiCall('/api/admin/reset-link', { method: 'POST', data: { parentId: b.dataset.reset } });
        $('[data-out]', f).innerHTML = `<div class="tiny">Link de nova senha para <b>${esc(b.dataset.email)}</b>:</div>` + linkBox(r.link, r.expires, 'Link para criar uma nova senha no app Estudos com a Lumi'); bindShare(f); } catch (e) { toast(e.message); }
    });
    $('[data-capsave]', f).onclick = async () => { const v = $('[data-cap]', f).value; await apiCall(`/api/admin/families/${id}`, { method: 'PATCH', data: { child_daily_usd: v === '' ? null : Number(v) } }); toast('Limite salvo'); };
    const st = $('[data-status]', f); if (st) st.onclick = async () => { await apiCall(`/api/admin/families/${id}`, { method: 'PATCH', data: { status: st.dataset.status } }); pAdmin(box); };
    const del = $('[data-famdel]', f); if (del) del.onclick = async () => {
      if (!(await confirmBox('Apagar esta família?', 'Todos os responsáveis, crianças e dados desta família serão apagados para sempre.', 'Apagar', true))) return;
      await apiCall(`/api/admin/families/${id}`, { method: 'DELETE' }); pAdmin(box);
    };
  });
}

/* =========================================================================
   8. INICIALIZAÇÃO
   ========================================================================= */
function init() {
  applyTheme();
  renderMascotMini();
  renderCoins();
  $('#mascot-btn').onclick = mascotClick;
  $('#bubble').onclick = () => { if (!$('#bubble-actions').children.length) hideBubble(); };
  $('#coin-pill').onclick = () => say(`Você tem <b>${S.coins}</b> moedas. ${S.coins < 0 ? 'Saldo negativo: faça extras e entregue a semana para recuperar!' : 'Gaste na 🛒 Lojinha!'}`);
  $$('.top-nav button').forEach(b => b.onclick = () => {
    if (!S.name) return;
    if (currentScreen === 'work') save();
    show(b.dataset.nav);
  });
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (currentScreen === 'work') fitGrid($('#sheet')); const k = $('#key-grid'); if (k && !$('#modal').classList.contains('hidden')) fitGrid(k, { colMin: 200 }); }, 120); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });

  boot();
}
// Descobre se há servidor. Com servidor: login da família → perfil da criança. Sem servidor: modo local.
async function boot() {
  const has = await detectServer();
  if (!has) { startApp(); return; }
  const q = new URLSearchParams(location.search);
  if (q.get('convite')) { VIEW.auth = { mode: 'invite', token: q.get('convite') }; show('login'); return; }
  if (q.get('redefinir')) { VIEW.auth = { mode: 'reset', token: q.get('redefinir') }; show('login'); return; }
  if (Server.needsSetup) { VIEW.auth = { mode: 'firstrun' }; show('login'); return; }
  try { await refreshMe(); }
  catch (e) {
    if (e.status === 401) { VIEW.auth = { mode: 'login' }; show('login'); return; }
    toast('Sem conexão com o servidor.'); VIEW.auth = { mode: 'login' }; show('login'); return;
  }
  afterLogin();
}
function startApp() {
  applyTheme(); renderMascotMini(); renderCoins();
  if (!S.name) { show('welcome'); return; }
  show('home');
  if (!S.tourDone) setTimeout(runTour, 400);
}
document.addEventListener('DOMContentLoaded', init);
