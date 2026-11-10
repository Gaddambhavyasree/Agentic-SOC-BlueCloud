# Workstream Audit — Purpose-Built SOC Detection Dashboards

**Audit date:** 2026-11-10
**Auditor:** automated review of the exported Grafana dashboards + live read-only validation against the OpenSearch/Wazuh cluster
**Source instance:** `http://192.168.3.55:3000` — Grafana 13.2.2
**Backing store:** OpenSearch cluster `wazuh-cluster` (node-1), version **7.10.2**, Lucene 9.12.3
**Evidence artefacts:** [`export/audit-report.json`](../export/audit-report.json), [`export/panel-validation.json`](../export/panel-validation.json), [`export/cluster-facts.json`](../export/cluster-facts.json), [`export/inventory.json`](../export/inventory.json)

---

## 1. What was delivered

| Dashboard | UID | Panels | Query panels | Default range | Live rows (validated) |
|---|---|---|---|---|---|
| SOC Overview | `adgszzq` | 11 | 10 | `now-24h → now` | 1078 |
| Threat Detection | `adsf5p4` | 11 | 10 | `now-24h → now` | 394 |
| File Integrity | `ad65mdz` | 11 | 10 | `now-24h → now` | 277 |
| Vulnerabilities | `ad4g2vm` | 11 | 10 | `now-24h → now` | 456 |
| Brute Force & Active Response | `adl6mwj` | 9 | 8 | `now-6h → now` | 115 |
| Configuration Assessment | `adbz577` | 13 | 12 | `now-2d → now` | 1092 |

**Totals:** 6 dashboards · 66 panels · 60 query panels · 63 distinct target queries · 20 distinct OpenSearch fields.

**Live validation:** every one of the 63 panel queries was replayed against the cluster with Grafana-equivalent semantics (`scripts/validate-queries.js`). **63/63 returned data. 0 empty, 0 errors.** The dashboards are not empty shells — they are wired to live Wazuh telemetry.

**Data backing them (24h window):**

| Fact | Value |
|---|---|
| Alert indices | 44 daily `wazuh-alerts-4.x-YYYY.MM.DD` (2026-09-23 → 2026-11-10) |
| Other Wazuh indices | 8 × `wazuh-statistics-*`, 14 × `wazuh-states-*` (vulnerabilities, inventory) |
| Total alert documents | 13,886,589 |
| Alerts in the last 24h | 2,979,089 |
| Freshest `@timestamp` | 2026-11-10T11:58Z (live at audit time) |
| Distinct MITRE techniques (24h) | 26 (`T1059.003` 5358, `T1114.003` 4155, `T1087` 2684, `T1213.002` 1044, `T1112` 523 …) |
| Agents reporting (7d) | 9 distinct agents — the manager host accounts for 12.15M alerts, the rest are a long tail (10.5k / 8.5k / 7.2k / 4.5k / 594 / 574 / 96 / 34) |

---

## 2. Workstream compliance, step by step

### Step 13 — Confirm data is indexed (rule level, MITRE ID, source IP, agent)

**Verdict: PASS.**

- 44 daily alert indices are populated and still being written to (verified live, not historical).
- Every field the workstream names is present **and parsed** in the `wazuh-alerts-4.x-*` mapping: `rule.level` (integer), `rule.mitre.id` (keyword array), `data.srcip` (ip), `agent.name` (keyword).
- All 20 fields referenced by the dashboards were checked against the live mapping — **none are missing**. No panel is relying on a field the decoder did not extract.

The four fields the workstream calls out map to live panels: `rule.level` → *Severity Distribution* / *Critical Alerts*; `rule.mitre.id` → *MITRE ATT&CK Heat Map*; `data.srcip` → *Top Source IPs*; `agent.name` → *Top Agents*.

### Step 14 — Learn the dashboard toolset (Wazuh dashboard on OpenSearch Dashboards)

**Verdict: DELIVERED ON A DIFFERENT TOOL — justified, but it must be recorded.**

