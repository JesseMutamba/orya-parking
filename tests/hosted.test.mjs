import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {hostedOrigin} from '../hosted-preview.mjs';

const origin='https://parking-demo.example.test';
async function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'orya-hosted-'));
  const app=createApp({dataDir:dir,publicOrigin:origin});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  const request=(path,body,headers={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:app.server.address().port,path,method:body?'POST':'GET',headers:{Host:'parking-demo.example.test','X-Forwarded-Proto':'https',...(body?{'Content-Type':'application/json',Origin:origin}:{}),...headers}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,data:res.headers['content-type']?.includes('application/json')?JSON.parse(text):null}));
    });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });return{app,request};
}
test('public hosting is explicit, HTTPS-only and cannot enable the local harness',()=>{
  assert.equal(hostedOrigin(undefined),null);assert.equal(hostedOrigin(origin+'/'),origin);
  for(const value of ['http://app.example.test','https://user:pass@app.example.test','https://app.example.test/path','https://app.example.test?x=1','https://app.example.test#pass','https://localhost','https://127.0.0.1','https://*.example.test'])assert.throws(()=>hostedOrigin(value));
  assert.throws(()=>createApp({publicOrigin:origin}),/explicit data directory/);
  assert.throws(()=>createApp({publicOrigin:origin,dataDir:'/tmp/unused-orya-test',harness:true}),/disabled simulator harness/);
  assert.throws(()=>createApp({publicOrigin:origin,dataDir:'/tmp/unused-orya-test',lanHost:'192.168.1.2'}),/no LAN mode/);
});
test('hosted requests retain exact hostname, proxy TLS and same-origin checks',async t=>{
  const {request}=await setup(t),body={zone:'CG-01',plate:'HOST 101',minutes:60};
  assert.equal((await request('/api/sites')).status,200);
  assert.equal((await request('/api/sites',null,{'X-Forwarded-Proto':'http'})).status,403);
  assert.equal((await request('/api/sites',null,{Host:'attacker.test','X-Forwarded-Host':'parking-demo.example.test'})).status,403);
  assert.equal((await request('/api/sites',null,{Host:'127.0.0.1'})).status,403);
  for(const Origin of ['https://attacker.test','http://parking-demo.example.test','null'])assert.equal((await request('/api/quotes',body,{Origin})).status,403);
  assert.equal((await request('/api/quotes',body,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await request('/api/quotes',body)).status,201);
  const probe=await request('/api/health',null,{Host:'healthcheck.railway.app','X-Forwarded-Proto':'http'});
  assert.equal(probe.status,200);assert.deepEqual(probe.data,{ok:true,demo:true});
  assert.equal((await request('/api/harness',{attempt:'x',scenario:'confirmed'})).status,404);
});
test('hosted driver and staff cookies are Secure and permissions remain separate',async t=>{
  const {app,request}=await setup(t);
  const staff=await request('/api/login',{username:'attendant',password:app.access.attendant});
  assert.equal(staff.status,200);assert.match(staff.headers['set-cookie'][0],/; Secure/);
  const staffCookie=staff.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request('/api/ops/overview',null,{Cookie:staffCookie})).status,200);
  assert.equal((await request('/api/manager/overview',null,{Cookie:staffCookie})).status,403);
  const signup=await request('/api/driver/signup',{name:'Hosted Tester',email:'hosted@example.test',password:'hosted-test-password',plate:'HOST 101',preference:'digital',paymentMethod:'card'});
  assert.equal(signup.status,200);assert.match(signup.headers['set-cookie'][0],/; Secure/);
  const driverCookie=signup.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request('/api/driver/me',null,{Cookie:driverCookie})).status,200);
  assert.equal((await request('/api/ops/overview',null,{Cookie:driverCookie})).status,401);
  for(const [path,Cookie] of [['/api/driver/logout',driverCookie],['/api/logout',staffCookie]]){
    const result=await request(path,{}, {Cookie});assert.equal(result.status,200);assert.match(result.headers['set-cookie'][0],/Max-Age=0; Secure/);
  }
});
test('all three hosted interfaces and their shared assets are served without secrets',async t=>{
  const {request}=await setup(t);
  for(const path of ['/','/mobile/driver','/mobile/operations','/identity.css','/i18n-catalog.js'])assert.equal((await request(path)).status,200,path);
  for(const path of ['/.local/access.json','/parking.sqlite','/Dockerfile','/.env'])assert.equal((await request(path)).status,404,path);
});
