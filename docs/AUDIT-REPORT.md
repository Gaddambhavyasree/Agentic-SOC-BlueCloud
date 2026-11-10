# Grafana Dashboard Audit Report

- **Source:** http://192.168.3.55:3000 (Grafana 13.2.2)
- **Exported:** 2026-11-10T11:55:20.5087664Z
- **Audited:** 2026-11-10T12:00:55.499Z
- **Dashboards:** 6 | **Panels:** 66 (60 query-backed)
- **Findings:** 0 error / 8 warn / 27 info / 1 pass

## Dashboard summary

| Dashboard | UID | Panels | Query panels | Default range | Datasource(s) |
|---|---|---|---|---|---|
| Vulnerabilities | `ad4g2vm` | 11 | 10 | now-24h → now | Blue Cloud Dashboard |
| File Integrity | `ad65mdz` | 11 | 10 | now-24h → now | Blue Cloud Dashboard |
| Configuration Assessment | `adbz577` | 13 | 12 | now-2d → now | Blue Cloud Dashboard |
| SOC Overview | `adgszzq` | 11 | 10 | now-24h → now | Blue Cloud Dashboard |
| Brute Force & Active Response | `adl6mwj` | 9 | 8 | now-6h → now | Blue Cloud Dashboard |
| Threat Detection | `adsf5p4` | 11 | 10 | now-24h → now | Blue Cloud Dashboard |

## Datasource usage

| Datasource | UID | Used by |
|---|---|---|
| Blue Cloud Dashboard | `cftkburm1y9z4f` | Vulnerabilities, File Integrity, Configuration Assessment, SOC Overview, Brute Force & Active Response, Threat Detection |
| grafana-opensearch-datasource | `aftnm572lwhz4f` | *(unused)* |
| grafana-opensearch-datasource-1 | `ffu5g832pmn7ka` | *(unused)* |
| grafana-opensearch-datasource-2 | `ffxtoeq5mgsu8f` | *(unused)* |
| IRIS API | `cfur5vpamtrswa` | *(unused)* |
| Threat Detection Dashboard | `ffu1imxcwterkc` | *(unused)* |

## Findings

### 🟠 WARN — Duplicate datasources for https://127.0.0.1:9200|[wazuh-alerts-4.x-]YYYY.MM.DD

**Scope:** datasources

Blue Cloud Dashboard (cftkburm1y9z4f), Threat Detection Dashboard (ffu1imxcwterkc) all point at the same OpenSearch cluster and index pattern.

**Remediation:** Consolidate to one datasource, or keep one canonical id per index pattern and re-point every panel at it so imports are deterministic.

### 🟠 WARN — Duplicate datasources for https://127.0.0.1:9200|

**Scope:** datasources

grafana-opensearch-datasource (aftnm572lwhz4f), grafana-opensearch-datasource-1 (ffu5g832pmn7ka) all point at the same OpenSearch cluster and index pattern.

**Remediation:** Consolidate to one datasource, or keep one canonical id per index pattern and re-point every panel at it so imports are deterministic.

### 🟠 WARN — No MITRE field referenced

**Scope:** SOC Overview

DoD requires the MITRE view to be populated from real alerts, but no panel queries a rule.mitre.* field.

**Remediation:** Add a terms aggregation on rule.mitre.id / rule.mitre.technique / rule.mitre.tactic.

### 🟠 WARN — Datasource "Blue Cloud Dashboard" declares version 2.0.0, cluster is 7.10.2

**Scope:** datasources

The datasource jsonData.version drives how the plugin builds date_histogram intervals and index patterns. Declaring 2.0.0 against a 7.10.2 cluster can silently produce empty or malformed aggregations.

**Remediation:** Set the datasource version to 7.10.2, or use a plain wildcard index name so no version-dependent interpolation is needed.

### 🟠 WARN — Datasource "Threat Detection Dashboard" declares version 2.0.0, cluster is 7.10.2

**Scope:** datasources

The datasource jsonData.version drives how the plugin builds date_histogram intervals and index patterns. Declaring 2.0.0 against a 7.10.2 cluster can silently produce empty or malformed aggregations.