The dashboards were built in **Grafana 13.2.2**, not in the OpenSearch Dashboards (Wazuh app) UI named in the workstream. The data path is still the Wazuh/OpenSearch one — Grafana is pointed at the same `wazuh-alerts-4.x-*` indices through the `grafana-opensearch-datasource` plugin (v2.34.0).

Why this is defensible: the workstream's *objective* ("an analyst gets an at-a-glance view of the lab's detection capabilities") is met, and Grafana gives version-controllable JSON, provisioning and a single importable bundle — which is exactly what step 16 asks for.

What it costs you (and must be written down so the next analyst is not surprised):

1. The workstream's *Wazuh Vulnerability Detection* reference points at the OpenSearch Dashboards app; **this set does not use that app's schema** (it queries `rule.groups:vulnerability-detector` alerts, not the `wazuh-states-vulnerabilities-*` state index). Both views exist in the cluster; only the alert-based one is used here.
2. Any mitigation the Wazuh app's own dashboards provide (its saved views, its mitigation status) is **not** reproduced here.

### Step 15 — One dashboard per operational question

**Verdict: PASS (6 delivered against 5 suggested).**

| Required by workstream | Delivered | Notes |
|---|---|---|
| SOC Overview (alert volume & severity) | ✅ `SOC Overview` | 4 severity gauges + trend + top agents/groups/rules + recent alerts |
| Threat Detection (Suricata + MITRE heat map) | ✅ `Threat Detection` | Suricata gauges, signature/source-IP breakdowns, **MITRE ATT&CK Heat Map** |
| File Integrity | ✅ `File Integrity` | Syscheck alert counts, modified/added/deleted split, changed attributes, registry paths |
| Vulnerabilities | ✅ `Vulnerabilities` | Severity split, CVE ranking, vulnerable packages, architectures, solved status |
| Brute Force & Active Response | ✅ `Brute Force & Active Response` | Authentication failure counts, invalid logins, source IPs, targeted agents, high-severity filter |
| *(not required)* | ➕ `Configuration Assessment` | **Extra dashboard**: SCA/CIS check pass/fail, compliance score, failed controls/policies. Sourced from `rule.groups:sca`. |

Each dashboard answers exactly one operational question — see [`DASHBOARD-CATALOG.md`](DASHBOARD-CATALOG.md).

### Step 16 — Export and version the dashboards; store the export in SharePoint

**Verdict: DONE IN GIT — SharePoint copy still outstanding.**

This repository is the versioned export:

- `dashboards/` — one Grafana-native JSON per dashboard (raw API envelope, re-importable).
- `export/grafana-soc-dashboards.bundle.json` — single-file bundle in Grafana's "Export for sharing externally" format, with the datasource reference rewritten to a `__inputs` placeholder so it binds to whatever datasource the target instance has.
- `provisioning/` — file-based provisioning assets so a rebuilt Grafana picks the dashboards up from disk on boot.
- `scripts/export-dashboards.ps1` — re-export from a live Grafana; `scripts/import-dashboards.ps1` — import back.
- `docs/` — this audit, the catalogue, the panel-by-panel validation and the re-import guide.

**Outstanding:** the workstream explicitly says *"store the export in SharePoint"*. Do that once this repo is pushed — push the repo to GitHub **and** drop the bundle file into the workstream's SharePoint location. Until then, step 16 is only half closed.

---

## 3. Definition of Done

