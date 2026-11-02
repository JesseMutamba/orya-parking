import { demoSites } from './site-catalog.mjs';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const secret = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const plate = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9 -]{3,16}$/.test(value.trim())) fail(400, 'Use a plate of 3–16 letters, numbers, spaces or hyphens.');
  return value.trim().toUpperCase();
};
const vehicleDetail = (value, label) => {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > 60) fail(400, `Use up to 60 characters for vehicle ${label}.`);
  return value.trim();
};
const paymentMethod = value => {
  if (!['mobile_money', 'card'].includes(value)) fail(400, 'Choose mobile money or bank card for demo payments.');
  return value;
};
const key = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) fail(400, 'A valid submission key is required.');
  return value;
};

export function createDriverAccounts({ db, now, transaction, zone, snapshot, audit, availability, secureCookie='' }) {
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  // Additive schema: existing sessions, tariffs and staff credentials are preserved.
  db.exec(`
    CREATE TABLE IF NOT EXISTS drivers(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, plate TEXT NOT NULL, preference TEXT NOT NULL, salt TEXT NOT NULL, digest TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS driver_vehicles(id TEXT PRIMARY KEY, driver TEXT NOT NULL REFERENCES drivers(id), plate TEXT NOT NULL, plate_key TEXT NOT NULL, make TEXT NOT NULL, model TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(driver,plate_key));
    CREATE TABLE IF NOT EXISTS driver_payment_preferences(driver TEXT PRIMARY KEY REFERENCES drivers(id), method TEXT NOT NULL CHECK(method IN ('mobile_money','card')), updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS payment_attempt_methods(attempt TEXT PRIMARY KEY REFERENCES attempts(id), method TEXT NOT NULL CHECK(method IN ('mobile_money','card')));
    CREATE TABLE IF NOT EXISTS driver_auth(token TEXT PRIMARY KEY, driver TEXT REFERENCES drivers(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS session_owners(session TEXT PRIMARY KEY REFERENCES sessions(id), driver TEXT REFERENCES drivers(id));
    CREATE TABLE IF NOT EXISTS subscriptions(session TEXT PRIMARY KEY REFERENCES sessions(id), driver TEXT REFERENCES drivers(id), cancelled INTEGER);
    CREATE TABLE IF NOT EXISTS site_details(zone TEXT PRIMARY KEY REFERENCES zones(id), area TEXT NOT NULL, capacity INTEGER NOT NULL, description TEXT NOT NULL);
  `);
  const seeds = demoSites;
  transaction(() => {
    for (const [id, name, area, capacity, rate, description] of seeds) {
      if (!get('SELECT id FROM zones WHERE id=?', id)) {
        const tariff = Number(run('INSERT INTO tariffs(rate,created) VALUES(?,?)', rate, now()).lastInsertRowid);
        run('INSERT INTO zones VALUES(?,?,?,?,?)', id, name, 'Africa/Kinshasa', 'CDF', tariff);
      }
      run('INSERT OR IGNORE INTO site_details VALUES(?,?,?,?)', id, area, capacity, description);
    }
  });
  const publicUser = u => ({ id: u.id, name: u.name, email: u.email, plate: u.plate, preference: u.preference, paymentMethod: get('SELECT method FROM driver_payment_preferences WHERE driver=?', u.id)?.method || null });
  const cookieToken = req => /(?:^|; )orya_driver=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const identity = req => {
    const token = cookieToken(req);
    return token ? get('SELECT d.* FROM drivers d JOIN driver_auth a ON a.driver=d.id WHERE a.token=? AND a.expires>?', hash(token), now()) : null;
  };
  const requireDriver = req => { const u = identity(req); if (!u) fail(401, 'Sign in to your driver account.'); return u; };
  const setCookie = (res, u) => {
    const token = secret();
    run('DELETE FROM driver_auth WHERE expires<=?', now());
    run('INSERT INTO driver_auth VALUES(?,?,?)', hash(token), u.id, now() + 7 * 86400000);
    res.setHeader('Set-Cookie', `orya_driver=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureCookie}`);
  };
  const sites = () => all('SELECT * FROM site_details').map(d => {
    const z = zone(d.zone);
    const active = get(`SELECT count(*) AS n FROM sessions s JOIN attempts a ON a.session=s.id LEFT JOIN subscriptions sub ON sub.session=s.id WHERE s.zone=? AND a.status='confirmed' AND s.end>? AND sub.cancelled IS NULL`, z.id, now()).n;
    return { ...z, ...d, activePasses: active, ...availability(z.id), subscriptionPrice: 60000, demo: true };
  });
  const own = (session, user) => run('INSERT INTO session_owners VALUES(?,?)', session, user.id);
  const subscriptions = id => all('SELECT s.*,sub.cancelled FROM subscriptions sub JOIN sessions s ON s.id=sub.session WHERE sub.driver=? ORDER BY s.created DESC', id).map(s => ({ ...snapshot(s), cancelled: s.cancelled, accessToken: s.access, autoRenew: false }));
  const attempts = new Map();
  return {
    identity, own, sites,
    async handle({ req, res, path, method, body, send }) {
      if (path === '/api/sites' && method === 'GET') { send(200, { sites: sites(), refreshed: now() }); return true; }
      if (!path.startsWith('/api/driver/')) return false;
      if (['/api/driver/signup', '/api/driver/login'].includes(path) && method === 'POST') {
        const bucket = req.socket.remoteAddress;
        const window = attempts.get(bucket) || { count: 0, expires: now() + 300000 };
        if (window.expires <= now()) { window.count = 0; window.expires = now() + 300000; }
        if (++window.count > 15) fail(429, 'Too many attempts. Please wait five minutes.');
        attempts.set(bucket, window);
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail(400, 'Enter a valid email address.');
        if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) fail(400, 'Use a password between 12 and 128 characters.');
        let u;
        if (path.endsWith('/signup')) {
          if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 80) fail(400, 'Enter a name between 2 and 80 characters.');
          if (!['digital', 'subscription'].includes(body.preference)) fail(400, 'Choose a digital pass or subscription.');
          const vehicle = plate(body.plate), make = vehicleDetail(body.make, 'make'), model = vehicleDetail(body.model, 'model'), method = paymentMethod(body.paymentMethod);
          if (get('SELECT id FROM drivers WHERE email=?', email)) fail(409, 'An account already uses this email. Sign in instead.');
          const salt = secret(), id = randomUUID();
          transaction(() => {
            run('INSERT INTO drivers(id,name,email,plate,preference,salt,digest,created) VALUES(?,?,?,?,?,?,?,?)', id, body.name.trim(), email, vehicle, body.preference, salt, scryptSync(body.password, salt, 32).toString('hex'), now());
            run('INSERT INTO driver_vehicles VALUES(?,?,?,?,?,?,?)', 'profile-'+id, id, vehicle, vehicle.replace(/[^A-Z0-9]/g, ''), make, model, now());
            run('INSERT INTO driver_payment_preferences VALUES(?,?,?)', id, method, now());
          });
          u = get('SELECT * FROM drivers WHERE id=?', id);
        } else {
          u = get('SELECT * FROM drivers WHERE email=?', email);
          const candidate = scryptSync(body.password, u?.salt || 'driver-dummy-salt', 32);
          if (!u || !timingSafeEqual(candidate, Buffer.from(u.digest, 'hex'))) fail(401, 'Incorrect email or password.');
        }
        // Rotate this browser's driver token; do not change its staff login.
        if (cookieToken(req)) run('DELETE FROM driver_auth WHERE token=?', hash(cookieToken(req)));
        setCookie(res, u); send(200, publicUser(u)); return true;
      }
      if (path === '/api/driver/logout' && method === 'POST') {
        if (cookieToken(req)) run('DELETE FROM driver_auth WHERE token=?', hash(cookieToken(req)));
        res.setHeader('Set-Cookie', `orya_driver=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`);
        send(200, { ok: true }); return true;
      }
      const u = requireDriver(req);
      if (path === '/api/driver/payment-method' && method === 'POST') {
        const selected = paymentMethod(body.paymentMethod);
        run('INSERT INTO driver_payment_preferences VALUES(?,?,?) ON CONFLICT(driver) DO UPDATE SET method=excluded.method,updated=excluded.updated', u.id, selected, now());
        send(200, publicUser(u)); return true;
      }
      if (path === '/api/driver/me' && method === 'GET') { send(200, publicUser(u)); return true; }
      if (path === '/api/driver/history' && method === 'GET') {
        const rows = all('SELECT s.* FROM sessions s JOIN session_owners o ON o.session=s.id WHERE o.driver=? ORDER BY s.created DESC', u.id).map(s => ({ ...snapshot(s), accessToken: s.access }));
        send(200, { rows, subscriptions: subscriptions(u.id), refreshed: now() }); return true;
      }
      if (path === '/api/driver/claim' && method === 'POST') {
        const s = get('SELECT * FROM sessions WHERE access=?', String(body.accessToken || ''));
        if (!s) fail(404, 'Private pass not found.');
        transaction(() => {
          const owner = get('SELECT driver FROM session_owners WHERE session=?', s.id);
          if (owner && owner.driver !== u.id) fail(409, 'This pass already belongs to another account.');
          if (!owner) { own(s.id, u); audit(s.zone, s.id, 'driver-account', 'pass_saved', 'Saved by private pass token'); }
        });
        send(200, { ok: true }); return true;
      }
      if (path === '/api/driver/subscriptions' && method === 'POST') {
        const z = zone(body.zone), vehicle = plate(body.plate), idem = key(body.idempotencyKey);
        const fingerprint = JSON.stringify(['subscription', z.id, vehicle, u.id]);
        const s = transaction(() => {
          const old = get('SELECT * FROM sessions WHERE idem=?', idem);
          if (old) { if (old.fingerprint !== fingerprint) fail(409, 'Submission key was reused.'); return old; }
          const existing = subscriptions(u.id).find(s => s.zone === z.id && s.plate === vehicle && !s.cancelled && ['not_started','pending','confirmed'].includes(s.payment) && s.validity !== 'expired');
          if (existing) fail(409, 'You already have a subscription for this vehicle and site. Open it in My passes.');
          const quote = secret(), id = `CG-${randomBytes(6).toString('hex').toUpperCase()}`, access = secret();
          run('INSERT INTO quotes VALUES(?,?,?,?,?,?,?,?)', quote, z.id, vehicle, 43200, z.tariff, 60000, 60000, now());
          run('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, access, quote, idem, fingerprint, z.id, vehicle, 43200, z.tariff, 60000, 60000, now(), 'driver', null, null);
          own(id, u); run('INSERT INTO subscriptions VALUES(?,?,NULL)', id, u.id);
          audit(z.id, id, 'driver-account', 'subscription_created', 'Demo 30-day pass v1 · 60000 CDF · no automatic renewal');
          return get('SELECT * FROM sessions WHERE id=?', id);
        });
        send(201, { ...snapshot(s), accessToken: s.access }); return true;
      }
      if (path === '/api/driver/subscriptions/end' && method === 'POST') {
        const sub = get('SELECT sub.*,s.zone FROM subscriptions sub JOIN sessions s ON s.id=sub.session WHERE sub.session=? AND sub.driver=?', String(body.reference || ''), u.id);
        if (!sub) fail(404, 'Subscription not found.');
        if (get('SELECT status FROM attempts WHERE session=?', sub.session)?.status !== 'confirmed') fail(409, 'Only a confirmed subscription can be ended early.');
        transaction(() => {
          if (!sub.cancelled) {
            run('UPDATE subscriptions SET cancelled=? WHERE session=?', now(), sub.session);
            audit(sub.zone, sub.session, 'driver-account', 'subscription_ended', 'Ended early by account owner; no refund or renewal');
          }
        });
        send(200, { ok: true }); return true;
      }
      fail(404, 'Driver endpoint not found.');
    },
  };
}
