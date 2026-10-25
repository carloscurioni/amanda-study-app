/* =========================================================================
   Diretório de contas (Durable Object com SQLite)
   Famílias, responsáveis, crianças, convites, sessões, uso do Claude e alertas.
   O hash de senhas roda aqui dentro (Durable Objects têm 30 s de CPU por
   requisição; o Worker comum só tem 10 ms no plano grátis).
   ========================================================================= */
import { DurableObject } from 'cloudflare:workers';

const PBKDF2_ITER = 100000;   // máximo aceito pelo Web Crypto dos Workers
const PIN_ITER = 20000;
const SESSION_DAYS = 60;
const INVITE_DAYS = 14;
const RESET_HOURS = 48;
const enc = new TextEncoder();

export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }

const now = () => new Date().toISOString();
const addMs = ms => new Date(Date.now() + ms).toISOString();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const newId = () => randomToken(9);
export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function pbkdf2(secret, saltB64, iter) {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
const newSalt = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
function sameString(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
const cleanEmail = e => String(e || '').trim().toLowerCase();
const cleanText = (s, max = 60) => String(s || '').replace(/[<>]/g, '').trim().slice(0, max);
const YEARS = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13'];
const AVATARS = ['🦉', '🦊', '🐼', '🐱', '🐶', '🦄', '🐸', '🐧', '🐯', '🐰', '🐨', '🐙'];
function checkPassword(p) {
  if (String(p || '').length < 8) throw new AppError(400, 'The password must be at least 8 characters long.');
}
function checkPin(pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) throw new AppError(400, 'The PIN must be 4 digits.');
}

export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, name TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', child_daily_usd REAL);
      CREATE TABLE IF NOT EXISTS parents (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'parent', consent_at TEXT, consent_version TEXT, created TEXT NOT NULL, last_login TEXT);
      CREATE TABLE IF NOT EXISTS children (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, name TEXT NOT NULL, year TEXT, avatar TEXT, pin_hash TEXT NOT NULL, pin_salt TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS invites (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, family_id TEXT, parent_id TEXT, note TEXT, created_by TEXT, created TEXT NOT NULL, expires TEXT NOT NULL, used_at TEXT);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, parent_id TEXT NOT NULL, family_id TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL, last_seen TEXT);
      CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, child_id TEXT NOT NULL, family_id TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, usd REAL NOT NULL DEFAULT 0, PRIMARY KEY (day, child_id));
      CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, family_id TEXT, child_id TEXT, kind TEXT, text TEXT, created TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS throttle (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until TEXT);
    `);
    // migração: sessão "desbloqueada" por alguns minutos depois que o responsável digita a senha (área dos pais)
    try { this.sql.exec('ALTER TABLE sessions ADD COLUMN unlocked_until TEXT'); } catch (e) { /* já existe */ }
    // 💬 mensagens do botão de dúvida/feedback e ajustes do app (ex.: e-mail de atendimento)
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, family_id TEXT, parent_id TEXT, child_id TEXT, who TEXT, kind TEXT NOT NULL, text TEXT NOT NULL,
        screen TEXT, app_version TEXT, user_agent TEXT, created TEXT NOT NULL, emailed INTEGER NOT NULL DEFAULT 0, resolved INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS feedback_family ON feedback (family_id, created);
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT);
    `);
  }
  // Chamada única usada pelo Worker: devolve o erro com o código HTTP certo
  // (erros lançados dentro de um Durable Object perdem campos extras no caminho).
  async rpc(name, ...args) {
    if (name === 'rpc' || name.startsWith('_') || typeof this[name] !== 'function') return { err: 'Invalid operation.', status: 400 };
    try { return { v: await this[name](...args) }; }
    catch (e) { return { err: e && e.message ? e.message : 'Server error.', status: e && Number.isInteger(e.status) ? e.status : 500 }; }
  }
  one(q, ...a) { return this.sql.exec(q, ...a).toArray()[0] || null; }
  all(q, ...a) { return this.sql.exec(q, ...a).toArray(); }

  /* ---------- tentativas (anti força-bruta) ---------- */
  throttled(k) { const r = this.one('SELECT n, until FROM throttle WHERE k = ?', k); return r && r.until && r.until > now(); }
  fail(k, max, minutes) {
    const r = this.one('SELECT n FROM throttle WHERE k = ?', k);
    const n = (r ? r.n : 0) + 1;
    this.sql.exec('INSERT OR REPLACE INTO throttle (k, n, until) VALUES (?, ?, ?)', k, n >= max ? 0 : n, n >= max ? addMs(minutes * 60000) : null);
  }
  clearFail(k) { this.sql.exec('DELETE FROM throttle WHERE k = ?', k); }

  /* ---------- sessões ---------- */
  async newSession(parentId, familyId) {
    const token = randomToken();
    this.sql.exec('INSERT INTO sessions (token_hash, parent_id, family_id, created, expires, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
      await sha256Hex(token), parentId, familyId, now(), addMs(SESSION_DAYS * 86400000), now());
    this.sql.exec('UPDATE parents SET last_login = ? WHERE id = ?', now(), parentId);
    return token;
  }
  async auth(token) {
    if (!token) return null;
    const h = await sha256Hex(token);
    const s = this.one('SELECT * FROM sessions WHERE token_hash = ?', h);
    if (!s || s.expires < now()) return null;
    const parent = this.one('SELECT id, family_id, name, email, role FROM parents WHERE id = ?', s.parent_id);
    const family = this.one('SELECT id, name, status, child_daily_usd FROM families WHERE id = ?', s.family_id);
    if (!parent || !family) return null;
    if (family.status !== 'active' && parent.role !== 'admin') return null;
    if (!s.last_seen || s.last_seen < addMs(-3600000)) this.sql.exec('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', now(), h);
    return { parent, family, children: this.children(family.id), unlocked: !!(s.unlocked_until && s.unlocked_until > now()) };
  }
  async lockSession(token) { if (token) this.sql.exec('UPDATE sessions SET unlocked_until = NULL WHERE token_hash = ?', await sha256Hex(token)); return { ok: true }; }
  async logout(token) { if (token) this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256Hex(token)); return { ok: true }; }
  children(familyId) { return this.all('SELECT id, name, year, avatar FROM children WHERE family_id = ? ORDER BY created', familyId); }

  /* ---------- primeiro acesso (administrador) ---------- */
  status() { return { accounts: this.one('SELECT COUNT(*) AS n FROM parents').n }; }
  async setup(d) {
    if (this.status().accounts > 0) throw new AppError(409, 'The app has already been set up.');
    checkPassword(d.password); checkPin(d.childPin);
    const email = cleanEmail(d.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError(400, 'Invalid e-mail address.');
    if (!d.consent) throw new AppError(400, 'You need to accept the privacy notice.');
    const familyId = newId(), parentId = newId(), childId = newId();
    const salt = newSalt(), pinSalt = newSalt();
    this.sql.exec('INSERT INTO families (id, name, created) VALUES (?, ?, ?)', familyId, cleanText(d.familyName) || 'My family', now());
    this.sql.exec('INSERT INTO parents (id, family_id, name, email, pass_hash, pass_salt, role, consent_at, consent_version, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      parentId, familyId, cleanText(d.parentName) || 'Parent', email, await pbkdf2(d.password, salt, PBKDF2_ITER), salt, 'admin', now(), 'v1', now());
    this.sql.exec('INSERT INTO children (id, family_id, name, year, avatar, pin_hash, pin_salt, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      childId, familyId, cleanText(d.childName, 30) || 'Child', YEARS.includes(d.childYear) ? d.childYear : 'Y5', AVATARS.includes(d.childAvatar) ? d.childAvatar : '🦉', await pbkdf2(String(d.childPin), pinSalt, PIN_ITER), pinSalt, now());
    return { token: await this.newSession(parentId, familyId), childId };
  }

  /* ---------- login e senha ---------- */
  async login(email, password) {
    email = cleanEmail(email);
    const k = 'login:' + email;
    if (this.throttled(k)) throw new AppError(429, 'Too many attempts. Wait 15 minutes and try again.');
    const p = this.one('SELECT * FROM parents WHERE email = ?', email);
    const hash = p ? await pbkdf2(String(password || ''), p.pass_salt, PBKDF2_ITER) : await pbkdf2('x', newSalt(), PBKDF2_ITER);
    if (!p || !sameString(hash, p.pass_hash)) { this.fail(k, 5, 15); throw new AppError(401, 'Incorrect e-mail or password.'); }
    const fam = this.one('SELECT status FROM families WHERE id = ?', p.family_id);
    if (fam && fam.status !== 'active' && p.role !== 'admin') throw new AppError(403, 'This account is paused. Please contact the administrator.');
    this.clearFail(k);
    return { token: await this.newSession(p.id, p.family_id) };
  }
  async verifyPassword(parentId, password, token) {
    const k = 'verify:' + parentId;
    if (this.throttled(k)) throw new AppError(429, 'Too many attempts. Wait 15 minutes.');
    const p = this.one('SELECT pass_hash, pass_salt FROM parents WHERE id = ?', parentId);
    const ok = !!p && sameString(await pbkdf2(String(password || ''), p.pass_salt, PBKDF2_ITER), p.pass_hash);
    if (!ok) this.fail(k, 5, 15); else this.clearFail(k);
    if (ok && token) this.sql.exec('UPDATE sessions SET unlocked_until = ? WHERE token_hash = ?', addMs(15 * 60000), await sha256Hex(token));
    return { ok };
  }
  async changePassword(parentId, oldPw, newPw) {
    if (!(await this.verifyPassword(parentId, oldPw)).ok) throw new AppError(401, 'Current password is incorrect.');
    checkPassword(newPw);
    const salt = newSalt();
    this.sql.exec('UPDATE parents SET pass_hash = ?, pass_salt = ? WHERE id = ?', await pbkdf2(newPw, salt, PBKDF2_ITER), salt, parentId);
    return { ok: true };
  }

  /* ---------- convites (nova família, outro responsável, redefinir senha) ---------- */
  async createInvite(by, { kind, note, familyId, parentId }) {
    const token = randomToken(24);
    const hours = kind === 'reset' ? RESET_HOURS : INVITE_DAYS * 24;
    this.sql.exec('INSERT INTO invites (token_hash, kind, family_id, parent_id, note, created_by, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      await sha256Hex(token), kind, familyId || null, parentId || null, cleanText(note, 80), by, now(), addMs(hours * 3600000));
    return { token, expires: addMs(hours * 3600000) };
  }
  async inviteRow(token) {
    const inv = this.one('SELECT * FROM invites WHERE token_hash = ?', await sha256Hex(String(token || '')));
    if (!inv || inv.used_at || inv.expires < now()) return null;
    return inv;
  }
  async inviteInfo(token) {
    const inv = await this.inviteRow(token);
    if (!inv) return { valid: false };
    const fam = inv.family_id ? this.one('SELECT name FROM families WHERE id = ?', inv.family_id) : null;
    const par = inv.parent_id ? this.one('SELECT name, email FROM parents WHERE id = ?', inv.parent_id) : null;
    return { valid: true, kind: inv.kind, familyName: fam ? fam.name : '', parentName: par ? par.name : '', email: par ? par.email : '' };
  }
  async acceptInvite(token, d) {
    const inv = await this.inviteRow(token);
    if (!inv) throw new AppError(410, 'This link has expired or has already been used. Ask for a new one.');
    checkPassword(d.password);
    const salt = newSalt();
    const hash = await pbkdf2(d.password, salt, PBKDF2_ITER);
    let parentId, familyId;
    if (inv.kind === 'reset') {
      parentId = inv.parent_id;
      const p = this.one('SELECT family_id FROM parents WHERE id = ?', parentId);
      if (!p) throw new AppError(410, 'Account not found.');
      familyId = p.family_id;
      this.sql.exec('UPDATE parents SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, parentId);
      this.sql.exec('DELETE FROM sessions WHERE parent_id = ?', parentId);
    } else {
      const email = cleanEmail(d.email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError(400, 'Invalid e-mail address.');
      if (this.one('SELECT id FROM parents WHERE email = ?', email)) throw new AppError(409, 'There is already an account with this e-mail. Log in with it or use another one.');
      if (!d.consent) throw new AppError(400, 'You need to accept the privacy notice.');
      parentId = newId();
      if (inv.kind === 'family') {
        familyId = newId();
        this.sql.exec('INSERT INTO families (id, name, created) VALUES (?, ?, ?)', familyId, cleanText(d.familyName) || 'Family', now());
      } else {
        familyId = inv.family_id;
        if (!this.one('SELECT id FROM families WHERE id = ?', familyId)) throw new AppError(410, 'Family not found.');
      }
      this.sql.exec('INSERT INTO parents (id, family_id, name, email, pass_hash, pass_salt, role, consent_at, consent_version, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        parentId, familyId, cleanText(d.parentName) || 'Parent', email, hash, salt, 'parent', now(), 'v1', now());
    }
    this.sql.exec('UPDATE invites SET used_at = ? WHERE token_hash = ?', now(), inv.token_hash);
    return { token: await this.newSession(parentId, familyId) };
  }

  /* ---------- crianças ---------- */
  ownChild(familyId, childId) {
    const c = this.one('SELECT * FROM children WHERE id = ? AND family_id = ?', String(childId || ''), familyId);
    if (!c) throw new AppError(404, 'Child not found in this family.');
    return c;
  }
  async addChild(familyId, d) {
    if (this.one('SELECT COUNT(*) AS n FROM children WHERE family_id = ?', familyId).n >= 8) throw new AppError(400, 'Limit of 8 children per family.');
    checkPin(d.pin);
    const id = newId(), salt = newSalt();
    this.sql.exec('INSERT INTO children (id, family_id, name, year, avatar, pin_hash, pin_salt, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, familyId, cleanText(d.name, 30) || 'Child', YEARS.includes(d.year) ? d.year : 'Y5', AVATARS.includes(d.avatar) ? d.avatar : '🦉', await pbkdf2(String(d.pin), salt, PIN_ITER), salt, now());
    return { id };
  }
  async updateChild(familyId, childId, d) {
    this.ownChild(familyId, childId);
    if (d.name !== undefined) this.sql.exec('UPDATE children SET name = ? WHERE id = ?', cleanText(d.name, 30) || 'Child', childId);
    if (d.year !== undefined && YEARS.includes(d.year)) this.sql.exec('UPDATE children SET year = ? WHERE id = ?', d.year, childId);
    if (d.avatar !== undefined && AVATARS.includes(d.avatar)) this.sql.exec('UPDATE children SET avatar = ? WHERE id = ?', d.avatar, childId);
    if (d.pin !== undefined) { checkPin(d.pin); const salt = newSalt(); this.sql.exec('UPDATE children SET pin_hash = ?, pin_salt = ? WHERE id = ?', await pbkdf2(String(d.pin), salt, PIN_ITER), salt, childId); }
    return { ok: true };
  }
  deleteChild(familyId, childId) {
    this.ownChild(familyId, childId);
    this.sql.exec('DELETE FROM children WHERE id = ?', childId);
    return { ok: true };
  }
  async unlockChild(familyId, childId, pin) {
    const c = this.ownChild(familyId, childId);
    const k = 'pin:' + childId;
    if (this.throttled(k)) throw new AppError(429, 'Too many attempts. Wait 10 minutes or ask a grown-up for help.');
    const ok = sameString(await pbkdf2(String(pin || ''), c.pin_salt, PIN_ITER), c.pin_hash);
    if (!ok) { this.fail(k, 8, 10); throw new AppError(401, 'Incorrect PIN.'); }
    this.clearFail(k);
    return { ok: true };
  }
  deleteFamily(familyId) {
    const kids = this.all('SELECT id FROM children WHERE family_id = ?', familyId).map(r => r.id);
    if (this.one("SELECT id FROM parents WHERE family_id = ? AND role = 'admin'", familyId) && this.one("SELECT COUNT(*) AS n FROM parents WHERE role = 'admin'").n <= 1)
      throw new AppError(400, 'The administrator’s family cannot be deleted here.');
    for (const t of ['children', 'invites', 'usage']) this.sql.exec(`DELETE FROM ${t} WHERE family_id = ?`, familyId);
    this.sql.exec('DELETE FROM sessions WHERE family_id = ?', familyId);
    this.sql.exec('DELETE FROM parents WHERE family_id = ?', familyId);
    this.sql.exec('DELETE FROM reports WHERE family_id = ?', familyId);
    this.sql.exec('DELETE FROM feedback WHERE family_id = ?', familyId);
    this.sql.exec('DELETE FROM families WHERE id = ?', familyId);
    return { childIds: kids };
  }
  // Tira um responsável da família (ex.: entrou pelo link de convite por engano). Não remove a si mesmo nem o administrador.
  removeParent(familyId, parentId, byId) {
    const p = this.one('SELECT id, role FROM parents WHERE id = ? AND family_id = ?', String(parentId), familyId);
    if (!p) throw new AppError(404, 'Parent not found in this family.');
    if (p.id === byId) throw new AppError(400, 'You can’t remove yourself. Ask another parent to do it.');
    if (p.role === 'admin') throw new AppError(400, 'The administrator can’t be removed.');
    this.sql.exec('DELETE FROM sessions WHERE parent_id = ?', p.id);
    this.sql.exec("DELETE FROM invites WHERE parent_id = ? AND kind = 'reset'", p.id);
    this.sql.exec('DELETE FROM parents WHERE id = ?', p.id);
    return { ok: true };
  }
  familyParents(familyId) { return this.all('SELECT id, name, email, role, last_login FROM parents WHERE family_id = ? ORDER BY created', familyId); }

  /* ---------- uso do Claude (controle de custo) ---------- */
  aiCheck(familyId, childId, childCapUsd, monthCapUsd) {
    const day = now().slice(0, 10), month = day.slice(0, 7);
    const fam = this.one('SELECT child_daily_usd FROM families WHERE id = ?', familyId);
    const cap = fam && fam.child_daily_usd != null ? fam.child_daily_usd : childCapUsd;
    const today = this.one('SELECT usd FROM usage WHERE day = ? AND child_id = ?', day, childId);
    if (today && today.usd >= cap) return { ok: false, why: 'child' };
    const m = this.one('SELECT COALESCE(SUM(usd), 0) AS s FROM usage WHERE day LIKE ?', month + '%');
    if (m.s >= monthCapUsd) return { ok: false, why: 'month' };
    return { ok: true };
  }
  aiRecord(familyId, childId, usd) {
    const day = now().slice(0, 10);
    this.sql.exec(`INSERT INTO usage (day, child_id, family_id, calls, usd) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(day, child_id) DO UPDATE SET calls = calls + 1, usd = usd + excluded.usd`, day, childId, familyId, usd);
  }
  familyUsage(familyId) {
    const month = now().slice(0, 7), day = now().slice(0, 10);
    return this.all(`SELECT c.id, c.name, COALESCE(SUM(CASE WHEN u.day = ? THEN u.usd END), 0) AS today_usd, COALESCE(SUM(u.usd), 0) AS month_usd, COALESCE(SUM(u.calls), 0) AS month_calls
      FROM children c LEFT JOIN usage u ON u.child_id = c.id AND u.day LIKE ? WHERE c.family_id = ? GROUP BY c.id ORDER BY c.created`, day, month + '%', familyId);
  }

  /* ---------- alertas (botão "avisar problema") ---------- */
  report(familyId, childId, kind, text) {
    if (this.one("SELECT COUNT(*) AS n FROM reports WHERE family_id = ? AND created > ?", familyId, addMs(-86400000)).n > 30) return { ok: true };
    this.sql.exec('INSERT INTO reports (family_id, child_id, kind, text, created) VALUES (?, ?, ?, ?, ?)', familyId, childId || null, cleanText(kind, 20), String(text || '').slice(0, 2000), now());
    return { ok: true };
  }

  /* ---------- administrador ---------- */
  adminOverview() {
    const month = now().slice(0, 7), day = now().slice(0, 10);
    const families = this.all('SELECT * FROM families ORDER BY created').map(f => ({
      ...f,
      parents: this.familyParents(f.id),
      children: this.children(f.id),
      today_usd: this.one('SELECT COALESCE(SUM(usd), 0) AS s FROM usage WHERE family_id = ? AND day = ?', f.id, day).s,
      month_usd: this.one('SELECT COALESCE(SUM(usd), 0) AS s FROM usage WHERE family_id = ? AND day LIKE ?', f.id, month + '%').s,
      month_calls: this.one('SELECT COALESCE(SUM(calls), 0) AS s FROM usage WHERE family_id = ? AND day LIKE ?', f.id, month + '%').s,
    }));
    const invites = this.all("SELECT substr(token_hash, 1, 12) AS id, kind, note, created, expires, used_at FROM invites WHERE kind = 'family' ORDER BY created DESC LIMIT 30");
    const reports = this.all('SELECT r.*, f.name AS family_name, c.name AS child_name FROM reports r LEFT JOIN families f ON f.id = r.family_id LEFT JOIN children c ON c.id = r.child_id WHERE resolved = 0 ORDER BY created DESC LIMIT 50');
    const monthUsd = this.one('SELECT COALESCE(SUM(usd), 0) AS s FROM usage WHERE day LIKE ?', month + '%').s;
    return { families, invites, reports, monthUsd };
  }
  revokeInvite(prefix) { this.sql.exec("UPDATE invites SET expires = ? WHERE substr(token_hash, 1, 12) = ? AND used_at IS NULL", now(), String(prefix)); return { ok: true }; }
  setFamily(familyId, d) {
    if (d.status && ['active', 'paused'].includes(d.status)) this.sql.exec('UPDATE families SET status = ? WHERE id = ?', d.status, familyId);
    if (d.child_daily_usd !== undefined) this.sql.exec('UPDATE families SET child_daily_usd = ? WHERE id = ?', d.child_daily_usd === null || d.child_daily_usd === '' ? null : Math.max(0, Number(d.child_daily_usd) || 0), familyId);
    return { ok: true };
  }
  // 💬 Feedback: grava sempre (até 20 por família/dia); diz se ainda pode mandar e-mail (até 10 por família/dia)
  feedbackAdd(d) {
    const day = addMs(-86400000);
    const n = this.one('SELECT COUNT(*) AS n FROM feedback WHERE family_id = ? AND created > ?', d.familyId, day).n;
    if (n >= 20) throw new AppError(429, 'Too many messages today. Try again tomorrow. 🙂');
    const mailed = this.one('SELECT COUNT(*) AS n FROM feedback WHERE family_id = ? AND created > ? AND emailed = 1', d.familyId, day).n;
    this.sql.exec('INSERT INTO feedback (family_id, parent_id, child_id, who, kind, text, screen, app_version, user_agent, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      d.familyId, d.parentId, d.childId || null, cleanText(d.who, 60), d.kind, String(d.text).slice(0, 2000), cleanText(d.screen, 40), cleanText(d.version, 20), String(d.userAgent || '').slice(0, 300), now());
    const id = this.one('SELECT last_insert_rowid() AS id').id;
    const fam = this.one('SELECT name FROM families WHERE id = ?', d.familyId);
    return { id, canEmail: mailed < 10, familyName: fam ? fam.name : '', supportEmail: this.getSetting('support_email', 'carloscurioni@gmail.com') };
  }
  feedbackEmailed(id) { this.sql.exec('UPDATE feedback SET emailed = 1 WHERE id = ?', Number(id)); return { ok: true }; }
  feedbackList(all) {
    return this.all(`SELECT fb.*, f.name AS family_name, c.name AS child_name, p.name AS parent_name FROM feedback fb LEFT JOIN families f ON f.id = fb.family_id LEFT JOIN children c ON c.id = fb.child_id LEFT JOIN parents p ON p.id = fb.parent_id
      ${all ? '' : 'WHERE fb.resolved = 0'} ORDER BY fb.created DESC LIMIT 100`);
  }
  feedbackResolve(id, resolved = true) { this.sql.exec('UPDATE feedback SET resolved = ? WHERE id = ?', resolved ? 1 : 0, Number(id)); return { ok: true }; }
  getSetting(key, def = null) { const r = this.one('SELECT value FROM app_settings WHERE key = ?', key); return r ? r.value : def; }
  setSetting(key, value) {
    if (key === 'support_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) throw new AppError(400, 'Invalid e-mail address.');
    if (key === 'easy_max_year' && !(Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 13)) throw new AppError(400, 'Invalid year.');
    this.sql.exec('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value).slice(0, 200)); return { ok: true };
  }
  settings() { return { support_email: this.getSetting('support_email', 'carloscurioni@gmail.com'), easy_max_year: this.getSetting('easy_max_year', null) }; }
  resolveReport(id) { this.sql.exec('UPDATE reports SET resolved = 1 WHERE id = ?', Number(id)); return { ok: true }; }
  parentById(id) { return this.one('SELECT id, family_id, name, email FROM parents WHERE id = ?', String(id || '')); }
}