| DoD item | Status | Evidence / gap |
|---|---|---|
| Five dashboards, each answering one clear question | ✅ **Met — six delivered** | The 5 required + `Configuration Assessment` as a bonus. Catalogue proves one question per dashboard. |
| MITRE view populated from real alerts | ✅ **Met, with a scoping caveat** | `MITRE ATT&CK Heat Map` is fed by `rule.mitre.id` and returns live technique counts (e.g. `T1059` 431, `T1595` 10 in 24h). **Caveat:** the heat map is filtered to `rule.groups:suricata`, so it only shows MITRE IDs attached to Suricata alerts. The feed actually carries **26** distinct techniques in 24h, led by `T1059.003` (5358) and `T1114.003` (4155). If the intent is "MITRE coverage of the whole lab", the filter must be widened — see F8. |
| Saved-objects export stored in SharePoint | ⚠️ **Partial** | Export + version control ✅ (this repo). SharePoint copy ⏳ outstanding. |
| Export re-imported once to prove portability | ⚠️ **Tooling ready, execution outstanding** | `scripts/import-dashboards.ps1` + bundle + provisioning assets are in place and documented in [`RE-IMPORT-GUIDE.md`](RE-IMPORT-GUIDE.md). The actual re-import against a fresh instance has not been run yet — see the checklist in that guide. |

---

## 4. The workstream's own pitfalls, checked against the evidence

| Pitfall (from the workstream) | What the audit found |
|---|---|
| *"Building on an empty index. If WS3 isn't producing alerts yet, you'll design against no data."* | **Not hit.** 13.9M alerts, live writer, every dashboard panel returns data. No panel was designed against a void. |
| *"Wrong time range. A dashboard that looks empty is often just set to the wrong window."* | **Partially hit — this is the live risk.** Default windows are `now-24h` / `now-6h` / `now-2d`. Low-volume rule groups fall outside them: `sca` = 13 events/24h (993/7d), `vulnerability-detector` = 48/24h (10,346/7d). *Configuration Assessment* uses `now-2d` and *Vulnerabilities* uses `now-24h`, so on a quiet day they read empty even though the feed is healthy. See F7. |
| *"Field not parsed. If a visualization can't find a field, the decoder upstream may not be extracting it."* | **Not hit.** All 20 referenced fields are present in the live mapping; all 63 queries return data. No workaround was needed. |
| *"No export. A beautiful dashboard that only exists on one server is lost on rebuild."* | **Fixed by this repository.** Every dashboard, the datasource definition and the provisioning assets are versioned and re-importable. |

---

## 5. Findings

Ranked: **P1** = will break a rebuild or mislead an analyst · **P2** = degrades analysis quality · **P3** = hygiene.

### P1 — Correctness and portability

