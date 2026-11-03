import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server.mjs';
import { stubMapTiles } from './map-fixture.mjs';

const dir = mkdtempSync(join(tmpdir(), 'orya-mobile-ux-'));
const app = createApp({ dataDir: dir });
app.seedDemoDay();
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const checks = [], failures = [], errors = [];
const output = 'test-results/mobile-ux';
mkdirSync(output, { recursive: true });

async function check(name, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await stubMapTiles(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await run(page, context);
    checks.push(name);
    console.log('PASS', name);
  } catch (error) {
    failures.push({ name, message: error.message });
    await page.screenshot({ path: `${output}/failure-${failures.length}.png` });
    console.error('FAIL', name, error.message);
  } finally {
    await context.close();
  }
}

async function openBooking(page, site = 'DEMO-02') {
  await page.goto(base + '/mobile/driver');
  await page.locator(`[data-site-detail="${site}"]`).click();
  await page.locator('#buy-site').click();
  await page.locator('#mobile-book').waitFor();
}

async function review(page) {
  const response = page.waitForResponse(r => r.url() === base + '/api/quotes' && r.request().method() === 'POST');
  await page.locator('#mobile-book button[type=submit]').click();
  await page.locator('#edit-book').waitFor();
  return (await response).json();
}

async function editAndCheck(page, plate, minutes) {
  await page.locator('#edit-book').click();
  await page.locator('#mobile-book').waitFor();
  assert.equal(await page.locator('#mobile-plate').inputValue(), plate, 'Edit details must retain the plate or selected vehicle');
  assert.equal(await page.locator('#mobile-duration').inputValue(), String(minutes), 'Edit details must retain the duration');
}

