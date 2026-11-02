import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.mjs';

async function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'orya-entry-codes-'));let clock=Date.UTC(2026,10,2,12);
  let app=createApp({dataDir:dir,now:()=>clock,paymentDelay:120000,harness:true});
  const listen=()=>new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));await listen();
  const call=async(path,body,headers={})=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],cache:r.headers.get('cache-control')};};
  const signup=async(name,method='card')=>{const r=await call('/api/driver/signup',{name,email:name+'@example.test',password:'entry-code-test-password',plate:'QR 101',make:'Toyota',model:'Corolla',preference:'digital',paymentMethod:method});assert.equal(r.status,200);return {Cookie:r.cookie};};
  const staff=async(role)=>{const r=await call('/api/login',{username:role,password:app.access[role]});return {Cookie:r.cookie};};
  const make=async(auth={},subscription=false,p='QR 101')=>{
    let r;
    if(subscription)r=await call('/api/driver/subscriptions',{zone:'CG-01',plate:p,idempotencyKey:randomUUID()},auth);
    else {const q=await call('/api/quotes',{zone:'CG-01',plate:p,minutes:60});r=await call('/api/sessions',{quote:q.data.id,idempotencyKey:randomUUID()},auth);}
    assert.equal(r.status,201);return r.data;
  };
  const pay=async(s,state='confirmed')=>{const r=await call('/api/payment',{idempotencyKey:randomUUID()},{Authorization:'Bearer '+s.accessToken});assert.equal(r.status,200);app.applyEvent(randomUUID(),r.data.attempt,state);return r.data;};
  const issue=(s,auth={})=>call('/api/pass/entry-code',{}, {...auth,Authorization:'Bearer '+s.accessToken});
  const admit=(s,code,auth,extra={})=>call('/api/ops/admit',{zone:s.zone,reference:s.reference,entryCode:code,observedPlate:s.plate,make:'Toyota',model:'Corolla',idempotencyKey:randomUUID(),...extra},auth);
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  return {get app(){return app;},call,signup,staff,make,pay,issue,admit,advance:n=>clock+=n,restart:async()=>{await app.close();app=createApp({dataDir:dir,now:()=>clock,paymentDelay:120000,harness:true});await listen();}};
}

test('entry QR is opaque, owner-bound, short-lived and not a private pass link',async t=>{
 const f=await setup(t),owner=await f.signup('Owner'),other=await f.signup('Other'),s=await f.make(owner);
 assert.equal((await f.issue(s,owner)).status,409);await f.pay(s);
 assert.equal((await f.issue(s)).status,403);assert.equal((await f.issue(s,other)).status,403);
 const issued=await f.issue(s,owner);assert.equal(issued.status,200);assert.equal(issued.cache,'no-store');assert.match(issued.data.code,/^ORYA-ENTRY-[A-Za-z0-9_-]{43}$/);
 assert.equal(issued.data.expires-issued.data.serverTime,60000);assert.match(issued.data.qrDataUrl,/^data:image\/png;base64,/);assert.ok(!JSON.stringify(issued.data).includes(s.accessToken));
 const stored=f.app.db.prepare('SELECT * FROM pass_entry_codes').get();assert.equal(stored.digest.length,64);assert.ok(!JSON.stringify(stored).includes(issued.data.code));
 await f.restart();const manager=await f.staff('manager');assert.equal((await f.call('/api/ops/pass-code/verify',{code:issued.data.code,zone:'CG-01'},manager)).status,200);
});

test('QR lookup is scoped to staff and operating site without exposing another site activity',async t=>{
 const f=await setup(t),owner=await f.signup('Owner'),s=await f.make(owner);await f.pay(s);const {data:q}=await f.issue(s,owner),manager=await f.staff('manager');
 const body={code:q.code,zone:'CG-01'};assert.equal((await f.call('/api/ops/pass-code/verify',body)).status,401);
 f.app.db.prepare('UPDATE staff SET zone=? WHERE id=?').run('DEMO-02','attendant');const otherSite=await f.staff('attendant');
 const denied=await f.call('/api/ops/pass-code/verify',{...body,zone:'DEMO-02'},otherSite);assert.equal(denied.status,403);assert.ok(!JSON.stringify(denied.data).includes('QR 101'));
 assert.equal((await f.call('/api/ops/pass-code/verify',{...body,zone:'DEMO-02'},manager)).status,409);
 const found=await f.call('/api/ops/pass-code/verify',body,manager);assert.equal(found.data.pass.vehicle.make,'Toyota');assert.equal(f.app.db.prepare('SELECT count(*) n FROM visits').get().n,0);
});

test('forged, replaced and expired codes are rejected with no admission',async t=>{
 const f=await setup(t),s=await f.make(),staff=await f.staff('attendant');await f.pay(s);const a=(await f.issue(s)).data;
 assert.equal((await f.admit(s,'ORYA-ENTRY-'+'a'.repeat(43),staff)).status,409);
 assert.equal((await f.admit(s,undefined,staff)).status,400);
 f.advance(2001);const b=(await f.issue(s)).data;assert.notEqual(a.code,b.code);
 assert.equal((await f.admit(s,a.code,staff)).status,409);f.advance(60000);
 assert.equal((await f.admit(s,b.code,staff)).status,409);assert.equal(f.app.db.prepare('SELECT count(*) n FROM visits').get().n,0);
});

