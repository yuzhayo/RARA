# ocr_words.ps1 - OCR an image and emit each recognised WORD with its bounding box.
#
#   powershell -NoProfile -File ocr_words.ps1 "C:\path\image.jpeg"
#
# Why: the full-frame pass mangles small/low-contrast overlay text. With word
# boxes we can find roughly where the date is, then crop that region and re-OCR
# it at high magnification. Two-pass OCR.
#
# ASCII only - PowerShell 5.1 reads .ps1 as ANSI without a BOM.

param(
  [Parameter(Mandatory=$true)][string]$Path
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

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

$file    = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream  = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap  = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine  = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$result  = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$words = @()
foreach ($line in $result.Lines) {
  foreach ($w in $line.Words) {
    $r = $w.BoundingRect
    $words += [ordered]@{
      t = $w.Text
      x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height
    }
  }
}

[ordered]@{
  imageW = [int]$bitmap.PixelWidth
  imageH = [int]$bitmap.PixelHeight
  words  = $words
} | ConvertTo-Json -Depth 5 -Compress
