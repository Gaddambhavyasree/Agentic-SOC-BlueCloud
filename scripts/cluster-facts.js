#!/usr/bin/env node
/**
 * cluster-facts.js
 *
 * Captures read-only facts about the OpenSearch/Wazuh data the dashboards sit on,
 * so the audit in this repo is backed by evidence rather than assumption.
 *
 * Writes export/cluster-facts.json.
 *
 * Usage:
 *   $env:GRAFANA_USER='admin'; $env:GRAFANA_PASSWORD='***'
 *   node scripts/cluster-facts.js [--url http://<grafana-host>:3000]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXP_DIR = path.join(ROOT, 'export');
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const URL_BASE = argOf('--url', process.env.GRAFANA_URL || 'http://localhost:3000');
const USER = process.env.GRAFANA_USER;
const PASS = process.env.GRAFANA_PASSWORD;
if (!USER || !PASS) {
  console.error('Set GRAFANA_USER and GRAFANA_PASSWORD.');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const PROXY = `${URL_BASE}/api/datasources/proxy/uid/cftkburm1y9z4f`;

const get = async (p) => {
  const r = await fetch(`${PROXY}${p}`, { headers: { Authorization: AUTH } });
  return r.json();
};
const post = async (p, body) => {
  const r = await fetch(`${PROXY}${p}`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
};

(async () => {
  const root = await get('/');
  const indices = await get('/_cat/indices?h=index,docs.count,health&format=json');
  const now = Date.now();
  const from = now - 24 * 3600 * 1000;

  const group = (prefix) =>
    indices.filter((i) => i.index.startsWith(prefix)).sort((a, b) => a.index.localeCompare(b.index));

  const alerts = group('wazuh-alerts-4.x-');
  const stats = group('wazuh-statistics');
  const states = group('wazuh-states');

  const total24h = await post('/wazuh-alerts-4.x-*/_count', {
    query: { range: { '@timestamp': { gte: from, lt: now } } },
  });

  const mitre = await post('/wazuh-alerts-4.x-*/_search', {
    size: 0,
    query: { range: { '@timestamp': { gte: from, lt: now } } },
    aggs: { techniques: { terms: { field: 'rule.mitre.id', size: 25 } } },
  });

  const ruleGroups = await post('/wazuh-alerts-4.x-*/_search', {
    size: 0,
    query: { range: { '@timestamp': { gte: from, lt: now } } },
    aggs: { groups: { terms: { field: 'rule.groups', size: 30 } } },
  });

  const severity = await post('/wazuh-alerts-4.x-*/_search', {
    size: 0,
    query: { range: { '@timestamp': { gte: from, lt: now } } },
    aggs: { levels: { terms: { field: 'rule.level', size: 20, order: { _key: 'asc' } } } },
  });

  const agents = await post('/wazuh-alerts-4.x-*/_search', {
    size: 0,
    query: { range: { '@timestamp': { gte: now - 7 * 86400000, lt: now } } },
    aggs: { agents: { terms: { field: 'agent.name', size: 20 } } },
  });

  // Counts for the exact rule groups the dashboards filter on. A terms agg of the
  // top 30 would hide low-volume groups such as "sca" or "vulnerability-detector".
  const dashboardGroups = {};
  for (const g of [
    'authentication_failed', 'invalid_login', 'suricata', 'syscheck', 'sca',
    'vulnerability-detector', 'pam', 'crowdsec', 'windows', 'sysmon', 'ossec',
  ]) {
    const c24 = await post('/wazuh-alerts-4.x-*/_count', {
      query: {
        bool: {
          filter: [
            { range: { '@timestamp': { gte: from, lt: now } } },
            { term: { 'rule.groups': g } },
          ],
        },
      },
    });
    const c7 = await post('/wazuh-alerts-4.x-*/_count', {
      query: {
        bool: {
          filter: [
            { range: { '@timestamp': { gte: now - 7 * 86400000, lt: now } } },
            { term: { 'rule.groups': g } },
          ],
        },
      },
    });
    dashboardGroups[g] = { last24h: c24.count, last7d: c7.count };
  }

  const facts = {
    capturedAt: new Date().toISOString(),
    cluster: {
      name: root.cluster_name,
      node: root.name,
      version: root.version && root.version.number,
      lucene: root.version && root.version.lucene_version,
      uuid: root.cluster_uuid,
    },
    indices: {
      total: indices.length,
      alertIndices: alerts.length,
      statisticsIndices: stats.length,
      stateIndices: states.length,
      stateIndexNames: states.map((s) => s.index),
      firstAlertIndex: alerts[0] && alerts[0].index,
      lastAlertIndex: alerts[alerts.length - 1] && alerts[alerts.length - 1].index,
    },
    alerts: {
      totalDocuments: alerts.reduce((n, i) => n + Number(i['docs.count'] || 0), 0),
      documentsLast24h: total24h.count,
      lastSeen: new Date(now).toISOString(),
    },
    severityLast24h: (severity.aggregations?.levels?.buckets || []).map((b) => ({
      level: b.key,
      count: b.doc_count,
    })),
    ruleGroupsLast24h: (ruleGroups.aggregations?.groups?.buckets || []).map((b) => ({
      group: b.key,
      count: b.doc_count,
    })),
    dashboardGroups,
    mitreTechniquesLast24h: (mitre.aggregations?.techniques?.buckets || []).map((b) => ({
      technique: b.key,
      count: b.doc_count,
    })),
    agentsLast7d: (agents.aggregations?.agents?.buckets || []).map((b) => ({
      agent: b.key,
      count: b.doc_count,
    })),
  };

  fs.mkdirSync(EXP_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXP_DIR, 'cluster-facts.json'), JSON.stringify(facts, null, 2));
  console.log(JSON.stringify(facts, null, 2));
})();
