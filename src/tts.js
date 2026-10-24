/* Voz natural da Lumi: áudios gerados pelo Google Cloud Text-to-Speech, guardados aqui (Durable Object com SQLite)
   para que o mesmo trecho (ex.: capítulo do banco compartilhado) não seja pago de novo. */
import { DurableObject } from 'cloudflare:workers';

const MAX_ENTRIES = 4000;   // ~ alguns GB no máximo; os mais antigos saem primeiro
export class Tts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tts_audio (k TEXT PRIMARY KEY, voice TEXT, chars INTEGER, audio BLOB, created TEXT, used TEXT, hits INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS tts_used ON tts_audio (used);`);
  }
  async get(k) {
    const r = [...this.sql.exec('SELECT audio FROM tts_audio WHERE k = ?', k)][0];
    if (!r) return null;
    this.sql.exec('UPDATE tts_audio SET hits = hits + 1, used = ? WHERE k = ?', new Date().toISOString(), k);
    return r.audio;
  }
  async put(k, voice, chars, audio) {
    const now = new Date().toISOString();
    this.sql.exec('INSERT OR REPLACE INTO tts_audio (k, voice, chars, audio, created, used, hits) VALUES (?, ?, ?, ?, ?, ?, 0)', k, voice, chars, audio, now, now);
    const n = ([...this.sql.exec('SELECT COUNT(*) AS n FROM tts_audio')][0] || {}).n || 0;
    if (n > MAX_ENTRIES) this.sql.exec('DELETE FROM tts_audio WHERE k IN (SELECT k FROM tts_audio ORDER BY used ASC LIMIT ?)', n - MAX_ENTRIES);
    return { ok: true };
  }
  async stats() {
    const r = [...this.sql.exec('SELECT COUNT(*) AS n, SUM(chars) AS chars, SUM(hits) AS hits, SUM(LENGTH(audio)) AS bytes FROM tts_audio')][0] || {};
    return { entries: r.n || 0, chars: r.chars || 0, hits: r.hits || 0, mb: Math.round((r.bytes || 0) / 1e5) / 10 };
  }
}
