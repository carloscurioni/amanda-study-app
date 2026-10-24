// Junta data/curriculum/<etapa>/*.json em public/curriculum/<etapa>.json (lido pelo seed do servidor e pela varinha sem servidor).
// Uso: node scripts/build-curriculum.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const src = 'data/curriculum', out = 'public/curriculum';
fs.mkdirSync(out, { recursive: true });
const index = { stages: {}, files: 0, weeks: 0 };
const hash = crypto.createHash('sha256');
for (const stage of ['primary', 'ks3', 'igcse', 'ib']) {
  const dir = path.join(src, stage); if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const body = JSON.stringify(files);
  fs.writeFileSync(path.join(out, stage + '.json'), body);
  hash.update(body);
  index.stages[stage] = files.map(f => `${f.year}-${f.subject}${f.level ? '-' + f.level : ''}`);
  index.files += files.length; index.weeks += files.reduce((a, f) => a + f.weeks.length, 0);
}
index.version = hash.digest('hex').slice(0, 12);
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
console.log(`currículo: ${index.files} arquivos, ${index.weeks} semanas, versão ${index.version}`);
