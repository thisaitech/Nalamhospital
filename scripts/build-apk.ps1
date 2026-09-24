# Build a release APK on Windows for local testing.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$env:GRADLE_USER_HOME = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { "D:\gradle-cache" }
$env:TEMP = "D:\build-tmp"
$env:TMP = "D:\build-tmp"
$env:NODE_ENV = "production"
$env:CI = "1"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"

New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME, $env:TEMP | Out-Null

if (-not (Test-Path "$env:ANDROID_HOME\platform-tools")) {
  Write-Error "Android SDK not found at $env:ANDROID_HOME. Install Android Studio or set ANDROID_HOME."
}

Write-Host "Running expo prebuild..."
npx expo prebuild --platform android --no-install

Write-Host "Building release APK (arm64)..."
Set-Location "$Root\android"

# Prefer cached Gradle when wrapper zip download fails on slow networks.
$gradleBat = Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\gradle-9.3.1-bin\*\gradle-9.3.1\bin\gradle.bat" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($gradleBat) {
  & $gradleBat.FullName assembleRelease --no-daemon --max-workers=1 `
    -x lintVitalAnalyzeRelease -x lint -PreactNativeArchitectures=arm64-v8a
} else {
  .\gradlew.bat assembleRelease --no-daemon --max-workers=1 `
    -x lintVitalAnalyzeRelease -x lint -PreactNativeArchitectures=arm64-v8a
}
if ($LASTEXITCODE -ne 0) {
  Write-Error "Gradle build failed (exit $LASTEXITCODE). Free disk space on C: and D: (need ~5 GB), then retry."
}

$version = (Get-Content "$Root\app.json" | ConvertFrom-Json).expo.version
$destDir = Join-Path $Root "releases"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$apkSrc = Join-Path $Root "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkSrc)) {
  Write-Error "Release APK not found at $apkSrc"
}
$apkDest = Join-Path $destDir "nalam-healthcare-v$version.apk"
Copy-Item $apkSrc $apkDest -Force

Write-Host ""
Write-Host "APK built successfully:"
Write-Host "  $apkDest"
Get-Item $apkDest | Format-List Name, Length, LastWriteTime
