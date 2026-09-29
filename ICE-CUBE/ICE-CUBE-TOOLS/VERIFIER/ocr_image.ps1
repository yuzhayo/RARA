# ocr_image.ps1 - OCR one image with the Windows built-in engine, and report
# whether it looks like a Timemark-camera photo plus the date it carries.
#
#   powershell -NoProfile -File ocr_image.ps1 "C:\path\to\image.jpeg"
#
# Output is a single JSON line on stdout.
#
# NOTE: deliberately pure ASCII. Windows PowerShell 5.1 reads .ps1 as ANSI unless
# the file has a UTF-8 BOM, so non-ASCII characters corrupt string parsing.

param(
  [Parameter(Mandatory=$true)][string]$Path
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

# Await helper: PowerShell cannot await WinRT IAsyncOperation directly.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

$out = [ordered]@{
  path          = $Path
  ok            = $false
  error         = $null
  timemark      = $false
  date_iso      = $null
  date_raw      = $null
  text          = ""
}

try {
  $file    = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
  $stream  = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap  = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

  $engine  = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language "en-US"))
  }
  if ($null -eq $engine) { throw "no OCR engine available" }

  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $text = $result.Text
  $out.text = $text
  $out.ok = $true

  # --- Timemark detection -------------------------------------------------
  # The Timestamp Camera app stamps these. Any one is a strong signal.
  if ($text -match '(?i)timemark|kode foto|foto 100|timemark verified') {
    $out.timemark = $true
  }

  # --- date extraction ----------------------------------------------------
  # e.g. "Jumat, 25 September 2026" or "25 September 2026"
  $months = 'Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember'
  $m = [regex]::Match($text, "(?i)\b(\d{1,2})\s+($months)\s+(\d{4})\b")
  if ($m.Success) {
    $day = [int]$m.Groups[1].Value
    $monName = $m.Groups[2].Value
    $yr = [int]$m.Groups[3].Value
    $map = @{
      'januari'=1; 'februari'=2; 'maret'=3; 'april'=4; 'mei'=5; 'juni'=6;
      'juli'=7; 'agustus'=8; 'september'=9; 'oktober'=10; 'november'=11; 'desember'=12
    }
    $mon = $map[$monName.ToLower()]
    if ($mon) {
      $out.date_iso = ('{0:d4}-{1:d2}-{2:d2}' -f $yr, $mon, $day)
      $out.date_raw = $m.Value
    }
  }

  # numeric fallback: 25/09/2026 or 25-09-2026
  if (-not $out.date_iso) {
    $m2 = [regex]::Match($text, '\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b')
    if ($m2.Success) {
      $out.date_iso = ('{0:d4}-{1:d2}-{2:d2}' -f [int]$m2.Groups[3].Value, [int]$m2.Groups[2].Value, [int]$m2.Groups[1].Value)
      $out.date_raw = $m2.Value
    }
  }
} catch {
  $out.error = $_.Exception.Message
}

$out | ConvertTo-Json -Compress
