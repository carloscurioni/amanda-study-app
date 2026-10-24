// Publica o banco: data/bank/**/wNN.json → public/bank/**/wNN.json (só o que é válido, com ids) + public/bank/index.json.
// O servidor carrega cada semana no SQLite na primeira vez que ela é pedida (e de novo quando o hash muda).
// Uso: node scripts/build-bank.mjs
import fs from 'node:fs';
import path from 'node:path';
import { allWeekFiles, loadCurriculum, validateWeek, sha, PUB, fileOf } from './bank-lib.mjs';
const cur = loadCurriculum();
const index = { version: '', files: {}, counts: { questions: 0, books: 0, rejected: 0 } };
fs.rmSync(PUB, { recursive: true, force: true }); fs.mkdirSync(PUB, { recursive: true });
for (const f of allWeekFiles()) {
  const r = validateWeek(JSON.parse(fs.readFileSync(f, 'utf8')), cur);
  index.counts.rejected += r.errors.length;
  const nq = Object.values(r.clean.subjects).reduce((a, s) => a + s.questions.length, 0);
  if (!nq && !r.clean.books.length) continue;
  const body = JSON.stringify(r.clean);
  const key = fileOf(r.clean.curriculum, r.clean.year, r.clean.academic_week);
  fs.mkdirSync(path.join(PUB, path.dirname(key)), { recursive: true });
  fs.writeFileSync(path.join(PUB, key + '.json'), body);
  index.files[key] = sha(body);
  index.counts.questions += nq; index.counts.books += r.clean.books.length;
}
index.version = sha(JSON.stringify(index.files));
fs.writeFileSync(path.join(PUB, 'index.json'), JSON.stringify(index));
console.log(`banco: ${Object.keys(index.files).length} semanas · ${index.counts.questions} perguntas · ${index.counts.books} livros · ${index.counts.rejected} itens recusados · versão ${index.version}`);
