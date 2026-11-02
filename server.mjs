import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { DemoPaymentProvider } from './payment-provider.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const secret = () => randomBytes(32).toString('base64url');
const hash = s => createHash('sha256').update(s).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const cleanPlate = p => { if (typeof p !== 'string' || !/^[A-Za-z0-9 -]{3,16}$/.test(p.trim())) fail(400, 'Enter a plate of 3–16 letters, numbers, spaces or hyphens.'); return p.trim().toUpperCase(); };
const int = (n, min, max) => { if (!Number.isSafeInteger(n) || n < min || n > max) fail(400, `Expected a whole number from ${min} to ${max}.`); return n; };
const key = x => { if (typeof x !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(x)) fail(400, 'A valid idempotency key is required.'); return x; };
export function createApp(options = {}) {
  const dataDir = options.dataDir || resolve(root, '.local'); mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolve(dataDir, 'parking.sqlite')); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`
  CREATE TABLE IF NOT EXISTS tariffs(id INTEGER PRIMARY KEY, rate INTEGER NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS zones(id TEXT PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL, currency TEXT NOT NULL, tariff INTEGER REFERENCES tariffs(id));
  CREATE TABLE IF NOT EXISTS staff(id TEXT PRIMARY KEY, role TEXT NOT NULL, zone TEXT NOT NULL, salt TEXT NOT NULL, digest TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS auth(token TEXT PRIMARY KEY, staff TEXT REFERENCES staff(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY, zone TEXT REFERENCES zones(id), plate TEXT, minutes INTEGER, tariff INTEGER, rate INTEGER, total INTEGER, created INTEGER);
  CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, access TEXT UNIQUE, quote TEXT UNIQUE REFERENCES quotes(id), idem TEXT UNIQUE, fingerprint TEXT, zone TEXT, plate TEXT, minutes INTEGER, tariff INTEGER, rate INTEGER, total INTEGER, created INTEGER, creator TEXT, start INTEGER, end INTEGER);
  CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, session TEXT UNIQUE REFERENCES sessions(id), idem TEXT UNIQUE, status TEXT, created INTEGER, due INTEGER, outcome TEXT);
  CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, attempt TEXT REFERENCES attempts(id), status TEXT, received INTEGER, applied INTEGER);
  CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, session TEXT UNIQUE REFERENCES sessions(id), created INTEGER);
  CREATE TABLE IF NOT EXISTS issues(id TEXT PRIMARY KEY, session TEXT REFERENCES sessions(id), actor TEXT, reason TEXT, created INTEGER, resolved INTEGER);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, zone TEXT, session TEXT, actor TEXT, action TEXT, detail TEXT, created INTEGER);
  `);
  const run = (s, ...p) => db.prepare(s).run(...p), get = (s, ...p) => db.prepare(s).get(...p), all = (s, ...p) => db.prepare(s).all(...p);
  const now = options.now || Date.now;
  const provider = new DemoPaymentProvider({ delayMs: options.paymentDelay ?? (process.env.ORYA_HARNESS === '1' ? 30000 : 2000) });
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const v = fn(); db.exec('COMMIT'); return v; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const audit = (zone, session, actor, action, detail = '') => run('INSERT INTO audit(zone,session,actor,action,detail,created) VALUES(?,?,?,?,?,?)', zone, session, actor, action, detail, now());
  if (!get('SELECT id FROM zones LIMIT 1')) transaction(() => {
    run('INSERT INTO tariffs VALUES(1,1000,?)', now());
    run('INSERT INTO zones VALUES(?,?,?,?,?)', 'CG-01', 'Congo Graphic · Gombe', 'Africa/Kinshasa', 'CDF', 1);
  });
  const accessPath = resolve(dataDir, 'access.json');
  let access;
  if (existsSync(accessPath)) access = JSON.parse(readFileSync(accessPath, 'utf8'));
  else { access = { attendant: secret().slice(0, 18), manager: secret().slice(0, 18), harness: secret() }; writeFileSync(accessPath, JSON.stringify(access, null, 2), { mode: 0o600 }); }
  for (const role of ['attendant', 'manager']) if (!get('SELECT id FROM staff WHERE id=?', role)) {
    const salt = secret(); run('INSERT INTO staff VALUES(?,?,?,?,?)', role, role, 'CG-01', salt, scryptSync(access[role], salt, 32).toString('hex'));
  }
  const zone = id => { const z = get('SELECT z.*,t.rate FROM zones z JOIN tariffs t ON t.id=z.tariff WHERE z.id=?', id); if (!z) fail(404, 'Unknown zone. Check the posted zone code.'); return z; };
  const session = id => { const s = get('SELECT * FROM sessions WHERE id=?', id); if (!s) fail(404, 'Session not found.'); return s; };
  const snapshot = (s, staff = false) => {
    const a = get('SELECT * FROM attempts WHERE session=?', s.id), r = get('SELECT * FROM receipts WHERE session=?', s.id), z = zone(s.zone);
    return { reference: s.id, zone: s.zone, zoneName: z.name, timezone: z.timezone, currency: z.currency, plate: s.plate, minutes: s.minutes, tariff: s.tariff, rate: s.rate, total: s.total, created: s.created, start: s.start, end: s.end,
      payment: a?.status || 'not_started', validity: a?.status === 'confirmed' ? (s.end > now() ? 'valid' : 'expired') : 'not_valid', settlement: 'unmatched', receipt: a?.status === 'confirmed' ? r?.id : null, demo: true,
      ...(staff ? { creator: s.creator, attempt: a?.id || null, history: all('SELECT actor,action,detail,created FROM audit WHERE session=? ORDER BY id', s.id) } : {}) };
  };
  // Provider adapter boundary: only server code can apply events, atomically.
  const applyEvent = (id, attemptId, status) => transaction(() => {
    if (!['pending', 'confirmed', 'failed', 'refunded'].includes(status)) fail(400, 'Unsupported payment event.');
    const prior = get('SELECT * FROM events WHERE id=?', id);
    if (prior) { if (prior.attempt !== attemptId || prior.status !== status) fail(409, 'Event key was reused with different data.'); return { duplicate: true }; }
    const a = get('SELECT * FROM attempts WHERE id=?', attemptId); if (!a) fail(404, 'Attempt not found.');
    const s = session(a.session);
    const allowed = (a.status === 'pending' && ['confirmed', 'failed'].includes(status)) || (a.status === 'confirmed' && status === 'refunded');
    run('INSERT INTO events VALUES(?,?,?,?,?)', id, attemptId, status, now(), Number(allowed));
    if (allowed) {
      run('UPDATE attempts SET status=?,due=NULL WHERE id=?', status, attemptId);
      if (status === 'confirmed') { run('UPDATE sessions SET start=?,end=? WHERE id=?', now(), now() + s.minutes * 60000, s.id); run('INSERT INTO receipts VALUES(?,?,?)', `RC-${randomBytes(8).toString('hex').toUpperCase()}`, s.id, now()); }
      audit(s.zone, s.id, 'demo-provider', `payment_${status}`, `Simulated provider event ${id}`);
    } else audit(s.zone, s.id, 'demo-provider', 'event_ignored', `${status}; current status ${a.status}`);
    return { applied: allowed };
  });
  const tick = () => { for (const a of all('SELECT * FROM attempts WHERE due IS NOT NULL AND due<=? AND status=?', now(), 'pending')) { const event = provider.eventFor(a); applyEvent(event.id, event.attempt, event.status); } };
  const timer = setInterval(tick, 500); timer.unref();
  const loginFailures = new Map();
  const server = http.createServer(async (req, res) => {
    const send = (status, obj, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type }); res.end(type.startsWith('application/json') ? JSON.stringify(obj) : obj); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) fail(403, 'This demo accepts loopback hosts only.');
      const url = new URL(req.url, `http://${host}`), path = url.pathname, method = req.method;
      if (method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${host}`) fail(403, 'Cross-origin request denied.');
      let body = {};
      if (method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON is required.');
        let raw = ''; for await (const c of req) { raw += c; if (raw.length > 16000) fail(413, 'Request too large.'); }
        try { body = JSON.parse(raw || '{}'); } catch { fail(400, 'Invalid JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Expected a JSON object.');
      }
      const cookie = /(?:^|; )orya_staff=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const identity = cookie ? get('SELECT s.* FROM staff s JOIN auth a ON a.staff=s.id WHERE a.token=? AND a.expires>?', hash(cookie), now()) : null;
      const staff = (role, zoneId) => { if (!identity) fail(401, 'Sign in to access the staff workspace.'); if (role && identity.role !== role) fail(403, 'This action requires a manager.'); if (zoneId && identity.zone !== zoneId) fail(403, 'This zone is not assigned to you.'); return identity; };
      const driverSession = () => { const token = req.headers.authorization?.replace(/^Bearer /, ''); if (!token) fail(401, 'A private pass link is required.'); const s = get('SELECT * FROM sessions WHERE access=?', token); if (!s) fail(404, 'Pass not found.'); return s; };
      if (path === '/api/health' && method === 'GET') return send(200, { ok: true, demo: true });
      if (path === '/api/zone' && method === 'GET') return send(200, { ...zone(url.searchParams.get('code') || 'CG-01'), serverTime: now() });
      if (path === '/api/qr' && method === 'GET') return send(200, await QRCode.toString(`http://${host}/?zone=CG-01`, { type: 'svg', margin: 2 }), 'image/svg+xml');
      if (path === '/api/login' && method === 'POST') {
        const bucket = req.socket.remoteAddress, f = loginFailures.get(bucket) || { count: 0, until: 0 };
        if (f.until > now()) fail(429, 'Too many sign-in attempts. Try again in five minutes.');
        const u = get('SELECT * FROM staff WHERE id=?', String(body.username || ''));
        const candidate = scryptSync(String(body.password || ''), u?.salt || 'dummy-salt', 32);
        if (!u || !timingSafeEqual(candidate, Buffer.from(u.digest, 'hex'))) { f.count++; if (f.count >= 10) { f.until = now() + 300000; f.count = 0; } loginFailures.set(bucket, f); fail(401, 'Incorrect username or password.'); }
        loginFailures.delete(bucket); const token = secret(); run('DELETE FROM auth WHERE expires<=?', now());
        run('INSERT INTO auth VALUES(?,?,?)', hash(token), u.id, now() + 8 * 3600000);
        res.setHeader('Set-Cookie', `orya_staff=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        return send(200, { id: u.id, role: u.role, zone: u.zone });
      }
      if (path === '/api/logout' && method === 'POST') { if (cookie) run('DELETE FROM auth WHERE token=?', hash(cookie)); res.setHeader('Set-Cookie', 'orya_staff=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(200, { ok: true }); }
      if (path === '/api/me' && method === 'GET') { const u = staff(); return send(200, { id: u.id, role: u.role, zone: u.zone }); }
      if (path === '/api/quotes' && method === 'POST') {
        const z = zone(body.zone); if (body.assisted) staff(null, z.id);
        const plate = cleanPlate(body.plate), minutes = int(body.minutes, 30, 480); if (minutes % 30) fail(400, 'Choose a duration in 30-minute increments.');
        const q = { id: secret(), zone: z.id, plate, minutes, tariff: z.tariff, rate: z.rate, total: z.rate * minutes / 30, created: now() };
        run('INSERT INTO quotes(id,zone,plate,minutes,tariff,rate,total,created) VALUES(?,?,?,?,?,?,?,?)', ...Object.values(q));
        return send(201, { ...q, currency: z.currency, expires: q.created + 600000 });
      }
      if (path === '/api/sessions' && method === 'POST') {
        const idem = key(body.idempotencyKey), q = get('SELECT * FROM quotes WHERE id=?', String(body.quote || '')); if (!q) fail(404, 'Quote not found.');
        const actor = body.assisted ? staff(null, q.zone).id : 'driver', fingerprint = JSON.stringify([q.id, actor]);
        const result = transaction(() => {
          const old = get('SELECT * FROM sessions WHERE idem=?', idem);
          if (old) { if (old.fingerprint !== fingerprint) fail(409, 'Submission key was reused with different data.'); return old; }
          if (q.created + 600000 < now()) fail(409, 'Quote expired. Please request a fresh quote.');
          if (get('SELECT id FROM sessions WHERE quote=?', q.id)) fail(409, 'This quote already has a session.');
          const id = `CG-${randomBytes(6).toString('hex').toUpperCase()}`, token = secret();
          run('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, token, q.id, idem, fingerprint, q.zone, q.plate, q.minutes, q.tariff, q.rate, q.total, now(), actor, null, null);
          audit(q.zone, id, actor, 'session_created', `Sample tariff v${q.tariff}; ${q.total} CDF`); return session(id);
        });
        return send(201, { ...snapshot(result), accessToken: result.access });
      }
      if (path === '/api/pass' && method === 'GET') return send(200, snapshot(driverSession()));
      if (path === '/api/payment' && method === 'POST') {
        const s = driverSession(), idem = key(body.idempotencyKey);
        const a = transaction(() => {
          const oldKey = get('SELECT * FROM attempts WHERE idem=?', idem); if (oldKey && oldKey.session !== s.id) fail(409, 'Payment key belongs to a different session.');
          const old = get('SELECT * FROM attempts WHERE session=?', s.id); if (old) return old;
          const id = randomUUID(), state = provider.createAttempt({ now: now() }); run('INSERT INTO attempts(id,session,idem,status,created,due,outcome) VALUES(?,?,?,?,?,?,?)', id, s.id, idem, state.status, now(), state.due, state.outcome);
          audit(s.zone, s.id, 'driver-or-assisted', 'payment_started', 'DEMO only; no money requested'); return get('SELECT * FROM attempts WHERE id=?', id);
        }); return send(200, { attempt: a.id, status: a.status, demo: true });
      }
      if (path === '/api/harness' && method === 'POST') {
        if (!(options.harness ?? process.env.ORYA_HARNESS === '1')) fail(404, 'Not found.');
        const h = req.headers['x-demo-key']; if (!h || !timingSafeEqual(Buffer.from(hash(h)), Buffer.from(hash(access.harness)))) fail(403, 'Harness credential required.');
        const a = get('SELECT * FROM attempts WHERE id=?', String(body.attempt || '')); if (!a) fail(404, 'Attempt not found.');
        if (body.scenario === 'delayed' || body.scenario === 'pending') { if (a.status !== 'pending') fail(409, 'Only pending attempts can be scheduled.'); run('UPDATE attempts SET due=? WHERE id=?', body.scenario === 'delayed' ? now() + int(body.delayMs ?? 15000, 1000, 86400000) : null, a.id); return send(200, { status: 'pending' }); }
        if (!['confirmed', 'failed', 'refunded'].includes(body.scenario)) fail(400, 'Unknown scenario.');
        return send(200, applyEvent(key(body.eventId), a.id, body.scenario));
      }
      if (path === '/api/staff/sessions' && method === 'GET') {
        const u = staff(null, url.searchParams.get('zone') || identity?.zone);
        const q = (url.searchParams.get('q') || '').toUpperCase();
        const rows = all('SELECT * FROM sessions WHERE zone=? ORDER BY created DESC', u.zone).map(s => snapshot(s, true)).filter(s => {
          const date = new Intl.DateTimeFormat('en-CA', { timeZone: s.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(s.created);
          return (!q || s.plate.includes(q) || s.reference.includes(q)) && (!url.searchParams.get('date') || date === url.searchParams.get('date')) && (!url.searchParams.get('payment') || s.payment === url.searchParams.get('payment')) && (!url.searchParams.get('validity') || s.validity === url.searchParams.get('validity')) && (!url.searchParams.get('creator') || s.creator === url.searchParams.get('creator'));
        });
        if (url.searchParams.get('format') === 'csv') {
          staff('manager'); const columns = ['reference','zone','plate','creator','created','total','currency','tariff','payment','validity','settlement','demo'];
          const cell = v => `"${String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
          res.setHeader('Content-Disposition', 'attachment; filename="orya-demo-sessions.csv"'); return send(200, [columns.join(','), ...rows.map(s => columns.map(k => cell(s[k])).join(','))].join('\r\n'), 'text/csv; charset=utf-8');
        } return send(200, { rows, refreshed: now() });
      }
      if (path === '/api/staff/issues' && method === 'POST') {
        const s = session(String(body.reference || '')), u = staff(null, s.zone);
        if (typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 500) fail(400, 'Enter a reason between 5 and 500 characters.');
        transaction(() => { run('INSERT INTO issues VALUES(?,?,?,?,?,NULL)', randomUUID(), s.id, u.id, body.reason.trim(), now()); audit(s.zone, s.id, u.id, 'issue_flagged', body.reason.trim()); }); return send(201, { ok: true });
      }
      if (path === '/api/manager/overview' && method === 'GET') {
        const u = staff('manager'), rows = all('SELECT * FROM sessions WHERE zone=?', u.zone).map(s => snapshot(s, true));
        const attempts = all('SELECT a.*,s.plate,s.total,s.zone FROM attempts a JOIN sessions s ON s.id=a.session WHERE s.zone=? ORDER BY a.created DESC', u.zone);
        const issues = all('SELECT i.*,s.plate FROM issues i JOIN sessions s ON s.id=i.session WHERE s.zone=? ORDER BY i.created DESC', u.zone);
        return send(200, { sessions: rows.length, active: rows.filter(s => s.validity === 'valid').length, confirmed: rows.filter(s => s.payment === 'confirmed').reduce((n, s) => n + s.total, 0), pending: rows.filter(s => s.payment === 'pending').length, attempts, issues,
          exceptions: rows.filter(s => ['pending','failed','refunded'].includes(s.payment)), history: all('SELECT * FROM audit WHERE zone=? ORDER BY id DESC LIMIT 100', u.zone), refreshed: now() });
      }
      if (path === '/api/manager/close' && method === 'GET') {
        const u = staff('manager'), date = url.searchParams.get('date'); if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) fail(400, 'Choose a local report date.');
        const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: zone(u.zone).timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(n);
        const rows = all('SELECT * FROM sessions WHERE zone=?', u.zone), events = all('SELECT e.*,s.total FROM events e JOIN attempts a ON a.id=e.attempt JOIN sessions s ON s.id=a.session WHERE s.zone=? AND e.applied=1', u.zone).filter(e => day(e.received) === date);
        return send(200, { date, timezone: zone(u.zone).timezone, currency: 'CDF', demo: true, charges: rows.filter(s => day(s.created) === date).reduce((n,s) => n+s.total,0), confirmedDigital: events.filter(e => e.status === 'confirmed').reduce((n,e) => n+e.total,0), refunds: events.filter(e => e.status === 'refunded').reduce((n,e) => n+e.total,0), cash: 'disabled', settlement: 'not imported', unmatched: rows.filter(s => snapshot(s).payment === 'confirmed').reduce((n,s) => n+s.total,0), unmatchedScope: 'All-time confirmed payments; no settlement imports exist.' });
      }
      if (path === '/api/manager/tariff' && method === 'POST') {
        const u = staff('manager', body.zone), rate = int(body.rate, 100, 1000000); if (rate % 100) fail(400, 'Sample rate must be a multiple of 100 CDF.');
        const z = zone(body.zone); if (body.version !== z.tariff) fail(409, 'Tariff changed. Refresh before editing.');
        transaction(() => { const id = Number(run('INSERT INTO tariffs(rate,created) VALUES(?,?)', rate, now()).lastInsertRowid); run('UPDATE zones SET tariff=? WHERE id=?', id, z.id); audit(z.id, null, u.id, 'tariff_changed', `${z.rate} → ${rate} CDF / 30 min; v${id}`); }); return send(200, zone(z.id));
      }
      if (path.startsWith('/api/')) fail(404, 'Endpoint not found.');
      if (method !== 'GET') fail(405, 'Method not allowed.');
      const files = { '/': 'index.html', '/attendant': 'index.html', '/management': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
      const file = files[path]; if (!file) fail(404, 'Page not found.');
      return send(200, readFileSync(resolve(root, 'public', file)), file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
    } catch (e) { if (!e.status) console.error(e); send(e.status || 500, { error: e.status ? e.message : 'Unexpected server error.' }); }
  });
  return { server, db, access, applyEvent, tick, close: async () => { clearInterval(timer); await new Promise(r => server.close(r)); db.close(); } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp(); const port = Number(process.env.PORT || 3040);
  app.server.listen(port, '127.0.0.1', () => console.log(`Orya DEMO · http://127.0.0.1:${port}\nRun npm run access for generated staff credentials. No live payments. Harness ${process.env.ORYA_HARNESS === '1' ? 'enabled' : 'disabled'}.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
