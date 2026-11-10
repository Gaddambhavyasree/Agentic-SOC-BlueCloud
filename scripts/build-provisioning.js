#!/usr/bin/env node
/**
 * build-provisioning.js
 *
 * Emits Grafana file-provisioning assets so a fresh Grafana can be rebuilt
 * straight from this repository (no manual JSON upload):
 *
 *   provisioning/datasources/datasources.yaml   the OpenSearch datasource
 *   provisioning/dashboards/provider.yaml        the dashboard provider
 *   provisioning/dashboards/<uid>.json          one dashboard per file
 *
 * Usage: node scripts/build-provisioning.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASH_DIR = path.join(ROOT, 'dashboards');
const EXP_DIR = path.join(ROOT, 'export');
const PROV_DIR = path.join(ROOT, 'provisioning');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const inventory = readJson(path.join(EXP_DIR, 'inventory.json'));
const primaryDs = inventory.datasources.find(
  (d) => d.type === 'grafana-opensearch-datasource' && d.indexPattern
);
if (!primaryDs) {
  console.error('No OpenSearch datasource with an index pattern in export/inventory.json');
  process.exit(1);
}

const dsDir = path.join(PROV_DIR, 'datasources');
const dbDir = path.join(PROV_DIR, 'dashboards');
fs.mkdirSync(dsDir, { recursive: true });
fs.mkdirSync(dbDir, { recursive: true });

/* ---------------------------- datasources ---------------------------- */
const dsYaml = `# Grafana datasource provisioning - Wazuh detection lab
# Drop this folder into <grafana>/conf/provisioning/datasources/ and restart Grafana.
#
# The uid is pinned so the dashboard JSON in dashboards/ keeps working unchanged
# after a rebuild (the dashboards reference this exact uid).
apiVersion: 1
datasources:
  - name: ${primaryDs.name}
    uid: ${primaryDs.uid}
    type: ${primaryDs.type}
    access: proxy
    url: ${primaryDs.url}
    isDefault: ${primaryDs.isDefault ? 'true' : 'false'}
    editable: true
    jsonData:
      database: "${primaryDs.indexPattern}"
      timeField: "${primaryDs.timeField}"
      interval: ${primaryDs.interval}
      flavor: opensearch
      version: "2.0.0"
      maxConcurrentShardRequests: 5
      tlsSkipVerify: true
`;
fs.writeFileSync(path.join(dsDir, 'datasources.yaml'), dsYaml);

/* ---------------------------- dashboards ---------------------------- */
const providerYaml = `# Grafana dashboard provisioning - Wazuh detection lab
# Drop this folder into <grafana>/conf/provisioning/dashboards/ and restart Grafana.
#
# setAllowUiUpdates: true  -> dashboards stay editable in the UI while still
#                             being seeded from this repository on boot.
apiVersion: 1
providers:
  - name: soc-detection-lab
    orgId: 1
    folder: "SOC Detection Lab"
    folderUid: soc-detection-lab
    type: file
    disableDeletion: false
    allowUiUpdates: true
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: false
`;
fs.writeFileSync(path.join(dbDir, 'provider.yaml'), providerYaml);

const files = fs.readdirSync(DASH_DIR).filter((f) => f.endsWith('.json')).sort();
for (const file of files) {
  const raw = readJson(path.join(DASH_DIR, file));
  const d = raw.dashboard || raw;
  const out = {
    apiVersion: 1,
    id: null,
    uid: d.uid,
    title: d.title,
    tags: d.tags || ['wazuh', 'soc', 'detection-lab'],
    timezone: d.timezone || 'browser',
    editable: true,
    graphTooltip: d.graphTooltip ?? 0,
    schemaVersion: d.schemaVersion ?? 39,
    version: 1,
    time: d.time || { from: 'now-24h', to: 'now' },
    refresh: d.refresh || '1m',
    panels: d.panels || [],
    templating: d.templating || { list: [] },
    annotations: d.annotations || { list: [] },
    links: d.links || [],
  };
  fs.writeFileSync(
    path.join(dbDir, `${d.uid}__${(d.title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`),
    JSON.stringify(out, null, 2) + '\n'
  );
}

console.log(
  `provisioning: 1 datasource (${primaryDs.name} / ${primaryDs.uid}), ${files.length} dashboards`
);
console.log('wrote provisioning/datasources/datasources.yaml, provisioning/dashboards/*');
