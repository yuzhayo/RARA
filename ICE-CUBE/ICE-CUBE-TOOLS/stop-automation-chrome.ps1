# stop-automation-chrome.ps1
#
# Stops the DEDICATED automation Chrome, and ONLY that one. Your normal Chrome
# is not touched: it runs from the default profile path, and this matches on the
# automation profile path only.
#
# ---------------------------------------------------------------------------
# >!< NEVER FORCE-KILL CHROME.
#
# CloseMainWindow() asks it to close, the way clicking the X does. That is the
# only safe way. `Stop-Process -Force` and `taskkill /F` during shutdown can
# corrupt profile state - doing exactly that destroyed a Google sign-in once
# already, on 2026-09-26.
#
# If the processes do not go away, this script says so and stops. Closing the
# window by hand is then the answer, not a bigger hammer.
# ---------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

# <RARA>\BROWSER-AUTOMATION, derived - never written down.
$tools   = Split-Path -Parent $MyInvocation.MyCommand.Path
$rara    = Split-Path -Parent (Split-Path -Parent $tools)
$profile = Join-Path $rara 'BROWSER-AUTOMATION'

function Get-AutomationChrome {
    @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine -like "*$profile*" })
}

Write-Host ''
Write-Host '  ============================================'
Write-Host '   ICE CUBE - stop automation browser'
Write-Host '  ============================================'
Write-Host ''
Write-Host "  profile : $profile"
Write-Host ''

$running = Get-AutomationChrome
if ($running.Count -eq 0) {
    Write-Host '  Nothing is running for this profile.'
    Write-Host ''
    exit 0
}

Write-Host ("  {0} process(es) belong to this profile." -f $running.Count)
Write-Host '  Asking them to close (CloseMainWindow - not a force-kill)...'
Write-Host ''

foreach ($p in $running) {
    try {
        $proc = Get-Process -Id $p.ProcessId -ErrorAction Stop
        # Only a process with a window answers; the helpers go when it does.
        if ($proc.MainWindowHandle -ne 0) { $proc.CloseMainWindow() | Out-Null }
    } catch { }
}

# Poll until they are GENUINELY gone. A force-kill would be instant and is
# exactly what must not happen, so this waits instead.
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 750
    if ((Get-AutomationChrome).Count -eq 0) {
        Write-Host '  Stopped. All processes for this profile are gone.'
        Write-Host ''
        exit 0
    }
}

$left = Get-AutomationChrome
Write-Host ("  STILL RUNNING: {0} process(es) did not close." -f $left.Count)
Write-Host '  NOT forcing them - a force-kill can corrupt the profile.'
Write-Host '  Close the automation Chrome window by hand, then run this again.'
Write-Host ''
foreach ($p in $left) {
    Write-Host ("    pid {0}  {1}" -f $p.ProcessId, $p.CommandLine.Substring(0, [Math]::Min(90, $p.CommandLine.Length)))
}
Write-Host ''
exit 1
