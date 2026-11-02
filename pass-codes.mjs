import { randomBytes, createHash } from 'node:crypto';
import QRCode from 'qrcode';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const codeDigest = value => createHash('sha256').update(value).digest('hex');
const plateKey = value => String(value || '').trim().toUpperCase().replace(/[ -]/g, '');

// An opaque, short-lived credential for one admission, never a private pass URL.
export function createPassCodes({ db, now, transaction, snapshot, audit }) {
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  db.exec(`CREATE TABLE IF NOT EXISTS pass_entry_codes(
    digest TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id),
    owner TEXT REFERENCES drivers(id), issued INTEGER NOT NULL, expires INTEGER NOT NULL,
    revoked INTEGER, used INTEGER, visit TEXT REFERENCES visits(id));
    CREATE INDEX IF NOT EXISTS pass_codes_session ON pass_entry_codes(session,issued);`);
  const owner = s => get('SELECT driver FROM session_owners WHERE session=?', s.id)?.driver || null;
  const required = s => { const p = snapshot(s); return p.paymentMethod === 'digital' && p.passType !== 'walkin'; };
  function eligible(s) {
    const p = snapshot(s);
    if (!required(s) || p.validity !== 'valid') fail(409, 'A confirmed, currently valid digital pass or subscription is required.');
    if (get('SELECT id FROM visits WHERE plate_key=? AND checked_out IS NULL', plateKey(s.plate))) fail(409, 'This vehicle is already checked in.');
    if (p.passType !== 'subscription' && get('SELECT id FROM visits WHERE session=?', s.id)) fail(409, 'This single-visit pass has already been used.');
    return p;
  }
  function check(code, s) {
    if (typeof code !== 'string' || !/^ORYA-ENTRY-[A-Za-z0-9_-]{43}$/.test(code)) fail(400, 'Scan or paste the current entry QR code.');
    const record = get('SELECT * FROM pass_entry_codes WHERE digest=?', codeDigest(code));
    if (!record || record.session !== s.id || record.owner !== owner(s)) fail(409, 'Entry code is not valid for this pass.');
    if (record.used) fail(409, 'This entry code has already been used.');
    if (record.revoked || record.expires <= now()) fail(409, 'Entry code expired or was replaced. Ask the driver to refresh it.');
    eligible(s);
    return record;
  }
  return {
    required,
    async issue(s, user) {
      const assigned = owner(s);
      if (assigned && assigned !== user?.id) fail(403, 'Sign in to the driver account that owns this pass to show its entry QR.');
      const code = 'ORYA-ENTRY-' + randomBytes(32).toString('base64url');
      const result = transaction(() => {
        eligible(s);
        const recent = get('SELECT issued FROM pass_entry_codes WHERE session=? ORDER BY issued DESC LIMIT 1', s.id);
        if (recent && now() - recent.issued < 2000) fail(429, 'Please wait two seconds before refreshing the entry code.');
        run('UPDATE pass_entry_codes SET revoked=? WHERE session=? AND used IS NULL AND revoked IS NULL', now(), s.id);
        const issued = now(), expires = Math.min(issued + 60000, s.end);
        run('INSERT INTO pass_entry_codes(digest,session,owner,issued,expires) VALUES(?,?,?,?,?)', codeDigest(code), s.id, assigned, issued, expires);
        return { code, expires, serverTime: issued, reference: s.id, plate: s.plate, zone: s.zone };
      });
      return { ...result, qrDataUrl: await QRCode.toDataURL(code, { margin: 4, width: 280, errorCorrectionLevel: 'M' }) };
    },
    inspect(code, staff, operatingSite) {
      if (!staff) fail(401, 'Staff sign-in required.');
      if (typeof code !== 'string' || !/^ORYA-ENTRY-[A-Za-z0-9_-]{43}$/.test(code)) fail(400, 'Scan or paste an Orya entry QR code.');
      const record = get('SELECT * FROM pass_entry_codes WHERE digest=?', codeDigest(code));
      const s = record && get('SELECT * FROM sessions WHERE id=?', record.session);
      if (!s) fail(404, 'Entry code not recognized.');
      if (staff.role !== 'manager' && staff.zone !== s.zone) fail(403, 'This site is not assigned to you.');
      if (operatingSite !== s.zone) fail(409, 'This pass belongs to another site.');
      check(code, s);
      const profile = get('SELECT v.make,v.model FROM driver_vehicles v JOIN session_owners o ON o.driver=v.driver WHERE o.session=? AND v.plate_key=?', s.id, plateKey(s.plate));
      return { pass: { ...snapshot(s, true), vehicle: profile || get('SELECT make,model FROM vehicles WHERE session=?', s.id) || null }, expires: record.expires, serverTime: now() };
    },
    authorize(code, s, observedPlate) {
      const record = check(code, s);
      if (typeof observedPlate !== 'string' || !/^[A-Za-z0-9 -]{3,16}$/.test(observedPlate.trim())) fail(400, 'Enter the arriving vehicle plate.');
      if (plateKey(observedPlate) !== plateKey(s.plate)) fail(409, 'The arriving plate does not match this pass.');
      return record;
    },
    consume(record, visit, actor) {
      const changed = run('UPDATE pass_entry_codes SET used=?,visit=? WHERE digest=? AND used IS NULL AND revoked IS NULL AND expires>?', now(), visit, record.digest, now());
      if (changed.changes !== 1) fail(409, 'Entry code is no longer valid.');
      run('UPDATE pass_entry_codes SET revoked=? WHERE session=? AND used IS NULL AND revoked IS NULL', now(), record.session);
      const s = get('SELECT zone FROM sessions WHERE id=?', record.session);
      audit(s.zone, record.session, actor, 'entry_qr_consumed', `Admission ${visit}; vehicle verified`);
    }
  };
}
