#!/usr/bin/env node
/**
 * audit-dashboards.js
 *
 * Offline audit of the exported Grafana dashboards.
 * Reads  dashboards/*.json  +  export/inventory.json
 * Writes export/audit-report.json  and  docs/AUDIT-REPORT.md
 *
 * Pure read-only analysis of files on disk. Never talks to Grafana.
 *
 * Usage:  node scripts/audit-dashboards.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASH_DIR = path.join(ROOT, 'dashboards');
const EXP_DIR = path.join(ROOT, 'export');
const DOC_DIR = path.join(ROOT, 'docs');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const inventory = readJson(path.join(EXP_DIR, 'inventory.json'));
const dsByUid = new Map(inventory.datasources.map((d) => [d.uid, d]));

const files = fs
  .readdirSync(DASH_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const findings = [];
const add = (level, scope, title, detail, fix) =>
  findings.push({ level, scope, title, detail, fix });

const dashboards = files.map((file) => {
  const raw = readJson(path.join(DASH_DIR, file));
  const d = raw.dashboard || raw;
  const meta = raw.meta || {};

  const panels = (d.panels || []).map((p) => {
    const targets = (p.targets || []).map((t) => ({
      refId: t.refId,
      queryType: t.queryType || 'lucene',
      query: t.query,
      metrics: (t.metrics || []).map((m) => ({
        id: m.id,
        type: m.type,
        field: m.field,
        settings: m.settings,
      })),
      bucketAggs: (t.bucketAggs || []).map((b) => ({
        id: b.id,
        type: b.type,
        field: b.field,
        settings: b.settings,
      })),
      timeField: t.timeField,
      bucketSize: t.bucketSize,
      interval: t.interval,
    }));

    const fields = new Set();
    for (const t of targets) {
      for (const m of t.metrics) if (m.field) fields.add(m.field);
      for (const b of t.bucketAggs) if (b.field) fields.add(b.field);
    }

    // absolute data links (drill-downs) and per-value colour overrides
    const linkUrls = [];
    const overrides = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.links && Array.isArray(node.links)) {
        for (const l of node.links) if (l && typeof l.url === 'string' && /^https?:/i.test(l.url)) {
          linkUrls.push({ title: l.title || '', url: l.url });
        }
      }
      if (node.overrides && Array.isArray(node.overrides)) {
        for (const o of node.overrides) {
          if (o && o.matcher && o.matcher.options) overrides.push(String(o.matcher.options));
        }
      }
      Object.values(node).forEach(walk);
    };
    walk(p.fieldConfig);
    // field names embedded in the lucene query string
    const qFields = new Set();
    for (const t of targets) {
      const q = t.query || '';
      const re = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*:/g;
      let mm;
      while ((mm = re.exec(q))) qFields.add(mm[1]);
    }

    return {
      id: p.id,
      title: p.title || '(untitled)',
      type: p.type,
      gridPos: p.gridPos,
      datasource: p.datasource
        ? { uid: p.datasource.uid || null, type: p.datasource.type || null }
        : null,
      targets,
      fields: [...fields],
      queryFields: [...qFields],
      hasStaticContent:
        p.type === 'text' || p.type === 'markdown' || p.type === 'news' ? true : false,
      linkUrls,
      overrides,
    };
  });

  const dsUids = [...new Set(panels.map((p) => p.datasource && p.datasource.uid).filter(Boolean))];
  const allFields = [...new Set(panels.flatMap((p) => p.fields))].sort();
  const allQueryFields = [...new Set(panels.flatMap((p) => p.queryFields))].sort();

  return {
    file: path.relative(ROOT, path.join(DASH_DIR, file)).replace(/\\/g, '/'),
    uid: d.uid,
    id: d.id,
    title: (d.title || '').trim(),
    metaVersion: meta.version,
    metaUpdated: meta.updated,
    tags: d.tags || [],
    time: d.time || null,
    refresh: d.refresh || null,
    templating: (d.templating && d.templating.list) || [],
    links: (d.links || []).map((l) => ({ title: l.title, url: l.url, type: l.type })),
    annotations: ((d.annotations && d.annotations.list) || []).map((a) => a.name),
    panelCount: panels.length,
    queryPanelCount: panels.filter((p) => p.targets.length > 0).length,
    staticPanelCount: panels.filter((p) => p.hasStaticContent).length,
    datasources: dsUids.map((u) => ({
      uid: u,
      name: dsByUid.get(u) ? dsByUid.get(u).name : null,
      indexPattern: dsByUid.get(u) ? dsByUid.get(u).indexPattern : null,
    })),
    panels,
    fields: allFields,
    queryFields: allQueryFields,
  };
});

/* ------------------------------------------------------------------ *
 * Cross-dashboard checks
 * ------------------------------------------------------------------ */

