<#
  Updates the FMS service to a new version (SYNC-HARDENING-PLAN.md D4, T3.1/T3.2).
  Once FMS runs as a service, the app's own automatic update no longer
  applies; this is the update path. In PowerShell **as Administrator**:

    & "C:\Program Files\FMS Service\app-<current>\service\update-service.ps1" -Installer "D:\FMS-Setup-1.0.4.exe"

  Rule 1 still holds: deploy the VPS (migrations included) before updating the
  factory. The new version runs its migrations on the factory database when it
  starts.

  1. -Installer: installs that FMS-Setup-<version>.exe silently for this user
     (the FMS window app, which on this PC only opens the dashboard), then takes
     its app folder. Without -Installer it takes the already installed one, or
     -From <app folder>.
  2. copies it to "C:\Program Files\FMS Service\app-<version>" (the running
     version is not touched)
  3. stops the service (it uploads and backs up first), points it at the new
     version, starts it, waits for the dashboard
  4. if the new version doesn't come up within 2 minutes: back to the previous
     version, started again, and the update is reported as failed
  5. keeps the previous version's folder for a manual rollback, removes older ones
#>
[CmdletBinding()]
param(
  [string]$Installer,
  [string]$From,
  [string]$Nssm
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-Admin
$marker = Read-ServiceMarker
$nssmExe = Find-Nssm $Nssm
$service = $marker.serviceName
$oldApp = $marker.appDir

if ($Installer) {
  if (-not (Test-Path $Installer)) { throw "$Installer not found." }
  Step "installing $(Split-Path $Installer -Leaf) for this user..."
  $p = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "the installer exited with code $($p.ExitCode)" }
}
if (-not $From) { $From = Find-InstalledApp }
if (-not $From) { throw 'Could not find the installed FMS app. Pass -Installer <FMS-Setup-x.exe> or -From <app folder>.' }
Assert-AppFolder $From
$version = (Get-Content (Join-Path $From 'package.json') -Raw | ConvertFrom-Json).version
$current = (Get-Content (Join-Path $oldApp 'package.json') -Raw | ConvertFrom-Json).version
if ($version -eq $current) { Step "the service already runs $version; nothing to do"; return }
Step "updating the service from $current to $version"

$newApp = Copy-AppVersion -SourceApp $From -Version $version
Step "app $version in $newApp"

Step 'stopping the service (it uploads and backs up first)...'
Stop-FmsService -Nssm $nssmExe -ServiceName $service
Set-NssmApp -Nssm $nssmExe -ServiceName $service -AppDir $newApp
& $nssmExe start $service | Out-Null
try {
  Wait-Dashboard -DataDir $marker.dataDir
  Assert-NoAdminRefusal -DataDir $marker.dataDir
} catch {
  Write-Host "The new version did not start: $($_.Exception.Message)" -ForegroundColor Red
  Step "going back to $current..."
  Stop-FmsService -Nssm $nssmExe -ServiceName $service
  Set-NssmApp -Nssm $nssmExe -ServiceName $service -AppDir $oldApp
  & $nssmExe start $service | Out-Null
  Wait-Dashboard -DataDir $marker.dataDir
  throw "Update to $version failed; the service runs $current again. See $(Join-Path $marker.dataDir 'logs\fms.log')."
}
Write-ServiceMarker -DataDir $marker.dataDir -ServiceName $service -AppDir $newApp

# Keep the new and the previous version only.
Get-ChildItem $script:ProgramRoot -Directory -Filter 'app-*' |
  Where-Object { $_.FullName -ne $newApp -and $_.FullName -ne $oldApp } |
  ForEach-Object { Remove-Item -Recurse -Force $_.FullName; Step "removed $($_.Name)" }

Write-Host ''
Write-Host "Done: the FMS service runs $version. $current is kept in $oldApp for a manual rollback." -ForegroundColor Green
