import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.mjs';
import { stubMapTiles } from './map-fixture.mjs';

const dir=mkdtempSync(join(tmpdir(),'orya-pass-code-browser-'));let clock=Date.now();
const app=createApp({dataDir:dir,now:()=>clock,paymentDelay:120000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const dc=await browser.newContext({viewport:{width:390,height:844}}),sc=await browser.newContext({viewport:{width:390,height:844},permissions:['camera']});
await stubMapTiles(dc);await stubMapTiles(sc);
await sc.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async constraints=>{window.testStream=await original(constraints);return window.testStream;};});
const driver=await dc.newPage(),staff=await sc.newPage(),errors=[],checks=[];
for(const p of [driver,staff])p.on('pageerror',e=>errors.push(e.message));
mkdirSync('test-results',{recursive:true});
await driver.clock.install({time:new Date(clock)});
async function post(context,path,data,headers={}){const r=await context.request.post(base+path,{data,headers});assert.ok(r.ok(),`${path}: ${await r.text()}`);return r.json();}
async function createPass(subscription=false){let s;if(subscription)s=await post(dc,'/api/driver/subscriptions',{zone:'CG-01',plate:'QR 101',idempotencyKey:randomUUID()});else{const q=await post(dc,'/api/quotes',{zone:'CG-01',plate:'QR 101',minutes:60});s=await post(dc,'/api/sessions',{quote:q.id,idempotencyKey:randomUUID()});}const pay=await post(dc,'/api/payment',{idempotencyKey:randomUUID()},{Authorization:'Bearer '+s.accessToken});app.applyEvent(randomUUID(),pay.attempt,'confirmed');return s;}
async function decode(page){await page.locator('.entry-code-image').waitFor();await page.addScriptTag({url:base+'/vendor/jsQR.js'});return page.evaluate(async()=>{const img=document.querySelector('.entry-code-image');await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const context=canvas.getContext('2d');context.drawImage(img,0,0);return window.jsQR(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height).data;});}
async function check(name,fn){try{await fn();checks.push(name);console.log('PASS',name);}catch(error){await driver.screenshot({path:'test-results/pass-code-driver-failure.png',fullPage:true});await staff.screenshot({path:'test-results/pass-code-staff-failure.png',fullPage:true});console.log('Staff toast:',await staff.locator('#toast').textContent().catch(()=>''));throw error;}}
async function screenshots(page,name){for(const width of [390,320,768]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflow at ${width}`);await page.screenshot({path:`test-results/${name}-${width}.png`,fullPage:true});}await page.setViewportSize({width:390,height:844});}
try {
 await post(dc,'/api/driver/signup',{name:'QR Demo Driver',email:'qr-demo@example.test',password:'qr-demo-password',plate:'QR 101',make:'Toyota',model:'Corolla',preference:'digital',paymentMethod:'mobile_money'});
 const pass=await createPass();let code;
 await check('driver displays an actual decodable QR and the chosen demo payment method',async()=>{
  await driver.goto(base+'/mobile/driver#pass='+pass.accessToken);await driver.getByRole('button',{name:'Show entry QR',exact:true}).click();code=await decode(driver);assert.match(code,/^ORYA-ENTRY-/);assert.ok(!code.includes(pass.accessToken));await driver.getByText('Mobile money',{exact:true}).waitFor();await screenshots(driver,'digital-entry-qr');
 });
 await check('expired displayed QR refreshes automatically and the previous code is invalid',async()=>{
  clock+=61000;await driver.clock.fastForward(61000);await driver.getByRole('button',{name:'Refresh entry QR',exact:true}).waitFor();const fresh=await decode(driver);assert.notEqual(fresh,code);code=fresh;
 });
 await staff.goto(base+'/mobile/operations');await staff.getByLabel('Username',{exact:true}).fill('attendant');await staff.getByLabel('Password',{exact:true}).fill(app.access.attendant);await staff.getByRole('button',{name:'Sign in',exact:false}).click();await staff.getByRole('heading',{name:'Keep the gate moving.',exact:true}).waitFor();
 await check('attendant verifies QR, checks actual plate and approves exactly one entry',async()=>{
  await staff.getByLabel('Entry QR code',{exact:true}).fill(code);await staff.getByRole('button',{name:'Verify entry QR',exact:true}).click();await staff.getByLabel('Arriving license plate',{exact:true}).waitFor();assert.equal(await staff.getByLabel('Confirm vehicle make',{exact:true}).inputValue(),'Toyota');
  await staff.getByLabel('Arriving license plate',{exact:true}).fill('WRONG 2');await staff.getByRole('button',{name:'Approve admission & check in',exact:false}).click();await staff.getByText('The arriving plate does not match this pass.',{exact:true}).waitFor();
  await staff.getByLabel('Arriving license plate',{exact:true}).fill('QR 101');await screenshots(staff,'entry-qr-review');await staff.getByRole('button',{name:'Approve admission & check in',exact:false}).click();await staff.getByText('Admission approved and vehicle checked in.',{exact:true}).waitFor();assert.equal(app.db.prepare('SELECT count(*) n FROM visits WHERE checked_out IS NULL').get().n,1);
  await staff.getByLabel('Entry QR code',{exact:true}).fill(code);await staff.getByRole('button',{name:'Verify entry QR',exact:true}).click();await staff.getByText('This entry code has already been used.',{exact:true}).waitFor();
 });
 await check('camera scanner starts and stops a synthetic camera stream',async()=>{
  await staff.getByRole('button',{name:'Scan with camera',exact:true}).click();await staff.locator('#pass-camera-panel video').waitFor();await staff.waitForFunction(()=>document.querySelector('#pass-camera-panel video')?.videoWidth>0);await staff.getByRole('button',{name:'Stop camera',exact:true}).click();assert.equal(await staff.locator('#pass-camera-panel').count(),0);assert.equal(await staff.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended')),true);
  await staff.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Browser-specific permission message','NotAllowedError');};});await staff.getByRole('button',{name:'Scan with camera',exact:true}).click();await staff.getByText('Camera permission was not granted. Use a scanner or paste the QR code.',{exact:true}).waitFor();
 });
 await staff.getByRole('button',{name:'Record exit',exact:true}).click();await staff.getByText('Departure recorded; capacity released.',{exact:true}).waitFor();
 await check('subscription QR retains the subscription reference and fresh credentials on another visit',async()=>{
  const subscription=await createPass(true);clock+=2100;await driver.goto(base+'/mobile/driver#pass='+subscription.accessToken);await driver.getByRole('button',{name:'Show entry QR',exact:true}).click();const first=await decode(driver);await screenshots(driver,'subscription-entry-qr');
  await staff.getByLabel('Entry QR code',{exact:true}).fill(first);await staff.getByRole('button',{name:'Verify entry QR',exact:true}).click();await staff.getByLabel('Arriving license plate',{exact:true}).fill('QR 101');await staff.getByRole('button',{name:'Approve admission & check in',exact:false}).click();await staff.getByRole('button',{name:'Record exit',exact:true}).click();await staff.getByText('Departure recorded; capacity released.',{exact:true}).waitFor();
  clock+=61000;await driver.reload();await driver.getByRole('button',{name:'Show entry QR',exact:true}).click();const next=await decode(driver);assert.notEqual(next,first);await driver.getByText(subscription.reference,{exact:true}).waitFor();
  await driver.getByRole('button',{name:'Account',exact:true}).click();await driver.getByLabel('Payment method',{exact:true}).selectOption('card');await driver.getByRole('button',{name:'Save payment method',exact:true}).click();await driver.getByText('Demo payment method saved.',{exact:true}).waitFor();await driver.reload();assert.equal(await driver.getByLabel('Payment method',{exact:true}).inputValue(),'card');
 });
 assert.deepEqual(errors,[]);checks.push('no browser JavaScript errors');writeFileSync('test-results/pass-code-browser-report.json',JSON.stringify({checks,errors,camera:'Synthetic Chromium stream; physical camera and native iOS untested'},null,2));console.log(`${checks.length} entry QR browser checks passed.`);
} finally {await browser.close();await app.close();rmSync(dir,{recursive:true,force:true});}
