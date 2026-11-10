#!/usr/bin/env node
/**
 * validate-panels-grafana-api.js
 *
 * KNOWN DIVERGENCE - kept for reproducibility, NOT the source of truth.
 *
 * This script replays every panel through Grafana's own query API
 * (POST /api/ds/query). Against the current datasource configuration it reports
 * every panel as EMPTY, even though the same panels render correctly in the
 * browser and return real rows from OpenSearch.
 *
 * Why: the datasource uses the legacy bracketed index pattern
 * "[wazuh-alerts-4.x-]YYYY.MM.DD". The plugin's frontend path (browser) expands
 * it into real daily index names; the plugin's backend path (this API) does not
 * resolve it, so the search hits a non-existent index and - because the plugin
 * sets ignore_unavailable - returns HTTP 200 with zero hits and zero frames.
 * During these replays no OpenSearch index's search.query_total counter moves.
 *
 * Use scripts/validate-queries.js instead: it issues the equivalent OpenSearch
 * query through the datasource proxy and reports real row counts.
 *
 * Fixing the datasource (index name "wazuh-alerts-4.x-*", interval "No pattern")
 * makes this script agree with the browser - see finding F1 in
 * docs/WORKSTREAM-AUDIT.md.
 *
 * Usage:
 *   $env:GRAFANA_USER='admin'; $env:GRAFANA_PASSWORD='***'
 *   node scripts/validate-panels-grafana-api.js [--url http://<grafana-host>:3000]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASH_DIR = path.join(ROOT, 'dashboards');
const EXP_DIR = path.join(ROOT, 'export');
const DOC_DIR = path.join(ROOT, 'docs');

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const URL_BASE = argOf('--url', process.env.GRAFANA_URL || 'http://localhost:3000');
const USER = process.env.GRAFANA_USER;
const PASS = process.env.GRAFANA_PASSWORD;
const RANGE_H = parseInt(argOf('--range', '24'), 10);

if (!USER || !PASS) {
  console.error('Set GRAFANA_USER and GRAFANA_PASSWORD environment variables first.');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const toMs = (v, fallback) => {
  if (typeof v === 'number') return v;
  const s = String(v || '');
  let m = /^now-(\d+)([smhdw])$/.exec(s);
  if (m) {
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[m[2]];
    return Date.now() - parseInt(m[1], 10) * mult;
  }
  if (s === 'now') return Date.now();
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/** Extract a rough row count out of a Grafana data frame. */
function frameRows(frame) {
  if (!frame || !frame.schema) return 0;
  const lenIdx = frame.schema.fields.findIndex((f) => f.type === 'time' || f.name === 'Time');
  if (lenIdx >= 0 && Array.isArray(frame.data[0])) {
    const row = frame.data[0][lenIdx];
    return Array.isArray(row) ? row.length : 0;
  }
  // wide frames: one array per field
  if (frame.data.length && Array.isArray(frame.data[0])) {
    return Math.max(...frame.data.map((c) => (Array.isArray(c) ? c.length : 0)));
  }
  return 0;
}

function frameLabels(frame) {
  if (!frame || !frame.schema) return [];
  const nameIdx = frame.schema.fields.findIndex((f) => f.name === 'Value' || f.name === 'value');
  const labelIdx = frame.schema.fields.findIndex((f) => f.name === 'Metric' || f.name === 'key');
  const out = [];
  if (labelIdx >= 0 && frame.data[labelIdx]) {
    for (const v of frame.data[labelIdx]) out.push(String(v));
  }
  if (!out.length && nameIdx >= 0) out.push('(single value)');
  return out;
}