const dsUsage = new Map();
for (const db of dashboards) {
  for (const ds of db.datasources) {
    if (!dsUsage.has(ds.uid)) dsUsage.set(ds.uid, { uid: ds.uid, name: ds.name, dashboards: [] });
    dsUsage.get(ds.uid).dashboards.push(db.title);
  }
}

const usedUids = new Set(dsUsage.keys());
const unusedDs = inventory.datasources.filter((d) => !usedUids.has(d.uid));

for (const d of unusedDs) {
  add(
    'info',
    'datasources',
    `Unused datasource "${d.name}"`,
    `uid=${d.uid} type=${d.type} url=${d.url}. No dashboard panel references it.`,
    'Delete it on the Grafana server, or keep it and note it in the runbook so reviewers know it is not a dependency.'
  );
}

// Duplicate datasources pointing at the same backend
const byBackend = new Map();
for (const d of inventory.datasources) {
  if (d.type !== 'grafana-opensearch-datasource') continue;
  const key = `${d.url}|${d.indexPattern || ''}`;
  if (!byBackend.has(key)) byBackend.set(key, []);
  byBackend.get(key).push(d);
}
for (const [key, group] of byBackend) {
  if (group.length > 1) {
    add(
      'warn',
      'datasources',
      `Duplicate datasources for ${key}`,
      `${group.map((g) => `${g.name} (${g.uid})`).join(', ')} all point at the same OpenSearch cluster and index pattern.`,
      'Consolidate to one datasource, or keep one canonical id per index pattern and re-point every panel at it so imports are deterministic.'
    );
  }
}

