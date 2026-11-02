import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.mjs';

async function fixture(t, opts={}) {
  const dir=mkdtempSync(join(tmpdir(),'orya-test-')); let clock=Date.UTC(2026,10,1,12);
  let app=createApp({dataDir:dir,now:()=>clock,paymentDelay:60000,harness:true,...opts});
  const listen=()=>new Promise(r=>app.server.listen(0,'127.0.0.1',r));await listen();
  const request=async(path,body,headers={})=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const data=r.headers.get('content-type')?.startsWith('application/json')?await r.json():await r.text();return {status:r.status,data,headers:r.headers};};
  const login=async(role)=>{const r=await request('/api/login',{username:role,password:app.access[role]});assert.equal(r.status,200);return {Cookie:r.headers.get('set-cookie').split(';')[0]};};
  const create=async(plate='1234 AB 01',extra={},headers={})=>{const q=await request('/api/quotes',{zone:'CG-01',plate,minutes:60,...extra},headers);assert.equal(q.status,201,JSON.stringify(q.data));const body={quote:q.data.id,idempotencyKey:randomUUID(),assisted:extra.assisted};const s=await request('/api/sessions',body,headers);assert.equal(s.status,201,JSON.stringify(s.data));return {s:s.data,q:q.data,body};};
  const pay=async(s)=>{const r=await request('/api/payment',{idempotencyKey:randomUUID()},{Authorization:`Bearer ${s.accessToken}`});assert.equal(r.status,200);return r.data;};
  const event=async(a,scenario,eventId=randomUUID())=>request('/api/harness',{attempt:a.attempt,scenario,eventId},{'X-Demo-Key':app.access.harness});
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  return {get app(){return app;},request,login,create,pay,event,advance:n=>clock+=n, restart:async()=>{await app.close();app=createApp({dataDir:dir,now:()=>clock,paymentDelay:60000,harness:true,...opts});await listen();}};
}

