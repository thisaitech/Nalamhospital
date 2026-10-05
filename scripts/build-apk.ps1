# Build a release APK on Windows for local testing.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BuildRoot = if ($env:NALAM_APK_BUILD_ROOT) { $env:NALAM_APK_BUILD_ROOT } else { "D:\nalam-apk-build" }

$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$env:GRADLE_USER_HOME = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { "D:\gradle-cache" }
$env:TEMP = "D:\build-tmp"
$env:TMP = "D:\build-tmp"
$env:CI = "1"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"

New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME, $env:TEMP, $BuildRoot | Out-Null

if (-not (Test-Path "$env:ANDROID_HOME\platform-tools")) {
  Write-Error "Android SDK not found at $env:ANDROID_HOME. Install Android Studio or set ANDROID_HOME."
}

Write-Host "Syncing project to $BuildRoot (excluding android/node_modules/.git)..."
robocopy $Root $BuildRoot /MIR /XD android node_modules .git releases /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
  Write-Error "robocopy failed (exit $LASTEXITCODE)"
}

Set-Location $BuildRoot
Write-Host "Syncing node_modules from project root..."
robocopy (Join-Path $Root "node_modules") (Join-Path $BuildRoot "node_modules") /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
  Write-Error "node_modules sync failed (exit $LASTEXITCODE)"
}
if (-not (Test-Path (Join-Path $BuildRoot "node_modules\expo-build-properties"))) {
  Write-Host "Installing missing packages in build tree..."
  npm install --ignore-scripts
  if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install failed in $BuildRoot"
  }
}

# Do not add babel.config.js — babel-preset-expo already configures Reanimated/Worklets.

Write-Host "Running expo prebuild..."
$env:NODE_ENV = "production"
npx expo prebuild --platform android --no-install

$gradleProps = Join-Path $BuildRoot "android\gradle.properties"
if (Test-Path $gradleProps) {
  $text = Get-Content $gradleProps -Raw
  if ($text -notmatch 'expo.useLegacyPackaging=true') {
    $text = $text -replace 'expo.useLegacyPackaging=false', 'expo.useLegacyPackaging=true'
  }
  $text = $text -replace 'newArchEnabled=true', 'newArchEnabled=false'
  $text = $text -replace 'edgeToEdgeEnabled=true', 'edgeToEdgeEnabled=false'
  $text = $text -replace 'reactNativeArchitectures=.*', 'reactNativeArchitectures=armeabi-v7a,arm64-v8a'
  $javaHomeEscaped = $env:JAVA_HOME -replace '\\', '/'
  if ($text -notmatch 'org.gradle.java.home=') {
    $text += "`norg.gradle.java.home=$javaHomeEscaped`n"
  }
  Set-Content -Path $gradleProps -Value $text -NoNewline
}

$appGradle = Join-Path $BuildRoot "android\app\build.gradle"
if (Test-Path $appGradle) {
  $gradleText = Get-Content $appGradle -Raw
  if ($gradleText -notmatch 'multiDexEnabled true') {
    $gradleText = $gradleText -replace '(versionName "[^"]+")', "`$1`n        multiDexEnabled true"
    Set-Content -Path $appGradle -Value $gradleText -NoNewline
  }
}

Write-Host "Building release APK (armeabi-v7a + arm64-v8a)..."
Set-Location "$BuildRoot\android"

$gradleSearchRoots = @(
  "$env:GRADLE_USER_HOME\wrapper\dists\gradle-9.3.1-bin",
  "$env:USERPROFILE\.gradle\wrapper\dists\gradle-9.3.1-bin"
)
$gradleCandidates = $null
foreach ($root in $gradleSearchRoots) {
  $gradleCandidates = Get-ChildItem "$root\*\gradle-9.3.1\bin\gradle.bat" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($gradleCandidates) { break }
}

$gradlew = Join-Path $BuildRoot "android\gradlew.bat"
if (Test-Path $gradlew) {
  & $gradlew assembleRelease --no-daemon --max-workers=1 `
    -x lintVitalAnalyzeRelease -x lint "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"
} elseif ($gradleCandidates) {
  & $gradleCandidates.FullName assembleRelease --no-daemon --max-workers=1 `
    -x lintVitalAnalyzeRelease -x lint "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"
} else {
  Write-Error "Gradle not found. Run prebuild successfully first, or install Gradle 9.3.1."
}
if ($LASTEXITCODE -ne 0) {
  Write-Error "Gradle build failed (exit $LASTEXITCODE). Free disk space on C: and D: (need ~5 GB), then retry."
}

$version = (Get-Content "$BuildRoot\app.json" | ConvertFrom-Json).expo.version
$destDir = Join-Path $Root "releases"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$apkSrc = Join-Path $BuildRoot "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkSrc)) {
  Write-Error "Release APK not found at $apkSrc"
}
$apkDest = Join-Path $destDir "nalam-healthcare-v$version.apk"
Copy-Item $apkSrc $apkDest -Force

Write-Host ""
Write-Host "APK built successfully:"
Write-Host "  $apkDest"
Get-Item $apkDest | Format-List Name, Length, LastWriteTime
