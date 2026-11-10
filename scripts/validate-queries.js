#!/usr/bin/env node
/**
 * validate-queries.js
 *
 * Executes every panel's query against the live OpenSearch cluster, using the
 * same query semantics Grafana's OpenSearch datasource uses (Lucene query string
 * + time-range filter on the datasource time field + the panel's aggregations).
 *
 * Read-only: only _search / _msearch requests are issued through the Grafana
 * datasource proxy. Nothing is written to Grafana or to OpenSearch.
 *
 * Why not POST /api/ds/query ?
 *   Grafana's own query API returns zero frames for these panels even though the
 *   browser UI renders them correctly - the plugin's backend path resolves the
 *   bracketed index pattern "[wazuh-alerts-4.x-]YYYY.MM.DD" differently to the
 *   frontend path (see docs/AUDIT-REPORT.md, finding "API replay divergence").
 *   This script therefore issues the equivalent OpenSearch query directly, which
 *   is what actually answers "does this panel have data?".
 *
 * Usage:
 *   $env:GRAFANA_USER='admin'; $env:GRAFANA_PASSWORD='***'
 *   node scripts/validate-queries.js [--url http://<grafana-host>:3000]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASH_DIR = path.join(ROOT, 'dashboards');
const EXP_DIR = path.join(ROOT, 'export');
const DOC_DIR = path.join(ROOT, 'docs');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const URL_BASE = argOf('--url', process.env.GRAFANA_URL || 'http://localhost:3000');
const USER = process.env.GRAFANA_USER;
const PASS = process.env.GRAFANA_PASSWORD;
const WINDOW = argOf('--window', ''); // e.g. --window 7d overrides the dashboard default

if (!USER || !PASS) {
  console.error('Set GRAFANA_USER and GRAFANA_PASSWORD environment variables first.');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

/* ---------------------------- time helpers ---------------------------- */
const UNIT = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

function parseRelative(s, fallback) {
  if (typeof s === 'number') return s;
  const str = String(s || '');
  let m = /^now-(\d+)([smhdw])$/.exec(str);
  if (m) return Date.now() - parseInt(m[1], 10) * UNIT[m[2]];
  if (str === 'now') return Date.now();
  const p = Date.parse(str);
  return Number.isNaN(p) ? fallback : p;
}

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

/** Mirror the OpenSearch datasource frontend: expand "[prefix-]YYYY.MM.DD" over the window. */
function resolveIndices(pattern, interval, from, to) {
  if (!interval || interval === 'none') return [pattern];
  const fmt = (d) =>
    pattern
      .replace(/\[(.*?)\]/g, '$1')
      .replace(/YYYY/g, String(d.getUTCFullYear()))
      .replace(/MM/g, pad(d.getUTCMonth() + 1))
      .replace(/DD/g, pad(d.getUTCDate()));
  const start = new Date(Math.floor(from / DAY) * DAY);
  const end = new Date(Math.floor(to / DAY) * DAY);
  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) out.push(fmt(new Date(t)));
  return out;
}

/* --------------------------- query building --------------------------- */
function buildBody(target, from, to, timeField) {
  const aggs = {};
  let metricCount = 0;
  let raw = null;

  (target.bucketAggs || []).forEach((b, i) => {
    const key = `agg_${i}`;
    if (b.type === 'date_histogram') {
      const interval = (b.settings && b.settings.interval) || 'auto';
      aggs[key] = {
        date_histogram: {
          field: b.field,
          fixed_interval: interval === 'auto' ? '30m' : interval,
          min_doc_count: b.settings && b.settings.min_doc_count !== undefined ? Number(b.settings.min_doc_count) : 0,
          extended_bounds: { min: from, max: to },
        },
      };
    } else if (b.type === 'terms') {
      aggs[key] = {
        terms: {
          field: b.field,
          size: b.settings && b.settings.size ? Number(b.settings.size) : 10,
          min_doc_count: b.settings && b.settings.min_doc_count !== undefined ? Number(b.settings.min_doc_count) : 1,
        },
      };
    }
    metricCount++;
  });

  const metrics = target.metrics || [];
  const rawMetric = metrics.find((m) => m.type === 'raw_data' || m.type === 'raw_document');
  if (rawMetric) {
    raw = {
      size: rawMetric.settings && rawMetric.settings.size ? Number(rawMetric.settings.size) : 100,
      sort: [{ '@timestamp': { order: 'desc' } }],
    };
  }

  const query = {
    bool: {
      filter: [
        { query_string: { query: target.query || '*', analyze_wildcard: true } },
        { range: { [timeField]: { gte: from, lt: to, format: 'epoch_millis' } } },
      ],
    },
  };

  const body = { size: 0, query, aggs };
  if (raw) {
    body.size = raw.size;
    body.sort = raw.sort;
    delete body.aggs;
  } else if (!metricCount) {
    body.size = 10;
  }
  // hasAggs must reflect the body that is actually sent
  return { body, hasAggs: Object.keys(body.aggs || {}).length > 0 };
}

