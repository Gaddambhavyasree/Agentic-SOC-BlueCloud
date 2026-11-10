<#
.SYNOPSIS
    Exports Grafana dashboards (and the folders / datasources they depend on) to disk
    as Git-friendly JSON, plus a single importable bundle file.

.DESCRIPTION
    Read-only against the Grafana API. Nothing is created, changed or deleted on the server.

.PARAMETER GrafanaUrl
    Base URL of the Grafana instance, e.g. http://192.168.3.55:3000

.PARAMETER User
    Username for HTTP Basic auth. Defaults to $env:GRAFANA_USER.

.PARAMETER Password
    Password for HTTP Basic auth. Defaults to $env:GRAFANA_PASSWORD.
    Prefer the env var so credentials never land in shell history or a script file.

.PARAMETER OutputDir
    Root of the repo. Dashboards land in <OutputDir>\dashboards, bundle in <OutputDir>\export.

.EXAMPLE
    $env:GRAFANA_USER='admin'; $env:GRAFANA_PASSWORD='***'
    .\export-dashboards.ps1 -GrafanaUrl 'http://192.168.3.55:3000'
#>
[CmdletBinding()]
param(
    [string]$GrafanaUrl = 'http://192.168.3.55:3000',
    [string]$User = $env:GRAFANA_USER,
    [string]$Password = $env:GRAFANA_PASSWORD,
    [string]$OutputDir = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($User) -or [string]::IsNullOrWhiteSpace($Password)) {
    throw "Missing credentials. Set `$env:GRAFANA_USER and `$env:GRAFANA_PASSWORD, or pass -User/-Password."
}

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Password}"))
$headers = @{ Authorization = "Basic $auth" }

function Invoke-Grafana {
    param([Parameter(Mandatory)][string]$Path, [string]$Method = 'Get')
    $uri = "$GrafanaUrl$Path"
    $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -UseBasicParsing -TimeoutSec 30
    if ($resp.StatusCode -ge 400) { throw "Grafana API $Method $Path returned $($resp.StatusCode)" }
    return ($resp.Content | ConvertFrom-Json)
}

$dashDir = Join-Path $OutputDir 'dashboards'
$expDir  = Join-Path $OutputDir 'export'
New-Item -ItemType Directory -Force -Path $dashDir, $expDir | Out-Null

function Write-Utf8 {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][AllowEmptyString()][string]$Content)
    # UTF-8 without BOM - keeps the JSON byte-identical to what Grafana serves and avoids BOM parse errors
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Host "==> Querying $GrafanaUrl"
$health = Invoke-Grafana '/api/health'
Write-Host "    Grafana $($health.version) / db=$($health.database)"

Write-Host "==> Fetching dashboards"
$search = Invoke-Grafana '/api/search?type=dash-db&limit=1000'
$manifest = @()
foreach ($d in $search) {
    $full = Invoke-Grafana "/api/dashboards/uid/$($d.uid)"
    $slug = ($d.uri -replace '^db/', '') -replace '[^a-zA-Z0-9-_]', '-'
    $file = Join-Path $dashDir "$($d.uid)__$slug.json"
    # Raw API envelope (dashboard + meta) - re-importable via POST /api/dashboards/db
    Write-Utf8 -Path $file -Content ($full | ConvertTo-Json -Depth 100)
    $manifest += [pscustomobject]@{
        uid       = $d.uid
        title     = $d.title.Trim()
        slug      = $slug
        url       = $d.url
        file      = "dashboards/$($d.uid)__$slug.json"
        panelCount= ($full.dashboard.panels | Measure-Object).Count
        rowCount  = ($full.dashboard.panels | Where-Object { $_.type -eq 'row' } | Measure-Object).Count
        version   = $full.meta.version
        updated   = $full.meta.updated
        tags      = $full.meta.tags -join ','
        folderUid = $full.meta.folderUid
    }
    Write-Host "    [$($d.uid)] $($d.title.Trim())  panels=$($manifest[-1].panelCount)"
}

Write-Host "==> Fetching folders"
$folders = @()
try { $folders = @(Invoke-Grafana '/api/folders?limit=1000') } catch { Write-Warning "folders unavailable: $($_.Exception.Message)" }

Write-Host "==> Fetching datasources"
$ds = @(Invoke-Grafana '/api/datasources')

$meta = [pscustomobject]@{
    exportedFrom  = $GrafanaUrl
    grafanaVersion= $health.version
    exportedAt    = (Get-Date).ToUniversalTime().ToString('o')
    dashboardCount= $manifest.Count
    dashboards    = $manifest
    folders       = @($folders | ForEach-Object { [pscustomobject]@{ uid=$_.uid; title=$_.title; parentUid=$_.parentUid } })
    datasources   = @($ds | ForEach-Object { [pscustomobject]@{
        uid=$_.uid; name=$_.name; type=$_.type; isDefault=$_.isDefault; url=$_.url
        indexPattern = $_.jsonData.database; timeField = $_.jsonData.timeField
        interval = $_.jsonData.interval
        flavor = $_.jsonData.flavor; pplEnabled = $_.jsonData.pplEnabled
        tlsSkipVerify = $_.jsonData.tlsSkipVerify; version = $_.jsonData.version
    } })
}
Write-Utf8 -Path (Join-Path $expDir 'inventory.json') -Content ($meta | ConvertTo-Json -Depth 20)

Write-Host "==> Writing inventory.json ($($manifest.Count) dashboards, $($ds.Count) datasources)"
$manifest | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
Write-Host "Done."
