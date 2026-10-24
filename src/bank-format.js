/* Banco de sugestões: formato e validação (usado pelo Worker e pelos scripts em Node).
   Sem dependências do Cloudflare para poder ser importado por scripts/*.mjs. */

export const BANK_CURRICULUM = 'uk';   // currículo atual (britânico + IB). O brasileiro será 'br'.
export const QTYPES = ['mc', 'short', 'num', 'open', 'proof'];
export const READ_LEVELS = ['below', 'at', 'above', 'way'];
export const BANK_READ_IDS = ['pt_leit', 'en_read', 'en_guided', 'pt_lit', 'en_lit'];
export const BOOK_CHAPTERS = 7;

const s = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const normTxt = v => String(v || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();

// Chave de uma matéria numa semana: uk|Y5|math||w12   (nível vazio fora do IB)
export function qKey(cur, year, subject, level, week) { return `${cur}|${year}|${subject}|${level || ''}|w${Number(week)}`; }
// Chave de um livro: uk|Y5|pt_leit||w12|at
export function bookKey(cur, year, subject, level, week, readLevel) { return `${qKey(cur, year, subject, level, week)}|${READ_LEVELS.includes(readLevel) ? readLevel : 'at'}`; }
// Nome do arquivo no repositório/public: uk/Y5/w12
export const fileOf = (cur, year, week) => `${cur}/${year}/w${String(Number(week)).padStart(2, '0')}`;
// "bio-hl" ↔ { subject: 'bio', level: 'hl' }
export const subjSlot = (subject, level) => (level ? `${subject}-${level}` : subject);
export function parseSlot(slot) { const m = String(slot).match(/^([a-z_]+)(?:-(hl|sl))?$/); return m ? { subject: m[1], level: m[2] || '' } : null; }

// Identificador estável do conteúdo (FNV-1a 64 bits em hex) — o mesmo item gerado duas vezes não duplica.
export function contentId(prefix, ...parts) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const str = parts.map(p => normTxt(p)).join('\u0001');
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ (c + i), 2246822519) >>> 0; }
  return prefix + h1.toString(36) + h2.toString(36);
}

const BAD = [/https?:\/\//i, /www\./i, /@[a-z0-9-]+\.[a-z]/i, /\b\d{4,5}[- ]?\d{4}\b/];   // links, e-mails, telefones
function unsafe(...texts) { return texts.some(t => BAD.some(re => re.test(String(t || '')))); }
function wordCount(text, w) {
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(text).match(new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=$|[^\\p{L}\\p{N}])`, 'gu')) || []).length;
}

// Valida e limpa uma pergunta. Devolve { q } ou { err }.
export function cleanQuestion(raw, subject) {
  const r = raw || {};
  const type = String(r.type || '').trim();
  if (!QTYPES.includes(type)) return { err: `tipo inválido "${type}"` };
  const q = { subject, type, q: s(r.q, 500), options: [], answer: s(r.answer, 300), accept: [], hint: s(r.hint, 240), text: '', errors: [] };
  if (!q.q) return { err: 'sem enunciado' };
  if (Array.isArray(r.accept)) q.accept = r.accept.map(x => s(x, 120)).filter(Boolean).slice(0, 8);
  if (type === 'mc') {
    q.options = (Array.isArray(r.options) ? r.options : []).map(x => s(x, 160)).filter(Boolean).slice(0, 5);
    if (q.options.length < 2) return { err: 'múltipla escolha sem opções' };
    if (new Set(q.options.map(normTxt)).size !== q.options.length) return { err: 'opções repetidas' };
    if (!q.options.some(o => normTxt(o) === normTxt(q.answer))) return { err: 'resposta fora das opções' };
  }
  if ((type === 'short' || type === 'num') && !q.answer) return { err: 'sem resposta' };
  if (type === 'num' && !/^-?[\d.,/ ]+$/.test(q.answer.replace(/\s/g, ''))) return { err: 'resposta numérica inválida' };
  if (type === 'open') q.answer = '';
  if (type === 'proof') {
    q.text = s(r.text, 1200);
    q.errors = (Array.isArray(r.errors) ? r.errors : []).map(e => ({ wrong: s(e && e.wrong, 60), right: s(e && e.right, 60) })).filter(e => e.wrong && e.right && e.wrong !== e.right).slice(0, 7);
    if (!q.text || q.errors.length < 3) return { err: 'caça-erros sem texto ou com menos de 3 erros' };
    if (q.errors.some(e => wordCount(q.text, e.wrong) !== 1)) return { err: 'caça-erros: palavra errada não aparece exatamente 1 vez' };
    q.answer = q.errors.map(e => `${e.wrong} → ${e.right}`).join('; ');
  }
  if (q.hint && q.answer && q.answer.length >= 3 && type !== 'proof' && normTxt(q.hint).includes(normTxt(q.answer))) return { err: 'a dica entrega a resposta' };
  if (unsafe(q.q, q.hint, q.text, ...q.options)) return { err: 'link, e-mail ou telefone no texto' };
  return { q };
}

// Capítulo de livro: { title, text, questions[3] }
export function cleanChapter(raw, subject) {
  const r = raw || {};
  const ch = { title: s(r.title, 160), synopsis: s(r.synopsis, 600), text: s(r.text, 6000), questions: [] };
  if (!ch.title) return { err: 'capítulo sem título' };
  if (r.text !== undefined || r.questions !== undefined) {
    if (ch.text.split(/\s+/).length < 60) return { err: 'capítulo curto demais' };
    if (unsafe(ch.text)) return { err: 'link no capítulo' };
    for (const x of (Array.isArray(r.questions) ? r.questions : []).slice(0, 4)) { const c = cleanQuestion(x, subject); if (c.q) ch.questions.push(c.q); }
    if (ch.questions.length < 2) return { err: 'capítulo com menos de 2 perguntas válidas' };
  }
  return { ch };
}
export function cleanBook(raw, subject) {
  const r = raw || {};
  const b = { title: s(r.title, 120), premise: s(r.premise, 800), chapters: [] };
  if (!b.title) return { err: 'livro sem título' };
  for (const c of (Array.isArray(r.chapters) ? r.chapters : []).slice(0, BOOK_CHAPTERS)) {
    const x = cleanChapter(c, subject); if (x.err) return { err: x.err };
    b.chapters.push(x.ch);
  }
  if (b.chapters.length !== BOOK_CHAPTERS) return { err: `o livro precisa de ${BOOK_CHAPTERS} capítulos (tem ${b.chapters.length})` };
  return { b };
}
export const chapterDone = c => !!(c && c.text && c.questions && c.questions.length);
