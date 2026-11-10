#!/usr/bin/env node
/**
 * sanitize.js
 *
 * Strips telemetry noise (real hostnames, internal source IPs, Windows SIDs,
 * cluster UUID) out of the generated evidence files, so the committed artefacts
 * stay useful as *evidence* without carrying an inventory of the lab estate.
 *
 * Credentials are never touched here - they are never written to disk by any
 * script in this repo (see .env.example).
 *
 * The unsanitised originals are copied to export/raw/ which is git-ignored, so
 * you keep the raw evidence locally without publishing it.
 *
 * Usage:
 *   node scripts/sanitize.js            # sanitize export/*.json + docs/*.md
 *   node scripts/sanitize.js --check    # report what would be removed, change nothing
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXP_DIR = path.join(ROOT, 'export');
const RAW_DIR = path.join(EXP_DIR, 'raw');
const DOC_DIR = path.join(ROOT, 'docs');

const CHECK = process.argv.includes('--check');

const TARGETS = [
  'export/cluster-facts.json',
  'export/panel-validation.json',
  'export/panel-validation-grafana-api.json',
  'export/audit-report.json',
  'export/inventory.json',
  'docs/PANEL-VALIDATION.md',
  'docs/PANEL-VALIDATION-GRAFANA-API.md',
  'docs/AUDIT-REPORT.md',
  'docs/DASHBOARD-CATALOG.md',
  'docs/WORKSTREAM-AUDIT.md',
  'README.md',
];
// NOTE: export/grafana-soc-dashboards.bundle.json and dashboards/*.json are
// deliberately NOT sanitised - they are import artefacts and must stay byte-
// faithful to the live dashboards, otherwise the cosmetic per-host colour
// overrides and the drill-down links would change on import.

/* ---------- build the redaction rules from the evidence itself ---------- */
/**
 * Prefer the unsanitised copy in export/raw/ when one exists - otherwise a
 * second sanitize run would see already-redacted input and lose the very
 * tokens it needs to redact (the host names are discovered FROM the evidence).
 */
function readRawFirst(rel) {
  const rawName = path.basename(rel).replace(/(\.[^.]+)$/, '.raw$1');
  const rawPath = path.join(RAW_DIR, rawName);
  if (fs.existsSync(rawPath)) return fs.readFileSync(rawPath, 'utf8').replace(/^\uFEFF/, '');
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
}

const factsPath = path.join(EXP_DIR, 'cluster-facts.json');
const agentNames = new Set();
let clusterUuid = null;
{
  const raw = readRawFirst('export/cluster-facts.json');
  if (raw) {
    const facts = JSON.parse(raw);
    for (const a of facts.agentsLast7d || []) agentNames.add(a.agent);
    for (const s of facts.stateIndexNames || []) {
      const m = /-([a-z0-9]+)$/i.exec(s);
      if (m) agentNames.add(m[1]);
    }
    if (facts.cluster && facts.cluster.uuid) clusterUuid = facts.cluster.uuid;
  }
}

// Names hardcoded in the dashboard panels (the per-host colour overrides) are
// estate hostnames too - pick them up from the audit report so they are covered
// even when they never appear as an agent.name in the sampled window.
const auditPath = path.join(EXP_DIR, 'audit-report.json');
const GENERIC_VALUES = new Set([
  'passed', 'failed', 'not applicable', 'critical', 'high', 'medium', 'low',
  'information', 'warning', 'error', 'total', 'true', 'false',
  'i386', 'i686', 'x86_64', 'amd64', 'arm64', 'count', 'count_value',
  'sum', 'avg', 'max', 'min', 'null', 'none', 'n/a',
]);
if (readRawFirst('export/audit-report.json')) {
  const audit = JSON.parse(readRawFirst('export/audit-report.json'));
  // technical tokens (field names, metric types) are not hostnames
  const technical = new Set();
  for (const d of audit.dashboards || []) {
    for (const p of d.panels || []) {
      for (const f of p.fields || []) technical.add(String(f).toLowerCase());
      for (const f of p.queryFields || []) technical.add(String(f).toLowerCase());
      for (const t of p.targets || []) {
        for (const m of t.metrics || []) technical.add(String(m.type).toLowerCase());
      }
    }
  }
  for (const d of audit.dashboards || []) {
    for (const p of d.panels || []) {
      for (const o of p.overrides || []) {
        const v = String(o).trim();
        if (!v || v.length < 4) continue;
        if (GENERIC_VALUES.has(v.toLowerCase())) continue;
        if (technical.has(v.toLowerCase())) continue;
        if (v.includes('.')) continue; // field path, not a hostname
        agentNames.add(v);
      }
    }
  }
}

const rules = [];
const addRule = (name, re, replace) => rules.push({ name, re, replace });

// Infrastructure addresses that are allowed to stay: the Grafana instance and
// the OpenSearch Dashboards instance. They are internal addressing for this lab
// and are useful context in a private repo - unlike the telemetry below them.
const keepAddresses = new Set(['127.0.0.1', '0.0.0.0', 'localhost']);
for (const u of [process.env.GRAFANA_URL, process.env.OSD_BASE_URL]) {
  if (!u) continue;
  const m = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(u);
  if (m) keepAddresses.add(m[1]);
}

// 1. IPv4 addresses (telemetry only) -> placeholder
addRule('ipv4', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => (keepAddresses.has(m) ? m : '<ip>'));

// 2. Windows SIDs
addRule('windows-sid', /\bS-1-5-21(?:-\d+)+\b/g, () => '<sid>');

// 3. cluster UUID
if (clusterUuid) addRule('cluster-uuid', new RegExp(clusterUuid, 'g'), () => '<cluster-uuid>');

// 4. agent / host names discovered in the data
for (const n of agentNames) {
  if (!n || n.length < 3) continue;
  addRule(`agent:${n}`, new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), () => '<agent>');
}

/* --------------------------------- run --------------------------------- */
function sanitizeText(text) {
  let out = text;
  const applied = [];
  for (const r of rules) {
    let n = 0;
    out = out.replace(r.re, (...a) => {
      const replaced = r.replace(...a);
      // count only actual redactions (a rule may legitimately keep a value)
      if (replaced !== a[0]) n++;
      return replaced;
    });
    if (n) applied.push(`${r.name} (${n})`);
  }
  return { out, applied };
}

let changed = 0;
const summary = [];

for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const original = fs.readFileSync(abs, 'utf8');
  const { out, applied } = sanitizeText(original);
  if (!applied.length) {
    summary.push(`  ${rel.padEnd(42)} clean`);
    continue;
  }
  summary.push(`  ${rel.padEnd(42)} ${applied.join(', ')}`);
  if (!CHECK) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
    const rawName = path.basename(rel).replace(/(\.[^.]+)$/, '.raw$1');
    fs.writeFileSync(path.join(RAW_DIR, rawName), original);
    fs.writeFileSync(abs, out);
  }
  changed++;
}

console.log(CHECK ? 'sanitize --check (nothing written):' : 'sanitize:');
console.log(summary.join('\n'));
console.log(
  changed
    ? `${CHECK ? 'would sanitize' : 'sanitized'} ${changed} file(s); raw copies in export/raw/ (git-ignored)`
    : 'nothing to sanitize'
);