test('driver session persists across restart, second context sees same session, metrics and CSV reconcile',async t=>{
  const f=await fixture(t), {s}=await f.create();const a=await f.pay(s);await f.event(a,'confirmed');await f.restart();
  const pass=await f.request('/api/pass',null,{Authorization:`Bearer ${s.accessToken}`});assert.equal(pass.data.payment,'confirmed');assert.equal(pass.data.validity,'valid');assert.ok(pass.data.receipt);assert.equal(pass.data.total,2000);assert.equal(pass.data.creator,undefined);
  const attendant=await f.login('attendant');const list=await f.request('/api/staff/sessions?q=1234',null,attendant);assert.equal(list.data.rows[0].reference,s.reference);
  const manager=await f.login('manager');const metrics=await f.request('/api/manager/overview',null,manager);assert.equal(metrics.data.confirmed,2000);assert.equal(metrics.data.active,1);assert.equal(metrics.data.sessions,1);
  const csv=await f.request('/api/staff/sessions?payment=confirmed&format=csv',null,manager);assert.equal(csv.status,200);assert.match(csv.data,/1234 AB 01/);assert.equal(csv.data.split('\r\n').length,2);
});
test('assisted creation uses same quote and payment rules and records actor',async t=>{
  const f=await fixture(t), staff=await f.login('attendant');const {s}=await f.create('HELP 101',{assisted:true},staff);assert.equal(s.payment,'not_started');const a=await f.pay(s);await f.event(a,'confirmed');const list=await f.request('/api/staff/sessions',null,staff);assert.equal(list.data.rows[0].creator,'attendant');assert.equal(list.data.rows[0].total,2000);
});
test('pending and failed events never issue receipts; terminal failed payment ignores late confirmation',async t=>{
  const f=await fixture(t),{s}=await f.create(),a=await f.pay(s);let p=await f.request('/api/pass',null,{Authorization:`Bearer ${s.accessToken}`});assert.equal(p.data.payment,'pending');assert.equal(p.data.validity,'not_valid');assert.equal(p.data.receipt,null);
  await f.event(a,'failed');await f.event(a,'confirmed');p=await f.request('/api/pass',null,{Authorization:`Bearer ${s.accessToken}`});assert.equal(p.data.payment,'failed');assert.equal(p.data.start,null);assert.equal(p.data.receipt,null);
});
test('idempotent submissions and duplicate/out-of-order events preserve one receipt and one time entitlement',async t=>{
  const f=await fixture(t),{s,body}=await f.create();const repeated=await Promise.all([f.request('/api/sessions',body),f.request('/api/sessions',body)]);assert.ok(repeated.every(x=>x.data.reference===s.reference));
  const a=await f.pay(s),again=await f.pay(s);assert.equal(a.attempt,again.attempt);const id=randomUUID();await f.event(a,'confirmed',id);const start=f.app.db.prepare('SELECT start FROM sessions').get().start;f.advance(10000);assert.equal((await f.event(a,'confirmed',id)).data.duplicate,true);await f.event(a,'confirmed');assert.equal(f.app.db.prepare('SELECT start FROM sessions').get().start,start);assert.equal(f.app.db.prepare('SELECT count(*) n FROM receipts').get().n,1);assert.equal(f.app.db.prepare('SELECT count(*) n FROM attempts').get().n,1);
  assert.equal((await f.event(a,'failed',id)).status,409);await f.event(a,'failed');const p=await f.request('/api/pass',null,{Authorization:`Bearer ${s.accessToken}`});assert.equal(p.data.payment,'confirmed');
});
test('same submission key cannot be rebound to a different quote',async t=>{const f=await fixture(t),a=await f.create(),b=await f.create('OTHER 01');assert.equal((await f.request('/api/sessions',{...a.body,quote:b.q.id})).status,409);});
test('historical confirmed payment stays confirmed after expiry',async t=>{const f=await fixture(t),{s}=await f.create(),a=await f.pay(s);await f.event(a,'confirmed');f.advance(3600001);const p=await f.request('/api/pass',null,{Authorization:`Bearer ${s.accessToken}`});assert.equal(p.data.payment,'confirmed');assert.equal(p.data.validity,'expired');assert.ok(p.data.receipt);});
test('refund is terminal and daily close separates charges, confirmations, refunds and settlement',async t=>{const f=await fixture(t),{s}=await f.create(),a=await f.pay(s);await f.event(a,'confirmed');await f.event(a,'refunded');await f.event(a,'confirmed');const p=await f.request('/api/pass',null,{Authorization:`Bearer ${s.accessToken}`});assert.equal(p.data.payment,'refunded');assert.equal(p.data.validity,'not_valid');assert.equal(p.data.receipt,null);const manager=await f.login('manager'),r=await f.request('/api/manager/close?date=2026-11-01',null,manager);assert.equal(r.data.charges,2000);assert.equal(r.data.confirmedDigital,2000);assert.equal(r.data.refunds,2000);assert.equal(r.data.unmatched,0);assert.equal(r.data.cash,'disabled');assert.equal(r.data.settlement,'not imported');});
test('wrong roles, missing auth and wrong zone are rejected by server',async t=>{const f=await fixture(t),staff=await f.login('attendant');assert.equal((await f.request('/api/staff/sessions')).status,401);assert.equal((await f.request('/api/manager/overview',null,staff)).status,403);assert.equal((await f.request('/api/manager/tariff',{zone:'CG-01',rate:5000,version:1},staff)).status,403);assert.equal((await f.request('/api/staff/sessions?zone=OTHER',null,staff)).status,403);assert.equal((await f.request('/api/staff/sessions?format=csv',null,staff)).status,403);
  const {s}=await f.create();f.app.db.prepare('UPDATE staff SET zone=? WHERE id=?').run('OTHER','attendant');assert.equal((await f.request('/api/staff/issues',{reference:s.reference,reason:'Wrong zone flag'},staff)).status,403);const q=await f.request('/api/quotes',{zone:'CG-01',plate:'SCOPE 01',minutes:60});assert.equal((await f.request('/api/sessions',{quote:q.data.id,idempotencyKey:randomUUID(),assisted:true},staff)).status,403);
});
test('drivers cannot enumerate by plate/reference or borrow another pass',async t=>{const f=await fixture(t),{s}=await f.create();assert.equal((await f.request('/api/pass?plate='+s.plate)).status,401);assert.equal((await f.request('/api/pass',null,{Authorization:`Bearer ${s.reference}`})).status,404);assert.equal((await f.request('/api/staff/sessions',null,{Authorization:`Bearer ${s.accessToken}`})).status,401);assert.equal((await f.request('/api/sessions/'+s.reference)).status,404);});
test('manager tariff versions preserve existing quotes and reject stale edits',async t=>{const f=await fixture(t),m=await f.login('manager'),{s}=await f.create();const q=await f.request('/api/quotes',{zone:'CG-01',plate:'OLD QUOTE',minutes:60});assert.equal((await f.request('/api/manager/tariff',{zone:'CG-01',rate:2000,version:1},m)).status,200);assert.equal((await f.request('/api/manager/tariff',{zone:'CG-01',rate:3000,version:1},m)).status,409);const old=await f.request('/api/sessions',{quote:q.data.id,idempotencyKey:randomUUID()});assert.equal(old.data.total,2000);const newer=await f.create('NEW QUOTE');assert.equal(newer.s.total,4000);assert.ok(newer.s.tariff>1);const p=await f.request('/api/pass',null,{Authorization:`Bearer ${s.accessToken}`});assert.equal(p.data.total,2000);assert.equal(p.data.tariff,1);});
test('delayed simulator job survives restart; pending harness pauses automatic confirmation',async t=>{const f=await fixture(t),{s}=await f.create(),a=await f.pay(s);await f.event(a,'delayed');await f.restart();f.advance(16000);f.app.tick();assert.equal((await f.request('/api/pass',null,{Authorization:`Bearer ${s.accessToken}`})).data.payment,'confirmed');const b=await f.create('PENDING 02'),p=await f.pay(b.s);await f.event(p,'pending');f.advance(100000);f.app.tick();assert.equal((await f.request('/api/pass',null,{Authorization:`Bearer ${b.s.accessToken}`})).data.payment,'pending');});
test('harness disabled by default and unavailable to ordinary staff even when enabled',async t=>{const f=await fixture(t,{harness:false}),{s}=await f.create(),a=await f.pay(s);assert.equal((await f.event(a,'confirmed')).status,404);const g=await fixture(t),b=await g.create(),p=await g.pay(b.s),staff=await g.login('manager');assert.equal((await g.request('/api/harness',{attempt:p.attempt,scenario:'confirmed',eventId:randomUUID()},staff)).status,403);});
test('input, origin and quote-expiry checks; issue flags preserve actor and timestamp',async t=>{const f=await fixture(t);assert.equal((await f.request('/api/quotes',{zone:'CG-01',plate:'<script>',minutes:60})).status,400);assert.equal((await f.request('/api/quotes',{zone:'CG-01',plate:'OK 01',minutes:31})).status,400);assert.equal((await f.request('/api/quotes',{zone:'CG-01',plate:'OK 01',minutes:60},{Origin:'https://attacker.invalid'})).status,403);const q=await f.request('/api/quotes',{zone:'CG-01',plate:'OLD 01',minutes:60});f.advance(600001);assert.equal((await f.request('/api/sessions',{quote:q.data.id,idempotencyKey:randomUUID()})).status,409);const {s}=await f.create(),staff=await f.login('attendant');assert.equal((await f.request('/api/staff/issues',{reference:s.reference,reason:'Plate needs supervisor review'},staff)).status,201);const m=await f.login('manager'),o=await f.request('/api/manager/overview',null,m);assert.equal(o.data.issues[0].actor,'attendant');assert.equal(o.data.issues[0].session,s.reference);assert.equal(o.data.issues[0].reason,'Plate needs supervisor review');});
test('logout invalidates the server session',async t=>{const f=await fixture(t),staff=await f.login('attendant');assert.equal((await f.request('/api/me',null,staff)).status,200);await f.request('/api/logout',{},staff);assert.equal((await f.request('/api/me',null,staff)).status,401);});

