<#
  FMS as a Windows service (SYNC-HARDENING-PLAN.md T3.2, D1, D14).

  Run once on the main factory PC, in PowerShell **as Administrator**, with the
  FMS app CLOSED:

    & "$env:LOCALAPPDATA\Programs\FMS\resources\app\service\install-service.ps1"

  (or wherever FMS is installed: this script lives in <install>\resources\app\service).

  What it does, in order - it stops at the first problem and says why:
    1. finds nssm.exe (D14): -Nssm <path>, else next to this script, else PATH
    2. copies the app (host.js, staged backend + dashboard, tools\node.exe) to
       "C:\Program Files\FMS Service\app-<version>": the per-user install folder
       is inside your profile, which the service user can't read, and the app's
       own updater would replace files under the running service
    3. creates the local user "fms-service" (not an administrator: Postgres
       refuses to start as one, and LocalSystem counts) with a random password
       that only Windows keeps (it is given to the service and never shown)
    4. the data (D1): if C:\ProgramData\FMS is empty, copies the app's
       %APPDATA%\FMS there with host.js copy-data (copy, verify, original left
       as it is); if it already holds FMS data, uses it as it is
    5. locks C:\ProgramData\FMS down to fms-service (+ SYSTEM, Administrators),
       owned by fms-service
    6. registers the service with NSSM: start Automatic, as fms-service; stop =
       Ctrl+C, then up to 75 s for host.js to finish (45 s final upload, the
       closing backup, Postgres shutdown); restart after a crash
    7. starts it and waits until the dashboard answers on 127.0.0.1:48620
    8. writes C:\ProgramData\FMS-service.json, so the FMS app on this PC only
       opens a window on the service instead of starting its own copy, and
       MOVED-TO-SERVICE.txt in %APPDATA%\FMS, so the old copy never runs again

  -Lan (T3.3) also lets the other factory PCs use it in a browser at
  http://<this PC>:48620: the backend listens on every interface, Windows
  Firewall lets TCP 48620 in from the local subnet on Private networks only, and
  the dashboard's origins are allowed. Postgres (48621) and the alert relay
  (48622) stay on 127.0.0.1 - never reachable from another PC.
  -HostName fms-host renames this PC (takes effect after a restart), so the
  others can use http://fms-host:48620. Give it a fixed address too: a DHCP
  reservation on the router for this PC's network card.
  Re-running it is safe: the service is stopped, updated and started again, and
  the data is never copied twice.
#>
[CmdletBinding()]
param(
  [string]$Nssm,
  [string]$FromAppData = (Join-Path $env:APPDATA 'FMS'),
  [string]$DataDir = (Join-Path $env:ProgramData 'FMS'),
  [string]$ServiceName = 'FMS',
  [string]$ServiceUser = 'fms-service',
  [switch]$Lan,
  [string]$HostName
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-Admin
$nssmExe = Find-Nssm $Nssm
$sourceApp = Split-Path $PSScriptRoot -Parent
Assert-AppFolder $sourceApp
if (Get-Process -Name 'FMS' -ErrorAction SilentlyContinue) {
  throw 'The FMS app is open. Close it (FMS menu -> Quit, or close the window) and run this again.'
}

# Stop an earlier install first: it holds its files and the data.
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne 'Stopped') {
  Step "stopping the running $ServiceName service (it uploads and backs up first)..."
  Stop-FmsService -Nssm $nssmExe -ServiceName $ServiceName
}

# 2. The app, in a folder of its own per version.
$version = (Get-Content (Join-Path $sourceApp 'package.json') -Raw | ConvertFrom-Json).version
$appDir = Copy-AppVersion -SourceApp $sourceApp -Version $version
Step "app $version in $appDir"
Save-Nssm $nssmExe

# 3. The service user.
$plain = New-ServicePassword
$password = ConvertTo-SecureString $plain -AsPlainText -Force
$existing = Get-LocalUser -Name $ServiceUser -ErrorAction SilentlyContinue
if ($existing) {
  Set-LocalUser -Name $ServiceUser -Password $password -PasswordNeverExpires $true
  Step "user $ServiceUser exists, password renewed"
} else {
  New-LocalUser -Name $ServiceUser -Password $password -PasswordNeverExpires -UserMayNotChangePassword `
    -AccountNeverExpires -Description 'Runs the FMS service (no administrator rights)' | Out-Null
  Step "user $ServiceUser created"
}
$admins = Get-LocalGroupMember -SID 'S-1-5-32-544' | Where-Object { $_.Name -match "\\$([regex]::Escape($ServiceUser))$" }
if ($admins) { throw "$ServiceUser is an administrator. Postgres will not start as one: remove it from Administrators and run this again." }

# 4. The data (D1): copy, verify, then switch - never in place.
$node = Join-Path $appDir 'tools\node.exe'
$hostJs = Join-Path $appDir 'host.js'
$isSetUp = Test-Path (Join-Path $DataDir 'pgdata\PG_VERSION')
if (-not $isSetUp) {
  if (-not (Test-Path (Join-Path $FromAppData 'pgdata\PG_VERSION'))) {
    throw "No FMS data in $DataDir or $FromAppData. On a new main PC run first:`n  `$env:FMS_DATA_DIR='$DataDir'; & '$node' '$hostJs' setup --code <setup code>`nthen this script again."
  }
  Step "copying $FromAppData -> $DataDir (the original is not changed)..."
  $env:FMS_DATA_DIR = $DataDir
  & $node $hostJs copy-data --from $FromAppData
  if ($LASTEXITCODE -ne 0) { throw 'copy-data failed (see above); nothing was switched.' }
} else {
  Step "using the FMS data already in $DataDir"
}