**Remediation:** Set the datasource version to 7.10.2, or use a plain wildcard index name so no version-dependent interpolation is needed.

### 🟠 WARN — Datasource "Blue Cloud Dashboard" uses the bracketed legacy index pattern

**Scope:** datasources

Index name "[wazuh-alerts-4.x-]YYYY.MM.DD" is the ES 1.x/2.x style template. The plugin's frontend path expands it correctly, but the backend path (POST /api/ds/query) does not resolve it the same way - every panel replayed through the Grafana API returns zero frames.

**Remediation:** Use the plain wildcard form "wazuh-alerts-4.x-*" with interval "No pattern". It resolves identically in both paths and removes the ambiguity.

### 🟠 WARN — Datasource "Threat Detection Dashboard" uses the bracketed legacy index pattern

**Scope:** datasources

Index name "[wazuh-alerts-4.x-]YYYY.MM.DD" is the ES 1.x/2.x style template. The plugin's frontend path expands it correctly, but the backend path (POST /api/ds/query) does not resolve it the same way - every panel replayed through the Grafana API returns zero frames.

**Remediation:** Use the plain wildcard form "wazuh-alerts-4.x-*" with interval "No pattern". It resolves identically in both paths and removes the ambiguity.

### 🟠 WARN — No level 15+ alerts in the last 24h

**Scope:** severity coverage

Highest rule.level observed in the last 24h is 12 (3:2638125, 4:23092, 5:208847, 6:119446, 7:99, 8:23, 9:348, 10:73, 12:14). The "Critical Alerts" gauge (rule.level >= 15) and the critical band of the severity panels therefore always read zero in this window.

**Remediation:** Either widen the default time range of the severity panels, lower the critical threshold to match the data the lab actually produces, or label the gauge explicitly as "no critical alerts in window" so an analyst does not read it as a broken panel.

### 🔵 INFO — Unused datasource "grafana-opensearch-datasource"

**Scope:** datasources

uid=aftnm572lwhz4f type=grafana-opensearch-datasource url=https://127.0.0.1:9200. No dashboard panel references it.

**Remediation:** Delete it on the Grafana server, or keep it and note it in the runbook so reviewers know it is not a dependency.

### 🔵 INFO — Unused datasource "grafana-opensearch-datasource-1"

**Scope:** datasources

uid=ffu5g832pmn7ka type=grafana-opensearch-datasource url=https://127.0.0.1:9200. No dashboard panel references it.

**Remediation:** Delete it on the Grafana server, or keep it and note it in the runbook so reviewers know it is not a dependency.

### 🔵 INFO — Unused datasource "grafana-opensearch-datasource-2"

**Scope:** datasources

uid=ffxtoeq5mgsu8f type=grafana-opensearch-datasource url=https://127.0.0.1:9200. No dashboard panel references it.

**Remediation:** Delete it on the Grafana server, or keep it and note it in the runbook so reviewers know it is not a dependency.

### 🔵 INFO — Unused datasource "IRIS API"

**Scope:** datasources

uid=cfur5vpamtrswa type=yesoreyeram-infinity-datasource url=https://127.0.0.1. No dashboard panel references it.

**Remediation:** Delete it on the Grafana server, or keep it and note it in the runbook so reviewers know it is not a dependency.

### 🔵 INFO — Unused datasource "Threat Detection Dashboard"

**Scope:** datasources

uid=ffu1imxcwterkc type=grafana-opensearch-datasource url=https://127.0.0.1:9200. No dashboard panel references it.

**Remediation:** Delete it on the Grafana server, or keep it and note it in the runbook so reviewers know it is not a dependency.

### 🔵 INFO — No auto-refresh interval

**Scope:** Vulnerabilities

refresh is empty; panels only update on manual reload.

**Remediation:** Set refresh to e.g. "1m" for SOC dashboards so analysts do not stare at stale numbers.

### 🔵 INFO — No tags

**Scope:** Vulnerabilities

Untagged dashboards are harder to find via /api/search and harder to group in the UI.

