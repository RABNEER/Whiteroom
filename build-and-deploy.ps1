# ─────────────────────────────────────────────────────────────────────────────
# Whiteroom - Build & Deploy APK
# Run: .\build-and-deploy.ps1
# Run with version bump: .\build-and-deploy.ps1 -Version "1.0.2"
# ─────────────────────────────────────────────────────────────────────────────

param(
    [string]$Version = "",
    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"

$APK_SOURCE     = "apps\mobile\android\app\build\outputs\apk\release\app-release.apk"
$APP_JSON_PATH  = "apps\mobile\app.json"
$GDRIVE_PATH    = "G:\My Drive\Whiteroom"
$APK_DEST_NAME  = "whiteroom-latest.apk"
$ANDROID_HOME   = "$env:LOCALAPPDATA\Android\Sdk"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  WHITEROOM - Build & Deploy" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Step 1: Bump Version (optional)
if ($Version -ne "") {
    Write-Host "Bumping version to $Version ..." -ForegroundColor Yellow
    $appJson = Get-Content $APP_JSON_PATH -Raw | ConvertFrom-Json
    $appJson.expo.version = $Version
    $appJson.expo.runtimeVersion = $Version
    $appJson | ConvertTo-Json -Depth 20 | Set-Content $APP_JSON_PATH -Encoding UTF8
    Write-Host "   app.json updated to $Version" -ForegroundColor Green

    $gradlePath = "apps\mobile\android\app\build.gradle"
    if (Test-Path $gradlePath) {
        $parts = $Version -split "\."
        $versionCode = [int]$parts[0] * 10000 + [int]$parts[1] * 100 + [int]$parts[2]
        $gradle = Get-Content $gradlePath -Raw
        $gradle = $gradle -replace 'versionCode\s+\d+', "versionCode $versionCode"
        $gradle = $gradle -replace 'versionName\s+"[^"]+"', "versionName `"$Version`""
        Set-Content $gradlePath $gradle -Encoding UTF8
        Write-Host "   build.gradle updated (versionCode=$versionCode)" -ForegroundColor Green
    }
}

# Step 2: Build APK
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "Building release APK..." -ForegroundColor Yellow
    Push-Location "apps\mobile\android"
    try {
        & ".\gradlew.bat" assembleRelease --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "Gradle build failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
    Write-Host "   Build complete!" -ForegroundColor Green
} else {
    Write-Host "Skipping build (using existing APK)" -ForegroundColor DarkYellow
}

# Step 3: Verify APK Exists
if (-not (Test-Path $APK_SOURCE)) {
    Write-Host "APK not found at: $APK_SOURCE" -ForegroundColor Red
    exit 1
}

$apkSize = (Get-Item $APK_SOURCE).Length / 1MB
Write-Host ""
Write-Host "APK found: $([math]::Round($apkSize, 1)) MB" -ForegroundColor Cyan

# Step 4: Deploy to Google Drive
Write-Host ""
Write-Host "Deploying to Google Drive..." -ForegroundColor Yellow

if (-not (Test-Path $GDRIVE_PATH)) {
    Write-Host "   WARNING: Google Drive path not found: $GDRIVE_PATH" -ForegroundColor DarkYellow
    Write-Host "   Make sure Google Drive for Desktop is running." -ForegroundColor DarkYellow
} else {
    $destPath = Join-Path $GDRIVE_PATH $APK_DEST_NAME
    Copy-Item $APK_SOURCE $destPath -Force
    Write-Host "   Copied to: $destPath" -ForegroundColor Green
    Write-Host "   Live at: https://apps.whiteroom.co.in/api/v1/storage/files/whiteroom-latest.apk" -ForegroundColor Cyan
}

# Step 5: Install on connected device (optional)
$adbPath = "$ANDROID_HOME\platform-tools\adb.exe"
if (Test-Path $adbPath) {
    $devices = & $adbPath devices 2>&1 | Select-String "device$"
    if ($devices.Count -gt 0) {
        Write-Host ""
        $install = Read-Host "Device detected! Install APK on phone? (y/N)"
        if ($install -eq "y" -or $install -eq "Y") {
            & $adbPath install -r $APK_SOURCE
            Write-Host "   Installed on device!" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  DONE! APK is live for users to download." -ForegroundColor Green
Write-Host "  https://apps.whiteroom.co.in/api/v1/storage/files/whiteroom-latest.apk" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