/** Count "rows" the way Grafana would: aggregation buckets, or raw hits. */
function countRows(resp, hasAggs) {
  if (!hasAggs) return (resp.hits && resp.hits.hits ? resp.hits.hits.length : 0);
  let total = 0;
  const walk = (aggs) => {
    for (const a of Object.values(aggs || {})) {
      if (a.buckets) total += a.buckets.length;
      if (a.doc_count !== undefined && !a.buckets) total += 1;
      if (a.aggs) walk(a.aggs);
    }
  };
  walk(resp.aggregations);
  return total;
}

function bucketSummary(resp) {
  const out = [];
  const walk = (aggs) => {
    for (const a of Object.values(aggs || {})) {
      if (a.buckets) {
        for (const b of a.buckets.slice(0, 5)) {
          out.push(`${b.key}: ${b.doc_count}`);
        }
      }
      if (a.aggs) walk(a.aggs);
    }
  };
  walk(resp.aggregations);
  return out.join(', ');
}

(async () => {
  const inventory = readJson(path.join(EXP_DIR, 'inventory.json'));
  const dsByUid = new Map(inventory.datasources.map((d) => [d.uid, d]));
  const files = fs.readdirSync(DASH_DIR).filter((f) => f.endsWith('.json')).sort();

  const results = [];
  let data = 0, empty = 0, error = 0;

  for (const file of files) {
    const raw = readJson(path.join(DASH_DIR, file));
    const d = raw.dashboard || raw;
    let from = parseRelative(d.time && d.time.from, Date.now() - DAY);
    let to = parseRelative(d.time && d.time.to, Date.now());
    if (WINDOW) {
      const m = /^(\d+)([smhdw])$/.exec(WINDOW);
      if (m) {
        to = Date.now();
        from = to - parseInt(m[1], 10) * UNIT[m[2]];
      }
    }

    console.log(`\n=== ${(d.title || '').trim()}   [${new Date(from).toISOString()} -> ${new Date(to).toISOString()}]`);

    for (const panel of d.panels || []) {
      if (!panel.targets || !panel.targets.length) {
        results.push({
          dashboard: (d.title || '').trim(), uid: d.uid, panelId: panel.id,
          panelTitle: panel.title || '(untitled)', type: panel.type,
          status: 'static', detail: 'static panel, no query',
        });
        continue;
      }

      for (const target of panel.targets) {
        const dsUid = (target.datasource && target.datasource.uid) || (panel.datasource && panel.datasource.uid);
        const ds = dsByUid.get(dsUid);
        const timeField = target.timeField || (ds && ds.timeField) || '@timestamp';
        const pattern = (ds && ds.indexPattern) || 'wazuh-alerts-4.x-*';
        const interval = (ds && ds.interval) || 'Daily';
        const indices = resolveIndices(pattern, interval, from, to);

        const { body, hasAggs } = buildBody(target, from, to, timeField);
        const url = `${URL_BASE}/api/datasources/proxy/uid/${dsUid}/${indices.join(',')}/_search`;

        let resp, status = 'data', detail = '', rows = 0, sample = '';
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const text = await r.text();
          resp = JSON.parse(text);
          if (resp.error) {
            status = 'error';
            detail = resp.error.reason || resp.error.type || JSON.stringify(resp.error).slice(0, 200);
          } else {
            rows = countRows(resp, hasAggs);
            sample = bucketSummary(resp).slice(0, 240);
            if (rows === 0) status = 'empty';
            detail = `query "${target.query}" on ${indices.length} index(es): ${indices.join(', ')}`;
          }
        } catch (e) {
          status = 'error';
          detail = String(e);
        }

        if (status === 'data') data++;
        else if (status === 'empty') empty++;
        else error++;

        const mark = { data: 'DATA ', empty: 'EMPTY', error: 'ERROR' }[status];
        console.log(`  [${mark}] ${panel.title} :: ${rows} rows${sample ? '  {' + sample + '}' : ''}`);
        if (status === 'error') console.log(`           ${detail}`);

        results.push({
          dashboard: (d.title || '').trim(), uid: d.uid, panelId: panel.id,
          panelTitle: panel.title || '(untitled)', type: panel.type,
          refId: target.refId, query: target.query, status, rows,
          sample, detail, indices, body,
        });
      }
    }
  }

  const out = {
    validatedAt: new Date().toISOString(),
    source: URL_BASE,
    method: 'equivalent OpenSearch DSL executed through the Grafana datasource proxy (read-only _search)',
    window: WINDOW || 'each dashboard default time range',
    summary: { data, empty, error },
    results,
  };
  fs.mkdirSync(EXP_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXP_DIR, 'panel-validation.json'), JSON.stringify(out, null, 2));

  const md = [];
  md.push('# Panel Data Validation (live, read-only)');
  md.push('');
  md.push(`- **Source:** ${URL_BASE}`);
  md.push(`- **Validated:** ${out.validatedAt}`);
  md.push(`- **Method:** ${out.method}`);
  md.push(`- **Window:** ${out.window}`);
  md.push('');
  md.push(`**Result: ${data} panel queries return data, ${empty} return no rows, ${error} error.**`);
  md.push('');
  md.push('| Dashboard | Panel | Query | Rows | Status |');
  md.push('|---|---|---|---|---|');
  for (const r of results) {
    if (r.status === 'static') continue;
    const mark = { data: 'Ã¢Å“â€¦ data', empty: 'Ã¢Å¡Â Ã¯Â¸Â empty', error: 'Ã°Å¸â€Â´ error' }[r.status];
    md.push(`| ${r.dashboard} | ${r.panelTitle} (#${r.panelId}) | \`${String(r.query).replace(/\|/g, '\\|')}\` | ${r.rows ?? 'Ã¢â‚¬â€'} | ${mark} |`);
  }
  md.push('');
  const empties = results.filter((r) => r.status === 'empty');
  if (empties.length) {
    md.push('## Panels with no data in the default window');
    md.push('');
    md.push('These are the ones to look at: either the rule has not fired inside the window, the field is not decoded upstream, or the window is too narrow.');
    md.push('');
    for (const e of empties) md.push(`- **${e.dashboard} Ã¢â€ â€™ ${e.panelTitle}** Ã¢â‚¬â€ \`${e.query}\` (${e.detail})`);
    md.push('');
  }
  const errs = results.filter((r) => r.status === 'error');
  if (errs.length) {
    md.push('## Errored panels');
    md.push('');
    for (const e of errs) md.push(`- **${e.dashboard} Ã¢â€ â€™ ${e.panelTitle}** Ã¢â‚¬â€ \`${e.detail}\``);
    md.push('');
  }
  fs.mkdirSync(DOC_DIR, { recursive: true });
  fs.writeFileSync(path.join(DOC_DIR, 'PANEL-VALIDATION.md'), md.join('\n'));

  console.log(`\nsummary: ${JSON.stringify(out.summary)}`);
  console.log('wrote export/panel-validation.json and docs/PANEL-VALIDATION.md');
})();
