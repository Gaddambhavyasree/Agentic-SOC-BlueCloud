<#
.SYNOPSIS
    Imports the dashboards in this repository into a Grafana instance.

.DESCRIPTION
    Writes to the target Grafana. Use this against a fresh/rebuild instance to
    prove the dashboards are portable - not against the instance they were
    exported from unless you intend to overwrite it.

    Two import paths are supported:

      1. -Mode Api    (default) POST each dashboard to /api/dashboards/db.
                      Datasource uids are kept as exported. If the target
                      instance uses different datasource uids, pass
                      -DatasourceUidMap "old= new=" or let the script resolve
                      the single OpenSearch datasource automatically.

      2. -Mode Bundle writes nothing; it only prints the path of the
                      single-file bundle for a manual "Import > Upload JSON"
                      through the Grafana UI (this is the path that lets the
                      importing analyst pick the datasource interactively).

.PARAMETER GrafanaUrl
    Base URL. Defaults to $env:GRAFANA_URL, else http://localhost:3000

.PARAMETER FolderName
    Optional. Creates a folder with this name and imports the dashboards into it.

.PARAMETER DatasourceUid
    Optional. Override the OpenSearch datasource uid that the dashboards should
    point at on the target instance. If omitted, the script uses the exported
    uid if it exists on the target, otherwise the only OpenSearch datasource it
    finds.

.EXAMPLE
    $env:GRAFANA_USER='admin'; $env:GRAFANA_PASSWORD='***'
    .\import-dashboards.ps1 -GrafanaUrl 'http://localhost:3000' -FolderName 'SOC Detection Lab'
#>
[CmdletBinding()]
param(
    [string]$GrafanaUrl = $(if ($env:GRAFANA_URL) { $env:GRAFANA_URL } else { 'http://localhost:3000' }),
    [string]$User = $env:GRAFANA_USER,
    [string]$Password = $env:GRAFANA_PASSWORD,
    [string]$FolderName = '',
    [string]$DatasourceUid = '',
    [ValidateSet('Api', 'Bundle')]
    [string]$Mode = 'Api',
    [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'

if ($Mode -eq 'Bundle') {
    $bundle = Join-Path (Split-Path -Parent $PSScriptRoot) 'export\grafana-soc-dashboards.bundle.json'
    Write-Host "Bundle file:"
    Write-Host "  $bundle"
    Write-Host ""
    Write-Host "Import it in Grafana:"
    Write-Host "  Dashboards > Import > Upload JSON file  ->  pick the file above"
    Write-Host "  The import dialog will ask which OpenSearch datasource to bind to."
    exit 0
}

if ([string]::IsNullOrWhiteSpace($User) -or [string]::IsNullOrWhiteSpace($Password)) {
    throw "Missing credentials. Set `$env:GRAFANA_USER and `$env:GRAFANA_PASSWORD."
}

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Password}"))
$headers = @{ Authorization = "Basic $auth" }

function Invoke-Grafana {
    param([Parameter(Mandatory)][string]$Path, [string]$Method = 'Get', $Body)
    $params = @{
        Uri         = "$GrafanaUrl$Path"
        Method      = $Method
        Headers     = $headers
        UseBasicParsing = $true
        TimeoutSec  = 60
    }
    if ($null -ne $Body) {
        $params.ContentType = 'application/json'
        $params.Body = ($Body | ConvertTo-Json -Depth 100 -Compress)
    }
    $resp = Invoke-WebRequest @params
    return ($resp.Content | ConvertFrom-Json)
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$dashDir = Join-Path $repoRoot 'dashboards'

Write-Host "==> Target: $GrafanaUrl"
$health = Invoke-Grafana '/api/health'
Write-Host "    Grafana $($health.version)"

# --- resolve datasource uid -------------------------------------------------
$dss = @(Invoke-Grafana '/api/datasources')
$osDs = @($dss | Where-Object { $_.type -eq 'grafana-opensearch-datasource' })
if (-not $DatasourceUid) {
    if ($osDs.Count -eq 1) {
        $DatasourceUid = $osDs[0].uid
        Write-Host "    Datasource: $($osDs[0].name) ($DatasourceUid) - only OpenSearch datasource found"
    }
    else {
        Write-Host "    OpenSearch datasources found: $($osDs.Count)"
        $osDs | ForEach-Object { Write-Host "      $($_.uid)  $($_.name)" }
        throw "Ambiguous datasource. Re-run with -DatasourceUid <uid>."
    }
}
else {
    Write-Host "    Datasource uid override: $DatasourceUid"
}

# --- optional folder --------------------------------------------------------
$folderUid = $null
if ($FolderName) {
    $existing = @(Invoke-Grafana "/api/folders?perpage=1000") | Where-Object { $_.title -eq $FolderName }
    if ($existing) {
        $folderUid = $existing[0].uid
        Write-Host "    Folder '$FolderName' already exists ($folderUid)"
    }
    else {
        $created = Invoke-Grafana '/api/folders' 'Post' @{ title = $FolderName }
        $folderUid = $created.uid
        Write-Host "    Created folder '$FolderName' ($folderUid)"
    }
}

# --- import -----------------------------------------------------------------
$files = Get-ChildItem $dashDir -Filter '*.json' | Sort-Object Name
$n = 0
foreach ($f in $files) {
    $raw = Get-Content $f.FullName -Raw
    $doc = $raw | ConvertFrom-Json
    $dash = if ($doc.PSObject.Properties.Name -contains 'dashboard') { $doc.dashboard } else { $doc }

    # repoint the datasource if asked
    $changed = $false
    foreach ($p in $dash.panels) {
        foreach ($t in $p.targets) {
            if ($t.datasource -and $t.datasource.uid -and $t.datasource.uid -ne $DatasourceUid) {
                $t.datasource.uid = $DatasourceUid
                $changed = $true
            }
        }
    }
    $dash.id = $null

    $payload = @{
        dashboard = $dash
        overwrite = [bool]$Overwrite
        message   = "imported from grafana-soc-dashboards repo"
    }
    if ($folderUid) { $payload.folderUid = $folderUid }

    try {
        $res = Invoke-Grafana '/api/dashboards/db' 'Post' $payload
        Write-Host ("    [OK] {0,-32} uid={1} version={2}{3}" -f $res.title, $res.uid, $res.version, $(if ($changed) { '  (datasource repointed)' } else { '' }))
        $n++
    }
    catch {
        Write-Warning "    [FAIL] $($f.Name): $($_.Exception.Message)"
    }
}
Write-Host "Imported $n/$($files.Count) dashboards."
