<#
  Removes the FMS Windows service (T3.2). In PowerShell **as Administrator**.

  The service is stopped first (it uploads and backs up), then removed. The data
  in C:\ProgramData\FMS, the program versions and the fms-service user stay -
  removing the service never deletes data. -RemoveUser also deletes the user.

  The FMS app does NOT go back to its old %APPDATA%\FMS folder by itself: that
  copy is out of date (MOVED-TO-SERVICE.txt). Install the service again with
  install-service.ps1 to use the data.
#>
[CmdletBinding()]
param(
  [string]$Nssm,
  [switch]$RemoveUser,
  [string]$ServiceUser = 'fms-service'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Assert-Admin
$marker = Read-ServiceMarker
$nssmExe = Find-Nssm $Nssm
Step 'stopping the service (it uploads and backs up first)...'
Stop-FmsService -Nssm $nssmExe -ServiceName $marker.serviceName
& $nssmExe remove $marker.serviceName confirm | Out-Null
if ($LASTEXITCODE -ne 0) { throw "nssm could not remove $($marker.serviceName)" }
Remove-Item $script:MarkerFile
Step "service $($marker.serviceName) removed; data kept in $($marker.dataDir)"
if ($RemoveUser) {
  Remove-LocalUser -Name $ServiceUser
  Step "user $ServiceUser removed"
}