**Remediation:** Tag with e.g. ["wazuh","soc","<domain>"] consistently across the set.

### 🔵 INFO — Dashboard lives in the General folder

**Scope:** Vulnerabilities

All six dashboards sit at the org root rather than a dedicated folder.

**Remediation:** Group them in a folder (e.g. "SOC Detection Lab") so they can be exported/imported as one unit.

### 🔵 INFO — No auto-refresh interval

**Scope:** File Integrity

refresh is empty; panels only update on manual reload.

**Remediation:** Set refresh to e.g. "1m" for SOC dashboards so analysts do not stare at stale numbers.

### 🔵 INFO — No tags

**Scope:** File Integrity

Untagged dashboards are harder to find via /api/search and harder to group in the UI.

**Remediation:** Tag with e.g. ["wazuh","soc","<domain>"] consistently across the set.

### 🔵 INFO — Dashboard lives in the General folder

**Scope:** File Integrity

All six dashboards sit at the org root rather than a dedicated folder.

**Remediation:** Group them in a folder (e.g. "SOC Detection Lab") so they can be exported/imported as one unit.

### 🔵 INFO — No auto-refresh interval

**Scope:** Configuration Assessment

refresh is empty; panels only update on manual reload.

**Remediation:** Set refresh to e.g. "1m" for SOC dashboards so analysts do not stare at stale numbers.

### 🔵 INFO — No tags

**Scope:** Configuration Assessment

Untagged dashboards are harder to find via /api/search and harder to group in the UI.

**Remediation:** Tag with e.g. ["wazuh","soc","<domain>"] consistently across the set.

### 🔵 INFO — Dashboard lives in the General folder

**Scope:** Configuration Assessment

All six dashboards sit at the org root rather than a dedicated folder.

**Remediation:** Group them in a folder (e.g. "SOC Detection Lab") so they can be exported/imported as one unit.

### 🔵 INFO — No auto-refresh interval

**Scope:** SOC Overview

refresh is empty; panels only update on manual reload.

**Remediation:** Set refresh to e.g. "1m" for SOC dashboards so analysts do not stare at stale numbers.

### 🔵 INFO — No tags

**Scope:** SOC Overview

Untagged dashboards are harder to find via /api/search and harder to group in the UI.

**Remediation:** Tag with e.g. ["wazuh","soc","<domain>"] consistently across the set.

### 🔵 INFO — Dashboard lives in the General folder

**Scope:** SOC Overview

All six dashboards sit at the org root rather than a dedicated folder.

**Remediation:** Group them in a folder (e.g. "SOC Detection Lab") so they can be exported/imported as one unit.

### 🔵 INFO — No auto-refresh interval

**Scope:** Brute Force & Active Response

refresh is empty; panels only update on manual reload.

**Remediation:** Set refresh to e.g. "1m" for SOC dashboards so analysts do not stare at stale numbers.

### 🔵 INFO — No tags

**Scope:** Brute Force & Active Response

Untagged dashboards are harder to find via /api/search and harder to group in the UI.

**Remediation:** Tag with e.g. ["wazuh","soc","<domain>"] consistently across the set.

### 🔵 INFO — Dashboard lives in the General folder

**Scope:** Brute Force & Active Response

All six dashboards sit at the org root rather than a dedicated folder.

**Remediation:** Group them in a folder (e.g. "SOC Detection Lab") so they can be exported/imported as one unit.

### 🔵 INFO — No auto-refresh interval

**Scope:** Threat Detection

refresh is empty; panels only update on manual reload.

**Remediation:** Set refresh to e.g. "1m" for SOC dashboards so analysts do not stare at stale numbers.

### 🔵 INFO — No tags

**Scope:** Threat Detection

Untagged dashboards are harder to find via /api/search and harder to group in the UI.

**Remediation:** Tag with e.g. ["wazuh","soc","<domain>"] consistently across the set.

### 🔵 INFO — Dashboard lives in the General folder

**Scope:** Threat Detection

All six dashboards sit at the org root rather than a dedicated folder.

