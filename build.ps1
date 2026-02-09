<#
.SYNOPSIS
    Packages the SpendGuard Chrome extension for Chrome Web Store upload.

.DESCRIPTION
    Reads manifest.json to extract short_name and version, then creates a zip
    containing ONLY the extension files (no docs/, README, .git, etc.).
    Output: dist/{short_name}-{version}-{yyyyMMdd-HHmmss}.zip

.EXAMPLE
    .\build.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$manifestPath = Join-Path $projectRoot 'manifest.json'

# ── Read manifest.json ────────────────────────────────────────────────────────
if (-not (Test-Path $manifestPath)) {
    Write-Error "manifest.json not found at: $manifestPath"
    exit 1
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

$shortName = $manifest.short_name
$version   = $manifest.version

if (-not $shortName -or -not $version) {
    Write-Error "Could not read short_name or version from manifest.json"
    exit 1
}

# ── Collect extension files dynamically from manifest ─────────────────────────
$files = [System.Collections.Generic.HashSet[string]]::new()

# manifest.json itself
[void]$files.Add('manifest.json')

# Service worker
if ($manifest.PSObject.Properties['background'] -and $manifest.background.PSObject.Properties['service_worker']) {
    [void]$files.Add($manifest.background.service_worker)
}

# Icons
if ($manifest.icons) {
    $manifest.icons.PSObject.Properties | ForEach-Object {
        [void]$files.Add($_.Value)
    }
}

# Content scripts
if ($manifest.PSObject.Properties['content_scripts']) {
    foreach ($cs in $manifest.content_scripts) {
        if ($cs.PSObject.Properties['js']) {
            foreach ($jsFile in $cs.js) {
                [void]$files.Add($jsFile)
            }
        }
        if ($cs.PSObject.Properties['css']) {
            foreach ($cssFile in $cs.css) {
                [void]$files.Add($cssFile)
            }
        }
    }
}

# Web accessible resources
if ($manifest.PSObject.Properties['web_accessible_resources']) {
    foreach ($war in $manifest.web_accessible_resources) {
        if ($war.PSObject.Properties['resources']) {
            foreach ($res in $war.resources) {
                [void]$files.Add($res)
            }
        }
    }
}

# ── Validate all files exist ──────────────────────────────────────────────────
$missing = @()
foreach ($f in $files) {
    $fullPath = Join-Path $projectRoot $f
    if (-not (Test-Path $fullPath)) {
        $missing += $f
    }
}

if ($missing.Count -gt 0) {
    Write-Error "Missing files referenced in manifest.json:`n  $($missing -join "`n  ")"
    exit 1
}

# ── Build zip ─────────────────────────────────────────────────────────────────
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipName   = "$shortName-$version-$timestamp.zip"
$distDir   = Join-Path $projectRoot 'dist'
$zipPath   = Join-Path $distDir $zipName

# Ensure dist/ exists
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

# Create a temp staging folder
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "spendguard-build-$timestamp"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    # Copy each file preserving directory structure
    foreach ($f in $files) {
        $src = Join-Path $projectRoot $f
        $dst = Join-Path $tempDir $f
        $dstDir = Split-Path $dst -Parent

        if (-not (Test-Path $dstDir)) {
            New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
        }

        Copy-Item -Path $src -Destination $dst
    }

    # Create the zip
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }

    Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

    # ── Summary ───────────────────────────────────────────────────────────────
    $zipSize = (Get-Item $zipPath).Length
    $sizeKB  = [math]::Round($zipSize / 1024, 1)

    Write-Host ''
    Write-Host '  ╔══════════════════════════════════════════════════════╗' -ForegroundColor Green
    Write-Host '  ║         Extension packaged successfully!            ║' -ForegroundColor Green
    Write-Host '  ╚══════════════════════════════════════════════════════╝' -ForegroundColor Green
    Write-Host ''
    Write-Host "  Name:     $($manifest.name)" -ForegroundColor Cyan
    Write-Host "  Version:  $version" -ForegroundColor Cyan
    Write-Host "  Files:    $($files.Count)" -ForegroundColor Cyan
    Write-Host "  Size:     $sizeKB KB" -ForegroundColor Cyan
    Write-Host "  Output:   $zipPath" -ForegroundColor Yellow
    Write-Host ''

    # List included files
    Write-Host '  Included files:' -ForegroundColor DarkGray
    $files | Sort-Object | ForEach-Object {
        Write-Host "    - $_" -ForegroundColor DarkGray
    }
    Write-Host ''
}
finally {
    # Cleanup temp folder
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force
    }
}
