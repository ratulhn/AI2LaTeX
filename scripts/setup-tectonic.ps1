# Downloads the Tectonic LaTeX engine into tools/tectonic/.
#
# Tectonic is a self-contained XeTeX/LaTeX distribution (~50 MB). It is not
# committed to this repository because it is a binary, and it is not required
# to run the app: without it the backend falls back to a PyMuPDF preview
# renderer. Install it to produce real, publication-grade PDFs.
#
#   pwsh -File scripts/setup-tectonic.ps1
#
# On macOS/Linux use scripts/setup-tectonic.sh instead.

$ErrorActionPreference = "Stop"

$version = "0.17.0"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "tools/tectonic"
$exe = Join-Path $dest "tectonic.exe"

if (Test-Path $exe) {
    Write-Host "Tectonic already installed at $exe"
    & $exe --version
    exit 0
}

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "aarch64-pc-windows-msvc" } else { "x86_64-pc-windows-msvc" }
$url = "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40$version/tectonic-$version-$arch.zip"

Write-Host "Downloading Tectonic $version ($arch)..."
Write-Host "  $url"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
$zip = Join-Path $env:TEMP "tectonic-$version.zip"

try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
} catch {
    Write-Error "Download failed: $($_.Exception.Message)"
    Write-Host "Download the archive manually from:"
    Write-Host "  https://github.com/tectonic-typesetting/tectonic/releases"
    Write-Host "and extract tectonic.exe into: $dest"
    exit 1
}

if (-not (Test-Path $exe)) {
    Write-Error "Expected $exe after extraction, but it is missing."
    exit 1
}

Write-Host ""
Write-Host "Installed:"
& $exe --version
Write-Host ""
Write-Host "The first compile downloads TeX packages into tools/tectonic-cache/"
Write-Host "(about 45 MB, cached afterwards)."
