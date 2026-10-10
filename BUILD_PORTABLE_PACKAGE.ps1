$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$outputRoot = [IO.Path]::GetFullPath((Join-Path $root 'outputs'))
$stage = [IO.Path]::GetFullPath((Join-Path $outputRoot 'SAMELCO-II-Reports-Portable'))
$zip = [IO.Path]::GetFullPath((Join-Path $outputRoot 'SAMELCO-II-Reports-Portable.zip'))

if (-not $stage.StartsWith($outputRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unsafe package staging path.'
}
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
New-Item -ItemType Directory -Path $stage, (Join-Path $stage 'runtime'), (Join-Path $stage 'portable_data'), (Join-Path $stage 'consumer_growth_kwh_forecast'), (Join-Path $stage 'generated') -Force | Out-Null

$files = @(
  'api_server.mjs', 'mysql_workspace.mjs', 'route_reports.mjs', 'delinquent_report.mjs', 'feeder_report.mjs', 'engineering_assets.mjs', 'feeder-mapping.settings.json', 'substation-capacity.settings.json', 'README.md', 'INSTALL.bat', 'CONFIGURE.bat', 'OPEN_REPORTS.bat',
  'STOP_REPORTS.bat', 'start_all_servers.bat', 'sync_remote_data.bat', 'sync_remote_data.mjs'
)
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $stage $file) -Force }
Copy-Item -LiteralPath (Join-Path $root 'web') -Destination (Join-Path $stage 'web') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'generated\feeder-engineering.json') -Destination (Join-Path $stage 'generated\feeder-engineering.json') -Force

$config = Get-Content -LiteralPath (Join-Path $root 'consumer_growth_kwh_forecast\builder.config.json') -Raw | ConvertFrom-Json
$config.mysql.host = '127.0.0.1'
$config.mysql.user = 'root'
$config.mysql.password = ''
$configJson = $config | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText((Join-Path $stage 'consumer_growth_kwh_forecast\builder.config.json'), $configJson, (New-Object Text.UTF8Encoding($false)))

$node = (Get-Command node.exe -ErrorAction Stop).Source
$mysql = (Get-Command mysql.exe -ErrorAction Stop).Source
$nodeVersion = & $node --version
if ([version]($nodeVersion.TrimStart('v')) -lt [version]'22.0.0') { throw "Node.js 22+ is required; found $nodeVersion." }
Copy-Item -LiteralPath $node -Destination (Join-Path $stage 'runtime\node.exe') -Force
Copy-Item -LiteralPath $mysql -Destination (Join-Path $stage 'runtime\mysql.exe') -Force

@'
@echo off
rem Copy or generate this file as server_settings.bat using CONFIGURE.bat.
set "REPORT_HOST=127.0.0.1"
set "PORT=3001"
set "NODE_EXE=%~dp0runtime\node.exe"
set "MYSQL_EXE=%~dp0runtime\mysql.exe"
set "MYSQL_HOST=192.168.1.99"
set "MYSQL_PORT=3306"
set "MYSQL_USER=root"
set "MYSQL_PASSWORD=change-this-password"
set "MYSQL_DATABASE_1=dbsamelco"
set "MYSQL_DATABASE_2=dbsamelco_catbalogan"
set "MYSQL_DATABASE_3=dbsamelco_basey"
set "MYSQL_DATABASE_4=dbsamelco_villareal"
'@ | Set-Content -LiteralPath (Join-Path $stage 'server_settings.example.bat') -Encoding ASCII

& (Join-Path $stage 'runtime\node.exe') --check (Join-Path $stage 'api_server.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Packaged API syntax validation failed.' }
& (Join-Path $stage 'runtime\mysql.exe') --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Packaged MySQL client validation failed.' }

Compress-Archive -LiteralPath $stage -DestinationPath $zip -CompressionLevel Optimal
$hashLine = & certutil.exe -hashfile $zip SHA256 | Where-Object { $_ -match '^[0-9A-Fa-f ]{64,}$' } | Select-Object -First 1
$hash = ($hashLine -replace ' ', '').ToUpperInvariant()
if ($hash.Length -ne 64) { throw 'Unable to calculate the package SHA-256 checksum.' }
Set-Content -LiteralPath "$zip.sha256.txt" -Value "$hash  $(Split-Path $zip -Leaf)" -Encoding ASCII

Write-Host "Package: $zip"
Write-Host "Size: $([math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 1)) MB"
Write-Host "SHA256: $hash"
