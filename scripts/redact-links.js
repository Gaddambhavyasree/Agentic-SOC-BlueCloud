#!/usr/bin/env node
/**
 * redact-links.js
 *
 * The dashboard panels carry drill-down links that point at the OpenSearch
 * Dashboards (Wazuh app) instance with a hardcoded origin, e.g.
 *   https://192.168.1.210:20443/app/data-explorer/discover#?_a=(discover:...)
 *   https://192.168.1.210:20443/app/mitre-attack
 *
 * That origin is baked into the exported JSON, so:
 *   - the links break on any other instance, and
 *   - the export carries internal addressing.
 *
 * This script rewrites the origin of those links to a configurable base URL.
 *
 * Usage:
 *   node scripts/redact-links.js --osd-base https://<osd-host>:20443 --write
 *   node scripts/redact-links.js --osd-base https://<osd-host>:20443        # dry run
 *
 * After rewriting, rebuild the derived artefacts:
 *   node scripts/build-bundle.js
 *   node scripts/build-provisioning.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASH_DIR = path.join(ROOT, 'dashboards');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const WRITE = argv.includes('--write');
const NEW_BASE = (argOf('--osd-base', process.env.OSD_BASE_URL || '')).replace(/\/+$/, '');

if (!NEW_BASE) {
  console.error('Pass --osd-base <url> or set OSD_BASE_URL.');
  process.exit(1);
}

const OSD_APP_URL = /(https?:\/\/[^\s"'\\/]+)(\/app\/[^\s"'\\]*)/g;

const files = fs.readdirSync(DASH_DIR).filter((f) => f.endsWith('.json')).sort();
let total = 0;

for (const file of files) {
  const abs = path.join(DASH_DIR, file);
  const original = fs.readFileSync(abs, 'utf8');
  const hosts = new Map();
  const out = original.replace(OSD_APP_URL, (m, origin, pathPart) => {
    if (!hosts.has(origin)) hosts.set(origin, 0);
    hosts.set(origin, hosts.get(origin) + 1);
    return `${NEW_BASE}${pathPart}`;
  });
  if (out === original) continue;

  total += [...hosts.values()].reduce((a, b) => a + b, 0);
  const before = [...hosts.keys()].join(', ');
  console.log(`  ${file}`);
  console.log(`      ${before}  ->  ${NEW_BASE}`);
  if (WRITE) fs.writeFileSync(abs, out);
}

console.log(
  `${WRITE ? 'rewritten' : 'would rewrite'} ${total} link(s) across ${files.length} dashboard file(s)` +
    (WRITE ? '' : '   (dry run - add --write to apply)')
);
if (WRITE) {
  console.log('Now rebuild the derived artefacts:');
  console.log('  node scripts/build-bundle.js');
  console.log('  node scripts/build-provisioning.js');
}