# 5. Only the service user (and SYSTEM / Administrators) may touch the data.
& icacls $DataDir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "${ServiceUser}:(OI)(CI)M" /T /C /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls could not set the permissions on $DataDir" }
& icacls $DataDir /setowner $ServiceUser /T /C /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls could not make $ServiceUser the owner of $DataDir" }
Step "$DataDir belongs to $ServiceUser"

# 6. The service.
$envExtra = @("FMS_DATA_DIR=$DataDir")
if ($Lan) { $envExtra += Get-LanEnvironment -HostName $HostName }
if (-not $svc) {
  & $nssmExe install $ServiceName $node | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "nssm install failed" }
}
Set-NssmApp -Nssm $nssmExe -ServiceName $ServiceName -AppDir $appDir
$settings = [ordered]@{
  DisplayName           = 'FMS (factory server)'
  Description           = 'FMS database, dashboard and upload to the online server. Data: ' + $DataDir
  Start                 = 'SERVICE_AUTO_START'
  # Ctrl+C first: host.js stops the backend, uploads (<= 45 s), backs up,
  # stops Postgres. 75 s before NSSM gives up and ends it.
  AppStopMethodSkip     = '0'
  AppStopMethodConsole  = '75000'
  AppStopMethodWindow   = '1000'
  AppStopMethodThreads  = '1000'
  AppKillProcessTree    = '1'
  AppExit               = @('Default', 'Restart')
  AppRestartDelay       = '10000'
  AppThrottle           = '30000'
  AppStdout             = (Join-Path $DataDir 'logs\service.log')
  AppStderr             = (Join-Path $DataDir 'logs\service.log')
  AppRotateFiles        = '1'
  AppRotateBytes        = '10485760'
}
foreach ($k in $settings.Keys) {
  & $nssmExe set $ServiceName $k @($settings[$k]) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "nssm set $k failed" }
}
& $nssmExe set $ServiceName AppEnvironmentExtra @envExtra | Out-Null
& $nssmExe set $ServiceName ObjectName ".\$ServiceUser" $plain | Out-Null
if ($LASTEXITCODE -ne 0) { throw "nssm could not set the service to run as $ServiceUser" }
# Windows shuts services down in ~5-20 s unless they take pre-shutdown; ask
# for 90 s in case NSSM does (the outbox and the database are safe either way).
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName" -Name PreshutdownTimeout -Value 90000 -Type DWord
Step "service $ServiceName registered (Automatic, runs as $ServiceUser)"

# 7. Start and wait.
& $nssmExe start $ServiceName | Out-Null
Wait-Dashboard -DataDir $DataDir
Assert-NoAdminRefusal -DataDir $DataDir
Write-ServiceMarker -DataDir $DataDir -ServiceName $ServiceName -AppDir $appDir
if ($Lan) { Enable-LanAccess -Node $node -HostName $HostName }
# The switch (D1): the app's old folder is never used again. pgdata there
# stays exactly as it was; this note is a new file next to it, and the app
# refuses to start on a folder that has it.
if (Test-Path (Join-Path $FromAppData 'pgdata')) {
  Set-Content -Encoding UTF8 (Join-Path $FromAppData 'MOVED-TO-SERVICE.txt') @"
This FMS data was copied to $DataDir on $(Get-Date -Format 'yyyy-MM-dd HH:mm') and is now run by the
Windows service "$ServiceName". This folder is the old copy: it is out of date and the FMS app will
not start on it. Keep it as a fallback until the service has run for a while, then delete it.
"@
  Step "$FromAppData marked as moved (its data is untouched)"
}

Write-Host ''
Write-Host 'Done. FMS now runs as a service, also with nobody logged in.' -ForegroundColor Green
Write-Host "  Data:       $DataDir   (owner: $((Get-Acl $DataDir).Owner))"
Write-Host "  Program:    $appDir"
Write-Host "  Log:        $(Join-Path $DataDir 'logs\fms.log')"
Write-Host "  Old data:   $FromAppData is unchanged; keep it until the service has run for a while."
Write-Host '  The FMS icon now just opens the dashboard. Updates: service\update-service.ps1'
