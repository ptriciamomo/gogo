# Script to delete Android Studio leftover folders
# Run this in PowerShell as Administrator

Write-Host "Deleting Android Studio leftover folders..." -ForegroundColor Yellow

# Delete Android SDK folder
$sdkPath = "C:\Users\patricia\AppData\Local\Android\Sdk"
if (Test-Path $sdkPath) {
    Write-Host "Deleting: $sdkPath" -ForegroundColor Cyan
    Remove-Item -Path $sdkPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Deleted SDK folder" -ForegroundColor Green
} else {
    Write-Host "SDK folder not found" -ForegroundColor Gray
}

# Delete Android Studio folder
$studioPath = "C:\Users\patricia\AppData\Local\Android Studio"
if (Test-Path $studioPath) {
    Write-Host "Deleting: $studioPath" -ForegroundColor Cyan
    Remove-Item -Path $studioPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Deleted Android Studio folder" -ForegroundColor Green
} else {
    Write-Host "Android Studio folder not found" -ForegroundColor Gray
}

# Delete .android folder
$androidPath = "C:\Users\patricia\.android"
if (Test-Path $androidPath) {
    Write-Host "Deleting: $androidPath" -ForegroundColor Cyan
    Remove-Item -Path $androidPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Deleted .android folder" -ForegroundColor Green
} else {
    Write-Host ".android folder not found" -ForegroundColor Gray
}

Write-Host "`nDone! All Android Studio folders have been deleted." -ForegroundColor Green
Write-Host "You can now reinstall Android Studio." -ForegroundColor Yellow
