async function driverSignup(f, email='driver@example.test',vehicle={}) {
  const result=await f.request('/api/driver/signup',{name:'Demo Driver',email,password:'demo-password-123',plate:'DRIVER 01',preference:'digital',paymentMethod:'mobile_money',...vehicle});
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.digest,undefined);
  return {Cookie:result.headers.get('set-cookie').split(';')[0]};
}
test('driver accounts persist; owner-only history and independent staff cookies',async t=>{
  const f=await fixture(t),a=await driverSignup(f,'driver@example.test',{make:' Toyota ',model:' Corolla '}),b=await driverSignup(f,'second@example.test');
  const vehicles=async auth=>(await f.request('/api/driver/vehicles',null,auth)).data.vehicles;
  const registered=(await vehicles(a))[0];assert.equal(registered.make,'Toyota');assert.equal(registered.model,'Corolla');
  assert.equal((await vehicles(b))[0].make,'');assert.notEqual((await vehicles(b))[0].id,registered.id);
  const {s}=await f.create('DRIVER 01',{},a);
  assert.equal((await f.request('/api/driver/history',null,a)).data.rows[0].reference,s.reference);
  assert.equal((await f.request('/api/driver/history',null,b)).data.rows.length,0);
  assert.equal((await f.request('/api/driver/history')).status,401);
  assert.equal((await f.request('/api/staff/sessions',null,a)).status,401);
  await f.restart();assert.equal((await f.request('/api/driver/history',null,a)).data.rows.length,1);
  assert.deepEqual(await vehicles(a),[registered],'signup vehicle details survive restart and repeated vehicle reads');
  const logout=await f.request('/api/driver/logout',{},a);assert.equal(logout.status,200);
  assert.equal((await f.request('/api/driver/me',null,a)).status,401);
  const login=await f.request('/api/driver/login',{email:'DRIVER@example.test',password:'demo-password-123'});
  assert.equal(login.status,200);assert.equal(login.data.plate,'DRIVER 01');
  assert.equal((await f.request('/api/driver/login',{email:'driver@example.test',password:'not-correct-password'})).status,401);
});
test('guest pass claim requires token; plate matching never links accounts; claims are exclusive',async t=>{
  const f=await fixture(t),a=await driverSignup(f),b=await driverSignup(f,'another@example.test'),{s}=await f.create('DRIVER 01');
  assert.equal((await f.request('/api/driver/history',null,a)).data.rows.length,0);
  assert.equal((await f.request('/api/driver/claim',{accessToken:s.reference},a)).status,404);
  assert.equal((await f.request('/api/driver/claim',{accessToken:s.accessToken},a)).status,200);
  assert.equal((await f.request('/api/driver/claim',{accessToken:s.accessToken},a)).status,200);
  assert.equal((await f.request('/api/driver/claim',{accessToken:s.accessToken},b)).status,409);
});
test('site capacity is not reduced by a paid pass alone and exposes no personal data',async t=>{
  const f=await fixture(t),initial=await f.request('/api/sites');assert.equal(initial.data.sites.length,8);
  const gombe=()=>f.request('/api/sites').then(r=>r.data.sites.find(s=>s.id==='CG-01'));
  assert.equal((await gombe()).available,40);const {s}=await f.create(),p=await f.pay(s);
  assert.equal((await gombe()).available,40);await f.event(p,'confirmed');assert.equal((await gombe()).available,40);
  assert.equal((await gombe()).availabilityType,'recorded');assert.doesNotMatch(JSON.stringify(await gombe()),/1234 AB 01/);
  f.app.db.prepare('UPDATE site_details SET capacity=0 WHERE zone=?').run('CG-01');assert.equal((await gombe()).available,0);
  f.advance(3600001);assert.equal((await gombe()).activePasses,0);
  const q=await f.request('/api/quotes',{zone:'DEMO-02',plate:'SITE 02',minutes:60});assert.equal(q.data.total,1600);
});
test('subscription uses server price and simulator, is idempotent, and expires after 30 days',async t=>{
  const f=await fixture(t),a=await driverSignup(f),body={zone:'CG-01',plate:'MONTH 01',idempotencyKey:randomUUID(),total:1};
  assert.equal((await f.request('/api/driver/subscriptions',body)).status,401);
  const r=await f.request('/api/driver/subscriptions',body,a),s=r.data;assert.equal(r.status,201);assert.equal(s.total,60000);assert.equal(s.minutes,43200);assert.equal(s.validity,'not_valid');assert.equal(s.passType,'subscription');
  assert.equal((await f.request('/api/driver/subscriptions',body,a)).data.reference,s.reference);
  assert.equal((await f.request('/api/driver/subscriptions',{...body,idempotencyKey:randomUUID()},a)).status,409);
  const p=await f.pay(s);await f.event(p,'confirmed');await f.event(p,'confirmed');
  let pass=(await f.request('/api/pass',null,{Authorization:'Bearer '+s.accessToken})).data;
  assert.equal(pass.end-pass.start,30*86400000);assert.equal(pass.validity,'valid');
  const history=await f.request('/api/driver/history',null,a);assert.equal(history.data.subscriptions.length,1);assert.equal(history.data.subscriptions[0].autoRenew,false);
  f.advance(30*86400000+1);pass=(await f.request('/api/pass',null,{Authorization:'Bearer '+s.accessToken})).data;assert.equal(pass.validity,'expired');assert.equal(pass.payment,'confirmed');
});
test('ending subscription requires its owner, revokes validity but preserves payment and history',async t=>{
  const f=await fixture(t),a=await driverSignup(f),b=await driverSignup(f,'outsider@example.test');
  const s=(await f.request('/api/driver/subscriptions',{zone:'CG-01',plate:'END 01',idempotencyKey:randomUUID()},a)).data;
  assert.equal((await f.request('/api/driver/subscriptions/end',{reference:s.reference},a)).status,409);
  const p=await f.pay(s);await f.event(p,'confirmed');
  assert.equal((await f.request('/api/driver/subscriptions/end',{reference:s.reference},b)).status,404);
  assert.equal((await f.request('/api/driver/subscriptions/end',{reference:s.reference},a)).status,200);
  assert.equal((await f.request('/api/driver/subscriptions/end',{reference:s.reference},a)).status,200);
  await f.event(p,'confirmed');const pass=(await f.request('/api/pass',null,{Authorization:'Bearer '+s.accessToken})).data;
  assert.equal(pass.validity,'cancelled');assert.equal(pass.payment,'confirmed');assert.equal((await f.request('/api/driver/history',null,a)).data.rows.length,1);
  assert.equal((await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01').activePasses,0);
  assert.equal((await f.request('/api/payment',{idempotencyKey:randomUUID()},{Authorization:'Bearer '+s.accessToken})).status,409);
});
test('onboarding validation and account-bound submission keys',async t=>{
  const f=await fixture(t);assert.equal((await f.request('/api/driver/signup',{name:'Demo',email:'bad',password:'short',plate:'BAD',preference:'digital',paymentMethod:'mobile_money'})).status,400);
  for(const details of [{make:'x'.repeat(61)},{model:'x'.repeat(61)},{make:{}},{model:42}]) {
    assert.equal((await f.request('/api/driver/signup',{name:'Demo',email:'invalid-vehicle@example.test',password:'demo-password-123',plate:'TEST 01',preference:'digital',paymentMethod:'mobile_money',...details})).status,400);
  }
  assert.equal(f.app.db.prepare('SELECT count(*) AS n FROM drivers WHERE email=?').get('invalid-vehicle@example.test').n,0);
  const a=await driverSignup(f),b=await driverSignup(f,'other@example.test'),created=await f.create('PRIVATE 01',{},a);
  assert.equal((await f.request('/api/sessions',created.body,b)).status,409);
  assert.equal((await f.request('/api/sessions',created.body)).status,409);
});

async function opsSite(f,manager,overrides={}){
 const sites=(await f.request('/api/ops/sites',null,manager)).data.sites;
 const s=sites.find(s=>s.id===(overrides.zone||'CG-01'));
 const body={zone:s.id,name:s.name,area:s.area,address:'Synthetic test address',capacity:s.capacity,blocked:s.blocked,open:Boolean(s.open),version:s.version,latitude:s.latitude,longitude:s.longitude,...overrides};
 const result=await f.request('/api/ops/site',body,manager);assert.equal(result.status,200,JSON.stringify(result.data));return result.data.site;
}
async function walkin(f,staff,overrides={}){
 const body={zone:'CG-01',plate:'CASH 001',make:'Toyota',model:'Corolla',minutes:60,method:'cash',idempotencyKey:randomUUID(),...overrides};
 const r=await f.request('/api/ops/walkin',body,staff);assert.equal(r.status,201,JSON.stringify(r.data));return {...r.data,body};
}
async function admit(f,staff,reference,key=randomUUID(),driver={}) {
 const session=f.app.db.prepare('SELECT * FROM sessions WHERE id=?').get(reference);
 let entryCode;
 if(!f.app.db.prepare('SELECT id FROM cash_payments WHERE session=?').get(reference)&&!f.app.db.prepare('SELECT id FROM walkin_tickets WHERE session=?').get(reference)) {
  f.advance(2001);const issued=await f.request('/api/pass/entry-code',{}, {...driver,Authorization:'Bearer '+session.access});entryCode=issued.data.code;
 }
 return f.request('/api/ops/admit',{reference,zone:session.zone,observedPlate:session.plate,make:'Toyota',model:'Corolla',entryCode,idempotencyKey:key},staff);
}
test('admin cash registration, confirmation, admission and exit are distinct and reconcile without duplicates',async t=>{
 const f=await fixture(t),m=await f.login('manager'),a=await f.login('attendant'),w=await walkin(f,a,{amount:1});
 assert.equal((await f.request('/api/ops/walkin',w.body,a)).data.reference,w.reference);
 assert.equal((await admit(f,a,w.reference)).status,409);
 assert.equal((await f.request('/api/payment',{idempotencyKey:randomUUID()},{Authorization:'Bearer '+w.accessToken})).status,409);
 assert.equal((await f.request('/api/ops/cash/approve',{reference:w.reference,amount:1},a)).status,409);
 for(let i=0;i<2;i++)assert.equal((await f.request('/api/ops/cash/approve',{reference:w.reference,amount:2000},a)).status,200);
 assert.equal((await f.request('/api/ops/staff',{username:'missing-site',password:'a-long-demo-password'},m)).status,400);
 assert.equal((await f.request('/api/ops/cash/close',{date:'2026-11-01',counted:0,idempotencyKey:randomUUID()},m)).status,400);
 const key=randomUUID(),first=await admit(f,a,w.reference,key),again=await admit(f,a,w.reference,key);assert.equal(first.status,200);assert.equal(again.data.visit,first.data.visit);
 let site=(await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01');assert.equal(site.occupied,1);assert.equal(site.available,39);
 f.advance(3600001);site=(await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01');assert.equal(site.occupied,1,'expiry never means physical departure');
 for(let i=0;i<2;i++)assert.equal((await f.request('/api/ops/checkout',{visit:first.data.visit},a)).status,200);
 assert.equal((await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01').occupied,0);
 const report=(await f.request('/api/ops/report?zone=CG-01&date=2026-11-01',null,m)).data;assert.equal(report.cash,2000);assert.equal(report.digital,0);assert.equal(report.transactions,1);
 assert.equal(f.app.db.prepare('SELECT count(*) n FROM receipts').get().n,1);
});
test('capacity holds prevent overbooking under simultaneous requests and expire automatically',async t=>{
 const f=await fixture(t),m=await f.login('manager');await opsSite(f,m,{capacity:1});
 const body={zone:'CG-01',plate:'HOLD 1',make:'Ford',model:'Focus',holdMinutes:15,idempotencyKey:randomUUID()};
 const r=await Promise.all([f.request('/api/ops/reservations',body,m),f.request('/api/ops/reservations',{...body,plate:'HOLD 2',idempotencyKey:randomUUID()},m)]);
 assert.deepEqual(r.map(x=>x.status).sort(),[201,409]);assert.equal((await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01').available,0);
 assert.equal((await f.request('/api/ops/reservations',body,m)).status,201);
 f.advance(15*60000+1);assert.equal((await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01').available,1);
});
test('matching reservation is consumed on admission without double-counting capacity',async t=>{
 const f=await fixture(t),m=await f.login('manager');await opsSite(f,m,{capacity:1});
 const hold=await f.request('/api/ops/reservations',{zone:'CG-01',plate:'CASH 001',make:'Toyota',model:'Corolla',holdMinutes:30,idempotencyKey:randomUUID()},m);assert.equal(hold.status,201);
 const w=await walkin(f,m);await f.request('/api/ops/cash/approve',{reference:w.reference,amount:2000},m);const v=await admit(f,m,w.reference);assert.equal(v.status,200);
 const site=(await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01');assert.equal(site.held,0);assert.equal(site.occupied,1);assert.equal(site.available,0);
 assert.equal((await f.request('/api/ops/reservations/cancel',{reference:hold.data.reference},m)).status,409);
});
test('simultaneous admission for last space admits one vehicle; site cannot shrink below occupancy',async t=>{
 const f=await fixture(t),m=await f.login('manager');await opsSite(f,m,{capacity:1});
 const a=await f.create('ENTRY 1'),b=await f.create('ENTRY 2');await f.event(await f.pay(a.s),'confirmed');await f.event(await f.pay(b.s),'confirmed');
 const responses=await Promise.all([admit(f,m,a.s.reference),admit(f,m,b.s.reference)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const s=(await f.request('/api/ops/sites',null,m)).data.sites[0];const edit=await f.request('/api/ops/site',{zone:s.id,name:s.name,area:s.area,address:'Demo',capacity:1,blocked:1,open:true,latitude:null,longitude:null,version:s.version},m);assert.equal(edit.status,409);
});
test('subscriptions allow separate repeated visits and count payment only once',async t=>{
 const f=await fixture(t),m=await f.login('manager'),driver=await driverSignup(f),s=(await f.request('/api/driver/subscriptions',{zone:'CG-01',plate:'SUB 001',idempotencyKey:randomUUID()},driver)).data;
 await f.event(await f.pay(s),'confirmed');assert.equal((await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01').occupied,0);
 const first=await admit(f,m,s.reference,randomUUID(),driver);assert.equal(first.status,200);assert.equal((await admit(f,m,s.reference,randomUUID(),driver)).status,409);
 await f.request('/api/ops/checkout',{visit:first.data.visit},m);assert.equal((await admit(f,m,s.reference,randomUUID(),driver)).status,200);
 const r=(await f.request('/api/ops/report?date=2026-11-01',null,m)).data;assert.equal(r.digital,60000);assert.equal(r.transactions,1);
});
test('single-visit passes cannot reenter; cash refunds revoke entitlement but do not erase occupancy',async t=>{
 const f=await fixture(t),m=await f.login('manager'),a=await f.login('attendant'),w=await walkin(f,m);await f.request('/api/ops/cash/approve',{reference:w.reference,amount:2000},m);const v=await admit(f,m,w.reference);
 assert.equal((await f.request('/api/ops/cash/refund',{reference:w.reference,reason:'Customer request'},a)).status,403);
 for(let i=0;i<2;i++)assert.equal((await f.request('/api/ops/cash/refund',{reference:w.reference,reason:'Customer request'},m)).status,200);
 assert.equal((await f.request('/api/sites')).data.sites.find(s=>s.id==='CG-01').occupied,1);
 const r=(await f.request('/api/ops/report?date=2026-11-01',null,m)).data;assert.equal(r.cash,2000);assert.equal(r.cashRefunds,2000);assert.equal(r.net,0);
 await f.request('/api/ops/checkout',{visit:v.data.visit},m);assert.equal((await admit(f,m,w.reference)).status,409);
});
test('manager-only site and staff controls enforce assigned-site access and revoke disabled sessions',async t=>{
 const f=await fixture(t),m=await f.login('manager'),a=await f.login('attendant');
 assert.equal((await f.request('/api/ops/overview?zone=DEMO-02',null,a)).status,403);
 assert.equal((await f.request('/api/ops/staff',null,a)).status,403);
 assert.equal((await f.request('/api/ops/overview')).status,401);
 assert.equal((await f.request('/api/ops/staff',{username:'test-staff',password:'test-password-123',zone:'DEMO-02'},m)).status,200);
 const login=await f.request('/api/login',{username:'test-staff',password:'test-password-123'});const auth={Cookie:login.headers.get('set-cookie').split(';')[0]};
 assert.equal((await f.request('/api/ops/overview?zone=DEMO-02',null,auth)).status,200);assert.equal((await f.request('/api/ops/overview?zone=CG-01',null,auth)).status,403);
 assert.equal((await f.request('/api/ops/staff',{username:'test-staff',zone:'DEMO-02',enabled:false},m)).status,200);
 assert.equal((await f.request('/api/ops/overview?zone=DEMO-02',null,auth)).status,401);
 assert.equal((await f.request('/api/login',{username:'test-staff',password:'test-password-123'})).status,401);
});
test('cash close includes opening cash, requires discrepancy note, and snapshots are idempotent',async t=>{
 const f=await fixture(t),m=await f.login('manager'),w=await walkin(f,m);await f.request('/api/ops/cash/approve',{reference:w.reference,amount:2000},m);
 const body={zone:'CG-01',date:'2026-11-01',opening:500,counted:2400,note:'',idempotencyKey:randomUUID()};assert.equal((await f.request('/api/ops/cash/close',body,m)).status,400);
 body.note='100 CDF short';const a=await f.request('/api/ops/cash/close',body,m);assert.equal(a.status,201);assert.equal((await f.request('/api/ops/cash/close',body,m)).data.id,a.data.id);
 const r=(await f.request('/api/ops/report?date=2026-11-01',null,m)).data;assert.equal(r.closes[0].expected,2500);assert.equal(r.closes[0].difference,-100);assert.equal(r.closes.length,1);
 const csv=await f.request('/api/ops/report?date=2026-11-01&format=csv',null,m);assert.match(csv.data,/CASH 001/);assert.equal(csv.data.split('\r\n').length,2);
});
test('site creation validates coordinates and public inventory reflects closure and saved location',async t=>{
 const f=await fixture(t),m=await f.login('manager');const body={zone:'TEST-04',name:'Test site',area:'Test',address:'Synthetic address',capacity:5,blocked:1,open:true,rate:1000,latitude:-4.3,longitude:15.3};
 assert.equal((await f.request('/api/ops/site',{...body,latitude:100},m)).status,400);
 assert.equal((await f.request('/api/ops/site',body,m)).status,200);
 let s=(await f.request('/api/sites')).data.sites.find(s=>s.id==='TEST-04');assert.equal(s.available,4);assert.equal(s.latitude,-4.3);
 await opsSite(f,m,{zone:'TEST-04',open:false});s=(await f.request('/api/sites')).data.sites.find(s=>s.id==='TEST-04');assert.equal(s.available,0);
});
test('issue resolution has manager attribution; operations persist across restart',async t=>{
 const f=await fixture(t),m=await f.login('manager'),a=await f.login('attendant'),w=await walkin(f,m);
 await f.request('/api/staff/issues',{reference:w.reference,reason:'Confirm vehicle details'},a);
 const issue=(await f.request('/api/ops/overview',null,m)).data.issues[0];
 assert.equal((await f.request('/api/ops/issues/resolve',{id:issue.id,reason:'Vehicle inspected'},a)).status,403);
 assert.equal((await f.request('/api/ops/issues/resolve',{id:issue.id,reason:'Vehicle inspected'},m)).status,200);
 await f.restart();const refreshed=(await f.request('/api/ops/overview',null,m)).data;assert.ok(refreshed.issues[0].resolved);assert.ok(refreshed.history.some(h=>h.action==='issue_resolved'&&h.actor==='manager'));assert.equal(refreshed.passes[0].vehicle.make,'Toyota');
});

async function ticketEntry(f,staff,extra={}) {
 const body={zone:'CG-01',plate:'FAST 001',idempotencyKey:randomUUID(),...extra};
 const r=await f.request('/api/ops/tickets',body,staff);assert.equal(r.status,201,JSON.stringify(r.data));return {...r.data,body};
}
async function exitQuote(f,staff,reference){const r=await f.request('/api/ops/ticket/quote',{reference,idempotencyKey:randomUUID()},staff);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
test('plate-only ticket immediately records occupancy without payment; retries and reprints never duplicate entry',async t=>{
 const f=await fixture(t),a=await f.login('attendant'),r=await ticketEntry(f,a);
 assert.equal(r.ticket.make,'');assert.equal(r.ticket.payment,'unpaid');assert.equal(r.ticket.state,'unpaid');
 assert.equal(f.app.db.prepare('SELECT count(*) n FROM sessions').get().n,0);
 assert.equal((await f.request('/api/ops/tickets',r.body,a)).data.reference,r.reference);
 assert.equal((await f.request('/api/ops/tickets',{...r.body,idempotencyKey:randomUUID(),plate:'FAST-001'},a)).status,409);
 assert.equal((await f.request('/api/ops/overview',null,a)).data.site.occupied,1);
 for(let i=0;i<2;i++){const page=await f.request('/api/ops/ticket/print?reference='+r.reference,null,a);assert.equal(page.status,200);assert.match(page.data,/PAY AT EXIT/);assert.match(page.data,/not a payment receipt/);assert.match(page.data,/<svg/);}
 assert.equal(f.app.db.prepare('SELECT count(*) n FROM visits').get().n,1);
 assert.equal((await f.request('/api/ops/checkout',{visit:r.visit},a)).status,409);
 assert.equal((await f.request('/api/ops/ticket/exit',{reference:r.reference,idempotencyKey:randomUUID()},a)).status,409);
});
test('ticket entry consumes its reservation and protects the last space under concurrent arrivals',async t=>{
 const f=await fixture(t),m=await f.login('manager');await opsSite(f,m,{capacity:1});
 const hold=await f.request('/api/ops/reservations',{zone:'CG-01',plate:'HOLD 1',make:'Toyota',model:'Corolla',holdMinutes:15,idempotencyKey:randomUUID()},m);assert.equal(hold.status,201);
 const r=await ticketEntry(f,m,{plate:'HOLD-1'});const site=(await f.request('/api/sites')).data.sites[0];assert.equal(site.held,0);assert.equal(site.occupied,1);assert.equal(site.available,0);
 const q=(await exitQuote(f,m,r.reference)).quote;await f.request('/api/ops/ticket/cash-exit',{reference:r.reference,quote:q.id,amount:q.total,idempotencyKey:randomUUID()},m);
 const results=await Promise.all(['LAST 1','LAST 2'].map(plate=>f.request('/api/ops/tickets',{zone:'CG-01',plate,idempotencyKey:randomUUID()},m)));assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
});
test('walk-in duration uses server time, started 30-minute blocks and the rate fixed at entry',async t=>{
 const f=await fixture(t),m=await f.login('manager'),r=await ticketEntry(f,m,{rate:1,entered:1});
 let q=(await exitQuote(f,m,r.reference)).quote;assert.equal(q.total,1000);assert.equal(q.billedMinutes,30);
 f.advance(1800000);q=(await exitQuote(f,m,r.reference)).quote;assert.equal(q.total,1000);
 f.advance(1);q=(await exitQuote(f,m,r.reference)).quote;assert.equal(q.total,2000);assert.equal(q.billedMinutes,60);
 await f.request('/api/manager/tariff',{zone:'CG-01',rate:5000,version:1},m);
 f.advance(8*3600000);const staff=await f.login('manager');q=(await exitQuote(f,staff,r.reference)).quote;assert.equal(q.billedMinutes,540);assert.equal(q.total,18000);
});
test('cash exit rejects stale or tampered charges, atomically receipts payment and departure, and reconciles once',async t=>{
 const f=await fixture(t),m=await f.login('manager'),r=await ticketEntry(f,m);f.advance(31*60000);
 let q=(await exitQuote(f,m,r.reference)).quote;const body={reference:r.reference,quote:q.id,amount:1,idempotencyKey:randomUUID()};
 assert.equal((await f.request('/api/ops/ticket/cash-exit',body,m)).status,409);assert.equal(f.app.db.prepare('SELECT count(*) n FROM sessions').get().n,0);
 f.advance(120000);assert.equal((await f.request('/api/ops/ticket/cash-exit',{...body,amount:2000},m)).status,409);
 q=(await exitQuote(f,m,r.reference)).quote;Object.assign(body,{quote:q.id,amount:q.total});
 const done=await f.request('/api/ops/ticket/cash-exit',body,m);assert.equal(done.status,200);assert.equal(done.data.ticket.state,'departed');assert.equal(done.data.ticket.payment,'confirmed');assert.ok(done.data.ticket.receipt);
 assert.equal((await f.request('/api/ops/ticket/cash-exit',body,m)).data.ticket.receipt,done.data.ticket.receipt);
 const report=(await f.request('/api/ops/report?date=2026-11-01',null,m)).data;assert.equal(report.cash,2000);assert.equal(report.transactions,1);
 assert.equal((await f.request('/api/ops/tickets',null,m)).data.rows.length,0);assert.equal((await f.request('/api/ops/tickets?state=all&q=FAST001',null,m)).data.rows.length,1);
 const receipt=await f.request('/api/ops/ticket/print?receipt=1&reference='+r.reference,null,m);assert.match(receipt.data,/PAYMENT RECEIPT/);assert.match(receipt.data,/2,000 CDF/);
 assert.equal((await f.request('/api/sites')).data.sites[0].available,40);
});
test('digital walk-in payment retains entry time and charge cutoff and only verified money permits exit',async t=>{
 const f=await fixture(t),a=await f.login('attendant'),r=await ticketEntry(f,a);f.advance(31*60000);
 const q=(await exitQuote(f,a,r.reference)).quote,b={reference:r.reference,quote:q.id,idempotencyKey:randomUUID()};
 const s=(await f.request('/api/ops/ticket/digital-charge',b,a)).data;const attempt=await f.pay(s);
 assert.equal((await f.request('/api/ops/ticket/cash-exit',{reference:r.reference,amount:2000,idempotencyKey:randomUUID()},a)).status,409);
 assert.equal((await f.request('/api/ops/ticket/exit',{reference:r.reference,idempotencyKey:randomUUID()},a)).status,409);
 f.advance(60000);await f.event(attempt,'confirmed');await f.event(attempt,'confirmed');
 let pass=(await f.request('/api/pass',null,{Authorization:'Bearer '+s.accessToken})).data;assert.equal(pass.passType,'walkin');assert.equal(pass.start,r.ticket.checked_in);assert.equal(pass.end,q.calculated);assert.equal(pass.validity,'exit_ready');
 assert.equal((await admit(f,a,s.reference)).status,409);
 const body={reference:r.reference,idempotencyKey:randomUUID()};assert.equal((await f.request('/api/ops/ticket/exit',body,a)).data.ticket.state,'departed');assert.equal((await f.request('/api/ops/ticket/exit',body,a)).status,200);
 pass=(await f.request('/api/pass',null,{Authorization:'Bearer '+s.accessToken})).data;assert.equal(pass.validity,'departed');assert.ok(pass.receipt);
});
test('failed digital ticket can be settled once in cash; late confirmation cannot duplicate collection',async t=>{
 const f=await fixture(t),a=await f.login('attendant'),r=await ticketEntry(f,a),q=(await exitQuote(f,a,r.reference)).quote;
 const s=(await f.request('/api/ops/ticket/digital-charge',{reference:r.reference,quote:q.id,idempotencyKey:randomUUID()},a)).data;
 const attempt=await f.pay(s);await f.event(attempt,'failed');
 assert.equal((await f.request('/api/ops/ticket/cash-exit',{reference:r.reference,amount:1000,idempotencyKey:randomUUID()},a)).status,200);
 await f.event(attempt,'confirmed');const m=await f.login('manager'),report=(await f.request('/api/ops/report?date=2026-11-01',null,m)).data;assert.equal(report.cash,1000);assert.equal(report.digital,0);assert.equal(report.transactions,1);
});
test('ticket lookup, print and settlement enforce staff and site scope; entries survive restart',async t=>{
 const f=await fixture(t),m=await f.login('manager'),a=await f.login('attendant'),r=await ticketEntry(f,m,{zone:'DEMO-02'});
 for(const path of ['/api/ops/ticket?reference=','/api/ops/ticket/print?reference=']){assert.equal((await f.request(path+r.reference)).status,401);assert.equal((await f.request(path+r.reference,null,a)).status,403);}
 assert.equal((await f.request('/api/ops/tickets?zone=DEMO-02',null,a)).status,403);
 assert.equal((await f.request('/api/ops/ticket/quote',{reference:r.reference,idempotencyKey:randomUUID()},a)).status,403);
 await f.restart();const again=await f.login('manager'),saved=(await f.request('/api/ops/ticket?reference='+r.reference,null,again)).data.ticket;assert.equal(saved.checked_in,r.ticket.checked_in);assert.equal(saved.payment,'unpaid');
 assert.equal((await f.request('/api/ops/ticket/print?receipt=1&reference='+r.reference,null,again)).status,409);
 assert.equal((await f.request('/api/ops/tickets',{zone:'CG-01',plate:'---',idempotencyKey:randomUUID()},again)).status,400);
});

test('eight Kinshasa sites include illustrative coordinates while manager location edits persist',async t=>{
 const f=await fixture(t),m=await f.login('manager');let sites=(await f.request('/api/sites')).data.sites;
 assert.equal(sites.length,8);assert.equal(sites.filter(s=>s.locationType==='illustrative').length,8);
 for(const s of sites){assert.ok(s.latitude>-4.5&&s.latitude<-4.2);assert.ok(s.longitude>15.1&&s.longitude<15.5);}
 assert.equal(sites.find(s=>s.id==='DEMO-04').area,'Gombe');
 await opsSite(f,m,{zone:'CG-01',latitude:-4.31,longitude:15.3});await f.restart();
 sites=(await f.request('/api/sites')).data.sites;assert.equal(sites[0].latitude,-4.31);assert.equal(sites[0].locationType,'configured');
});
test('synthetic active day is additive, idempotent, reconciles and survives restart without reseeding',async t=>{
 const f=await fixture(t),prior=await f.create('KEEP 001'),driver=await driverSignup(f,'preserve@example.test');
 const before=f.app.db.prepare('SELECT * FROM sessions WHERE id=?').get(prior.s.reference);
 const result=f.app.seedDemoDay();assert.equal(result.sites,8);assert.ok(result.visitsInside>100);assert.equal(result.visitsDeparted,40);assert.equal(result.holds,16);assert.equal(result.issues,24);
 assert.deepEqual(f.app.db.prepare('SELECT * FROM sessions WHERE id=?').get(prior.s.reference),before);
 const tables=['sessions','visits','cash_payments','events','receipts','reservations','audit'];const counts=()=>Object.fromEntries(tables.map(k=>[k,f.app.db.prepare('SELECT count(*) n FROM '+k).get().n]));const seeded=counts();
 assert.equal(f.app.seedDemoDay().alreadyLoaded,true);assert.deepEqual(counts(),seeded);
 const manager=await f.login('manager'),overview=(await f.request('/api/ops/overview',null,manager)).data;
 assert.ok(overview.demoDay);assert.ok(overview.passes.some(p=>p.synthetic));assert.ok(overview.walkins.some(t=>t.synthetic&&t.payment==='unpaid'));
 assert.ok(overview.visits.some(v=>v.passValidity==='expired'));assert.ok(overview.passes.some(p=>p.passType==='subscription'));
 const report=(await f.request('/api/ops/report?date=2026-11-01',null,manager)).data;
 assert.ok(report.cash>0);assert.ok(report.digital>=60000);assert.ok(report.cashRefunds>0);assert.equal(report.closes[0].expected,5000+report.cashExpected);
 const sites=(await f.request('/api/sites')).data.sites;for(const s of sites){assert.equal(s.available,s.capacity-s.blocked-s.occupied-s.held);assert.ok(s.available>=0);}
 assert.equal((await f.request('/api/driver/history',null,driver)).data.rows.length,0,'synthetic sessions never attach to existing driver');
 await f.restart();assert.deepEqual(counts(),seeded);assert.equal(f.app.seedDemoDay().alreadyLoaded,true);assert.deepEqual(f.app.db.prepare('pragma foreign_key_check').all(),[]);
});
test('synthetic day respects closed sites and existing capacity instead of displacing vehicles',async t=>{
 const f=await fixture(t),m=await f.login('manager');await opsSite(f,m,{zone:'CG-01',capacity:1});await opsSite(f,m,{zone:'DEMO-02',open:false});
 const tkt=await ticketEntry(f,m,{plate:'KEEP INSIDE'});const prior=f.app.db.prepare('SELECT * FROM visits WHERE id=?').get(tkt.visit);
 f.app.seedDemoDay();assert.deepEqual(f.app.db.prepare('SELECT * FROM visits WHERE id=?').get(tkt.visit),prior);
 const sites=(await f.request('/api/sites')).data.sites;assert.equal(sites[0].occupied,1);assert.equal(sites[0].held,0);assert.equal(sites[1].occupied,0);assert.equal(sites[1].open,0);
 const attendant=await f.login('attendant');assert.equal((await f.request('/api/ops/sites',null,attendant)).data.sites.length,1);assert.equal((await f.request('/api/ops/overview?zone=DEMO-04',null,attendant)).status,403);
});
