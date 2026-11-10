#!/usr/bin/env node
/**
 * capture-screenshots.js
 *
 * Screenshots every exported dashboard from the live Grafana instance and stores
 * them in docs/screenshots/, so the repository carries a visual record of the
 * set (useful for the workstream hand-off and for anyone without a Grafana
 * instance to look at).
 *
 * Drives the locally installed Chrome through playwright-core - no browser
 * download required.
 *
 * Usage:
 *   $env:GRAFANA_URL='http://<grafana-host>:3000'
 *   $env:GRAFANA_USER='<grafana-user>'; $env:GRAFANA_PASSWORD='<password>'
 *   node scripts/capture-screenshots.js
 *
 * !! NOTE ON SENSITIVITY
 * A screenshot is rasterised telemetry: host names, source IPs and rule text
 * are baked into the pixels and cannot be sanitised afterwards. This is why the
 * JSON evidence is sanitised but the screenshots are not. Before publishing the
 * repo outside the organisation, either blur/crop the images or drop them.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASH_DIR = path.join(ROOT, 'dashboards');
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots');

const URL_BASE = (process.env.GRAFANA_URL || 'http://localhost:3000').replace(/\/+$/, '');
const USER = process.env.GRAFANA_USER;
const PASS = process.env.GRAFANA_PASSWORD;

if (!USER || !PASS) {
  console.error('Set GRAFANA_USER and GRAFANA_PASSWORD (and GRAFANA_URL).');
  process.exit(1);
}

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));

const PLAYWRIGHT_CANDIDATES = [
  'C:\\Users\\bhavy\\your-digital-studio\\node_modules\\playwright-core',
  path.join(ROOT, 'node_modules', 'playwright-core'),
];

function loadPlaywright() {
  for (const p of PLAYWRIGHT_CANDIDATES) {
    if (fs.existsSync(path.join(p, 'package.json'))) {
      try {
        return require(p);
      } catch (e) {
        /* keep looking */
      }
    }
  }
  return null;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

(async () => {
  const pw = loadPlaywright();
  if (!pw) {
    console.error('playwright-core not found. Install it:  npm i -D playwright-core');
    process.exit(1);
  }
  if (!executablePath) {
    console.error('No local Chrome/Edge found for screenshot capture.');
    process.exit(1);
  }
  console.log(`browser: ${executablePath}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // dashboard list straight from the export (slug comes from Grafana's own url
  // so the file name and the link match the live dashboard address)
  const dashboards = fs
    .readdirSync(DASH_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const raw = readJson(path.join(DASH_DIR, f));
      const d = raw.dashboard || raw;
      const url = (raw.meta && raw.meta.url) || `/d/${d.uid}`;
      const slug = url.split('/').filter(Boolean).pop() || d.uid;
      return { uid: d.uid, title: (d.title || '').trim(), slug };
    });

  const browser = await pw.chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // ---- log in ----
  console.log(`logging in to ${URL_BASE} ...`);
  await page.goto(`${URL_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });

  const userSelectors = ['input[name="user"]', 'input[placeholder*="username" i]', 'input[type="text"]'];
  const passSelectors = ['input[name="password"]', 'input[type="password"]'];

  // the login form is React-rendered - wait for it to appear
  for (const sel of [...userSelectors, ...passSelectors]) {
    await page.waitForSelector(sel, { timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);

  const fillFirst = async (selectors, value) => {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) {
        await el.fill(value);
        return true;
      }
    }
    return false;
  };

  const okUser = await fillFirst(userSelectors, USER);
  const okPass = await fillFirst(passSelectors, PASS);
  if (!okUser || !okPass) {
    console.error('Could not find the login form.');
    await browser.close();
    process.exit(1);
  }
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {}),
  ]);
  console.log(`logged in -> ${page.url()}`);

  // ---- capture each dashboard ----
  const SETTLE_MS = Number(process.env.SETTLE_MS || 8000);
  const PANEL_WAIT_MS = Number(process.env.PANEL_WAIT_MS || 90000);
  const KIOSK = process.env.KIOSK !== '0';

  /** Wait until Grafana has no panel still showing a loading state. */
  const waitForPanels = async () => {
    const deadline = Date.now() + PANEL_WAIT_MS;
    while (Date.now() < deadline) {
      const loading = await page
        .evaluate(() => {
          const sel = '[aria-label="Panel loading bar"], .panel-loading, [data-testid="Panel loading bar"]';
          return document.querySelectorAll(sel).length;
        })
        .catch(() => 0);
      if (!loading) return true;
      await page.waitForTimeout(1000);
    }
    return false;
  };

  /** Scroll through the page so lazily-rendered panels actually draw. */
  const scrollThrough = async () => {
    await page.evaluate(async () => {
      const step = window.innerHeight;
      const height = document.body.scrollHeight;
      for (let y = 0; y < height; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 400));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);
  };

  for (const d of dashboards) {
    const slug = d.slug;
    const url = `${URL_BASE}/d/${d.uid}/${slug}?orgId=1${KIOSK ? '&kiosk' : ''}`;
    console.log(`capturing ${d.title} ...`);
    const file = path.join(OUT_DIR, `${d.uid}__${slug}.png`);
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
        await waitForPanels();
        await scrollThrough();
        await waitForPanels();
        await page.waitForTimeout(SETTLE_MS);
        await page.screenshot({ path: file, fullPage: true });
        const kb = Math.round(fs.statSync(file).size / 1024);
        console.log(`  -> docs/screenshots/${d.uid}__${slug}.png  (${kb} KB)`);
        done = true;
      } catch (e) {
        console.error(`  attempt ${attempt} failed for ${d.title}: ${e.message.split('\n')[0]}`);
        await page.waitForTimeout(3000);
      }
    }
  }

  await browser.close();
  console.log(`done. ${fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png')).length} screenshots in docs/screenshots/`);
})();
