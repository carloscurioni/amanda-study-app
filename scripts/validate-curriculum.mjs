// Valida os arquivos de currículo: node scripts/validate-curriculum.mjs [pasta]
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || 'data/curriculum';
const only = process.argv[3] || '';   // filtro opcional: parte do nome do arquivo (ex.: Y5-)
const SUBJ = ['pt', 'pt_ort', 'pt_leit', 'pt_lit', 'pt_red', 'bss', 'en', 'en_read', 'en_spell', 'en_guided', 'en_lit', 'ipc', 'math', 'fmath', 'sci', 'bio', 'chem', 'phys', 'hist', 'geog', 'comp', 'econ', 'bus', 'psych', 'spa', 'fre', 'tok'];
const STAGE = { primary: [1, 6], ks3: [7, 9], igcse: [10, 11], ib: [12, 13] };
const termOf = w => (w <= 15 ? [1, w] : w <= 27 ? [2, w - 15] : [3, w - 27]);
let files = 0, weeks = 0; const errs = [];
for (const stage of Object.keys(STAGE)) {
  const dir = path.join(root, stage); if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && (!only || x.startsWith(only) || (stage + '/' + x).includes(only)))) {
    const p = path.join(dir, f); const E = m => errs.push(`${p}: ${m}`);
    let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { E('JSON inválido: ' + e.message); continue; }
    files++;
    const m = f.match(/^Y(\d+)-([a-z_]+?)(?:-(sl|hl))?\.json$/);
    if (!m) { E('nome fora do padrão'); continue; }
    const n = Number(m[1]);
    if (n < STAGE[stage][0] || n > STAGE[stage][1]) E('ano fora da etapa');
    if (j.year !== 'Y' + n || j.stage !== stage || j.subject !== m[2] || (j.level || null) !== (m[3] || null)) E('cabeçalho não bate com o nome do arquivo');
    if (!SUBJ.includes(j.subject)) E('matéria desconhecida ' + j.subject);
    if (!['pt', 'en'].includes(j.language)) E('language');
    if (!j.source || String(j.source).length < 10) E('source vazio');
    if (!Array.isArray(j.weeks) || j.weeks.length !== 37) { E(`precisa de 37 semanas (tem ${j.weeks && j.weeks.length})`); continue; }
    const seen = new Map();
    j.weeks.forEach((w, i) => {
      const W = i + 1; weeks++;
      const [t, wt] = termOf(W);
      if (w.academic_week !== W || w.term !== t || w.week_of_term !== wt) E(`semana ${W}: academic_week/term/week_of_term errados`);
      if (!['teaching', 'review', 'exam'].includes(w.type)) E(`semana ${W}: type`);
      if (!w.topic || w.topic.length > 140) E(`semana ${W}: topic vazio ou longo`);
      if (!Array.isArray(w.objectives) || w.objectives.length < 2 || w.objectives.length > 4 || w.objectives.some(o => !o || typeof o !== 'string')) E(`semana ${W}: objectives (2–4)`);
      if (!Array.isArray(w.keywords) || w.keywords.length < 3 || w.keywords.length > 10) E(`semana ${W}: keywords (3–8)`);
      if (!Array.isArray(w.spelling)) E(`semana ${W}: spelling deve ser lista`);
      else if (['pt_ort', 'en_spell'].includes(j.subject) && stage === 'primary' && w.type === 'teaching' && (w.spelling.length < 6 || w.spelling.length > 12)) E(`semana ${W}: spelling precisa de 8–10 palavras`);
      if (w.type === 'teaching') { const k = String(w.topic).toLowerCase().trim(); if (seen.has(k)) E(`semana ${W}: tópico repetido da semana ${seen.get(k)}`); seen.set(k, W); }
    });
  }
}
console.log(`${files} arquivos, ${weeks} semanas, ${errs.length} problemas`);
errs.slice(0, 80).forEach(e => console.log(' - ' + e));
process.exit(errs.length ? 1 : 0);
