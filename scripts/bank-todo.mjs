// Lista o que ainda falta no banco, na ordem em que vale a pena gerar (para o job que popula o banco).
// Uso: node scripts/bank-todo.mjs [--limit 12] [--target 16] [--years Y5,Y10] [--date 2026-10-24] [--no-books] [--summary]
// Ordem: semana letiva atual → até a 37 → depois da 1 em diante; dentro da semana, os anos de data/bank/priority.json primeiro.
import fs from 'node:fs';
import { loadCurriculum, readWeek, academicWeekOf, stageOf, DAILY_BOOKS, YEARS, subjSlot, parseSlot, chapterDone } from './bank-lib.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes('--' + k);
const limit = Number(arg('limit', 12)), target = Number(arg('target', 16));
const date = arg('date', new Date().toISOString().slice(0, 10));
const only = arg('years', '') ? arg('years').split(',') : null;
let prio = []; try { prio = JSON.parse(fs.readFileSync('data/bank/priority.json', 'utf8')).years || []; } catch { /* sem prioridade */ }
const cur = loadCurriculum();
const cw = academicWeekOf(new Date(Date.parse(date + 'T12:00:00Z') + 2 * 86400000).toISOString().slice(0, 10));   // a semana que o app vai planejar (o ciclo começa no sábado)
const weeks = [...Array.from({ length: 38 - cw }, (_, i) => cw + i), ...Array.from({ length: cw - 1 }, (_, i) => i + 1)];
const years = [...prio.filter(y => YEARS.includes(y)), ...YEARS.filter(y => !prio.includes(y))].filter(y => cur[y] && (!only || only.includes(y)));
const units = []; let slots = 0, full = 0, bookSlots = 0, booksDone = 0;
for (const week of weeks) for (const year of years) {
  const w = readWeek(year, week);
  for (const slot of Object.keys(cur[year]).sort()) {
    const f = cur[year][slot]; const row = f.weeks.find(x => x.academic_week === week); if (!row) continue;
    const have = ((w.subjects[slot] || {}).questions || []).length; slots++;
    if (have >= target) { full++; continue; }
    const { subject, level } = parseSlot(slot);
    units.push({ kind: 'questions', year, academic_week: week, subject, level, have, need: target - have, language: f.language, type: row.type, topic: row.topic, objectives: row.objectives, keywords: row.keywords, spelling: row.spelling });
  }
  if (has('no-books')) continue;
  for (const subject of DAILY_BOOKS[stageOf(year)]) {
    const slot = subjSlot(subject, ''); const f = cur[year][slot]; if (!f) continue;
    const row = f.weeks.find(x => x.academic_week === week); bookSlots++;
    const b = (w.books || []).find(b => b.subject === subject && (b.read_level || 'at') === 'at');
    if (b && b.chapters.every(chapterDone)) { booksDone++; continue; }
    units.push({ kind: 'book', year, academic_week: week, subject, level: '', read_level: 'at', language: f.language, topic: row && row.topic, objectives: row && row.objectives });
  }
}
const out = { date, academic_week_now: cw, target, progress: { question_slots: slots, question_slots_full: full, books: bookSlots, books_done: booksDone }, units: has('summary') ? [] : units.slice(0, limit), remaining: units.length };
console.log(JSON.stringify(out, null, 1));
