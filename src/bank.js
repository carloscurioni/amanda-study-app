/* Banco de sugestões compartilhado (Durable Object com SQLite).
   Guarda perguntas e livros por currículo · ano · matéria · nível · semana letiva, para que o conteúdo
   criado para uma criança sirva para outra do mesmo ano/semana/currículo (menos chamadas ao Claude).
   Fontes: 'repo' (arquivos data/bank publicados em public/bank), 'api' (criados na hora pelo Claude), 'admin' (editados).
   Só entra conteúdo derivado do currículo de referência — nunca texto, fotos ou erros de uma criança. */
import { DurableObject } from 'cloudflare:workers';
import { cleanQuestion, cleanChapter, cleanBook, contentId, chapterDone, BOOK_CHAPTERS } from './bank-format.js';

const MAX_PER_KEY = 150;
function mix(seed, id) {   // ordem pseudoaleatória estável por criança (irmãos e colegas recebem conjuntos diferentes)
  let h = 2166136261; const str = seed + '|' + id;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export class Bank extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bank_q (
        id TEXT PRIMARY KEY, ckey TEXT NOT NULL, subject TEXT NOT NULL, payload TEXT NOT NULL,
        source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ok', reports INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0,
        created TEXT, updated TEXT);
      CREATE INDEX IF NOT EXISTS bank_q_key ON bank_q (ckey, status);
      CREATE TABLE IF NOT EXISTS bank_books (
        ckey TEXT PRIMARY KEY, subject TEXT NOT NULL, payload TEXT NOT NULL,
        source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ok', reports INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0,
        created TEXT, updated TEXT);
      CREATE TABLE IF NOT EXISTS bank_meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS bank_reports (id TEXT NOT NULL, family TEXT NOT NULL, created TEXT, PRIMARY KEY (id, family));
    `);
  }
  meta(k) { const r = [...this.sql.exec('SELECT v FROM bank_meta WHERE k = ?', k)][0]; return r ? r.v : null; }
  setMeta(k, v) { this.sql.exec('INSERT INTO bank_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v)); }
  qRow(r) { return Object.assign(JSON.parse(r.payload), { bank: r.id }); }

  /* ---- carga dos arquivos publicados (um por currículo/ano/semana) ---- */
  async loadedHash(file) { return this.meta('file:' + file); }
  async importFile(file, hash, data) {
    const now = new Date().toISOString();
    let nq = 0, nb = 0;
    const cur = data.curriculum, year = data.year, week = data.academic_week;
    for (const [slot, v] of Object.entries(data.subjects || {})) {
      const [subject, level = ''] = slot.split('-');
      const ckey = `${cur}|${year}|${subject}|${level}|w${week}`;
      for (const raw of v.questions || []) {
        const c = cleanQuestion(raw, subject); if (c.err) continue;
        const id = raw.id || contentId('r', ckey, c.q.type, c.q.q, c.q.answer);
        this.sql.exec(`INSERT OR IGNORE INTO bank_q (id, ckey, subject, payload, source, created, updated) VALUES (?, ?, ?, ?, 'repo', ?, ?)`, id, ckey, subject, JSON.stringify(c.q), now, now);
        nq++;
      }
    }
    for (const bk of data.books || []) {
      const c = cleanBook(bk, bk.subject); if (c.err) continue;
      const ckey = `${cur}|${year}|${bk.subject}|${bk.level || ''}|w${week}|${bk.read_level || 'at'}`;
      const old = [...this.sql.exec('SELECT * FROM bank_books WHERE ckey = ?', ckey)][0];
      if (!old) this.sql.exec(`INSERT INTO bank_books (ckey, subject, payload, source, created, updated) VALUES (?, ?, ?, 'repo', ?, ?)`, ckey, bk.subject, JSON.stringify(c.b), now, now);
      else if (old.source !== 'admin') {   // o livro do repositório completa capítulos que ainda faltam
        const ob = JSON.parse(old.payload);
        if (ob.chapters.filter(chapterDone).length < c.b.chapters.filter(chapterDone).length) this.sql.exec(`UPDATE bank_books SET payload = ?, source = 'repo', updated = ? WHERE ckey = ?`, JSON.stringify(c.b), now, ckey);
      }
      nb++;
    }
    this.setMeta('file:' + file, hash);
    return { questions: nq, books: nb };
  }

  /* ---- uso pelo app ---- */
  // keys: [{ ckey, need }], books: [ckey], exclude: ids já usados por esta criança
  async draw(seed, keys, books, exclude) {
    const ex = new Set(exclude || []);
    const out = { questions: {}, have: {}, books: {} };
    for (const k of keys || []) {
      const rows = [...this.sql.exec(`SELECT id, payload FROM bank_q WHERE ckey = ? AND status = 'ok'`, k.ckey)];
      out.have[k.ckey] = rows.length;
      const pick = rows.filter(r => !ex.has(r.id)).sort((a, b) => mix(seed, a.id) - mix(seed, b.id)).slice(0, Math.max(0, Math.min(80, k.need | 0)));
      out.questions[k.ckey] = pick.map(r => this.qRow(r));
      for (const r of pick) this.sql.exec('UPDATE bank_q SET uses = uses + 1 WHERE id = ?', r.id);
    }
    for (const ck of books || []) {
      const r = [...this.sql.exec(`SELECT payload FROM bank_books WHERE ckey = ? AND status = 'ok'`, ck)][0];
      out.books[ck] = r ? JSON.parse(r.payload) : null;
      if (r) this.sql.exec('UPDATE bank_books SET uses = uses + 1 WHERE ckey = ?', ck);
    }
    return out;
  }
  async count(ckey) { return ([...this.sql.exec(`SELECT COUNT(*) AS n FROM bank_q WHERE ckey = ? AND status != 'deleted'`, ckey)][0] || {}).n || 0; }
  async recent(ckey, n = 50) { return [...this.sql.exec(`SELECT payload FROM bank_q WHERE ckey = ? AND status != 'deleted' ORDER BY created DESC LIMIT ?`, ckey, n)].map(r => JSON.parse(r.payload).q); }
  // Perguntas novas criadas pelo Claude (já validadas no Worker; valida de novo aqui por segurança)
  async addQuestions(ckey, subject, items, source = 'api') {
    const now = new Date().toISOString();
    const have = await this.count(ckey);
    const out = [];
    // sem quase-repetidas: a mesma pergunta com outra pontuação/acentuação não entra de novo
    const nq = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const seen = new Set([...this.sql.exec(`SELECT payload FROM bank_q WHERE ckey = ? AND status != 'deleted'`, ckey)].map(r => { const q = JSON.parse(r.payload); return nq(q.q) + '|' + nq(q.text); }));
    for (const raw of items || []) {
      const c = cleanQuestion(raw, subject); if (c.err) continue;
      const k = nq(c.q.q) + '|' + nq(c.q.text); if (seen.has(k)) continue; seen.add(k);
      const id = contentId('a', ckey, c.q.type, c.q.q, c.q.answer);
      if (have + out.length < MAX_PER_KEY) this.sql.exec(`INSERT OR IGNORE INTO bank_q (id, ckey, subject, payload, source, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, ckey, subject, JSON.stringify(c.q), source, now, now);
      out.push(Object.assign({}, c.q, { bank: id }));
    }
    return out;
  }
  async book(ckey) { const r = [...this.sql.exec(`SELECT payload, status FROM bank_books WHERE ckey = ?`, ckey)][0]; return r && r.status === 'ok' ? JSON.parse(r.payload) : null; }
  // Roteiro do livro (título, premissa e sinopse dos 7 capítulos): só grava se ainda não existir
  async bookHeader(ckey, subject, raw) {
    const cur = await this.book(ckey); if (cur) return cur;
    if ([...this.sql.exec('SELECT 1 FROM bank_books WHERE ckey = ?', ckey)].length) return null;   // oculto pelo admin
    const b = { title: String(raw.title || '').slice(0, 120), premise: String(raw.premise || '').slice(0, 800), chapters: (raw.chapters || []).slice(0, BOOK_CHAPTERS).map(c => ({ title: String(c.title || '').slice(0, 160), synopsis: String(c.synopsis || '').slice(0, 600) })) };
    if (!b.title || b.chapters.length !== BOOK_CHAPTERS) return null;
    const now = new Date().toISOString();
    this.sql.exec(`INSERT INTO bank_books (ckey, subject, payload, source, created, updated) VALUES (?, ?, ?, 'api', ?, ?)`, ckey, subject, JSON.stringify(b), now, now);
    return b;
  }
  // Um capítulo escrito: só grava se aquele capítulo ainda estiver vazio (dois pedidos ao mesmo tempo não brigam)
  async bookChapter(ckey, subject, idx, raw) {
    const b = await this.book(ckey); if (!b || !b.chapters[idx]) return null;
    if (chapterDone(b.chapters[idx])) return b.chapters[idx];
    const c = cleanChapter(Object.assign({ title: b.chapters[idx].title, synopsis: b.chapters[idx].synopsis }, raw), subject);
    if (c.err) return null;
    b.chapters[idx] = c.ch;
    this.sql.exec('UPDATE bank_books SET payload = ?, updated = ? WHERE ckey = ?', JSON.stringify(b), new Date().toISOString(), ckey);
    return c.ch;
  }
  // 🚩 de uma criança/responsável: avisos de 2 famílias diferentes (ou do admin) escondem o item até a revisão
  async report(id, family, admin = false) {
    const isBook = id.includes('|');
    const t = isBook ? 'bank_books' : 'bank_q', col = isBook ? 'ckey' : 'id';
    this.sql.exec('INSERT OR IGNORE INTO bank_reports (id, family, created) VALUES (?, ?, ?)', id, String(family || '?'), new Date().toISOString());
    const n = ([...this.sql.exec('SELECT COUNT(*) AS n FROM bank_reports WHERE id = ?', id)][0] || {}).n || 0;
    this.sql.exec(`UPDATE ${t} SET reports = ?, status = CASE WHEN (? >= 2 OR ?) AND status = 'ok' THEN 'hidden' ELSE status END WHERE ${col} = ?`, n, n, admin ? 1 : 0, id);
    const r = [...this.sql.exec(`SELECT reports, status FROM ${t} WHERE ${col} = ?`, id)][0];
    return r ? { reports: r.reports, status: r.status } : { missing: true };
  }

  /* ---- admin ---- */
  async stats() {
    const q = [...this.sql.exec(`SELECT source, status, COUNT(*) AS n, SUM(uses) AS uses FROM bank_q GROUP BY source, status`)];
    const b = [...this.sql.exec(`SELECT source, status, COUNT(*) AS n, SUM(uses) AS uses FROM bank_books GROUP BY source, status`)];
    const keys = ([...this.sql.exec(`SELECT COUNT(DISTINCT ckey) AS n FROM bank_q WHERE status = 'ok'`)][0] || {}).n || 0;
    const files = ([...this.sql.exec(`SELECT COUNT(*) AS n FROM bank_meta WHERE k LIKE 'file:%'`)][0] || {}).n || 0;
    return { questions: q, books: b, keys, files };
  }
  async list(f = {}) {
    const lim = Math.max(1, Math.min(200, Number(f.limit) || 50));
    let qs;
    if (f.ckey) qs = [...this.sql.exec(`SELECT * FROM bank_q WHERE ckey = ? AND status != 'deleted' ORDER BY created DESC LIMIT ?`, f.ckey, lim)];
    else qs = [...this.sql.exec(`SELECT * FROM bank_q WHERE status = 'hidden' OR reports > 0 ORDER BY updated DESC LIMIT ?`, lim)];
    const books = f.ckey ? [] : [...this.sql.exec(`SELECT ckey, subject, source, status, reports, uses, payload FROM bank_books WHERE status = 'hidden' OR reports > 0 ORDER BY updated DESC LIMIT 30`)]
      .map(r => ({ ckey: r.ckey, subject: r.subject, source: r.source, status: r.status, reports: r.reports, uses: r.uses, title: JSON.parse(r.payload).title }));
    return { items: qs.map(r => ({ id: r.id, ckey: r.ckey, source: r.source, status: r.status, reports: r.reports, uses: r.uses, q: JSON.parse(r.payload) })), books };
  }
  async keys(prefix) {
    return [...this.sql.exec(`SELECT ckey, COUNT(*) AS n, SUM(source = 'repo') AS repo, SUM(source = 'api') AS api FROM bank_q WHERE ckey LIKE ? AND status = 'ok' GROUP BY ckey ORDER BY ckey`, String(prefix || '') + '%')];
  }
  async setStatus(id, status) {
    if (!['ok', 'hidden', 'deleted'].includes(status)) return { err: 'Invalid status.' };
    const isBook = id.includes('|');
    this.sql.exec(`UPDATE ${isBook ? 'bank_books' : 'bank_q'} SET status = ?, reports = CASE WHEN ? = 'ok' THEN 0 ELSE reports END, updated = ? WHERE ${isBook ? 'ckey' : 'id'} = ?`, status, status, new Date().toISOString(), id);
    if (status === 'ok') this.sql.exec('DELETE FROM bank_reports WHERE id = ?', id);
    return { ok: true };
  }
  async edit(id, raw) {
    const r = [...this.sql.exec('SELECT * FROM bank_q WHERE id = ?', id)][0];
    if (!r) return { err: 'Question not found.' };
    const c = cleanQuestion(Object.assign(JSON.parse(r.payload), raw), r.subject);
    if (c.err) return { err: c.err };
    this.sql.exec(`UPDATE bank_q SET payload = ?, source = 'admin', status = 'ok', reports = 0, updated = ? WHERE id = ?`, JSON.stringify(c.q), new Date().toISOString(), id);
    return { ok: true, q: c.q };
  }
  // Exporta o que foi criado na hora (para levar ao repositório, se quiser)
  async exportApi(prefix, limit = 2000) {
    return [...this.sql.exec(`SELECT id, ckey, payload FROM bank_q WHERE source != 'repo' AND status = 'ok' AND ckey LIKE ? LIMIT ?`, String(prefix || '') + '%', limit)].map(r => ({ id: r.id, ckey: r.ckey, q: JSON.parse(r.payload) }));
  }
}