**F1 · Datasource uses the legacy bracketed index pattern**
The datasource `Blue Cloud Dashboard` (`cftkburm1y9z4f`) points at index name `[wazuh-alerts-4.x-]YYYY.MM.DD` with interval `Daily`. This ES-1.x/2.x-style template is resolved by the plugin's *frontend* path (which is what the browser uses, and why the dashboards render) but **not** by the plugin's *backend* path (`POST /api/ds/query`). Proof: replaying all 60 panels through the Grafana API returns `200` with **zero frames**, and during those replays **no OpenSearch index's `search.query_total` counter moves at all** — i.e. Grafana is querying an index name that does not exist, and `ignore_unavailable: true` turns that into a silent empty result.
*Fix:* set the datasource index name to the plain wildcard `wazuh-alerts-4.x-*` with interval **No pattern**. It resolves identically in both paths, removes the version-dependent interpolation entirely, and makes headless/CI validation work. Until that is done, **any scripted re-validation of these dashboards will look broken even when the dashboards are fine** (this repo's `scripts/validate-queries.js` works around it by issuing the equivalent query through the datasource proxy).

**F2 · Datasource version does not match the cluster**
`jsonData.version` is `2.0.0`; the cluster is **7.10.2**. The plugin uses this value to decide date-histogram interval syntax and index interpolation, so the declared version is wrong and interacts badly with F1. *Fix:* set it to `7.10.2` (or to `2.0.0` only if the datasource is genuinely meant for an OpenSearch 2.x cluster).

**F3 · Five unused datasources, two of them duplicates of the live one**
`grafana-opensearch-datasource`, `grafana-opensearch-datasource-1` (no index pattern at all), `grafana-opensearch-datasource-2` (`index.*` — matches nothing), `IRIS API` (an Infinity datasource, unused) and `Threat Detection Dashboard` (identical config to the live one). Every dashboard uses only `Blue Cloud Dashboard`. *Risk:* an analyst edits a panel, picks a datasource that points at `index.*` or an empty pattern, and gets a blank panel with no clue why. *Fix:* delete the unused ones or rename them clearly as scratch datasources; keep exactly one OpenSearch datasource per index pattern.

**F4 · Branding banner is a server-local asset**
Each dashboard has a text panel pointing at `/public/img/banner.png` (Blue Cloud Softech Solutions branding). That file lives in the Grafana server's public folder — on any other instance the panel renders as a broken image. *Fix:* the image is now versioned in this repo at [`assets/banner.png`](../assets/banner.png); copy it to `<grafana>/public/img/banner.png` on the target instance (documented in the re-import guide), or inline it as a base64 data URI in the panel HTML to remove the dependency entirely.

**F5 · PPL is enabled on the datasource while every panel is authored in Lucene**
`jsonData.pplEnabled = true`, but all 63 targets use `queryType: lucene` with Lucene query strings. On this cluster the PPL endpoint does not accept hyphenated index names unquoted (`index=wazuh-alerts-4.x-2026.11.10` fails to tokenise), so anyone who flips a panel to PPL in the query editor gets a silent empty result. *Fix:* turn PPL off for this datasource, or document the required `index="…"` quoting alongside the Lucene fallback.

**F17 · Every drill-down link points at a hardcoded OpenSearch Dashboards origin**
**22** panel links across all six dashboards resolve to `https://192.168.1.210:20443/app/...` — 21 to the OSD *Discover* app (`/app/data-explorer/discover#?_a=(discover:…)`) and 1 to the OSD *MITRE ATT&CK* app (`/app/mitre-attack`). They are absolute URLs baked into the panel definitions, so they (a) break on any other instance, and (b) are why the exported dashboard JSON carries a second internal host.

There is a positive reading too: the drill-downs are exactly the **OpenSearch Dashboards / Wazuh app hand-off the workstream describes**, so the OSD integration is present in the links even though the dashboards themselves are Grafana. *Fix:* re-point the origin from configuration rather than the panel JSON — `scripts/redact-links.js --osd-base <url> --write` rewrites all 22 in one pass — and point them at Grafana Explore if the OSD hand-off is not wanted.

**F18 · Hardcoded per-host colour overrides**
21 `fieldConfig.overrides` entries across the six dashboards colour values by **exact host name** (Windows endpoints, the SOC lab VMs and the manager host). If a host is renamed or absent the override silently does nothing (the panel falls back to the palette), and the exported JSON embeds an inventory of estate machine names. *Fix:* use a value mapping or a regex override instead of hardcoded names.

### P2 — Analysis quality

**F6 · The "critical" gauges can never fire in this lab**
`Critical Alerts` filters `rule.level:>=15` and `Critical Suricata Alerts` filters `rule.level:[15 TO *]`. The highest severity actually produced in the last 24h is **level 12** (level 3: 2.63M, 5: 207k, 6: 119k, 9: 346, 10: 73, 12: 14). Both gauges therefore read a permanent 0 that an analyst will read as "the panel is broken" rather than "nothing that severe happened". *Fix:* either retune the bands to the lab's real severity profile (e.g. high ≥ 10) and rename the panels accordingly, or keep 15 and label the gauge *"no level-15 alerts in window"* so the zero is self-explanatory.

**F7 · Default windows are too narrow for the low-volume rule groups**
`sca` = 13 events/24h (993/7d); `vulnerability-detector` = 48/24h (10,346/7d). *Configuration Assessment* (`now-2d`) and *Vulnerabilities* (`now-24h`) will look empty on a quiet day. *Fix:* default *Configuration Assessment* and *Vulnerabilities* to `now-7d → now`; keep the fast-moving ones at 24h or 6h. This is exactly the "wrong time range" pitfall from the workstream, still latent in the delivery.

**F8 · The MITRE heat map covers only Suricata**
`MITRE ATT&CK Heat Map` queries `rule.groups:suricata AND rule.mitre.id:*` and `MITRE Techniques` aggregates `rule.mitre.id` under `rule.groups:suricata`. The panel is populated from real alerts (so the DoD is technically met) but it is **not** a view of the lab's MITRE coverage: the feed carries 26 techniques in 24h, and the top ones (`T1059.003` 5358, `T1114.003` 4155, `T1087` 2684, `T1213.002` 1044) come from Windows/Exchange/SharePoint rules that the suricata filter excludes. *Fix:* either drop the `rule.groups:suricata` clause to make it a true ATT&CK heat map, or rename the panels to "Suricata MITRE Techniques" so the scope is honest.

**F9 · Two mislabelled / mis-scoped panels on Threat Detection**
- *"Top Source IPs"* (panel 7) queries `*` while every other panel on that dashboard filters `rule.groups:suricata`. It therefore shows source IPs across **all** alert traffic (dominated by FortiGate and Office 365 logs), not the network IDS traffic — a misleading label on a security dashboard. *Fix:* change the query to `rule.groups:suricata`, or retitle it "Top Source IPs (all alerts)".
- *"Top Alert Categories"* (panel 10) aggregates `rule.description`, not `rule.groups` — it is a second copy of the *"Top Suricata Signatures"* aggregation (panel 5) rather than the category breakdown the title promises. *Fix:* re-point it to `terms: rule.groups` (the SOC Overview dashboard does exactly this correctly).

**F10 · Two different time fields are used for the time axis**
Some panels aggregate on `timestamp` (Wazuh *event* time) and others on `@timestamp` (*ingest* time). Both are `date` fields, but they disagree for delayed/queued events, so the same dashboard can show two timelines that do not line up. *Fix:* standardise on one (recommend `@timestamp`, which is what the datasource is configured with) and re-point the outlier panels.

**F11 · No auto-refresh on any dashboard**
`refresh` is empty on all six. A SOC wallboard that only updates on a manual reload will be read as live and quietly go stale. *Fix:* set `refresh: "1m"` (or `30s` on the brute-force dashboard).

### P3 — Hygiene and process

**F12 · No tags, no folder.** All six dashboards sit in *General* with zero tags, so they cannot be found via tag search or exported as one unit. *Fix:* the repo already ships `provisioning/dashboards/provider.yaml` pointing at a folder named `SOC Detection Lab`; apply it and tag each dashboard (`wazuh`, `soc`, `<domain>`).

**F13 · No Grafana alert rules and no annotations.** `GET /api/v1/provisioning/alert-rules` returns `[]` and `GET /api/annotations` returns `[]`. If the lab is meant to *notify* on critical alerts, that alerting has to live elsewhere (or be added as Grafana alert rules built on these panel queries).

**F14 · Datasource name is environment-specific.** The live datasource is called *"Blue Cloud Dashboard"*; that is a display name, not a technical one, and it is baked into `provisioning/datasources/datasources.yaml`. A rebuild on another host should use a neutral name (e.g. `Wazuh OpenSearch`) — the uid is what actually matters and it is pinned.

**F15 · Platform delta needs a line in the runbook.** The workstream says OpenSearch Dashboards; the delivery is Grafana (see step 14). Record that decision next to the workstream so the next person does not "fix" it back.

**F16 · SharePoint copy outstanding** (step 16 / DoD). Push to GitHub *and* copy the bundle to the workstream's SharePoint location.

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Dashboard set is lost on server rebuild | Low (now) | High | This repo is the source of truth; provisioning assets re-seed a fresh Grafana | Dashboards owner |
| Analyst edits a panel against the wrong datasource (F3) | Medium | Medium | Delete the 5 unused datasources | Grafana admin |
| A rebuild silently produces empty panels (F1) | High if unfixed | High | Apply F1 + F2 before the next rebuild; re-run `scripts/validate-queries.js` after any datasource change | Dashboards owner |
| Low-volume rule groups make dashboards look broken (F7) | High | Medium | Widen default windows on *Configuration Assessment* / *Vulnerabilities* | Dashboards owner |
| Critical gauge always reads 0 (F6) | Certain | Medium | Retune thresholds or label the gauge | Dashboards owner |
| MITRE heat map read as lab-wide coverage (F8) | Medium | Medium | Widen the filter or rename the panels | Dashboards owner |
| Branding image missing on a new instance (F4) | High on rebuild | Low | `assets/banner.png` + install step in the re-import guide | Dashboards owner |
| Credentials leak into git | Low | High | No credentials in this repo; scripts read `GRAFANA_USER` / `GRAFANA_PASSWORD` from the environment | Repo owner |

---

## 7. Recommended order of work

1. **Before the next rebuild:** fix F1 (wildcard index name) and F2 (version 7.10.2), then re-run `scripts/validate-queries.js` to confirm nothing regressed.
2. **Before the SharePoint hand-off:** run the portability test in [`RE-IMPORT-GUIDE.md`](RE-IMPORT-GUIDE.md) against a fresh Grafana and record the result in this document.
3. **Quality pass:** F6, F7, F8, F9, F10, F11 — each is a small panel edit in the Grafana UI, then re-export with `scripts/export-dashboards.ps1` and commit the delta.
4. **Portability of the links and overrides:** F17 (re-point the 22 drill-down URLs with `scripts/redact-links.js`) and F18 (replace the hardcoded per-host colour overrides with value mappings).
5. **Hygiene:** F3, F12, F13.
6. **Process:** F16 — SharePoint copy; F15 — record the Grafana-vs-OpenSearch-Dashboards decision in the workstream.

### On data hygiene in this repository

The dashboards themselves contain internal estate detail by nature — hostnames in colour overrides and a hardcoded drill-down origin. The repository is arranged so that:

- **no credential** is ever written to disk (scripts read `GRAFANA_USER` / `GRAFANA_PASSWORD` from the environment; `.env` is git-ignored, `.env.example` has a blank password);
- the **generated evidence** committed here is sanitised — telemetry IPs, agent names, Windows SIDs and the cluster UUID are replaced with placeholders, with the unsanitised copies kept locally in the git-ignored `export/raw/`;
- the **import artefacts** (`dashboards/`, the bundle, `provisioning/`) stay byte-faithful, because rewriting them would silently change how the dashboards behave on import.

See the *Security and data hygiene* section in [`../README.md`](../README.md).

---

## 8. How the evidence was produced

All commands are **read-only** against Grafana and OpenSearch. No dashboard, datasource, folder or alert rule was created, modified or deleted during this audit.

| Artefact | Command |
|---|---|
| `export/inventory.json`, `dashboards/*.json` | `scripts/export-dashboards.ps1` — `GET /api/search`, `GET /api/dashboards/uid/<uid>`, `GET /api/datasources`, `GET /api/folders` |
| `export/cluster-facts.json` | `scripts/cluster-facts.js` — `_cat/indices`, `_count`, `_search` aggregations through the datasource proxy |
| `export/panel-validation.json` | `scripts/validate-queries.js` — one `_search` per panel query through the datasource proxy |
| `export/audit-report.json`, `docs/AUDIT-REPORT.md` | `scripts/audit-dashboards.js` — offline analysis of the exported JSON |

Reproduce the whole thing:

```powershell
$env:GRAFANA_USER='<grafana-user>'; $env:GRAFANA_PASSWORD='<password>'
.\scripts\export-dashboards.ps1
node scripts\cluster-facts.js
node scripts\validate-queries.js
node scripts\audit-dashboards.js
node scripts\build-catalog.js
node scripts\build-bundle.js
node scripts\build-provisioning.js
node scripts\sanitize.js
```
