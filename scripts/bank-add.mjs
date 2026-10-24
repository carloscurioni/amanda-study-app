// Junta um lote gerado (pelo job ou à mão) aos arquivos do banco em data/bank, validando cada item.
// Uso: node scripts/bank-add.mjs lote.json [lote2.json …]
// Lote: um objeto ou uma lista de objetos:
//   { "year": "Y5", "academic_week": 12, "subject": "math", "level": "", "questions": [ {type, q, options, answer, accept, hint, text, errors} ] }
//   { "year": "Y5", "academic_week": 12, "book": { "subject": "pt_leit", "level": "", "read_level": "at", "title", "premise", "chapters": [7 × {title, synopsis, text, questions[3]}] } }
import fs from 'node:fs';
import { readWeek, writeWeek, validateWeek, loadCurriculum, cleanQuestion, cleanBook, chapterDone, subjSlot, BANK_CURRICULUM } from './bank-lib.mjs';
const MAX_PER_SLOT = 60;
const cur = loadCurriculum();
let added = 0, rejected = 0, books = 0; const touched = new Map();
for (const f of process.argv.slice(2)) {
  let data; try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(`✗ ${f}: JSON inválido (${e.message})`); process.exitCode = 1; continue; }
  for (const u of (Array.isArray(data) ? data : [data])) {
    const year = u.year, week = Number(u.academic_week);
    if (!cur[year] || !(week >= 1 && week <= 37)) { console.log(`✗ unidade com ano/semana inválidos: ${year} ${u.academic_week}`); rejected++; continue; }
    const k = `${year}/${week}`;
    const w = touched.get(k) || readWeek(year, week, u.curriculum || BANK_CURRICULUM); touched.set(k, w);
    if (u.book) {
      const c = cleanBook(u.book, u.book.subject);
      if (c.err || !c.b.chapters.every(chapterDone)) { console.log(`✗ ${k} livro ${u.book.subject}: ${c.err || 'capítulos incompletos'}`); rejected++; continue; }
      const meta = { subject: u.book.subject, level: u.book.level || '', read_level: u.book.read_level || 'at' };
      w.books = (w.books || []).filter(b => !(b.subject === meta.subject && (b.level || '') === meta.level && (b.read_level || 'at') === meta.read_level));
      w.books.push(Object.assign(meta, c.b)); books++;
      continue;
    }
    const slot = subjSlot(u.subject, u.level || '');
    if (!cur[year][slot]) { console.log(`✗ ${k}: ${slot} não existe no currículo de ${year}`); rejected += (u.questions || []).length; continue; }
    const box = w.subjects[slot] = w.subjects[slot] || { topic: (cur[year][slot].weeks.find(x => x.academic_week === week) || {}).topic || '', questions: [] };
    const seen = new Set(box.questions.map(q => q.type + '|' + String(q.q).toLowerCase()));
    for (const [i, raw] of (u.questions || []).entries()) {
      const c = cleanQuestion(raw, u.subject);
      if (c.err) { console.log(`✗ ${k} ${slot} #${i + 1}: ${c.err} — "${String(raw && raw.q || '').slice(0, 70)}"`); rejected++; continue; }
      const kk = c.q.type + '|' + c.q.q.toLowerCase();
      if (seen.has(kk) || box.questions.length >= MAX_PER_SLOT) { rejected++; continue; }
      seen.add(kk); box.questions.push(c.q); added++;
    }
  }
}
for (const w of touched.values()) { const r = validateWeek(w, cur); writeWeek(r.clean); }
console.log(`lote: +${added} perguntas · +${books} livros · ${rejected} recusados · ${touched.size} semanas atualizadas`);
