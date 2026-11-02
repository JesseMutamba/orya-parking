import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { stubMapTiles } from './map-fixture.mjs';
const dir=mkdtempSync(join(tmpdir(),'orya-map-browser-')),app=createApp({dataDir:dir,harness:true});const seeded=app.seedDemoDay();
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1050}});await stubMapTiles(context);
const p=await context.newPage(),errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));mkdirSync('test-results',{recursive:true});
async function check(name,fn){try{await fn();checks.push(name);console.log('PASS',name);}catch(e){await p.screenshot({path:'test-results/map-failure.png',fullPage:true});console.log('Toast:',await p.locator('#toast').textContent());throw e;}}
async function shots(name){for(const [size,width] of [['desktop',1440],['tablet',768],['phone',390],['narrow',320]]){await p.setViewportSize({width,height:1050});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflow ${width}`);if(await p.locator('.parking-explorer').count())assert.equal(await p.evaluate(()=>{const f=document.querySelector('.map-footnote').getBoundingClientRect();return ['.map-sidebar','.map-canvas-wrap'].every(s=>document.querySelector(s).getBoundingClientRect().bottom<=f.top+1);}),true,'map fits above footer');await p.screenshot({path:`test-results/${name}-${size}.png`,fullPage:true});}await p.setViewportSize({width:1440,height:1050});}
async function tab(id){await p.locator(`[data-ops-tab="${id}"]`).click();await p.waitForFunction(id=>document.querySelector(`[data-ops-tab="${id}"]`)?.classList.contains('selected'),id);}
try{
 await check('driver gets eight mapped sites, street-map attribution and availability pins without location permission',async()=>{
  await p.goto(base);await p.locator('.map-site-option').first().waitFor();assert.equal(await p.locator('.map-site-option').count(),8);assert.equal(await p.locator('.parking-marker').count(),8);
  await p.locator('.leaflet-control-attribution').getByRole('link',{name:'OpenStreetMap contributors'}).waitFor();
  assert.equal(await p.locator('.leaflet-control-attribution').getByRole('link',{name:'OpenFreeMap',exact:true}).count(),1);
  assert.equal(await p.locator('.maplibregl-canvas').isVisible(),true);
  assert.equal(await p.locator('.map-network').isVisible(),false);
  const sites=await (await context.request.get(base+'/api/sites')).json();for(const s of sites.sites)assert.equal(await p.locator(`[data-map-site="${s.id}"] .map-spaces b`).textContent(),String(s.available));
  await shots('kinshasa-map');
 });
 await check('search, area and availability filters keep the list and markers aligned',async()=>{
  await p.locator('#map-search').fill('Financial');assert.equal(await p.locator('.map-site-option').count(),1);assert.equal(await p.locator('.parking-marker').count(),1);
  await p.locator('#map-search').fill('');await p.locator('#map-area').selectOption('Gombe');assert.equal(await p.locator('.map-site-option').count(),5);
  await p.locator('#map-available').check();assert.equal(await p.locator('.parking-marker').count(),5);
  await p.locator('#map-search').fill('no such site');await p.getByText('No sites match these filters.',{exact:true}).waitFor();assert.equal(await p.locator('.parking-marker').count(),0);
  await p.locator('#map-search').fill('');await p.locator('#map-area').selectOption('');
 });
 await check('selecting a listed site opens its map details and existing booking flow',async()=>{
  await p.locator('[data-map-site="DEMO-04"]').click();await p.locator('.parking-popup').getByRole('heading',{name:'Orya · Financial District',exact:true}).waitFor();
  const href=await p.locator('.parking-popup').getByRole('link',{name:'Choose this site',exact:false}).getAttribute('href');assert.equal(href,'/?book=1&zone=DEMO-04');
  await p.locator('.parking-popup').getByRole('link',{name:'Choose this site',exact:false}).click();await p.locator('#registration').waitFor();assert.match(await p.locator('#booking').innerText(),/Financial District/);
 });
 await check('manager sees a populated synthetic day with collections, holds, exceptions and all sites',async()=>{
  await p.goto(base+'/management');await p.getByLabel('Password',{exact:true}).fill(app.access.manager);await p.getByRole('button',{name:'Sign in',exact:false}).click();await p.locator('.sample-day-banner').waitFor();assert.equal(await p.locator('#ops-site option').count(),8);assert.ok(await p.getByRole('button',{name:'Record exit',exact:true}).count()>0);
  const overview=await (await context.request.get(base+'/api/ops/overview')).json();assert.ok(overview.site.occupied>0);assert.ok(overview.site.held>0);assert.ok(overview.report.net>0);assert.ok(overview.issues.length>0);
  await shots('synthetic-management');await tab('walkins');await p.locator('#ticket-list .synthetic-label').first().waitFor();await shots('synthetic-walkins');
  await tab('reports');await p.getByText('Synthetic example: 1,000 CDF difference for supervisor review.',{exact:true}).waitFor();await shots('synthetic-collections');
 });
 await check('manager can open a site from the map; attendant only operates their assigned site',async()=>{
  await tab('map');await p.locator('[data-map-site="DEMO-04"]').click();await p.getByRole('button',{name:'Operate this site',exact:false}).click();await p.locator('#quick-plate').waitFor();assert.equal(await p.locator('#ops-site').inputValue(),'DEMO-04');
  await p.getByRole('button',{name:'Sign out',exact:true}).click();await p.goto(base+'/attendant');await p.getByLabel('Password',{exact:true}).fill(app.access.attendant);await p.getByRole('button',{name:'Sign in',exact:false}).click();await p.locator('#quick-plate').waitFor();assert.equal(await p.locator('#ops-site option').count(),1);await shots('synthetic-attendant');
  await tab('map');await p.locator('[data-map-site="DEMO-04"]').click();await p.getByText('Public availability. Staff access is limited to your assigned site.',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Operate this site',exact:false}).count(),0);
 });
 await check('failed basemap requests show a fallback message while site lookup remains usable',async()=>{
  await context.unroute('https://tiles.openfreemap.org/**');await context.route('https://tiles.openfreemap.org/**',r=>r.abort());await p.goto(base);await p.getByText('Street map unavailable.',{exact:false}).waitFor();assert.equal(await p.locator('.map-site-option').count(),8);await p.locator('[data-map-site="CG-01"]').click();await p.locator('.parking-popup').getByRole('heading',{name:'Congo Graphic · Gombe',exact:true}).waitFor();
 });
 await check('devices without WebGL retain site details and can leave the map safely',async()=>{
  const limited=await chromium.launch({headless:true,args:['--disable-webgl'],...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try {
   const c=await limited.newContext();await stubMapTiles(c);const page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/mobile/driver');await page.locator('#mobile-map-error').waitFor();assert.equal(await page.locator('.mobile-site-card').count(),8);
   await page.getByRole('button',{name:'List',exact:true}).click();await page.locator('[data-site-detail="CG-01"]').click();await page.getByRole('dialog').waitFor();
   await page.getByRole('button',{name:'Close site details'}).click();await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'Create account',exact:true}).waitFor();
  } finally { await limited.close(); }
 });
 assert.deepEqual(errors,[]);checks.push('no browser JavaScript errors');writeFileSync('test-results/map-browser-report.json',JSON.stringify({checks,errors,seeded,tileSource:'stubbed; live tiles reviewed separately'},null,2));console.log(`${checks.length} map/sample-day browser checks passed.`);
}finally{await browser.close();await app.close();rmSync(dir,{recursive:true,force:true});}
