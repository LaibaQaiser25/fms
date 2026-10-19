# Shared by install-service.ps1, update-service.ps1 and remove-service.ps1 (T3.2).

$script:ProgramRoot = Join-Path $env:ProgramFiles 'FMS Service'
$script:MarkerFile = Join-Path $env:ProgramData 'FMS-service.json'
$script:DashboardUrl = 'http://127.0.0.1:48620'

function Step([string]$Message) { Write-Host "-> $Message" }

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this in PowerShell opened with "Run as administrator".'
  }
}

# D14: NSSM 2.24 (https://nssm.cc/download, win64\nssm.exe), or `winget install NSSM.NSSM`.
function Find-Nssm([string]$Given) {
  $candidates = @($Given, (Join-Path $PSScriptRoot 'nssm.exe'), (Join-Path $script:ProgramRoot 'nssm.exe')) | Where-Object { $_ }
  foreach ($c in $candidates) { if (Test-Path $c) { return (Resolve-Path $c).Path } }
  $cmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'nssm.exe not found. Download NSSM 2.24 from https://nssm.cc/download and put win64\nssm.exe next to this script (or pass -Nssm <path>, or: winget install NSSM.NSSM).'
}

function Assert-AppFolder([string]$App) {
  foreach ($f in @('host.js', 'package.json', 'tools\node.exe', 'tools\pg_dump.exe', 'staged\backend\server.js', 'staged\frontend\index.html')) {
    if (-not (Test-Path (Join-Path $App $f))) { throw "$App is not an FMS app folder ($f missing). Use the one inside the installed FMS: <install>\resources\app." }
  }
}

function New-ServicePassword {
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  # Letters, digits and a symbol, so it passes the local password policy.
  return 'Fms!' + ([Convert]::ToBase64String($bytes) -replace '[+/=]', 'x')
}

# Copies <install>\resources\app to "C:\Program Files\FMS Service\app-<version>",
# through a .partial folder, so a half-copied version is never used.
function Copy-AppVersion([string]$SourceApp, [string]$Version) {
  $dest = Join-Path $script:ProgramRoot "app-$Version"
  $partial = "$dest.partial"
  New-Item -ItemType Directory -Force -Path $script:ProgramRoot | Out-Null
  if (Test-Path $partial) { Remove-Item -Recurse -Force $partial }
  & robocopy $SourceApp $partial /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "copying the app to $partial failed (robocopy $LASTEXITCODE)" }
  Assert-AppFolder $partial
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Rename-Item $partial (Split-Path $dest -Leaf)
  return $dest
}

# The service gets up to 75 s to drain (AppStopMethodConsole); wait for it.
function Stop-FmsService([string]$Nssm, [string]$ServiceName) {
  & $Nssm stop $ServiceName | Out-Null
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Service -Name $ServiceName).Status -ne 'Stopped') {
    if ((Get-Date) -gt $deadline) { throw "$ServiceName did not stop within 120 s." }
    Start-Sleep -Seconds 1
  }
}

function Set-NssmApp([string]$Nssm, [string]$ServiceName, [string]$AppDir) {
  & $Nssm set $ServiceName Application (Join-Path $AppDir 'tools\node.exe') | Out-Null
  & $Nssm set $ServiceName AppParameters ('"' + (Join-Path $AppDir 'host.js') + '"') | Out-Null
  & $Nssm set $ServiceName AppDirectory $AppDir | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "nssm could not point $ServiceName at $AppDir" }
}

# Resolves when GET / answers; throws with the end of the logs if it doesn't.
function Wait-Dashboard([string]$DataDir, [int]$Seconds = 120) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "$script:DashboardUrl/" | Out-Null
      Step "the dashboard answers on $script:DashboardUrl"
      return
    } catch { Start-Sleep -Seconds 2 }
  }
  $log = Join-Path $DataDir 'logs\fms.log'
  if (Test-Path $log) { Get-Content $log -Tail 25 | ForEach-Object { Write-Host "   $_" } }
  throw "The service did not answer on $script:DashboardUrl within $Seconds s (log: $log)."
}

