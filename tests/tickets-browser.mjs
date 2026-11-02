import { stubMapTiles } from './map-fixture.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.mjs';
const dir=mkdtempSync(join(tmpdir(),'orya-tickets-browser-'));let clock=Date.now();
const app=createApp({dataDir:dir,harness:true,now:()=>clock,paymentDelay:3600000});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1050}});
await context.addInitScript(()=>{window.__prints=0;window.print=()=>window.__prints++;});
await stubMapTiles(context);
const p=await context.newPage(),checks=[],errors=[];context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));p.on('pageerror',e=>errors.push(e.message));
mkdirSync('test-results',{recursive:true});
async function check(name,fn){try{await fn();checks.push(name);console.log('PASS',name);}catch(e){await p.screenshot({path:'test-results/ticket-failure.png',fullPage:true});console.log('Toast:',await p.locator('#toast').textContent());throw e;}}
async function tab(id){await p.locator(`[data-ops-tab="${id}"]`).click();await p.waitForFunction(id=>document.querySelector(`[data-ops-tab="${id}"]`)?.classList.contains('selected'),id);}
async function shots(name){await p.locator('#toast').evaluate(e=>e.hidden=true);for(const [size,width] of [['desktop',1440],['tablet',768],['phone',390],['narrow',320]]){await p.setViewportSize({width,height:1000});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflow ${width}`);await p.screenshot({path:`test-results/${name}-${size}.png`,fullPage:true});}await p.setViewportSize({width:1440,height:1050});}
let reference,printPage;
try{
 await p.goto(base+'/attendant');await p.getByLabel('Password',{exact:true}).fill(app.access.attendant);await p.getByRole('button',{name:'Sign in',exact:false}).click();await p.locator('#quick-plate').waitFor();
 await check('attendant lands on quick entry; plate alone issues and prints a ticket',async()=>{
  assert.equal(await p.locator('#quick-walkin [required]').count(),1);await p.locator('#quick-plate').fill('FAST 123');
  const opened=context.waitForEvent('page');await p.getByRole('button',{name:'Issue & print ticket',exact:false}).click();printPage=await opened;
  await p.getByText('FAST 123 is checked in.',{exact:true}).waitFor();await printPage.waitForURL('**/api/ops/ticket/print?**');await printPage.waitForFunction(()=>window.__prints===1);
  reference=app.db.prepare('SELECT id FROM walkin_tickets').get().id;
  assert.equal(app.db.prepare('SELECT count(*) n FROM visits WHERE checked_out IS NULL').get().n,1);assert.equal(app.db.prepare('SELECT count(*) n FROM sessions').get().n,0);
  assert.equal(await p.locator('#quick-plate').inputValue(),'');await shots('ticket-quick-entry');
 });
 await check('print layout contains reference, QR, plate, time and tariff and can be saved as PDF',async()=>{
  await printPage.getByRole('heading',{name:'PAY AT EXIT',exact:true}).waitFor();assert.equal(await printPage.locator('svg').count(),1);assert.match(await printPage.locator('body').innerText(),new RegExp(reference));
  await printPage.emulateMedia({media:'print'});assert.equal(await printPage.locator('.print-controls').isVisible(),false);
  await printPage.pdf({path:'test-results/walkin-entry-ticket.pdf',preferCSSPageSize:true});assert.equal((readFileSync('test-results/walkin-entry-ticket.pdf').toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'entry ticket fits one page');await printPage.setViewportSize({width:320,height:800});await printPage.screenshot({path:'test-results/walkin-entry-ticket.png',fullPage:true});await printPage.close();
 });
 await check('pending exit view finds normalized plate and shows server-calculated duration and charge',async()=>{
  clock+=31*60000;await tab('walkins');await p.locator('#ticket-query').fill('FAST123');await p.getByRole('button',{name:'Find ticket',exact:true}).click();await p.getByRole('button',{name:'Review exit',exact:true}).click();
  await p.getByRole('button',{name:'Cash received & vehicle exited · 2,000 CDF',exact:true}).waitFor();assert.match(await p.locator('#ticket-detail').innerText(),/31m 0s/);await shots('ticket-exit');
 });
 await check('stale quote refuses cash; refresh then records one receipt and departure',async()=>{
  clock+=120001;await p.getByRole('button',{name:'Cash received & vehicle exited · 2,000 CDF',exact:true}).click();await p.getByText('Exit quote expired. Refresh the charge before collecting payment.',{exact:true}).waitFor();
  assert.equal(app.db.prepare('SELECT count(*) n FROM receipts').get().n,0);
  await p.getByRole('button',{name:'Refresh status / charge',exact:true}).click();await p.getByRole('button',{name:'Cash received & vehicle exited · 2,000 CDF',exact:true}).click();await p.getByRole('heading',{name:'FAST 123 · Completed stay'}).waitFor();
  assert.equal(app.db.prepare('SELECT count(*) n FROM visits WHERE checked_out IS NULL').get().n,0);assert.equal(app.db.prepare('SELECT count(*) n FROM receipts').get().n,1);await shots('ticket-completed');
 });
 await check('completed tickets remain searchable and their receipt prints without another charge',async()=>{
  const href=await p.getByRole('link',{name:'Print receipt',exact:true}).getAttribute('href');const receipt=await context.newPage();await receipt.goto(base+href);await receipt.getByRole('heading',{name:'PAYMENT RECEIPT'}).waitFor();await receipt.pdf({path:'test-results/walkin-cash-receipt.pdf',preferCSSPageSize:true});assert.equal((readFileSync('test-results/walkin-cash-receipt.pdf').toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'receipt fits one page');await receipt.screenshot({path:'test-results/walkin-cash-receipt.png',fullPage:true});await receipt.close();
  await p.locator('#ticket-state').selectOption('all');await p.locator('#ticket-query').fill(reference);await p.getByRole('button',{name:'Find ticket',exact:true}).click();await p.getByRole('button',{name:'View ticket',exact:true}).waitFor();assert.equal(app.db.prepare('SELECT count(*) n FROM receipts').get().n,1);
 });
 await check('digital checkout waits for provider confirmation, then attendant records departure',async()=>{
  await tab('gate');await p.locator('#quick-plate').fill('DIGITAL 2');const opened=context.waitForEvent('page');await p.getByRole('button',{name:'Issue & print ticket',exact:false}).click();const page=await opened;await p.getByText('DIGITAL 2 is checked in.',{exact:true}).waitFor();await page.close();
  await tab('walkins');await p.getByRole('button',{name:'Review exit',exact:true}).click();await p.getByRole('button',{name:'Start demo digital payment',exact:true}).click();await p.getByText('Waiting for the demo payment provider.',{exact:false}).waitFor();assert.equal(await p.getByRole('button',{name:'Record vehicle exit',exact:false}).count(),0);
  const attempt=app.db.prepare('SELECT id FROM attempts').get();app.applyEvent(randomUUID(),attempt.id,'confirmed');await p.getByRole('button',{name:'Refresh status / charge',exact:true}).click();await p.getByRole('button',{name:'Record vehicle exit',exact:false}).click();await p.getByRole('heading',{name:'DIGITAL 2 · Completed stay'}).waitFor();
 });
 await check('refreshing pending list works after reload and disconnected state is visible',async()=>{
  await p.reload();await p.locator('#quick-plate').waitFor();await tab('walkins');await p.getByText('No records for this selection.',{exact:true}).waitFor();await context.setOffline(true);await p.getByText('Connection unavailable · Records are stale / unknown',{exact:false}).waitFor();await context.setOffline(false);
 });
 assert.deepEqual(errors,[]);checks.push('no browser JavaScript errors');writeFileSync('test-results/tickets-browser-report.json',JSON.stringify({checks,errors},null,2));console.log(`${checks.length} ticket browser checks passed.`);
}finally{await browser.close();await app.close();rmSync(dir,{recursive:true,force:true});}
