// Confere os arquivos do banco de sugestões (data/bank/<currículo>/<ano>/wNN.json).
// Uso: node scripts/validate-bank.mjs [arquivo ou pasta]   (sai com código 1 se houver erro)
import fs from 'node:fs';
import { allWeekFiles, loadCurriculum, validateWeek } from './bank-lib.mjs';
const arg = process.argv[2];
const files = arg && fs.existsSync(arg) && fs.statSync(arg).isFile() ? [arg] : allWeekFiles().filter(f => !arg || f.includes(arg));
const cur = loadCurriculum();
let nErr = 0, nWarn = 0, nQ = 0, nB = 0;
for (const f of files) {
  let w; try { w = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(`✗ ${f}: JSON inválido (${e.message})`); nErr++; continue; }
  const exp = f.match(/(Y\d+)[/\\]w(\d\d)\.json$/);
  const r = validateWeek(w, cur);
  if (exp && (w.year !== exp[1] || w.academic_week !== Number(exp[2]))) r.errors.push(`year/academic_week não batem com o nome do arquivo`);
  nQ += Object.values(r.clean.subjects).reduce((a, s) => a + s.questions.length, 0); nB += r.clean.books.length;
  r.errors.forEach(e => console.log(`✗ ${f}: ${e}`)); r.warnings.forEach(e => console.log(`⚠ ${f}: ${e}`));
  nErr += r.errors.length; nWarn += r.warnings.length;
}
console.log(`${files.length} arquivos · ${nQ} perguntas válidas · ${nB} livros · ${nErr} erros · ${nWarn} avisos`);
process.exit(nErr ? 1 : 0);
