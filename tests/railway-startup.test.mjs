import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const origin='https://parking-test.example.test';
const root=fileURLToPath(new URL('../',import.meta.url));
async function start(dir,hosted){
  const env={...process.env,PORT:'0',ORYA_DATA_DIR:dir,ORYA_HARNESS:'0'};
  delete env.ORYA_PUBLIC_ORIGIN;delete env.RAILWAY_ENVIRONMENT_ID;
  if(hosted){env.ORYA_PUBLIC_ORIGIN=origin;env.RAILWAY_ENVIRONMENT_ID='test-environment';}
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  const closed=new Promise(resolve=>child.once('close',resolve));
  const stop=async()=>{if(child.exitCode===null)child.kill('SIGTERM');await closed;};
  const port=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Server startup timed out'));},10000);
    child.stdout.on('data',data=>{output+=data;const match=output.match(/listening (0\.0\.0\.0|127\.0\.0\.1):(\d+)/);if(match){clearTimeout(timer);assert.equal(match[1],hosted?'0.0.0.0':'127.0.0.1');resolve(Number(match[2]));}});
    child.once('exit',code=>{clearTimeout(timer);reject(Error(`Server exited before startup: ${code}`));});
  });
  const request=(path,body,headers={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path,method:body?'POST':'GET',headers:{Host:hosted?'parking-test.example.test':`127.0.0.1:${port}`,...(hosted?{'X-Forwarded-Proto':'https'}:{}),...(body?{'Content-Type':'application/json',Origin:hosted?origin:`http://127.0.0.1:${port}`} : {}),...headers}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:res.headers['content-type']?.includes('application/json')?JSON.parse(text):text}));
    });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
  });
  return {request,stop};
}

test('local CLI startup remains loopback-only',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'orya-local-bind-'));const app=await start(dir,false);
  t.after(async()=>{await app.stop();rmSync(dir,{recursive:true,force:true});});
  assert.equal((await app.request('/api/health')).status,200);
  assert.equal((await app.request('/',null,{Host:'parking-test.example.test'})).status,403);
});

test('Railway CLI startup accepts the public HTTPS host and internal healthcheck',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'orya-public-bind-'));const app=await start(dir,true);
  t.after(async()=>{await app.stop();rmSync(dir,{recursive:true,force:true});});
  assert.deepEqual((await app.request('/api/health',null,{Host:'healthcheck.railway.app','X-Forwarded-Proto':'http'})).data,{ok:true,demo:true});
  assert.equal((await app.request('/')).status,200);
  assert.equal((await app.request('/',null,{Host:'attacker.test'})).status,403);
  assert.equal((await app.request('/',null,{'X-Forwarded-Proto':'http'})).status,403);
  const body={zone:'CG-01',plate:'RAILWAY 01',minutes:60};
  assert.equal((await app.request('/api/quotes',body)).status,201);
  assert.equal((await app.request('/api/quotes',body,{Origin:'https://attacker.test'})).status,403);
  const access=JSON.parse(readFileSync(join(dir,'access.json'),'utf8'));
  const login=await app.request('/api/login',{username:'attendant',password:access.attendant});
  assert.equal(login.status,200);assert.match(login.headers['set-cookie'][0],/; Secure/);
  const cookie=login.headers['set-cookie'][0].split(';')[0];
  assert.equal((await app.request('/api/manager/overview',null,{Cookie:cookie})).status,403);
  assert.equal((await app.request('/api/harness',{attempt:'x',scenario:'confirmed'})).status,404);
  for(const path of ['/.local/access.json','/data/access.json','/parking.sqlite'])assert.equal((await app.request(path)).status,404);
});

test('hosted sessions survive process restart in the configured data directory',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'orya-public-persist-'));let app=await start(dir,true);
  t.after(async()=>{await app.stop();rmSync(dir,{recursive:true,force:true});});
  const quote=await app.request('/api/quotes',{zone:'CG-01',plate:'KEEP 101',minutes:60});
  const session=await app.request('/api/sessions',{quote:quote.data.id,idempotencyKey:randomUUID()});
  assert.equal(session.status,201);await app.stop();app=await start(dir,true);
  const pass=await app.request('/api/pass',null,{Authorization:`Bearer ${session.data.accessToken}`});
  assert.equal(pass.status,200);assert.equal(pass.data.reference,session.data.reference);assert.equal(pass.data.plate,'KEEP 101');
});