for (const db of dashboards) {
  /* -- datasource resolution -- */
  for (const ds of db.datasources) {
    if (!ds.name) {
      add('error', db.title, `Datasource ${ds.uid} not found on server`,
        'Dashboard references a datasource uid that does not exist in the inventory.',
        'Re-import will fail to render this panel until the datasource is recreated with the same uid.');
    }
  }

  /* -- empty / static-only dashboards -- */
  if (db.queryPanelCount === 0) {
    add('error', db.title, 'Dashboard has no query panels',
      'Every panel is static text/markdown.',
      'Rebuild at least one data-backed panel.');
  }

  /* -- time range -- */
  if (!db.time || !db.time.from || db.time.from === '' ) {
    add('warn', db.title, 'No default time range set',
      'A dashboard without a default time window opens on "Last 6 hours" in some Grafana versions and can look empty.',
      'Set time.from/time.to explicitly (the other dashboards use now-24h -> now).');
  } else if (!/now-/.test(String(db.time.from))) {
    add('warn', db.title, `Absolute default time range (${db.time.from})`,
      'An absolute window will show stale/empty data for anyone opening it later.',
      'Use a relative window (now-24h -> now) as the default.');
  }

  /* -- refresh -- */
  if (!db.refresh) {
    add('info', db.title, 'No auto-refresh interval',
      'refresh is empty; panels only update on manual reload.',
      'Set refresh to e.g. "1m" for SOC dashboards so analysts do not stare at stale numbers.');
  }

  /* -- tags -- */
  if (!db.tags || db.tags.length === 0) {
    add('info', db.title, 'No tags',
      'Untagged dashboards are harder to find via /api/search and harder to group in the UI.',
      'Tag with e.g. ["wazuh","soc","<domain>"] consistently across the set.');
  }

  /* -- folder -- */
  const inGeneral = !inventory.dashboards.find((d) => d.uid === db.uid)?.folderUid;
  if (inGeneral) {
    add('info', db.title, 'Dashboard lives in the General folder',
      'All six dashboards sit at the org root rather than a dedicated folder.',
      'Group them in a folder (e.g. "SOC Detection Lab") so they can be exported/imported as one unit.');
  }

  /* -- panels with a datasource but no target -- */
  for (const p of db.panels) {
    if (!p.hasStaticContent && p.targets.length === 0 && p.type !== 'row') {
      add('warn', db.title, `Panel "${p.title}" has no query`,
        `type=${p.type} id=${p.id}. It will render empty.`,
        'Add a target or convert the panel to text/markdown.');
    }
  }

  /* -- hardcoded drill-down links -- */
  const links = db.panels.flatMap((p) => p.linkUrls || []);
  if (links.length) {
    const hosts = [...new Set(links.map((l) => new URL(l.url).host))];
    add('warn', db.title, `${links.length} drill-down links point at a hardcoded host`,
      `All panel links resolve to ${hosts.join(', ')} - an absolute URL baked into the panel definition, not to the Grafana instance that renders them. The links break on any other instance, and they are the reason the exported dashboard JSON carries internal addressing.`,
      'Either point the links at Grafana Explore (relative URL) or re-point them at the OpenSearch Dashboards base URL from configuration (see scripts/redact-links.js).');
  }

  /* -- hardcoded per-value colour overrides -- */
  const overrides = [...new Set(db.panels.flatMap((p) => p.overrides || []))];
  if (overrides.length) {
    add('info', db.title, `${overrides.length} hardcoded per-value colour overrides`,
      `Panels colour values by hardcoded name (${overrides.slice(0, 6).join(', ')}${overrides.length > 6 ? ', ...' : ''}). If a host is renamed or absent the override silently does nothing, and the exported JSON embeds estate hostnames.`,
      'Use a value mapping or a regex-based override instead of hardcoded names.');
  }

  /* -- MITRE coverage (DoD requirement) -- */
  const mitreFields = [...new Set([...db.fields, ...db.queryFields])].filter((f) => /mitre/i.test(f));
  if (/threat|detection|soc/i.test(db.title) && mitreFields.length === 0) {
    add('warn', db.title, 'No MITRE field referenced',
      'DoD requires the MITRE view to be populated from real alerts, but no panel queries a rule.mitre.* field.',
      'Add a terms aggregation on rule.mitre.id / rule.mitre.technique / rule.mitre.tactic.');
  }
  if (mitreFields.length) {
    const scoped = db.panels
      .filter((p) => p.queryFields.some((f) => /mitre/i.test(f)))
      .map((p) => `${p.title}: ${p.targets.map((t) => t.query).join(' | ')}`);
    add('pass', db.title, `MITRE fields referenced: ${mitreFields.join(', ')}`,
      'MITRE ATT&CK context is queried directly from the alert index.', '');
    add('info', db.title, 'MITRE view scope',
      `MITRE panels are restricted to: ${scoped.join('; ')}. Rules outside that filter are not represented in the heat map.`,
      'Widen the query (drop the rule.groups filter) if the heat map is meant to cover every alert, or state the scope in the panel title.');
  }

  /* -- external assets -- */
  for (const p of db.panels) {
    if (p.type !== 'text' && p.type !== 'markdown') continue;
    const raw = JSON.stringify(p);
    const img = [...raw.matchAll(/src=\\?"([^"\\]+)\\?"/g)].map((m) => m[1]);
    for (const src of img) {
      if (src.startsWith('/public/')) {
        add('warn', db.title, `Panel ${p.id} embeds server-local asset ${src}`,
          'The image lives in the Grafana server public/ folder. It will render as a broken image on any other Grafana instance.',
          'Ship the image in this repo (assets/) and document the copy step, or inline it as a base64 data URI.');
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Environment-level checks (datasource config + live cluster facts)
 * ------------------------------------------------------------------ */

const factsPath = path.join(EXP_DIR, 'cluster-facts.json');
if (fs.existsSync(factsPath)) {
  const facts = readJson(factsPath);

  // 1. datasource version vs real cluster version
  for (const d of inventory.datasources) {
    if (d.type !== 'grafana-opensearch-datasource') continue;
    if (d.version && facts.cluster.version && d.version !== facts.cluster.version) {
      add('warn', 'datasources',
        `Datasource "${d.name}" declares version ${d.version}, cluster is ${facts.cluster.version}`,
        `The datasource jsonData.version drives how the plugin builds date_histogram intervals and index patterns. Declaring ${d.version} against a ${facts.cluster.version} cluster can silently produce empty or malformed aggregations.`,
        `Set the datasource version to ${facts.cluster.version}, or use a plain wildcard index name so no version-dependent interpolation is needed.`);
    }
  }

  // 2. index pattern style
  for (const d of inventory.datasources) {
    if (d.type !== 'grafana-opensearch-datasource') continue;
    if (d.indexPattern && /\[[^\]]*\]YYYY/.test(d.indexPattern)) {
      add('warn', 'datasources',
        `Datasource "${d.name}" uses the bracketed legacy index pattern`,
        `Index name "${d.indexPattern}" is the ES 1.x/2.x style template. The plugin's frontend path expands it correctly, but the backend path (POST /api/ds/query) does not resolve it the same way - every panel replayed through the Grafana API returns zero frames.`,
        'Use the plain wildcard form "wazuh-alerts-4.x-*" with interval "No pattern". It resolves identically in both paths and removes the ambiguity.');
    }
    if (d.pplEnabled) {
      add('info', 'datasources',
        `Datasource "${d.name}" has PPL enabled`,
        'The panels in this set are authored with Lucene query syntax (queryType: lucene). PPL is available but unused; the PPL endpoint on this cluster does not accept hyphenated index names unquoted, so switching a panel to PPL needs care.',
        'Leave PPL off for this dashboard set, or document the PPL syntax separately.');
    }
  }

  // 3. severity coverage - do the critical gauges have anything to show?
  const levels = facts.severityLast24h || [];
  const maxLevel = levels.length ? Math.max(...levels.map((l) => Number(l.level))) : null;
  if (maxLevel !== null && maxLevel < 15) {
    add('warn', 'severity coverage',
      'No level 15+ alerts in the last 24h',
      `Highest rule.level observed in the last 24h is ${maxLevel} (${levels.map((l) => l.level + ':' + l.count).join(', ')}). The "Critical Alerts" gauge (rule.level >= 15) and the critical band of the severity panels therefore always read zero in this window.`,
      'Either widen the default time range of the severity panels, lower the critical threshold to match the data the lab actually produces, or label the gauge explicitly as "no critical alerts in window" so an analyst does not read it as a broken panel.');
  }

  // 4. rule groups that back each dashboard
  const groups = facts.dashboardGroups || {};
  for (const [group, dash] of [['authentication_failed', 'Brute Force'], ['invalid_login', 'Brute Force'], ['suricata', 'Threat Detection'], ['syscheck', 'File Integrity'], ['sca', 'Configuration Assessment'], ['vulnerability-detector', 'Vulnerabilities']]) {
    const hit = groups[group];
    if (!hit) continue;
    if (!hit.last24h) {
      add('info', 'coverage',
        `No "${group}" alerts in the last 24h (${hit.last7d} in the last 7 days)`,
        `The "${dash}" dashboards filter on rule.groups:${group}. The window on this dashboard is now-24h, so those panels will read empty even though the feed is alive.`,
        'Expected if the producer is idle in that window; otherwise widen the dashboard default range (e.g. now-7d) for the low-volume rule groups.');
    }
  }
}

/* ------------------------------------------------------------------ *
 * Report output
 * ------------------------------------------------------------------ */

const order = { error: 0, warn: 1, info: 2, pass: 3 };
findings.sort((a, b) => order[a.level] - order[b.level]);

const report = {
  generatedAt: new Date().toISOString(),
  source: inventory.exportedFrom,
  grafanaVersion: inventory.grafanaVersion,
  summary: {
    dashboards: dashboards.length,
    panels: dashboards.reduce((n, d) => n + d.panelCount, 0),
    queryPanels: dashboards.reduce((n, d) => n + d.queryPanelCount, 0),
    datasourcesReferenced: usedUids.size,
    datasourcesOnServer: inventory.datasources.length,
    errors: findings.filter((f) => f.level === 'error').length,
    warnings: findings.filter((f) => f.level === 'warn').length,
    info: findings.filter((f) => f.level === 'info').length,
    passes: findings.filter((f) => f.level === 'pass').length,
  },
  dashboards,
  datasourceUsage: [...dsUsage.values()],
  findings,
};

fs.mkdirSync(EXP_DIR, { recursive: true });
fs.writeFileSync(path.join(EXP_DIR, 'audit-report.json'), JSON.stringify(report, null, 2));

/* --- markdown --- */
const md = [];
md.push('# Grafana Dashboard Audit Report');
md.push('');
md.push(`- **Source:** ${inventory.exportedFrom} (Grafana ${inventory.grafanaVersion})`);
md.push(`- **Exported:** ${inventory.exportedAt}`);
md.push(`- **Audited:** ${report.generatedAt}`);
md.push(`- **Dashboards:** ${report.summary.dashboards} | **Panels:** ${report.summary.panels} (${report.summary.queryPanels} query-backed)`);
md.push(`- **Findings:** ${report.summary.errors} error / ${report.summary.warnings} warn / ${report.summary.info} info / ${report.summary.passes} pass`);
md.push('');
md.push('## Dashboard summary');
md.push('');
md.push('| Dashboard | UID | Panels | Query panels | Default range | Datasource(s) |');
md.push('|---|---|---|---|---|---|');
for (const d of dashboards) {
  md.push(`| ${d.title} | \`${d.uid}\` | ${d.panelCount} | ${d.queryPanelCount} | ${d.time ? `${d.time.from} → ${d.time.to}` : '—'} | ${d.datasources.map((x) => x.name || x.uid).join(', ')} |`);
}
md.push('');
md.push('## Datasource usage');
md.push('');
md.push('| Datasource | UID | Used by |');
md.push('|---|---|---|');
for (const u of dsUsage.values()) {
  md.push(`| ${u.name || '—'} | \`${u.uid}\` | ${u.dashboards.join(', ')} |`);
}
for (const d of unusedDs) {
  md.push(`| ${d.name} | \`${d.uid}\` | *(unused)* |`);
}
md.push('');
md.push('## Findings');
md.push('');
for (const f of findings) {
  const badge = { error: '🔴 ERROR', warn: '🟠 WARN', info: '🔵 INFO', pass: '🟢 PASS' }[f.level];
  md.push(`### ${badge} — ${f.title}`);
  md.push('');
  md.push(`**Scope:** ${f.scope}`);
  md.push('');
  md.push(f.detail);
  if (f.fix) {
    md.push('');
    md.push(`**Remediation:** ${f.fix}`);
  }
  md.push('');
}
md.push('## Panel inventory');
md.push('');
for (const d of dashboards) {
  md.push(`### ${d.title} (\`${d.uid}\`)`);
  md.push('');
  md.push('| # | Panel | Type | Datasource | Query | Aggregations |');
  md.push('|---|---|---|---|---|---|');
  for (const p of d.panels) {
    const q = p.targets.map((t) => `${t.refId}: \`${t.query}\``).join('<br>') || '—';
    const aggs = p.targets
      .flatMap((t) => t.bucketAggs.map((b) => `${b.type}:${b.field}`))
      .concat(p.targets.flatMap((t) => t.metrics.filter((m) => m.field).map((m) => `metric:${m.field}`)))
      .join('<br>') || '—';
    md.push(`| ${p.id} | ${p.title} | ${p.type} | ${p.datasource?.uid || '—'} | ${q} | ${aggs} |`);
  }
  md.push('');
}

fs.mkdirSync(DOC_DIR, { recursive: true });
fs.writeFileSync(path.join(DOC_DIR, 'AUDIT-REPORT.md'), md.join('\n'));

console.log(
  `audit: ${report.summary.dashboards} dashboards, ${report.summary.panels} panels, ` +
    `${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info`
);
console.log('wrote export/audit-report.json and docs/AUDIT-REPORT.md');