(async () => {
  const files = fs.readdirSync(DASH_DIR).filter((f) => f.endsWith('.json')).sort();
  const results = [];
  let totalPanels = 0, dataPanels = 0, emptyPanels = 0, errorPanels = 0;

  for (const file of files) {
    const raw = readJson(path.join(DASH_DIR, file));
    const d = raw.dashboard || raw;
    const from = toMs(d.time && d.time.from, Date.now() - RANGE_H * 3600000);
    const to = toMs(d.time && d.time.to, Date.now());

    console.log(`\n=== ${(d.title || '').trim()}  (${d.time ? d.time.from + ' -> ' + d.time.to : 'default'})`);

    for (const panel of d.panels || []) {
      if (!panel.targets || !panel.targets.length) {
        results.push({
          dashboard: (d.title || '').trim(), uid: d.uid, panelId: panel.id,
          panelTitle: panel.title || '(untitled)', type: panel.type,
          status: 'static', detail: 'no query target',
        });
        continue;
      }
      totalPanels++;

      const queries = panel.targets.map((t, i) => ({
        refId: t.refId || String.fromCharCode(65 + i),
        datasource: t.datasource || panel.datasource,
        query: t.query,
        queryType: t.queryType || 'lucene',
        luceneQueryType: t.luceneQueryType || 'Metric',
        metrics: t.metrics || [],
        bucketAggs: t.bucketAggs || [],
        timeField: t.timeField || '@timestamp',
        interval: 'auto',
        bucketSize: 'auto',
        maxDataPoints: 500,
        time: { from, to },
      }));

      let payload;
      try {
        const r = await fetch(`${URL_BASE}/api/ds/query`, {
          method: 'POST',
          headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries }),
        });
        const text = await r.text();
        payload = JSON.parse(text);
      } catch (e) {
        errorPanels++;
        results.push({
          dashboard: (d.title || '').trim(), uid: d.uid, panelId: panel.id,
          panelTitle: panel.title || '(untitled)', type: panel.type,
          status: 'error', detail: String(e),
        });
        continue;
      }

      let rows = 0;
      let labels = [];
      let err = null;
      for (const q of Object.values(payload.results || {})) {
        if (q.error) { err = q.error; break; }
        for (const frame of q.frames || []) {
          rows += frameRows(frame);
          labels = labels.concat(frameLabels(frame));
        }
      }

      if (err) {
        errorPanels++;
        console.log(`  [ERROR] ${panel.id} ${panel.title} :: ${err}`);
        results.push({
          dashboard: (d.title || '').trim(), uid: d.uid, panelId: panel.id,
          panelTitle: panel.title || '(untitled)', type: panel.type,
          status: 'error', detail: err,
        });
      } else if (rows === 0) {
        emptyPanels++;
        console.log(`  [EMPTY] ${panel.id} ${panel.title}  (query: ${panel.targets.map((t) => t.query).join(' | ')})`);
        results.push({
          dashboard: (d.title || '').trim(), uid: d.uid, panelId: panel.id,
          panelTitle: panel.title || '(untitled)', type: panel.type,
          status: 'empty', rows: 0, detail: `no rows for query "${panel.targets.map((t) => t.query).join(' | ')}"`,
        });
      } else {
        dataPanels++;
        const sample = labels.slice(0, 8).join(', ');
        console.log(`  [DATA ] ${panel.id} ${panel.title}  rows=${rows}${sample ? '  {' + sample + '}' : ''}`);
        results.push({
          dashboard: (d.title || '').trim(), uid: d.uid, panelId: panel.id,
          panelTitle: panel.title || '(untitled)', type: panel.type,
          status: 'data', rows, sample: sample.slice(0, 300),
          detail: `query "${panel.targets.map((t) => t.query).join(' | ')}"`,
        });
      }
    }
  }

  const summary = { totalPanels, dataPanels, emptyPanels, errorPanels };
  const out = {
    validatedAt: new Date().toISOString(),
    source: URL_BASE,
    range: 'dashboard default time range per dashboard',
    summary,
    results,
  };
  fs.mkdirSync(EXP_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXP_DIR, 'panel-validation-grafana-api.json'), JSON.stringify(out, null, 2));

  /* markdown */
  const md = [];
  md.push('# Panel Data Validation');
  md.push('');
  md.push(`- **Source:** ${URL_BASE}`);
  md.push(`- **Validated:** ${out.validatedAt}`);
  md.push(`- **Method:** each panel target replayed through Grafana's own query engine (\`POST /api/ds/query\`) using the dashboard's default time range`);
  md.push(`- **Read-only:** search queries only, nothing written to Grafana or OpenSearch`);
  md.push('');
  md.push(`**Result:** ${dataPanels} panels returned data, ${emptyPanels} returned no rows, ${errorPanels} errored, out of ${totalPanels} query panels.`);
  md.push('');
  md.push('| Dashboard | Panel | Query | Rows | Status |');
  md.push('|---|---|---|---|---|');
  for (const r of results) {
    if (r.status === 'static') continue;
    const mark = { data: 'Ã¢Å“â€¦ data', empty: 'Ã¢Å¡Â Ã¯Â¸Â empty', error: 'Ã°Å¸â€Â´ error' }[r.status];
    const q = r.detail && r.detail.startsWith('query') ? r.detail.replace(/^query "/, '').replace(/"$/, '') : '';
    md.push(`| ${r.dashboard} | ${r.panelTitle} (#${r.panelId}) | \`${q.replace(/\|/g, '\\|')}\` | ${r.rows ?? 'Ã¢â‚¬â€'} | ${mark} |`);
  }
  md.push('');
  const empties = results.filter((r) => r.status === 'empty');
  if (empties.length) {
    md.push('## Empty panels');
    md.push('');
    md.push('These render with no data over the default window. Either the window is too narrow, the rule/field has not fired yet, or the field is not decoded upstream.');
    md.push('');
    for (const e of empties) md.push(`- **${e.dashboard} Ã¢â€ â€™ ${e.panelTitle}** (panel ${e.panelId}) Ã¢â‚¬â€ \`${e.detail}\``);
    md.push('');
  }
  const errs = results.filter((r) => r.status === 'error');
  if (errs.length) {
    md.push('## Errored panels');
    md.push('');
    for (const e of errs) md.push(`- **${e.dashboard} Ã¢â€ â€™ ${e.panelTitle}** (panel ${e.panelId}) Ã¢â‚¬â€ \`${e.detail}\``);
    md.push('');
  }
  fs.mkdirSync(DOC_DIR, { recursive: true });
  fs.writeFileSync(path.join(DOC_DIR, 'PANEL-VALIDATION-GRAFANA-API.md'), md.join('\n'));

  console.log(`\nsummary: ${JSON.stringify(summary)}`);
  console.log('wrote export/panel-validation-grafana-api.json and docs/PANEL-VALIDATION-GRAFANA-API.md');
  console.log('REMINDER: see scripts/validate-queries.js for the authoritative validation.');
})();
