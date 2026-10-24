// Funções comuns dos scripts do banco de sugestões (data/bank → public/bank).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cleanQuestion, cleanBook, contentId, fileOf, parseSlot, subjSlot, BANK_CURRICULUM, BOOK_CHAPTERS, READ_LEVELS, chapterDone } from '../src/bank-format.js';
export { cleanQuestion, cleanBook, contentId, fileOf, parseSlot, subjSlot, BANK_CURRICULUM, BOOK_CHAPTERS, READ_LEVELS, chapterDone };

export const DATA = 'data/bank', PUB = 'public/bank', CUR = 'data/curriculum';
export const STAGES = { primary: [1, 6], ks3: [7, 9], igcse: [10, 11], ib: [12, 13] };
export const stageOf = y => { const n = Number(String(y).slice(1)); return Object.keys(STAGES).find(k => n >= STAGES[k][0] && n <= STAGES[k][1]); };
// Leitura diária do app: o 1º livro em português e o 1º em inglês das matérias sugeridas da etapa
export const DAILY_BOOKS = { primary: ['pt_leit', 'en_read'], ks3: ['pt_leit', 'en_read'], igcse: ['pt_lit', 'en_lit'], ib: ['pt_lit', 'en_lit'] };
export const YEARS = Array.from({ length: 13 }, (_, i) => 'Y' + (i + 1));

// Calendário letivo padrão (o mesmo do app: public/script.js → DEFAULT_SCHOOL_START / DEFAULT_HOLIDAYS)
export const SCHOOL_START = '2026-08-03';
export const HOLIDAYS = [['2026-10-12', '2026-10-16'], ['2026-12-14', '2027-01-29'], ['2027-02-08', '2027-02-12'], ['2027-03-29', '2027-04-02']];
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const mondayOf = d => { const t = new Date(d + 'T12:00:00Z'); return addDays(d, -((t.getUTCDay() + 6) % 7)); };
export function academicWeekOf(date) {
  const start = mondayOf(SCHOOL_START), mon = mondayOf(date);
  if (mon < start) return 1;
  let w = 0;
  for (let d = start; d <= mon; d = addDays(d, 7)) { const mid = addDays(d, 2); if (!HOLIDAYS.some(([a, b]) => mid >= a && mid <= b)) w++; }
  return Math.max(1, Math.min(37, w || 1));
}

// Currículo: { 'Y5': { 'math': {file}, 'bio-hl': {file} } }
export function loadCurriculum() {
  const out = {};
  for (const st of Object.keys(STAGES)) {
    const dir = path.join(CUR, st); if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      (out[c.year] = out[c.year] || {})[subjSlot(c.subject, c.level)] = c;
    }
  }
  return out;
}
export const bankPath = (year, week, cur = BANK_CURRICULUM) => path.join(DATA, fileOf(cur, year, week) + '.json');
export function readWeek(year, week, cur = BANK_CURRICULUM) {
  const p = bankPath(year, week, cur);
  if (!fs.existsSync(p)) return { version: 1, curriculum: cur, year, academic_week: week, subjects: {}, books: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
export function writeWeek(w) {
  const p = bankPath(w.year, w.academic_week, w.curriculum);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const subjects = Object.fromEntries(Object.keys(w.subjects).sort().map(k => [k, w.subjects[k]]));
  fs.writeFileSync(p, JSON.stringify({ version: 1, curriculum: w.curriculum, year: w.year, academic_week: w.academic_week, subjects, books: w.books || [] }, null, 1) + '\n');
  return p;
}
export function allWeekFiles() {
  const out = [];
  if (!fs.existsSync(DATA)) return out;
  for (const cur of fs.readdirSync(DATA).filter(d => fs.statSync(path.join(DATA, d)).isDirectory()))
    for (const y of fs.readdirSync(path.join(DATA, cur)).filter(d => /^Y\d+$/.test(d)))
      for (const f of fs.readdirSync(path.join(DATA, cur, y)).filter(f => /^w\d\d\.json$/.test(f))) out.push(path.join(DATA, cur, y, f));
  return out.sort();
}
export const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

// Valida um arquivo de semana. Devolve { errors: [], warnings: [], clean } (clean = versão limpa, com ids).
export function validateWeek(w, cur) {
  const errors = [], warnings = [];
  if (!w || w.version !== 1) errors.push('version precisa ser 1');
  if (!/^Y([1-9]|1[0-3])$/.test(w.year || '')) errors.push(`year inválido: ${w.year}`);
  if (!(w.academic_week >= 1 && w.academic_week <= 37)) errors.push(`academic_week inválida: ${w.academic_week}`);
  const clean = { version: 1, curriculum: w.curriculum || BANK_CURRICULUM, year: w.year, academic_week: w.academic_week, subjects: {}, books: [] };
  const known = (cur && cur[w.year]) || {};
  for (const [slot, v] of Object.entries(w.subjects || {})) {
    const ps = parseSlot(slot); if (!ps) { errors.push(`matéria inválida: ${slot}`); continue; }
    if (cur && !known[slot]) warnings.push(`${slot}: não existe no currículo de ${w.year}`);
    const seen = new Set(); const qs = [];
    (v.questions || []).forEach((raw, i) => {
      const c = cleanQuestion(raw, ps.subject);
      if (c.err) { errors.push(`${slot} #${i + 1}: ${c.err} — "${String(raw && raw.q || '').slice(0, 60)}"`); return; }
      const k = c.q.type + '|' + c.q.q.toLowerCase();
      if (seen.has(k)) { warnings.push(`${slot} #${i + 1}: repetida`); return; }
      seen.add(k);
      qs.push(Object.assign({ id: raw.id || contentId('r', `${clean.curriculum}|${w.year}|${ps.subject}|${ps.level}|w${w.academic_week}`, c.q.type, c.q.q, c.q.answer) }, c.q));
    });
    clean.subjects[slot] = { topic: String(v.topic || (known[slot] && (known[slot].weeks.find(x => x.academic_week === w.academic_week) || {}).topic) || ''), questions: qs };
  }
  for (const [i, bk] of (w.books || []).entries()) {
    const c = cleanBook(bk, bk.subject);
    if (c.err) { errors.push(`livro ${i + 1} (${bk.subject}): ${c.err}`); continue; }
    if (!READ_LEVELS.includes(bk.read_level || 'at')) { errors.push(`livro ${i + 1}: read_level inválido`); continue; }
    if (!c.b.chapters.every(chapterDone)) { errors.push(`livro ${i + 1} (${bk.subject}): todos os ${BOOK_CHAPTERS} capítulos precisam de texto e perguntas`); continue; }
    clean.books.push(Object.assign({ subject: bk.subject, level: bk.level || '', read_level: bk.read_level || 'at' }, c.b));
  }
  return { errors, warnings, clean };
}
