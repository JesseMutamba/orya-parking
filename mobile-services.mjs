import { randomUUID, randomBytes } from 'node:crypto';

// Shared records for the mobile apps; no client-calculated charges or occupancy.
export function createMobileServices({ db, now, transaction, drivers, operations, audit }) {
  const get = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const text = (value, max = 60) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const plate = value => { const p = text(value, 100).toUpperCase(); if (!/^[A-Z0-9 -]{3,16}$/.test(p)) fail(400, 'Enter a plate of 3–16 letters, numbers, spaces or hyphens.'); return p; };
  const plateKey = p => p.replace(/[^A-Z0-9]/g, '');
  db.exec(`CREATE TABLE IF NOT EXISTS driver_holds(reservation TEXT PRIMARY KEY REFERENCES reservations(id), driver TEXT NOT NULL REFERENCES drivers(id), idem TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL);`);
  const vehicleList = u => {
    // Backfill only the original profile vehicle. Existing profile data is retained.
    run('INSERT OR IGNORE INTO driver_vehicles VALUES(?,?,?,?,?,?,?)', 'profile-'+u.id, u.id, u.plate, plateKey(u.plate), '', '', u.created);
    return all('SELECT id,plate,make,model FROM driver_vehicles WHERE driver=? ORDER BY created,id', u.id);
  };
  const holds = u => all('SELECT r.*,z.name AS zoneName FROM reservations r JOIN driver_holds h ON h.reservation=r.id JOIN zones z ON z.id=r.zone WHERE h.driver=? ORDER BY r.created DESC', u.id).map(r => ({...r, status:r.status==='held' && r.expires<=now() ? 'expired' : r.status}));
  return { async handle({req,path,method,body,send}) {
    if (!['/api/driver/vehicles','/api/driver/holds','/api/driver/holds/cancel'].includes(path)) return false;
    const u = drivers.identity(req); if (!u) fail(401, 'Sign in to your driver account.');
    if (path==='/api/driver/vehicles' && method==='GET') { send(200,{vehicles:vehicleList(u)}); return true; }
    if (path==='/api/driver/vehicles' && method==='POST') {
      const p=plate(body.plate); vehicleList(u);
      transaction(()=>{
        if (get('SELECT id FROM driver_vehicles WHERE driver=? AND plate_key=?',u.id,plateKey(p))) fail(409,'This vehicle is already saved.');
        if (get('SELECT count(*) n FROM driver_vehicles WHERE driver=?',u.id).n>=10) fail(409,'You can save up to ten vehicles.');
        run('INSERT INTO driver_vehicles VALUES(?,?,?,?,?,?,?)',randomUUID(),u.id,p,plateKey(p),text(body.make),text(body.model),now());
      }); send(201,{vehicles:vehicleList(u)}); return true;
    }
    if (path==='/api/driver/holds' && method==='GET') { send(200,{holds:holds(u),serverTime:now()}); return true; }
    if (path==='/api/driver/holds' && method==='POST') {
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(body.idempotencyKey||'')) fail(400,'A valid submission key is required.');
      const p=plate(body.plate), vehicle=vehicleList(u).find(v=>plateKey(v.plate)===plateKey(p));
      if (!vehicle) fail(400,'Save this vehicle in your account first.');
      const fingerprint=JSON.stringify([u.id,body.zone,p]);
      const reference=transaction(()=>{
        const previous=get('SELECT * FROM driver_holds WHERE idem=?',body.idempotencyKey);
        if(previous){if(previous.driver!==u.id||previous.fingerprint!==fingerprint)fail(409,'Submission key was reused.');return previous.reservation;}
        if(!get('SELECT id FROM zones WHERE id=?',String(body.zone||'')))fail(404,'Parking site not found.');
        const a=operations.availability(body.zone);
        if(!a.open||a.available<1)fail(409,'No spaces available. Please choose another site.');
        if(get('SELECT id FROM visits WHERE plate_key=? AND checked_out IS NULL',plateKey(p)))fail(409,'This vehicle is already checked in.');
        if(get("SELECT id FROM reservations WHERE plate_key=? AND status='held' AND expires>?",plateKey(p),now()))fail(409,'This vehicle already has an arrival hold.');
        const ref='RES-'+randomBytes(6).toString('hex').toUpperCase();
        run('INSERT INTO reservations VALUES(?,?,?,?,?,?,?,?,?,?,NULL,NULL)',ref,body.zone,p,plateKey(p),vehicle.make,vehicle.model,now(),now()+15*60000,'driver:'+u.id,'held');
        run('INSERT INTO driver_holds VALUES(?,?,?,?)',ref,u.id,body.idempotencyKey,fingerprint);
        audit(body.zone,null,'driver:'+u.id,'reservation_held',`${ref}; ${p}; 15-minute arrival hold`); return ref;
      }); send(201,{hold:holds(u).find(r=>r.id===reference),serverTime:now()});return true;
    }
    if(path==='/api/driver/holds/cancel' && method==='POST') {
      transaction(()=>{
        const r=get('SELECT r.* FROM reservations r JOIN driver_holds h ON h.reservation=r.id WHERE r.id=? AND h.driver=?',String(body.reference||''),u.id);
        if(!r)fail(404,'Arrival hold not found.');
        if(r.status==='cancelled')return;
        if(r.status!=='held'||r.expires<=now())fail(409,'This hold has expired or has already been used.');
        run("UPDATE reservations SET status='cancelled',cancelled=? WHERE id=?",now(),r.id);
        audit(r.zone,null,'driver:'+u.id,'reservation_cancelled',r.id);
      }); send(200,{ok:true});return true;
    }
    fail(405,'Method not allowed.');
  }};
}
