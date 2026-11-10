# Re-Import Guide — proving the dashboards are portable

This is the procedure behind **step 16** (*"Export and version the dashboards … re-imported once to prove portability"*) and the second half of the **Definition of Done** (*"saved-objects export … re-imported once to prove portability"*).

Nothing here modifies the source instance `http://192.168.3.55:3000` unless you deliberately point the scripts at it.

---

## 0. What is in the box

| Path | What it is | Use it when |
|---|---|---|
| `dashboards/<uid>__<slug>.json` | Raw Grafana export of one dashboard (API envelope: `dashboard` + `meta`) | API import (`POST /api/dashboards/db`) |
| `export/grafana-soc-dashboards.bundle.json` | Single file in Grafana's *"Export for sharing externally"* format, datasource reference rewritten to a `DS_OPENSEARCH` placeholder | Manual import through the Grafana UI, or hand-off to another team |
| `export/inventory.json` | Datasource/folder inventory + dashboard manifest | Reference, drift checks |
| `provisioning/datasources/datasources.yaml` | File-based datasource provisioning, uid pinned | Rebuilding a Grafana from scratch |
| `provisioning/dashboards/*.json` + `provider.yaml` | File-based dashboard provisioning | Rebuilding a Grafana from scratch |
| `assets/banner.png` | The branding image the dashboard header panel references | Recreating `/public/img/banner.png` on the target instance |
| `scripts/import-dashboards.ps1` | API import with datasource re-pointing and optional folder creation | Automated import |
| `scripts/export-dashboards.ps1` | Re-export from a live Grafana | After editing a dashboard |
| `scripts/validate-queries.js` | Replays every panel query against the cluster and reports live row counts | Verifying an import actually shows data |

---

## 1. Fastest path — provision a fresh Grafana from this repo

This is the cleanest portability proof because nothing is uploaded by hand.

```bash
# on the target Grafana host
git clone <your-github-remote> grafana-soc-dashboards
sudo cp -r grafana-soc-dashboards/provisioning/datasources/* /etc/grafana/provisioning/datasources/
sudo cp -r grafana-soc-dashboards/provisioning/dashboards/*   /etc/grafana/provisioning/dashboards/
sudo cp grafana-soc-dashboards/assets/banner.png              /var/lib/grafana/public/img/banner.png
sudo systemctl restart grafana-server
```

On Grafana (Docker) the same files go into `/etc/grafana/provisioning/…` inside the container.

What you get:

- Datasource **`Blue Cloud Dashboard`** with uid `cftkburm1y9z4f` and index `wazuh-alerts-4.x-*` (pinned uid = the dashboards bind to it without edits).
- All six dashboards in a folder named **SOC Detection Lab**, still editable in the UI (`allowUiUpdates: true`).

> **Before you do this, apply finding F1** from [`WORKSTREAM-AUDIT.md`](WORKSTREAM-AUDIT.md): set the datasource index name to the plain wildcard `wazuh-alerts-4.x-*` with interval **No pattern**. The provisioned file already uses the wildcard form — but the live instance still uses the bracketed legacy pattern, so the two would differ until you fix the live one.

---

## 2. Manual import through the Grafana UI

1. Open the target Grafana → **Dashboards → New → Import**.
2. **Upload JSON file** → select `export/grafana-soc-dashboards.bundle.json`.
3. Grafana lists the six dashboards and asks which **datasource** to bind. Choose the OpenSearch datasource that points at your Wazuh indices.
   The bundle's `__inputs` placeholder is `DS_OPENSEARCH`; every panel reference was rewritten to it, so the mapping survives a different datasource uid *and* a different datasource name.
4. Click **Import**. The dashboards land in *General* with their uids preserved (`adgszzq`, `adsf5p4`, `ad65mdz`, `ad4g2vm`, `adl6mwj`, `adbz577`).
5. Copy `assets/banner.png` to `<grafana-data>/public/img/banner.png` on the target instance, otherwise the header panel of every dashboard shows a broken image.

---

## 3. Automated import through the API

```powershell
$env:GRAFANA_USER='admin'
$env:GRAFANA_PASSWORD='<password>'

# into a fresh instance, into a folder
.\scripts\import-dashboards.ps1 `
    -GrafanaUrl 'http://<target>:3000' `
    -FolderName 'SOC Detection Lab' `
    -DatasourceUid '<uid-of-the-opensearch-datasource-on-target>'
```

The script:

- resolves the OpenSearch datasource on the target (or uses `-DatasourceUid`),
- creates the folder if it does not exist,
- repoints every panel's datasource to that uid,
- POSTs each dashboard to `/api/dashboards/db`.

`-Overwrite` is required to replace a dashboard that already exists with the same uid — leave it off for the first import so a typo cannot clobber anything.

---

## 4. Verify the import actually shows data

An import can succeed and still show empty panels — that is exactly the failure mode behind finding F1. Verify with the query replay, not by eyeballing the first screenshot:

```powershell
$env:GRAFANA_USER='admin'; $env:GRAFANA_PASSWORD='<password>'
node scripts\validate-queries.js --url 'http://<target>:3000'
```

Expected on a healthy instance:

```
summary: {"data":63,"empty":0,"error":0}
```

and `docs/PANEL-VALIDATION.md` regenerated against the new instance.

If the summary shows `empty` panels:

| Symptom | Likely cause |
|---|---|
| every panel empty, `cluster-facts.json` still shows 13M alerts | The datasource index pattern does not resolve on the target (finding F1). Use the wildcard `wazuh-alerts-4.x-*`. |
| a few panels empty, others fine | The default time range is narrower than the rule group's event rate (finding F7). Re-run with `--window 7d`. |
| all panels error with `no such index` | The datasource points at the wrong cluster or the index pattern has a typo. |
| panels work in the browser but not via `POST /api/ds/query` | Expected with the legacy bracketed pattern — see F1. |

---

## 5. Portability test — record the result

Copy this block into the workstream notes (or a `docs/RE-IMPORT-LOG.md` in this repo) and fill it in once the test has been run:

```
Portability test
  Date            :
  Target instance : http://<host>:3000  (Grafana <version>)
  Method          : [ ] file provisioning  [ ] UI bundle import  [ ] API import
  Dashboards      : 6/6 imported
  Datasource      : <name> / <uid>, index <pattern>
  Panel queries   : 63 validated, <n> data, 0 empty, 0 errors
  Branding asset  : banner.png installed to <path>
  Result          : PASS / FAIL
  Notes           :
```

---

## 6. After the test — keep the repo authoritative

Any dashboard edited in the UI should be re-exported and committed:

```powershell
.\scripts\export-dashboards.ps1 -GrafanaUrl 'http://192.168.3.55:3000'
node scripts\audit-dashboards.js
node scripts\build-catalog.js
node scripts\build-bundle.js
node scripts\build-provisioning.js
git add -A
git commit -m "chore(dashboards): re-export after <change>"
```

`scripts/export-dashboards.ps1` overwrites `dashboards/*.json` and `export/inventory.json`; the diff in git is the change log for the dashboard set.
