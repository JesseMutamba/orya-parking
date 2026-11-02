import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.mjs';
import { acceptsHost, previewHost } from '../preview-network.mjs';
async function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'orya-mobile-'));let clock=Date.now();
  const app=createApp({dataDir:dir,now:()=>clock});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const call=async(path,body,cookie)=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const signup=async(name,p)=> (await call('/api/driver/signup',{name,email:name+'@example.test',password:'mobile-test-password',plate:p,preference:'digital',paymentMethod:'mobile_money'})).cookie;
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});return {app,call,signup,advance:n=>clock+=n};
}
test('mobile saved vehicles are authenticated, isolated and plate-normalized',async t=>{
  const f=await setup(t),a=await f.signup('DriverOne','MOB 100'),b=await f.signup('DriverTwo','MOB 200');
  assert.equal((await f.call('/api/driver/vehicles')).status,401);
  assert.equal((await f.call('/api/driver/vehicles',null,a)).data.vehicles.length,1);
  assert.equal((await f.call('/api/driver/vehicles',{plate:'MOB 101',make:'Toyota',model:'RAV4'},a)).status,201);
  assert.equal((await f.call('/api/driver/vehicles',{plate:'mob-101'},a)).status,409);
  assert.deepEqual((await f.call('/api/driver/vehicles',null,b)).data.vehicles.map(v=>v.plate),['MOB 200']);
});
test('arrival holds are idempotent, owned and shared with attendant occupancy',async t=>{
  const f=await setup(t),a=await f.signup('DriverOne','MOB 100'),b=await f.signup('DriverTwo','MOB 200'),body={zone:'CG-01',plate:'MOB 100',idempotencyKey:randomUUID()};
  const held=await f.call('/api/driver/holds',body,a);assert.equal(held.status,201);assert.equal(held.data.hold.expires-held.data.hold.created,900000);
  assert.equal((await f.call('/api/driver/holds',body,a)).data.hold.id,held.data.hold.id);
  assert.equal((await f.call('/api/driver/holds',{...body,plate:'MOB 200'},b)).status,409);
  assert.equal((await f.call('/api/driver/holds/cancel',{reference:held.data.hold.id},b)).status,404);
  const site=()=>f.call('/api/sites').then(r=>r.data.sites.find(s=>s.id==='CG-01'));
  assert.equal((await site()).available,39);assert.equal((await site()).held,1);
  const staff=(await f.call('/api/login',{username:'attendant',password:f.app.access.attendant})).cookie;
  const ticket=await f.call('/api/ops/tickets',{zone:'CG-01',plate:'MOB 100',idempotencyKey:randomUUID()},staff);assert.equal(ticket.status,201,JSON.stringify(ticket.data));
  assert.equal((await site()).available,39);assert.equal((await site()).held,0);assert.equal((await site()).occupied,1);
  assert.equal((await f.call('/api/driver/holds',null,a)).data.holds[0].status,'consumed');
  assert.equal((await f.call('/api/driver/holds/cancel',{reference:held.data.hold.id},a)).status,409);
});
test('full sites reject holds; expiration and owner cancellation release capacity',async t=>{
  const f=await setup(t),a=await f.signup('DriverOne','MOB 100');
  f.app.db.prepare('UPDATE site_details SET capacity=1 WHERE zone=?').run('CG-01');
  const body={zone:'CG-01',plate:'MOB 100',idempotencyKey:randomUUID()};
  const held=await f.call('/api/driver/holds',body,a);assert.equal(held.status,201);
  const b=await f.signup('DriverTwo','MOB 200');assert.equal((await f.call('/api/driver/holds',{...body,plate:'MOB 200',idempotencyKey:randomUUID()},b)).status,409);
  f.advance(900001);assert.equal((await f.call('/api/driver/holds',null,a)).data.holds[0].status,'expired');
  assert.equal((await f.call('/api/driver/holds/cancel',{reference:held.data.hold.id},a)).status,409);
  const h2=await f.call('/api/driver/holds',{...body,idempotencyKey:randomUUID()},a);assert.equal(h2.status,201);
  assert.equal((await f.call('/api/driver/holds/cancel',{reference:h2.data.hold.id},a)).status,200);
  assert.equal((await f.call('/api/driver/holds/cancel',{reference:h2.data.hold.id},a)).status,200);
  assert.equal((await f.call('/api/sites')).data.sites.find(s=>s.id==='CG-01').available,1);
});
test('unsigned and unsaved vehicle holds cannot be created',async t=>{
  const f=await setup(t),a=await f.signup('DriverOne','MOB 100'),body={zone:'CG-01',plate:'MOB 999',idempotencyKey:randomUUID()};
  assert.equal((await f.call('/api/driver/holds',body)).status,401);
  assert.equal((await f.call('/api/driver/holds',body,a)).status,400);
  assert.equal((await f.call('/api/driver/holds',{...body,plate:'MOB 100',idempotencyKey:'short'},a)).status,400);
});
test('LAN preview is explicit and permits only the exact private host',()=>{
  assert.equal(acceptsHost('127.0.0.1:3040'),true);
  assert.equal(acceptsHost('192.168.1.25:3040'),false);
  assert.equal(acceptsHost('192.168.1.25:3040',previewHost('192.168.1.25')),true);
  for(const bad of ['192.168.1.26:3040','192.168.1.25.attacker.test','evil.test','192x168x1x25'])assert.equal(acceptsHost(bad,'192.168.1.25'),false);
  for(const bad of ['0.0.0.0','8.8.8.8','example.test','999.1.1.1'])assert.throws(()=>previewHost(bad));
});