try {
  await check('guest pass edits preserve details, request a fresh quote, and do not leak into a new booking', async page => {
    await openBooking(page);
    await page.locator('#mobile-plate').fill('UX 901');
    await page.locator('#mobile-duration').selectOption('90');
    const first = await review(page);
    assert.equal(first.zone, 'DEMO-02');
    assert.equal(first.total, 2400);
    await editAndCheck(page, 'UX 901', 90);
    await page.screenshot({ path: `${output}/pass-details-preserved.png` });
    await page.locator('#mobile-plate').fill('UX 902');
    await page.locator('#mobile-duration').selectOption('120');
    const second = await review(page);
    assert.notEqual(second.id, first.id, 'Editing must obtain a new server quote');
    assert.equal(second.zone, 'DEMO-02');
    assert.equal(second.plate, 'UX 902');
    assert.equal(second.total, 3200);
    await editAndCheck(page, 'UX 902', 120);
    await openBooking(page, 'CG-01');
    assert.equal(await page.locator('#mobile-plate').inputValue(), '');
    assert.equal(await page.locator('#mobile-duration').inputValue(), '60');
  });

  await check('saved vehicle selection and duration survive editing and French switching', async (page, context) => {
    const signup = await context.request.post(base + '/api/driver/signup', { data: { name: 'UX Driver', email: 'ux@example.test', password: 'local-ux-test-password', plate: 'UX 101', preference: 'digital', paymentMethod: 'mobile_money' } });
    assert.equal(signup.status(), 201);
    const added = await context.request.post(base + '/api/driver/vehicles', { data: { plate: 'UX 202', make: 'Toyota', model: 'RAV4' } });
    assert.equal(added.status(), 201);
    await openBooking(page);
    await page.locator('#mobile-plate').selectOption('UX 202');
    await page.locator('#mobile-duration').selectOption('180');
    await review(page);
    await page.getByRole('button', { name: 'Français', exact: true }).click();
    await editAndCheck(page, 'UX 202', 180);
    assert.equal(await page.getByRole('button', { name: 'Français', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: `${output}/saved-vehicle-french.png` });
    await page.getByRole('button', { name: 'English', exact: true }).click();
    const quote = await review(page);
    assert.equal(quote.plate, 'UX 202');
    assert.equal(quote.minutes, 180);
    await editAndCheck(page, 'UX 202', 180);
  });

  await check('map controls cannot capture bottom-navigation taps at narrow and tablet sizes', async page => {
    for (const [width, height] of [[320, 600], [390, 600], [457, 633], [390, 844], [768, 600]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + '/mobile/driver');
      await page.locator('.mobile-site-card').first().waitFor();
      await page.locator('.leaflet-control-zoom-out').waitFor();
      await page.locator('.leaflet-control-attribution').getByRole('link', { name: 'OpenStreetMap contributors' }).waitFor();
      const overlap = await page.evaluate(() => {
        const zoom = document.querySelector('.leaflet-control-zoom-out');
        const nav = document.querySelector('#mobile-nav');
        const z = zoom.getBoundingClientRect(), n = nav.getBoundingClientRect();
        const target = n.top + n.height / 2;
        window.scrollBy(0, Math.max(0, z.top + z.height / 2 - target));
        const after = zoom.getBoundingClientRect();
        const x = after.left + after.width / 2, y = after.top + after.height / 2;
        return { x, y, overlaps: y >= n.top && y < n.bottom };
      });
      const covered = await page.locator('#mobile-nav button').evaluateAll(buttons => buttons.flatMap(button => {
        const r = button.getBoundingClientRect();
        return [0.2, 0.5, 0.8].flatMap(fx => [0.2, 0.5, 0.8].flatMap(fy => {
          const top = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
          return button.contains(top) ? [] : [button.dataset.mobileTab];
        }));
      }));
      assert.deepEqual(covered, [], `Navigation is covered at ${width}x${height}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 457) {
        assert.ok(overlap.overlaps, 'Exercise the originally reported overlap');
        await page.screenshot({ path: `${output}/map-navigation-clear.png` });
        await page.mouse.click(overlap.x, overlap.y);
      } else {
        await page.locator('[data-mobile-tab="account"]').click();
      }
      await page.locator('#mobile-auth').waitFor();
    }
  });

  await check('staff alerts precede populated vehicle records on mobile while desktop keeps its side column', async (page, context) => {
    const login = await context.request.post(base + '/api/login', { data: { username: 'manager', password: app.access.manager } });
    assert.equal(login.status(), 200);
    await page.goto(base + '/mobile/operations');
    await page.locator('.ops-columns>aside').waitFor();
    assert.ok(await page.locator('.ops-columns>section tbody tr').count() >= 20, 'Use a populated site');
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const order = await page.locator('.ops-columns').evaluate(el => {
        const alerts = el.querySelector('aside'), vehicles = el.querySelector('section');
        return { domFirst: !!(alerts.compareDocumentPosition(vehicles) & Node.DOCUMENT_POSITION_FOLLOWING), alertsBottom: alerts.getBoundingClientRect().bottom, vehiclesTop: vehicles.getBoundingClientRect().top };
      });
      assert.ok(order.domFirst, 'Alerts must also precede vehicles for keyboard and screen-reader users');
      assert.ok(order.alertsBottom <= order.vehiclesTop, `Alerts must be above vehicles at ${width}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 390) {
        await page.locator('.ops-columns').evaluate(el => el.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: `${output}/staff-alerts-first.png` });
      }
    }
    await page.locator('#go-gate').click();
    await page.locator('#quick-plate').waitFor();
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(base + '/management');
    await page.locator('.ops-columns>aside').waitFor();
    const desktop = await page.locator('.ops-columns').evaluate(el => {
      const a = el.querySelector('aside').getBoundingClientRect(), v = el.querySelector('section').getBoundingClientRect();
      return { alertLeft: a.left, vehicleRight: v.right, sameTop: Math.abs(a.top - v.top) < 2 };
    });
    assert.ok(desktop.alertLeft >= desktop.vehicleRight && desktop.sameTop, 'Desktop must keep alerts alongside vehicles');
    await page.screenshot({ path: `${output}/desktop-overview.png` });
  });

  assert.deepEqual(errors, [], 'No browser JavaScript errors');
  writeFileSync(`${output}/report.json`, JSON.stringify({ checks, failures, errors, mapTiles: 'stubbed' }, null, 2));
  console.log(`${checks.length} mobile UX regression checks passed; ${failures.length} failed.`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true });
}
