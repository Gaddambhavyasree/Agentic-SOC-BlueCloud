# Panel Data Validation (live, read-only)

- **Source:** http://192.168.3.55:3000
- **Validated:** 2026-11-10T12:00:55.422Z
- **Method:** equivalent OpenSearch DSL executed through the Grafana datasource proxy (read-only _search)
- **Window:** each dashboard default time range

**Result: 63 panel queries return data, 0 return no rows, 0 error.**

| Dashboard | Panel | Query | Rows | Status |
|---|---|---|---|---|
| Vulnerabilities | Total Vulnerabilities (#2) | `rule.groups:vulnerability-detector` | 49 | ✅ data |
| Vulnerabilities | Critical Vulnerabilities (#3) | `rule.groups:vulnerability-detector AND data.vulnerability.severity:Critical` | 49 | ✅ data |
| Vulnerabilities | High Vulnerabilities (#4) | `rule.groups:vulnerability-detector AND data.vulnerability.severity:High` | 49 | ✅ data |
| Vulnerabilities | Solved Vulnerabilities (#5) | `rule.groups:vulnerability-detector AND data.vulnerability.status:Solved` | 49 | ✅ data |
| Vulnerabilities | Vulnerability Trend (#6) | `rule.groups:vulnerability-detector` | 49 | ✅ data |
| Vulnerabilities | Severity Distribution (#7) | `rule.groups:vulnerability-detector` | 50 | ✅ data |
| Vulnerabilities | Top Affected Hosts (#8) | `rule.groups:vulnerability-detector` | 51 | ✅ data |
| Vulnerabilities | Top CVEs (#9) | `rule.groups:vulnerability-detector` | 10 | ✅ data |
| Vulnerabilities | Vulnerable Packages (#10) | `rule.groups:vulnerability-detector` | 50 | ✅ data |
| Vulnerabilities | Package Architectures (#11) | `rule.groups:vulnerability-detector` | 50 | ✅ data |
| File Integrity | Total File Integrity Alerts (#1) | `rule.groups:syscheck` | 49 | ✅ data |
| File Integrity | Modified Files (#2) | `rule.groups:syscheck AND rule.description:*modified*` | 49 | ✅ data |
| File Integrity | Added Files (#3) | `rule.groups:syscheck AND rule.description:*added*` | 49 | ✅ data |
| File Integrity | Deleted Files (#4) | `rule.groups:syscheck AND rule.description:*deleted*` | 49 | ✅ data |
| File Integrity | File Integrity Trend (#5) | `rule.groups:syscheck` | 49 | ✅ data |
| File Integrity | Top Modified Files (#6) | `rule.groups:syscheck` | 10 | ✅ data |
| File Integrity | Top Changed Attributes (#7) | `rule.groups:syscheck` | 5 | ✅ data |
| File Integrity | Top Agents (#8) | `rule.groups:syscheck` | 1 | ✅ data |
| File Integrity | File Action Distribution (#9) | `rule.groups:syscheck` | 6 | ✅ data |
| File Integrity | Recent File Integrity Events (#10) | `rule.groups:syscheck` | 10 | ✅ data |
| Configuration Assessment | Total Configuration Checks (#1) | `rule.groups:sca` | 97 | ✅ data |
| Configuration Assessment | Passed Checks (#2) | `rule.groups:sca AND data.sca.check.result:passed` | 97 | ✅ data |
| Configuration Assessment | Failed Checks (#3) | `rule.groups:sca AND data.sca.check.result:failed` | 97 | ✅ data |
| Configuration Assessment | Compliance Score (#4) | `rule.groups:sca AND data.sca.type:summary` | 97 | ✅ data |
| Configuration Assessment | Pass vs Fail (#5) | `rule.groups:sca` | 100 | ✅ data |
| Configuration Assessment | Failed Checks by Agent (#6) | `rule.groups:sca AND data.sca.check.result:failed` | 98 | ✅ data |
| Configuration Assessment | Top Failed Controls (#8) | `rule.groups:sca AND data.sca.check.result:failed` | 102 | ✅ data |
| Configuration Assessment | Failed Checks by Policy (#7) | `rule.groups:sca AND data.sca.check.result:failed` | 98 | ✅ data |
| Configuration Assessment | Failed Checks Trend (#9) | `rule.groups:sca AND data.sca.check.result:failed` | 97 | ✅ data |
| Configuration Assessment | Compliance by Agent (#10) | `` | 102 | ✅ data |
| Configuration Assessment | Failed Check IDs (#11) | `rule.groups:sca AND data.sca.check.result:failed` | 102 | ✅ data |
| Configuration Assessment | Recent Failed Checks (#12) | `rule.groups:sca AND data.sca.check.result:failed` | 5 | ✅ data |
| SOC Overview | Total Alerts (#1) | `*` | 49 | ✅ data |
| SOC Overview | Critical Alerts (#2) | `rule.level:>=15` | 49 | ✅ data |
| SOC Overview | High Alerts (#3) | `rule.level:[12 TO 14]` | 49 | ✅ data |
| SOC Overview | Medium Alerts (#4) | `rule.level:[7 TO 11]` | 49 | ✅ data |
| SOC Overview | Alert Trend (#5) | `*` | 58 | ✅ data |
| SOC Overview | Severity Distribution (#6) | `rule.level:>=15` | 49 | ✅ data |
| SOC Overview | Severity Distribution (#6) | `rule.level:[12 TO 14]` | 49 | ✅ data |
| SOC Overview | Severity Distribution (#6) | `rule.level:[7 TO 11]` | 49 | ✅ data |
| SOC Overview | Severity Distribution (#6) | `rule.level:[0 TO 6]` | 49 | ✅ data |
| SOC Overview | Top Agents (#7) | `*` | 54 | ✅ data |
| SOC Overview | Top Alert Categories (#8) | `*` | 59 | ✅ data |
| SOC Overview | Top Alert Rules (#9) | `*` | 15 | ✅ data |
| SOC Overview | Recent Alerts (#10) | `*` | 500 | ✅ data |
| Brute Force & Active Response | Total Authentication Failures (#1) | `rule.groups:authentication_failed` | 13 | ✅ data |
| Brute Force & Active Response | Invalid Login Attempts (#2) | `rule.groups:invalid_login` | 13 | ✅ data |
| Brute Force & Active Response | High Severity Authentication Events (#3) | `(rule.groups:authentication_failed OR rule.groups:invalid_login) AND rule.level >= 10` | 13 | ✅ data |
| Brute Force & Active Response | Authentication Failures with Source IP (#4) | `rule.groups:authentication_failed AND data.srcip:*` | 13 | ✅ data |
| Brute Force & Active Response | Authentication Failure Trend (#5) | `rule.groups:authentication_failed` | 13 | ✅ data |
| Brute Force & Active Response | Top Targeted Agents (#6) | `rule.groups:(authentication_failed OR invalid_login)` | 14 | ✅ data |
| Brute Force & Active Response | Top Source IPs (#7) | `(rule.groups:authentication_failed OR rule.groups:invalid_login)` | 13 | ✅ data |
| Brute Force & Active Response | Authentication Event Types (#8) | `` | 23 | ✅ data |
| Threat Detection | Total Suricata Alerts (#1) | `rule.groups:suricata` | 49 | ✅ data |
| Threat Detection | Critical Suricata Alerts (#2) | `rule.groups:suricata AND rule.level:[15 TO *]` | 49 | ✅ data |
| Threat Detection | MITRE Techniques (#3) | `rule.groups:suricata` | 51 | ✅ data |
| Threat Detection | Alert Trend (#4) | `rule.groups:suricata` | 49 | ✅ data |
| Threat Detection | Top Suricata Signatures (#5) | `rule.groups:suricata` | 10 | ✅ data |
| Threat Detection | Top Source IPs (#7) | `*` | 5 | ✅ data |
| Threat Detection | MITRE ATT&CK Heat Map (#6) | `rule.groups:suricata AND rule.mitre.id:*` | 51 | ✅ data |
| Threat Detection | Top Agents (#8) | `rule.groups:suricata` | 51 | ✅ data |
| Threat Detection | Top Alert Categories (#10) | `rule.groups:suricata` | 59 | ✅ data |
| Threat Detection | Recent Suricata Alerts (#11) | `rule.groups:suricata` | 20 | ✅ data |
