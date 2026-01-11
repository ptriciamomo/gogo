# How to Temporarily Disable Windows Defender & Firewall

## ⚠️ Important Warning
**Only disable these temporarily during Android Studio installation. Re-enable them immediately after!**

---

## Method 1: Disable Windows Defender (Antivirus)

### Step 1: Open Windows Security
1. Press `Windows Key` on your keyboard
2. Type **"Windows Security"**
3. Click on **"Windows Security"** app

### Step 2: Disable Real-time Protection
1. Click on **"Virus & threat protection"** (shield icon)
2. Click on **"Manage settings"** under "Virus & threat protection settings"
3. **Turn OFF** the toggle for **"Real-time protection"**
4. If Windows asks for confirmation, click **"Yes"**

### Step 3: Disable Cloud Protection (Optional but recommended)
1. In the same settings page, scroll down
2. **Turn OFF** **"Cloud-delivered protection"**
3. **Turn OFF** **"Automatic sample submission"**

### Step 4: Disable Firewall (see Method 2 below)

### Step 5: After Android Studio Installation
**Come back here and turn everything back ON!**

---

## Method 2: Disable Windows Firewall

### Option A: Through Windows Security (Easiest)

1. In **Windows Security** app
2. Click on **"Firewall & network protection"** (firewall icon)
3. You'll see three network profiles:
   - **Domain network**
   - **Private network**
   - **Public network**

4. For each one that shows **"Active"**:
   - Click on it (e.g., "Private network")
   - **Turn OFF** the toggle for **"Microsoft Defender Firewall"**
   - Click **"Yes"** if prompted
   - Go back and do the same for other active networks

### Option B: Through Control Panel

1. Press `Windows Key` + `R`
2. Type: `firewall.cpl` and press Enter
3. Click **"Turn Windows Defender Firewall on or off"** (left sidebar)
4. For both **"Private network settings"** and **"Public network settings"**:
   - Select **"Turn off Windows Defender Firewall"**
5. Click **"OK"**

---

## Method 3: Quick Disable via Command (Advanced)

If you prefer command line, open PowerShell as Administrator:

```powershell
# Disable Firewall for all profiles
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

# Disable Windows Defender Real-time Protection
Set-MpPreference -DisableRealtimeMonitoring $true
```

**To re-enable:**
```powershell
# Re-enable Firewall
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True

# Re-enable Windows Defender
Set-MpPreference -DisableRealtimeMonitoring $false
```

---

## Complete Step-by-Step Process

### Before Android Studio Installation:

1. **Disable Windows Defender:**
   - Windows Key → "Windows Security"
   - Virus & threat protection → Manage settings
   - Turn OFF "Real-time protection"

2. **Disable Windows Firewall:**
   - In Windows Security → Firewall & network protection
   - Turn OFF firewall for all active networks

3. **Go back to Android Studio setup**
   - Click **"Retry"** on the error dialog
   - Let it download components

### After Android Studio Installation:

1. **Re-enable Windows Defender:**
   - Windows Security → Virus & threat protection → Manage settings
   - Turn ON "Real-time protection"

2. **Re-enable Windows Firewall:**
   - Windows Security → Firewall & network protection
   - Turn ON firewall for all networks

---

## Visual Guide (Windows 11)

### Windows Defender:
```
Windows Security
  └─ Virus & threat protection
      └─ Manage settings
          └─ Real-time protection: [Turn OFF]
```

### Windows Firewall:
```
Windows Security
  └─ Firewall & network protection
      └─ Private network → [Turn OFF]
      └─ Public network → [Turn OFF]
```

---

## Troubleshooting

### "You need administrator permission"
- Right-click on Windows Security → "Run as administrator"
- Or use an administrator account

### "Some settings are managed by your organization"
- You're on a managed/corporate computer
- Contact your IT administrator
- Or try the command-line method with admin PowerShell

### Can't find Windows Security
- Press `Windows Key` + `I` (Settings)
- Go to **Privacy & Security** → **Windows Security**

---

## ⚠️ Remember to Re-enable!

**Set a reminder or write a note to turn these back ON after installation!**

Your computer will be vulnerable without these protections enabled.

---

## Alternative: Add Exception Instead

If you don't want to disable everything, you can add Android Studio as an exception:

### Windows Defender Exception:
1. Windows Security → Virus & threat protection
2. Manage settings → Exclusions
3. Add or remove exclusions → Add an exclusion
4. Choose "Folder" and add: `C:\Program Files\Android\Android Studio`

### Firewall Exception:
1. Windows Security → Firewall & network protection
2. Allow an app through firewall
3. Find "Android Studio" and check both Private and Public

This is safer but may not solve the connection issue.


