**Remediation:** Group them in a folder (e.g. "SOC Detection Lab") so they can be exported/imported as one unit.

### 🔵 INFO — MITRE view scope

**Scope:** Threat Detection

MITRE panels are restricted to: MITRE ATT&CK Heat Map: rule.groups:suricata AND rule.mitre.id:*. Rules outside that filter are not represented in the heat map.

**Remediation:** Widen the query (drop the rule.groups filter) if the heat map is meant to cover every alert, or state the scope in the panel title.

### 🔵 INFO — Datasource "Blue Cloud Dashboard" has PPL enabled

**Scope:** datasources

The panels in this set are authored with Lucene query syntax (queryType: lucene). PPL is available but unused; the PPL endpoint on this cluster does not accept hyphenated index names unquoted, so switching a panel to PPL needs care.

**Remediation:** Leave PPL off for this dashboard set, or document the PPL syntax separately.

### 🔵 INFO — Datasource "grafana-opensearch-datasource-2" has PPL enabled

**Scope:** datasources

The panels in this set are authored with Lucene query syntax (queryType: lucene). PPL is available but unused; the PPL endpoint on this cluster does not accept hyphenated index names unquoted, so switching a panel to PPL needs care.

**Remediation:** Leave PPL off for this dashboard set, or document the PPL syntax separately.

### 🔵 INFO — Datasource "Threat Detection Dashboard" has PPL enabled

**Scope:** datasources

The panels in this set are authored with Lucene query syntax (queryType: lucene). PPL is available but unused; the PPL endpoint on this cluster does not accept hyphenated index names unquoted, so switching a panel to PPL needs care.

**Remediation:** Leave PPL off for this dashboard set, or document the PPL syntax separately.

### 🟢 PASS — MITRE fields referenced: rule.mitre.id

**Scope:** Threat Detection

MITRE ATT&CK context is queried directly from the alert index.

## Panel inventory

### Vulnerabilities (`ad4g2vm`)

