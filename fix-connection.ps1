# Fix Expo Connection Issues
# This script adds a Windows Firewall rule to allow Expo Metro Bundler connections

Write-Host "Fixing Expo connection..." -ForegroundColor Green

# Add firewall rule for Expo Metro Bundler (port 8081)
$ruleName = "Expo Metro Bundler"
$port = 8081

# Check if rule already exists
$existingRule = netsh advfirewall firewall show rule name="$ruleName" 2>$null

if ($existingRule -match "No rules match") {
    Write-Host "Adding firewall rule for port $port..." -ForegroundColor Yellow
    netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$port
    Write-Host "Firewall rule added successfully!" -ForegroundColor Green
} else {
    Write-Host "Firewall rule already exists." -ForegroundColor Cyan
}

# Get current IP address
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like "*Wi-Fi*" -or $_.InterfaceAlias -like "*Ethernet*"} | Select-Object -First 1).IPAddress

Write-Host "`nYour IP address: $ipAddress" -ForegroundColor Cyan
Write-Host "`nTo connect your device:" -ForegroundColor Yellow
Write-Host "1. Make sure your device is on the same Wi-Fi network" -ForegroundColor White
Write-Host "2. Run: npm start" -ForegroundColor White
Write-Host "3. Scan the QR code with Expo Go app" -ForegroundColor White
Write-Host "4. Or manually enter: exp://$ipAddress`:8081`n" -ForegroundColor White