# Check 2 of T3.2: Postgres refuses an administrative account with this line.
function Assert-NoAdminRefusal([string]$DataDir) {
  $log = Join-Path $DataDir 'logs\fms.log'
  $hit = Select-String -Path $log -Pattern 'administrative permissions|must not run with administrative|Execution of PostgreSQL by a user with administrative' -SimpleMatch:$false -ErrorAction SilentlyContinue | Select-Object -Last 1
  if ($hit) { throw "Postgres refused the account: $($hit.Line)" }
  Step 'Postgres log: no administrative-account refusal'
}

function Write-ServiceMarker([string]$DataDir, [string]$ServiceName, [string]$AppDir) {
  [ordered]@{
    serviceName = $ServiceName
    dataDir     = $DataDir
    appDir      = $AppDir
    url         = $script:DashboardUrl
    installedAt = (Get-Date).ToString('o')
  } | ConvertTo-Json | Set-Content -Encoding UTF8 $script:MarkerFile
  Step "$script:MarkerFile written (the FMS app now opens the service's dashboard)"
}

# Keeps nssm.exe next to the versions, so update/remove find it later.
function Save-Nssm([string]$Nssm) {
  $kept = Join-Path $script:ProgramRoot 'nssm.exe'
  if ((Resolve-Path $Nssm).Path -ne $kept) { Copy-Item -Force $Nssm $kept }
}

function Read-ServiceMarker {
  if (-not (Test-Path $script:MarkerFile)) { throw "FMS is not installed as a service on this PC ($script:MarkerFile missing). Use install-service.ps1." }
  return Get-Content $script:MarkerFile -Raw | ConvertFrom-Json
}

# Where the per-user FMS app is installed (electron-builder writes it here).
function Find-InstalledApp {
  $keys = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue
  foreach ($k in $keys) {
    $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
    if ($p.DisplayName -eq 'FMS' -and $p.InstallLocation) { return (Join-Path $p.InstallLocation 'resources\app') }
  }
  return $null
}

# ---- T3.3: the dashboard on the factory network ----------------------------

$script:LanRule = 'FMS dashboard (factory network)'

# The backend listens on every interface; the dashboard's own origins (by
# name and by each IPv4 address) are allowed for CORS. The frontend calls
# the API on the same origin it was loaded from (T3.4), so these are a
# safety net.
function Get-LanEnvironment([string]$HostName) {
  $names = @($env:COMPUTERNAME.ToLower())
  if ($HostName) { $names += $HostName.ToLower() }
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress
  $origins = @($names + $ips | Select-Object -Unique | ForEach-Object { "http://${_}:48620" })
  return @('FMS_BIND_HOST=0.0.0.0', "FMS_LAN_ORIGINS=$($origins -join ',')")
}

function Enable-LanAccess([string]$Node, [string]$HostName) {
  Get-NetFirewallRule -DisplayName $script:LanRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $script:LanRule -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort 48620 -Profile Private -RemoteAddress LocalSubnet -Program $Node | Out-Null
  Step "firewall: TCP 48620 open to the local subnet on Private networks (only for $Node)"
  $public = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' }
  foreach ($p in $public) {
    Write-Host "   NOTE: the network '$($p.Name)' ($($p.InterfaceAlias)) is set to Public, so the other PCs can't connect through it." -ForegroundColor Yellow
    Write-Host "   If it is the factory network, run: Set-NetConnectionProfile -InterfaceAlias '$($p.InterfaceAlias)' -NetworkCategory Private" -ForegroundColor Yellow
  }
  if ($HostName -and $env:COMPUTERNAME -ne $HostName) {
    Rename-Computer -NewName $HostName -Force | Out-Null
    Step "this PC will be called $HostName after the next restart"
  }
  $ips = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }).IPAddress -join ', '
  Step "other factory PCs: http://$(if ($HostName) { $HostName } else { $env:COMPUTERNAME }):48620  (or by address: $ips)"
}

function Disable-LanAccess {
  Get-NetFirewallRule -DisplayName $script:LanRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
