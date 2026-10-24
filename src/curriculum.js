/* Currículo de referência semana a semana (Durable Object com SQLite).
   Carregado a partir de public/curriculum/<etapa>.json (gerados por scripts/build-curriculum.mjs).
   O seed é idempotente: linhas editadas pelo admin (edited = 1) não são sobrescritas. */
import { DurableObject } from 'cloudflare:workers';

export class Curriculum extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS curriculum_weeks (
        year TEXT NOT NULL, stage TEXT NOT NULL, subject TEXT NOT NULL, level TEXT NOT NULL DEFAULT '',
        term INTEGER, week_of_term INTEGER, academic_week INTEGER NOT NULL, type TEXT,
        topic TEXT, objectives TEXT, keywords TEXT, spelling TEXT, source TEXT, version INTEGER,
        edited INTEGER NOT NULL DEFAULT 0, updated TEXT,
        PRIMARY KEY (year, subject, level, academic_week));
      CREATE INDEX IF NOT EXISTS curriculum_idx ON curriculum_weeks (year, subject, academic_week);
      CREATE TABLE IF NOT EXISTS curriculum_meta (k TEXT PRIMARY KEY, v TEXT);
    `);
  }
  meta(k) { const r = [...this.sql.exec('SELECT v FROM curriculum_meta WHERE k = ?', k)][0]; return r ? r.v : null; }
  setMeta(k, v) { this.sql.exec('INSERT INTO curriculum_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v)); }
  async stats() {
    const r = [...this.sql.exec('SELECT COUNT(*) AS n, COUNT(DISTINCT year || subject || level) AS files, SUM(edited) AS edited FROM curriculum_weeks')][0] || {};
    return { rows: r.n || 0, files: r.files || 0, edited: r.edited || 0, version: this.meta('bundle_version'), seededAt: this.meta('seeded_at') };
  }
  // files: [{ year, stage, subject, level, language, source, version, weeks: [...] }]
  async seed(files, bundleVersion) {
    let n = 0;
    const now = new Date().toISOString();
    for (const f of files || []) {
      for (const w of f.weeks || []) {
        this.sql.exec(`INSERT INTO curriculum_weeks (year, stage, subject, level, term, week_of_term, academic_week, type, topic, objectives, keywords, spelling, source, version, edited, updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
          ON CONFLICT(year, subject, level, academic_week) DO UPDATE SET stage = excluded.stage, term = excluded.term, week_of_term = excluded.week_of_term, type = excluded.type,
            topic = excluded.topic, objectives = excluded.objectives, keywords = excluded.keywords, spelling = excluded.spelling, source = excluded.source, version = excluded.version, updated = excluded.updated
          WHERE curriculum_weeks.edited = 0`,
          f.year, f.stage, f.subject, f.level || '', w.term, w.week_of_term, w.academic_week, w.type, w.topic,
          JSON.stringify(w.objectives || []), JSON.stringify(w.keywords || []), JSON.stringify(w.spelling || []), f.source || '', Number(f.version) || 1, now);
        n++;
      }
    }
    if (bundleVersion) this.setMeta('bundle_version', bundleVersion);
    this.setMeta('seeded_at', now);
    return { rows: n };
  }
  row(r) {
    return r && { year: r.year, stage: r.stage, subject: r.subject, level: r.level || null, term: r.term, week_of_term: r.week_of_term, academic_week: r.academic_week, type: r.type,
      topic: r.topic, objectives: JSON.parse(r.objectives || '[]'), keywords: JSON.parse(r.keywords || '[]'), spelling: JSON.parse(r.spelling || '[]'), source: r.source, edited: !!r.edited };
  }
  // subjects: [{ subject, level }]
  async week(year, week, subjects) {
    const out = [];
    for (const s of subjects || []) {
      let r = [...this.sql.exec('SELECT * FROM curriculum_weeks WHERE year = ? AND subject = ? AND level = ? AND academic_week = ?', year, s.subject, s.level || '', week)][0];
      if (!r && s.level) r = [...this.sql.exec("SELECT * FROM curriculum_weeks WHERE year = ? AND subject = ? AND academic_week = ? ORDER BY level = 'sl' DESC LIMIT 1", year, s.subject, week)][0];
      if (r) out.push(this.row(r));
    }
    return out;
  }
  async get(year, subject, level, week) { return this.row([...this.sql.exec('SELECT * FROM curriculum_weeks WHERE year = ? AND subject = ? AND level = ? AND academic_week = ?', year, subject, level || '', week)][0]) || null; }
  async edit(year, subject, level, week, d) {
    const cur = await this.get(year, subject, level, week);
    if (!cur) return { err: 'Linha não encontrada.' };
    const clean = (a, n) => (Array.isArray(a) ? a : String(a || '').split(/\n|;/)).map(x => String(x).trim()).filter(Boolean).slice(0, n).map(x => x.slice(0, 200));
    this.sql.exec('UPDATE curriculum_weeks SET topic = ?, objectives = ?, keywords = ?, spelling = ?, edited = 1, updated = ? WHERE year = ? AND subject = ? AND level = ? AND academic_week = ?',
      String(d.topic || cur.topic).slice(0, 140), JSON.stringify(clean(d.objectives ?? cur.objectives, 6)), JSON.stringify(clean(d.keywords ?? cur.keywords, 10)), JSON.stringify(clean(d.spelling ?? cur.spelling, 14)),
      new Date().toISOString(), year, subject, level || '', week);
    return { row: await this.get(year, subject, level, week) };
  }
  async subjectsFor(year) { return [...this.sql.exec('SELECT DISTINCT subject, level FROM curriculum_weeks WHERE year = ? ORDER BY subject, level', year)].map(r => ({ subject: r.subject, level: r.level || null })); }
}