test('correct plate and pass binding are required; a code authorizes one atomic admission',async t=>{
 const f=await setup(t),s=await f.make(),other=await f.make({},false,'QR 202'),staff=await f.staff('attendant');await f.pay(s);await f.pay(other);const q=(await f.issue(s)).data;
 assert.equal((await f.admit(other,q.code,staff)).status,409);assert.equal((await f.admit(s,q.code,staff,{observedPlate:'WRONG 1'})).status,409);
 const keys=[randomUUID(),randomUUID()];const results=await Promise.all(keys.map(idempotencyKey=>f.admit(s,q.code,staff,{idempotencyKey})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const successful=results.find(r=>r.status===200);assert.equal(f.app.db.prepare('SELECT count(*) n FROM visits').get().n,1);
 assert.equal((await f.admit(s,q.code,staff,{idempotencyKey:keys[results.findIndex(r=>r.status===200)]})).data.visit,successful.data.visit);
 assert.ok(!JSON.stringify(f.app.db.prepare('SELECT * FROM ops_requests').all()).includes(q.code));
 await f.call('/api/ops/checkout',{visit:successful.data.visit},staff);assert.equal((await f.admit(s,q.code,staff)).status,409);assert.equal((await f.issue(s)).status,409);
});

test('subscriptions retain their pass ID but require a fresh QR for each later visit',async t=>{
 const f=await setup(t),owner=await f.signup('Owner'),s=await f.make(owner,true),staff=await f.staff('attendant');await f.pay(s);const q=(await f.issue(s,owner)).data;
 const first=await f.admit(s,q.code,staff);assert.equal(first.status,200);assert.equal((await f.issue(s,owner)).status,409);
 await f.call('/api/ops/checkout',{visit:first.data.visit},staff);assert.equal((await f.admit(s,q.code,staff)).status,409);
 f.advance(2001);const fresh=(await f.issue(s,owner)).data;assert.equal(fresh.reference,q.reference);assert.notEqual(fresh.code,q.code);assert.equal((await f.admit(s,fresh.code,staff)).status,200);
 assert.equal(f.app.db.prepare('SELECT count(*) n FROM attempts WHERE session=?').get(s.reference).n,1);
});

test('refund, cancellation, changed ownership and capacity are rechecked before admission',async t=>{
 const f=await setup(t),owner=await f.signup('Owner'),staff=await f.staff('attendant');
 const s=await f.make(owner);const payment=await f.pay(s);const q=(await f.issue(s,owner)).data;
 f.app.db.prepare('UPDATE site_details SET capacity=0 WHERE zone=?').run(s.zone);assert.equal((await f.admit(s,q.code,staff)).status,409);assert.equal(f.app.db.prepare('SELECT used FROM pass_entry_codes').get().used,null);
 f.app.db.prepare('UPDATE site_details SET capacity=40 WHERE zone=?').run(s.zone);f.app.applyEvent(randomUUID(),payment.attempt,'refunded');assert.equal((await f.admit(s,q.code,staff)).status,409);
 const sub=await f.make(owner,true,'QR 303');await f.pay(sub);const sq=(await f.issue(sub,owner)).data;await f.call('/api/driver/subscriptions/end',{reference:sub.reference},owner);assert.equal((await f.admit(sub,sq.code,staff)).status,409);
 const guest=await f.make({},false,'QR 404');await f.pay(guest);const gq=(await f.issue(guest)).data;await f.call('/api/driver/claim',{accessToken:guest.accessToken},owner);assert.equal((await f.admit(guest,gq.code,staff)).status,409);
});

test('payment method is required at sign-up, private, editable and fixed on a payment attempt',async t=>{
 const f=await setup(t),body={name:'Driver',email:'driver@example.test',password:'payment-test-password',plate:'PM 101',preference:'digital'};
 assert.equal((await f.call('/api/driver/signup',body)).status,400);assert.equal((await f.call('/api/driver/signup',{...body,paymentMethod:'unsupported'})).status,400);
 const owner=await f.signup('Owner','card'),other=await f.signup('Other','mobile_money');
 assert.equal((await f.call('/api/driver/me',null,owner)).data.paymentMethod,'card');assert.equal((await f.call('/api/driver/payment-method',{paymentMethod:'card'})).status,401);
 const s=await f.make(owner);await f.pay(s);assert.equal((await f.call('/api/pass',null,{Authorization:'Bearer '+s.accessToken})).data.paymentOption,'card');
 await f.call('/api/driver/payment-method',{paymentMethod:'mobile_money'},owner);assert.equal((await f.call('/api/pass',null,{Authorization:'Bearer '+s.accessToken})).data.paymentOption,'card');
 assert.equal((await f.call('/api/driver/me',null,other)).data.paymentMethod,'mobile_money');await f.restart();assert.equal((await f.call('/api/driver/me',null,owner)).data.paymentMethod,'mobile_money');
});