| # | Panel | Type | Datasource | Query | Aggregations |
|---|---|---|---|---|---|
| 12 | (untitled) | text | — | — | — |
| 2 | Total Vulnerabilities | stat | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector` | date_histogram:@timestamp |
| 3 | Critical Vulnerabilities | stat | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector AND data.vulnerability.severity:Critical` | date_histogram:@timestamp |
| 4 | High Vulnerabilities | stat | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector AND data.vulnerability.severity:High` | date_histogram:@timestamp |
| 5 | Solved Vulnerabilities | stat | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector AND data.vulnerability.status:Solved` | date_histogram:@timestamp |
| 6 | Vulnerability Trend | timeseries | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector` | date_histogram:timestamp |
| 7 | Severity Distribution | piechart | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector` | terms:data.vulnerability.severity<br>date_histogram:@timestamp |
| 8 | Top Affected Hosts | bargauge | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector` | terms:agent.name<br>date_histogram:@timestamp |
| 9 | Top CVEs | bargauge | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector` | terms:data.vulnerability.cve |
| 10 | Vulnerable Packages | bargauge | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector` | terms:data.vulnerability.package.name<br>date_histogram:@timestamp |
| 11 | Package Architectures | piechart | cftkburm1y9z4f | A: `rule.groups:vulnerability-detector` | terms:data.vulnerability.package.architecture<br>date_histogram:@timestamp |

### File Integrity (`ad65mdz`)

| # | Panel | Type | Datasource | Query | Aggregations |
|---|---|---|---|---|---|
| 11 | (untitled) | text | — | — | — |
| 1 | Total File Integrity Alerts | stat | cftkburm1y9z4f | A: `rule.groups:syscheck` | date_histogram:@timestamp |
| 2 | Modified Files | stat | cftkburm1y9z4f | A: `rule.groups:syscheck AND rule.description:*modified*` | date_histogram:@timestamp |
| 3 | Added Files | stat | cftkburm1y9z4f | A: `rule.groups:syscheck AND rule.description:*added*` | date_histogram:@timestamp |
| 4 | Deleted Files | stat | cftkburm1y9z4f | A: `rule.groups:syscheck AND rule.description:*deleted*` | date_histogram:@timestamp |
| 5 | File Integrity Trend | timeseries | cftkburm1y9z4f | A: `rule.groups:syscheck` | date_histogram:@timestamp |
| 6 | Top Modified Files | bargauge | cftkburm1y9z4f | A: `rule.groups:syscheck` | terms:syscheck.path |
| 7 | Top Changed Attributes | barchart | cftkburm1y9z4f | A: `rule.groups:syscheck` | terms:syscheck.changed_attributes |
| 8 | Top Agents | piechart | cftkburm1y9z4f | A: `rule.groups:syscheck` | terms:agent.name |
| 9 | File Action Distribution | piechart | cftkburm1y9z4f | A: `rule.groups:syscheck` | terms:rule.description |
| 10 | Recent File Integrity Events | table | cftkburm1y9z4f | A: `rule.groups:syscheck` | date_histogram:@timestamp |

### Configuration Assessment (`adbz577`)

| # | Panel | Type | Datasource | Query | Aggregations |
|---|---|---|---|---|---|
| 13 | (untitled) | text | — | — | — |
| 1 | Total Configuration Checks | gauge | cftkburm1y9z4f | A: `rule.groups:sca` | date_histogram:@timestamp |
| 2 | Passed Checks | gauge | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.check.result:passed` | date_histogram:@timestamp |
| 3 | Failed Checks | gauge | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.check.result:failed` | date_histogram:@timestamp |
| 4 | Compliance Score | stat | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.type:summary` | date_histogram:@timestamp<br>metric:data.sca.score |
| 5 | Pass vs Fail | piechart | cftkburm1y9z4f | A: `rule.groups:sca` | terms:data.sca.check.result<br>date_histogram:@timestamp |
| 6 | Failed Checks by Agent | bargauge | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.check.result:failed` | terms:agent.name<br>date_histogram:@timestamp |
| 8 | Top Failed Controls | bargauge | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.check.result:failed` | terms:data.sca.check.title<br>date_histogram:@timestamp |
| 7 | Failed Checks by Policy | timeseries | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.check.result:failed` | terms:data.sca.policy<br>date_histogram:@timestamp |
| 9 | Failed Checks Trend | timeseries | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.check.result:failed` | date_histogram:@timestamp |
| 10 | Compliance by Agent | piechart | cftkburm1y9z4f | A: `` | terms:agent.name<br>date_histogram:@timestamp<br>metric:data.sca.score |
| 11 | Failed Check IDs | bargauge | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.check.result:failed` | terms:data.sca.check.id<br>date_histogram:@timestamp |
| 12 | Recent Failed Checks | table | cftkburm1y9z4f | A: `rule.groups:sca AND data.sca.check.result:failed` | date_histogram:@timestamp |

### SOC Overview (`adgszzq`)

| # | Panel | Type | Datasource | Query | Aggregations |
|---|---|---|---|---|---|
| 11 | (untitled) | text | — | — | — |
| 1 | Total Alerts | gauge | cftkburm1y9z4f | A: `*` | date_histogram:timestamp |
| 2 | Critical Alerts | gauge | cftkburm1y9z4f | A: `rule.level:>=15` | date_histogram:timestamp |
| 3 | High Alerts | gauge | cftkburm1y9z4f | A: `rule.level:[12 TO 14]` | date_histogram:timestamp |
| 4 | Medium Alerts | gauge | cftkburm1y9z4f | A: `rule.level:[7 TO 11]` | date_histogram:timestamp |
| 5 | Alert Trend | timeseries | cftkburm1y9z4f | A: `*` | terms:rule.level<br>date_histogram:@timestamp |
| 6 | Severity Distribution | bargauge | cftkburm1y9z4f | Critical: `rule.level:>=15`<br>High: `rule.level:[12 TO 14]`<br>Medium: `rule.level:[7 TO 11]`<br>Low: `rule.level:[0 TO 6]` | date_histogram:@timestamp<br>date_histogram:@timestamp<br>date_histogram:@timestamp<br>date_histogram:@timestamp |
| 7 | Top Agents | bargauge | cftkburm1y9z4f | A: `*` | terms:agent.name<br>date_histogram:timestamp |
| 8 | Top Alert Categories | bargauge | cftkburm1y9z4f | A: `*` | terms:rule.groups<br>date_histogram:timestamp |
| 9 | Top Alert Rules | table | cftkburm1y9z4f | A: `*` | terms:rule.description<br>metric:rule.level |
| 10 | Recent Alerts | table | cftkburm1y9z4f | A: `*` | date_histogram:@timestamp |

### Brute Force & Active Response (`adl6mwj`)

| # | Panel | Type | Datasource | Query | Aggregations |
|---|---|---|---|---|---|
| 9 | (untitled) | text | — | — | — |
| 1 | Total Authentication Failures | stat | cftkburm1y9z4f | A: `rule.groups:authentication_failed` | date_histogram:@timestamp |
| 2 | Invalid Login Attempts | stat | cftkburm1y9z4f | A: `rule.groups:invalid_login` | date_histogram:@timestamp |
| 3 | High Severity Authentication Events | stat | cftkburm1y9z4f | A: `(rule.groups:authentication_failed OR rule.groups:invalid_login) AND rule.level >= 10` | date_histogram:@timestamp |
| 4 | Authentication Failures with Source IP | stat | cftkburm1y9z4f | A: `rule.groups:authentication_failed AND data.srcip:*` | date_histogram:@timestamp |
| 5 | Authentication Failure Trend | timeseries | cftkburm1y9z4f | A: `rule.groups:authentication_failed` | date_histogram:@timestamp |
| 6 | Top Targeted Agents | bargauge | cftkburm1y9z4f | A: `rule.groups:(authentication_failed OR invalid_login)` | terms:agent.name<br>date_histogram:@timestamp |
| 7 | Top Source IPs | bargauge | cftkburm1y9z4f | A: `(rule.groups:authentication_failed OR rule.groups:invalid_login)` | terms:agent.ip<br>date_histogram:@timestamp |
| 8 | Authentication Event Types | piechart | cftkburm1y9z4f | A: `` | terms:rule.description<br>date_histogram:@timestamp |

### Threat Detection (`adsf5p4`)

| # | Panel | Type | Datasource | Query | Aggregations |
|---|---|---|---|---|---|
| 12 | (untitled) | text | — | — | — |
| 1 | Total Suricata Alerts | gauge | cftkburm1y9z4f | A: `rule.groups:suricata` | date_histogram:@timestamp |
| 2 | Critical Suricata Alerts | stat | cftkburm1y9z4f | A: `rule.groups:suricata AND rule.level:[15 TO *]` | date_histogram:@timestamp |
| 3 | MITRE Techniques | stat | cftkburm1y9z4f | A: `rule.groups:suricata` | terms:rule.mitre.id<br>date_histogram:@timestamp |
| 4 | Alert Trend | timeseries | cftkburm1y9z4f | A: `rule.groups:suricata` | date_histogram:@timestamp |
| 5 | Top Suricata Signatures | barchart | cftkburm1y9z4f | A: `rule.groups:suricata` | terms:rule.description |
| 7 | Top Source IPs | barchart | cftkburm1y9z4f | A: `*` | terms:data.srcip |
| 6 | MITRE ATT&CK Heat Map | heatmap | cftkburm1y9z4f | A: `rule.groups:suricata AND rule.mitre.id:*` | terms:rule.mitre.id<br>date_histogram:@timestamp |
| 8 | Top Agents | bargauge | cftkburm1y9z4f | A: `rule.groups:suricata` | terms:agent.name<br>date_histogram:@timestamp |
| 10 | Top Alert Categories | timeseries | cftkburm1y9z4f | A: `rule.groups:suricata` | terms:rule.description<br>date_histogram:@timestamp |
| 11 | Recent Suricata Alerts | table | cftkburm1y9z4f | A: `rule.groups:suricata` | date_histogram:@timestamp |
