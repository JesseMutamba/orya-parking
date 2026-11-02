import {languageFrom,csvLabel,csvValue} from './localization.mjs';
import { demoSites } from './site-catalog.mjs';
import { createTickets } from './tickets.mjs';
import { codeDigest } from './pass-codes.mjs';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const token = () => randomBytes(32).toString('base64url');
const text = (v, title, max = 120) => { if (typeof v !== 'string' || !v.trim() || v.length > max) fail(400, `Enter ${title} (1–${max} characters).`); return v.trim(); };
const integer = (v, min, max) => { if (!Number.isSafeInteger(v) || v < min || v > max) fail(400, `Expected a whole number from ${min} to ${max}.`); return v; };
const plate = v => { const p = text(v, 'a plate', 16).toUpperCase(); if (!/^[A-Z0-9 -]{3,16}$/.test(p)) fail(400, 'Use 3–16 plate letters, numbers, spaces or hyphens.'); return p; };
const plateKey = p => p.replace(/[ -]/g, '');
const idem = v => { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(v)) fail(400, 'A submission key is required.'); return v; };
export function createOperations({ db, now, transaction, zone, snapshot, audit, passCodes }) {
  const get = (s,...a) => db.prepare(s).get(...a), all = (s,...a) => db.prepare(s).all(...a), run = (s,...a) => db.prepare(s).run(...a);
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_locations(zone TEXT PRIMARY KEY REFERENCES zones(id), source TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ops_sites(zone TEXT PRIMARY KEY REFERENCES zones(id), address TEXT NOT NULL DEFAULT '', latitude REAL, longitude REAL, blocked INTEGER NOT NULL DEFAULT 0, open INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS vehicles(session TEXT PRIMARY KEY REFERENCES sessions(id), make TEXT NOT NULL, model TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS cash_payments(id TEXT PRIMARY KEY, session TEXT UNIQUE REFERENCES sessions(id), amount INTEGER NOT NULL, receipt TEXT UNIQUE NOT NULL, status TEXT NOT NULL, recorded_by TEXT NOT NULL, created INTEGER NOT NULL, approved_by TEXT, confirmed INTEGER, refunded_by TEXT, refunded INTEGER, refund_reason TEXT);
    CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, zone TEXT REFERENCES zones(id), plate TEXT NOT NULL, plate_key TEXT NOT NULL, make TEXT NOT NULL, model TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, actor TEXT NOT NULL, status TEXT NOT NULL, consumed INTEGER, cancelled INTEGER);
    CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY, zone TEXT REFERENCES zones(id), session TEXT REFERENCES sessions(id), plate TEXT NOT NULL, plate_key TEXT NOT NULL, make TEXT NOT NULL, model TEXT NOT NULL, approved_by TEXT NOT NULL, checked_in INTEGER NOT NULL, checked_out INTEGER, exited_by TEXT, reservation TEXT REFERENCES reservations(id));
    CREATE UNIQUE INDEX IF NOT EXISTS one_vehicle_inside ON visits(plate_key) WHERE checked_out IS NULL;
    CREATE TABLE IF NOT EXISTS ops_requests(key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS staff_access(staff TEXT PRIMARY KEY REFERENCES staff(id), enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS cash_closes(id TEXT PRIMARY KEY, zone TEXT REFERENCES zones(id), day TEXT NOT NULL, expected INTEGER NOT NULL, counted INTEGER NOT NULL, difference INTEGER NOT NULL, note TEXT NOT NULL, actor TEXT NOT NULL, created INTEGER NOT NULL, opening INTEGER NOT NULL DEFAULT 0);
  `);
  run('INSERT OR IGNORE INTO ops_sites(zone) SELECT id FROM zones');
  transaction(()=>{for(const [id,,,,,,lat,lng] of demoSites){
    const source=get('SELECT source FROM site_locations WHERE zone=?',id);
    const existing=get('SELECT * FROM ops_sites WHERE zone=?',id);
    if(source?.source==='illustrative'&&existing.version===1&&(existing.latitude!==lat||existing.longitude!==lng)){
      run('UPDATE ops_sites SET latitude=?,longitude=? WHERE zone=?',lat,lng,id);
      audit(id,null,'demo-site-catalog','illustrative_pin_updated','Updated demo pin placement; not a verified property.');
    }
    if(!source){
      if(existing.latitude===null&&existing.longitude===null&&existing.version===1){
        run('UPDATE ops_sites SET latitude=?,longitude=? WHERE zone=?',lat,lng,id);
        run('INSERT INTO site_locations VALUES(?,?)',id,'illustrative');
      }else run('INSERT INTO site_locations VALUES(?,?)',id,existing.latitude===null?'unmapped':'configured');
    }
  }});
  const availability = id => {
    zone(id);
    const config=get('SELECT * FROM ops_sites WHERE zone=?',id), d=get('SELECT * FROM site_details WHERE zone=?',id);
    const occupied=get('SELECT count(*) n FROM visits WHERE zone=? AND checked_out IS NULL',id).n;
    const held=get("SELECT count(*) n FROM reservations WHERE zone=? AND status='held' AND expires>?",id,now()).n;
    return { ...config, locationType:get('SELECT source FROM site_locations WHERE zone=?',id)?.source||(config.latitude===null?'unmapped':'configured'), capacity:d.capacity, occupied, held, available:config.open?Math.max(0,d.capacity-config.blocked-occupied-held):0, availabilityType:'recorded', refreshed:now() };
  };
  const scope = (u,id,manager=false) => { if(!u)fail(401,'Staff sign-in required.'); if(manager&&u.role!=='manager')fail(403,'Manager access required.'); if(id){zone(id);if(u.role!=='manager'&&u.zone!==id)fail(403,'This site is not assigned to you.');}return u; };
  const scopeSession = (u,reference) => { scope(u);const s=get('SELECT * FROM sessions WHERE id=?',String(reference||''));if(!s)fail(404,'Pass not found.');scope(u,s.zone);return s; };
  const once = (body,u,action,fn) => transaction(()=>{
    const k=idem(body.idempotencyKey),fingerprint=JSON.stringify([u.id,action,{...body,idempotencyKey:undefined,...(typeof body.entryCode==='string'?{entryCode:codeDigest(body.entryCode)}:{})}]);
    const old=get('SELECT * FROM ops_requests WHERE key=?',k);
    if(old){if(old.fingerprint!==fingerprint)fail(409,'Submission key was reused with different data.');return JSON.parse(old.result);}
    const result=fn();run('INSERT INTO ops_requests VALUES(?,?,?)',k,fingerprint,JSON.stringify(result));return result;
  });
  const vehicle = body => ({plate:plate(body.plate),make:text(body.make,'vehicle make',60),model:text(body.model,'vehicle model',60)});
  const localDate = n => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Kinshasa',year:'numeric',month:'2-digit',day:'2-digit'}).format(n);
  const dayInput = v => { if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(400,'Choose a valid report date.');return v; };
  const ledger = id => {
    const digital=all(`SELECT e.id,e.status,e.received AS time,s.id AS reference,s.plate,s.total AS amount,s.zone FROM events e JOIN attempts a ON a.id=e.attempt JOIN sessions s ON s.id=a.session WHERE s.zone=? AND e.applied=1 AND e.status IN ('confirmed','refunded')`,id).map(e=>({...e,method:'digital',actor:'demo-provider'}));
    const cash=all("SELECT * FROM cash_payments WHERE session IN (SELECT id FROM sessions WHERE zone=?)",id);
    const rows=[...digital];for(const c of cash){const s=get('SELECT plate FROM sessions WHERE id=?',c.session);if(c.confirmed)rows.push({id:c.id,status:'confirmed',time:c.confirmed,reference:c.session,plate:s.plate,amount:c.amount,zone:id,method:'cash',actor:c.approved_by,receipt:c.receipt});if(c.refunded)rows.push({id:c.id+'-refund',status:'refunded',time:c.refunded,reference:c.session,plate:s.plate,amount:c.amount,zone:id,method:'cash',actor:c.refunded_by,receipt:c.receipt});}
    return rows.sort((a,b)=>b.time-a.time);
  };
  const report = (id,day) => {
    const rows=ledger(id).filter(r=>localDate(r.time)===day),sum=(method,status)=>rows.filter(r=>r.method===method&&r.status===status).reduce((n,r)=>n+r.amount,0);
    const digital=sum('digital','confirmed'),cash=sum('cash','confirmed'),digitalRefunds=sum('digital','refunded'),cashRefunds=sum('cash','refunded');
    return {day,zone:id,currency:'CDF',digital,cash,digitalRefunds,cashRefunds,gross:digital+cash,refunds:digitalRefunds+cashRefunds,net:digital+cash-digitalRefunds-cashRefunds,transactions:rows.filter(r=>r.status==='confirmed').length,rows,cashExpected:cash-cashRefunds,closes:all('SELECT * FROM cash_closes WHERE zone=? AND day=? ORDER BY created DESC',id,day),settlement:'not imported',demo:true};
  };
  const siteList = u => all('SELECT * FROM zones').filter(z=>u.role==='manager'||u.zone===z.id).map(z=>({...zone(z.id),...get('SELECT * FROM site_details WHERE zone=?',z.id),...availability(z.id)}));
  const tickets=createTickets({db,now,zone,snapshot,audit,scope,once,availability});
  return {availability, async handle({req,res,path,method,body,url,identity:u,send}){
    if(!path.startsWith('/api/ops/'))return false;
    scope(u);
    if(await tickets.handle({req,path,method,body,url,identity:u,send}))return true;
    const id=method==='GET'?(url.searchParams.get('zone')||u.zone):body.zone;
    if(path==='/api/ops/sites'&&method==='GET'){send(200,{sites:siteList(u),serverTime:now()});return true;}
    if(path==='/api/ops/site'&&method==='POST'){
      scope(u,null,true);const name=text(body.name,'site name'),area=text(body.area,'area',80),address=text(body.address,'site address',250),capacity=integer(body.capacity,1,10000),blocked=integer(body.blocked,0,capacity),open=body.open===true?1:body.open===false?0:fail(400,'Choose whether the site is open.');
      const code=text(body.zone,'site code',24).toUpperCase();if(!/^[A-Z0-9-]{2,24}$/.test(code))fail(400,'Site code must use letters, numbers or hyphens.');
      const lat=body.latitude===null?null:body.latitude,lng=body.longitude===null?null:body.longitude;
      if((lat===null)!==(lng===null)||lat!==null&&(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180))fail(400,'Provide both valid latitude and longitude, or leave both blank.');
      transaction(()=>{
        const existing=get('SELECT * FROM zones WHERE id=?',code);
        if(existing){const a=availability(code);if(body.version!==a.version)fail(409,'Site changed. Refresh before saving.');if(capacity-blocked<a.occupied+a.held)fail(409,'Capacity cannot be below checked-in vehicles plus unexpired holds.');run('UPDATE zones SET name=? WHERE id=?',name,code);run('UPDATE site_details SET area=?,capacity=?,description=? WHERE zone=?',area,capacity,String(body.description||'').slice(0,240),code);run('UPDATE ops_sites SET address=?,latitude=?,longitude=?,blocked=?,open=?,version=version+1 WHERE zone=?',address,lat,lng,blocked,open,code);}
        else {const rate=integer(body.rate,100,1000000);if(rate%100)fail(400,'Use rate increments of 100 CDF.');const tariff=Number(run('INSERT INTO tariffs(rate,created) VALUES(?,?)',rate,now()).lastInsertRowid);run('INSERT INTO zones VALUES(?,?,?,?,?)',code,name,'Africa/Kinshasa','CDF',tariff);run('INSERT INTO site_details VALUES(?,?,?,?)',code,area,capacity,String(body.description||'').slice(0,240));run('INSERT INTO ops_sites VALUES(?,?,?,?,?,?,1)',code,address,lat,lng,blocked,open);}
        run('INSERT INTO site_locations VALUES(?,?) ON CONFLICT(zone) DO UPDATE SET source=excluded.source',code,lat===null?'unmapped':'configured');
        audit(code,null,u.id,'site_saved',`${name}; capacity ${capacity}; blocked ${blocked}; ${open?'open':'closed'}`);
      });send(200,{site:siteList(u).find(s=>s.id===code)});return true;
    }
    if(path==='/api/ops/walkin'&&method==='POST'){
      scope(u,id);const z=zone(id),v=vehicle(body),minutes=integer(body.minutes,30,480);if(minutes%30)fail(400,'Choose 30-minute increments.');if(!['cash','digital'].includes(body.method))fail(400,'Choose cash or digital payment.');
      const result=once(body,u,'walkin',()=>{
        const capacity=availability(id),hold=get("SELECT id FROM reservations WHERE zone=? AND plate_key=? AND status='held' AND expires>?",id,plateKey(v.plate),now());
        if(!capacity.open||(capacity.available<1&&!hold))fail(409,'No capacity is available for this walk-in.');
        const q=token(),ref=`CG-${randomBytes(6).toString('hex').toUpperCase()}`,access=token(),total=z.rate*minutes/30;
        run('INSERT INTO quotes VALUES(?,?,?,?,?,?,?,?)',q,id,v.plate,minutes,z.tariff,z.rate,total,now());
        run('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',ref,access,q,body.idempotencyKey,JSON.stringify(['ops',u.id,body.idempotencyKey]),id,v.plate,minutes,z.tariff,z.rate,total,now(),u.id,null,null);
        run('INSERT INTO vehicles VALUES(?,?,?,?)',ref,v.make,v.model,String(body.phone||'').slice(0,30));
        if(body.method==='cash')run('INSERT INTO cash_payments(id,session,amount,receipt,status,recorded_by,created) VALUES(?,?,?,?,?,?,?)',randomUUID(),ref,total,'CASH-'+randomBytes(6).toString('hex').toUpperCase(),'recorded',u.id,now());
        audit(id,ref,u.id,'walkin_registered',`${v.make} ${v.model}; ${body.method}; ${total} CDF`);return {reference:ref,accessToken:access};
      });send(201,result);return true;
    }
    if(path==='/api/ops/cash/approve'&&method==='POST'){
      const s=scopeSession(u,body.reference);
      if(get('SELECT id FROM walkin_tickets WHERE session=?',s.id))fail(409,'Use the ticket exit workflow for this walk-in.');
      transaction(()=>{const c=get('SELECT * FROM cash_payments WHERE session=?',s.id);if(!c)fail(404,'No recorded cash payment.');if(c.status==='confirmed')return;if(c.status!=='recorded')fail(409,'Cash payment cannot be confirmed.');if(body.amount!==c.amount)fail(409,'Confirm the exact server-calculated cash amount.');run("UPDATE cash_payments SET status='confirmed',approved_by=?,confirmed=? WHERE id=?",u.id,now(),c.id);run('UPDATE sessions SET start=?,end=? WHERE id=?',now(),now()+s.minutes*60000,s.id);run('INSERT INTO receipts VALUES(?,?,?)',c.receipt,s.id,now());audit(s.zone,s.id,u.id,'cash_confirmed',`${c.amount} CDF; ${c.receipt}`);});send(200,{pass:snapshot(get('SELECT * FROM sessions WHERE id=?',s.id),true)});return true;
    }
    if(path==='/api/ops/cash/refund'&&method==='POST'){
      scope(u,null,true);const s=scopeSession(u,body.reference),reason=text(body.reason,'refund reason',500);
      transaction(()=>{const c=get('SELECT * FROM cash_payments WHERE session=?',s.id);if(!c)fail(404,'Cash payment not found.');if(c.status==='refunded')return;if(c.status!=='confirmed')fail(409,'Only confirmed cash may be refunded.');run("UPDATE cash_payments SET status='refunded',refunded_by=?,refunded=?,refund_reason=? WHERE id=?",u.id,now(),reason,c.id);audit(s.zone,s.id,u.id,'cash_refunded',`${c.amount} CDF; ${reason}`);});send(200,{ok:true});return true;
    }
    if(path==='/api/ops/reservations'&&method==='POST'){
      scope(u,id);const v=vehicle(body),minutes=integer(body.holdMinutes,5,120);
      const result=once(body,u,'reserve',()=>{
        const a=availability(id);if(!a.open||a.available<1)fail(409,'No capacity available for a reservation hold.');
        if(get('SELECT id FROM visits WHERE plate_key=? AND checked_out IS NULL',plateKey(v.plate)))fail(409,'This vehicle is already checked in.');
        if(get("SELECT id FROM reservations WHERE plate_key=? AND status='held' AND expires>?",plateKey(v.plate),now()))fail(409,'This vehicle already has an active hold.');
        const ref='RES-'+randomBytes(6).toString('hex').toUpperCase();run('INSERT INTO reservations VALUES(?,?,?,?,?,?,?,?,?,?,NULL,NULL)',ref,id,v.plate,plateKey(v.plate),v.make,v.model,now(),now()+minutes*60000,u.id,'held');audit(id,null,u.id,'reservation_held',`${ref}; ${v.plate}; ${minutes} minutes`);return {reference:ref};
      });send(201,result);return true;
    }
    if(path==='/api/ops/reservations/cancel'&&method==='POST'){
      const r=get('SELECT * FROM reservations WHERE id=?',String(body.reference||''));if(!r)fail(404,'Reservation not found.');scope(u,r.zone);
      transaction(()=>{if(r.status==='cancelled')return;if(r.status!=='held')fail(409,'This reservation has already been used.');run("UPDATE reservations SET status='cancelled',cancelled=? WHERE id=?",now(),r.id);audit(r.zone,null,u.id,'reservation_cancelled',r.id);});send(200,{ok:true});return true;
    }
    if(path==='/api/ops/admit'&&method==='POST'){
      const s=scopeSession(u,body.reference),make=text(body.make,'vehicle make',60),model=text(body.model,'vehicle model',60);
      const result=once(body,u,'admit',()=>{
        const p=snapshot(s);if(p.validity!=='valid')fail(409,'A confirmed, currently valid payment or subscription pass is required.');
        if(get('SELECT id FROM visits WHERE plate_key=? AND checked_out IS NULL',plateKey(s.plate)))fail(409,'This vehicle is already checked in.');
        if(p.passType!=='subscription'&&get('SELECT id FROM visits WHERE session=?',s.id))fail(409,'This single-visit pass has already been used.');
        if(passCodes.required(s)&&body.zone!==s.zone)fail(409,'Select the site assigned to this pass.');
        const entryCode=passCodes.required(s)?passCodes.authorize(body.entryCode,s,body.observedPlate):null;
        const a=availability(s.zone);if(!a.open)fail(409,'The site is closed to admissions.');
        const hold=get("SELECT * FROM reservations WHERE zone=? AND plate_key=? AND status='held' AND expires>?",s.zone,plateKey(s.plate),now());
        if(a.available<1&&!hold)fail(409,'Site capacity is full or held for reservations.');
        const ref=randomUUID();if(hold)run("UPDATE reservations SET status='consumed',consumed=? WHERE id=?",now(),hold.id);
        run('INSERT INTO visits VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,?)',ref,s.zone,s.id,s.plate,plateKey(s.plate),make,model,u.id,now(),hold?.id||null);
        run('INSERT INTO vehicles VALUES(?,?,?,?) ON CONFLICT(session) DO UPDATE SET make=excluded.make,model=excluded.model',s.id,make,model,'');
        if(entryCode)passCodes.consume(entryCode,ref,u.id);
        audit(s.zone,s.id,u.id,'vehicle_admitted',`${ref}; ${make} ${model}${hold?'; hold '+hold.id:''}`);return {visit:ref};
      });send(200,result);return true;
    }
    if(path==='/api/ops/checkout'&&method==='POST'){
      const v=get('SELECT * FROM visits WHERE id=?',String(body.visit||''));if(!v)fail(404,'Visit not found.');scope(u,v.zone);
      if(get('SELECT id FROM walkin_tickets WHERE visit=?',v.id))fail(409,'Use the ticket exit workflow; payment must be checked.');
      transaction(()=>{if(v.checked_out)return;run('UPDATE visits SET checked_out=?,exited_by=? WHERE id=?',now(),u.id,v.id);audit(v.zone,v.session,u.id,'vehicle_departed',v.id);});send(200,{ok:true});return true;
    }
    if(path==='/api/ops/report'&&method==='GET'){
      scope(u,id,true);const result=report(id,dayInput(url.searchParams.get('date')||localDate(now())));
      if(url.searchParams.get('format')==='csv'){const cols=['id','time','reference','plate','method','status','amount','actor'];const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';res.setHeader('Content-Disposition','attachment; filename="orya-demo-transactions.csv"');send(200,[cols.map(c=>csvLabel(c,languageFrom(req))).join(','),...result.rows.map(r=>cols.map(c=>cell(csvValue(c,r[c],languageFrom(req)))).join(','))].join('\r\n'),'text/csv; charset=utf-8');}else send(200,result);return true;
    }
    if(path==='/api/ops/cash/close'&&method==='POST'){
      scope(u,id,true);zone(id);const day=dayInput(body.date),opening=integer(body.opening??0,0,1000000000),counted=integer(body.counted,0,1000000000),note=String(body.note||'').slice(0,500);
      const result=once(body,u,'cash-close',()=>{const r=report(id,day),expected=opening+r.cashExpected;if(counted!==expected&&!note.trim())fail(400,'Explain the cash discrepancy.');const ref=randomUUID();run('INSERT INTO cash_closes VALUES(?,?,?,?,?,?,?,?,?,?)',ref,id,day,expected,counted,counted-expected,note,u.id,now(),opening);audit(id,null,u.id,'cash_close',`${day}; opening ${opening}; expected ${expected}; counted ${counted}`);return {id:ref};});send(201,result);return true;
    }
    if(path==='/api/ops/staff'&&method==='GET'){scope(u,null,true);send(200,{rows:all('SELECT s.id,s.role,s.zone,coalesce(a.enabled,1) AS enabled FROM staff s LEFT JOIN staff_access a ON a.staff=s.id')});return true;}
    if(path==='/api/ops/staff'&&method==='POST'){
      scope(u,id,true);zone(id);const name=text(body.username,'staff username',40);if(!/^[a-zA-Z0-9_-]{3,40}$/.test(name))fail(400,'Use a simple username of 3–40 characters.');
      transaction(()=>{const existing=get('SELECT * FROM staff WHERE id=?',name);if(existing){if(existing.role==='manager')fail(403,'Manager accounts cannot be changed here.');if(typeof body.enabled!=='boolean')fail(400,'Choose enabled or disabled.');run('UPDATE staff SET zone=? WHERE id=?',id,name);run('INSERT INTO staff_access VALUES(?,?) ON CONFLICT(staff) DO UPDATE SET enabled=excluded.enabled',name,Number(body.enabled));run('DELETE FROM auth WHERE staff=?',name);audit(id,null,u.id,'staff_updated',`${name}; ${body.enabled?'enabled':'disabled'}`);}else{if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)fail(400,'Use a password of 12–128 characters.');const salt=token();run('INSERT INTO staff VALUES(?,?,?,?,?)',name,'attendant',id,salt,scryptSync(body.password,salt,32).toString('hex'));audit(id,null,u.id,'staff_created',name);}});send(200,{ok:true});return true;
    }
    if(path==='/api/ops/issues/resolve'&&method==='POST'){
      scope(u,null,true);const issue=get('SELECT i.*,s.zone FROM issues i JOIN sessions s ON s.id=i.session WHERE i.id=?',String(body.id||''));if(!issue)fail(404,'Issue not found.');scope(u,issue.zone);const reason=text(body.reason,'resolution note',500);
      transaction(()=>{if(issue.resolved)return;run('UPDATE issues SET resolved=? WHERE id=?',now(),issue.id);audit(issue.zone,issue.session,u.id,'issue_resolved',`${issue.id}; ${reason}`);});send(200,{ok:true});return true;
    }
    if(path==='/api/ops/overview'&&method==='GET'){
      scope(u,id);const passes=all('SELECT * FROM sessions WHERE zone=? ORDER BY created DESC',id).map(s=>({...snapshot(s,true),vehicle:get('SELECT make,model,phone FROM vehicles WHERE session=?',s.id)||null,cash:get('SELECT * FROM cash_payments WHERE session=?',s.id)||null}));
      const walkins=tickets.list(id,'','all');
      const visits=all('SELECT * FROM visits WHERE zone=? ORDER BY checked_in DESC',id).map(v=>{const t=walkins.find(t=>t.visit===v.id);return {...v,ticket:t?.id||null,passValidity:t?(t.payment==='confirmed'?'exit_ready':'pay_at_exit'):snapshot(get('SELECT * FROM sessions WHERE id=?',v.session)).validity};});
      const holds=all('SELECT * FROM reservations WHERE zone=? ORDER BY created DESC',id).map(r=>({...r,status:r.status==='held'&&r.expires<=now()?'expired':r.status}));
      send(200,{demoDay:get('SELECT created FROM demo_days ORDER BY created DESC LIMIT 1')||null,site:{...zone(id),...availability(id)},passes,visits,walkins,reservations:holds,report:u.role==='manager'?report(id,localDate(now())):null,issues:all('SELECT i.*,s.plate FROM issues i JOIN sessions s ON s.id=i.session WHERE s.zone=? ORDER BY i.created DESC',id),history:all('SELECT * FROM audit WHERE zone=? ORDER BY id DESC LIMIT 200',id),serverTime:now()});return true;
    }
    fail(404,'Operations endpoint not found.');
  }};
}
