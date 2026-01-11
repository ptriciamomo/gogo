# Fix Android Studio Download Error

## Problem
Android Studio setup is failing to download SDK components with "Connection reset" error.

## Solutions (Try in Order)

### Solution 1: Retry the Download (Easiest)
1. Click **"Retry"** in the error dialog
2. Sometimes it's just a temporary network issue
3. If it fails again, try the solutions below

### Solution 2: Check Your Internet Connection
1. Make sure you have a stable internet connection
2. Try opening https://dl.google.com/android/re in your browser
3. If it doesn't load, you may have network/firewall issues

### Solution 3: Disable Antivirus/Firewall Temporarily
1. **Temporarily disable** Windows Defender or your antivirus
2. **Temporarily disable** Windows Firewall
3. Retry the Android Studio setup
4. **Re-enable** them after installation completes

### Solution 4: Use a VPN or Different Network
- If you're on a restricted network (corporate/school), try:
  - Using a VPN
  - Using a mobile hotspot
  - Using a different network

### Solution 5: Manual SDK Component Installation
If downloads keep failing, you can install components later:

1. **Click "Cancel"** on the error dialog
2. **Click "Cancel"** on the setup wizard
3. **Open Android Studio** (it should still open)
4. Go to **File → Settings** (or **Android Studio → Preferences** on Mac)
5. Go to **Appearance & Behavior → System Settings → Android SDK**
6. Click **"SDK Tools"** tab
7. Check the components you need:
   - ✅ Android SDK Build-Tools
   - ✅ Android Emulator
   - ✅ Android SDK Platform-Tools
   - ✅ Intel x86 Emulator Accelerator (HAXM installer) - if on Intel CPU
8. Click **"Apply"** and let it download

### Solution 6: Configure Proxy (If Behind Corporate Firewall)
If you're behind a corporate firewall:

1. In Android Studio Setup, look for **"Proxy Settings"**
2. Or configure after installation:
   - **File → Settings → Appearance & Behavior → System Settings → HTTP Proxy**
   - Enter your proxy settings
   - Retry downloads

### Solution 7: Use Android Studio Offline Installer
1. Download Android Studio **offline installer** (if available)
2. Or download SDK components manually from:
   - https://developer.android.com/studio#command-tools
3. Extract to your SDK folder manually

### Solution 8: Skip Components for Now
You can skip some components and install them later:

1. **Click "Cancel"** on the error
2. **Click "Cancel"** on setup wizard
3. Android Studio will still open
4. You can install missing components later through SDK Manager

---

## Recommended Action Plan

**Step 1:** Click **"Retry"** first (simplest)

**Step 2:** If retry fails:
- Disable antivirus/firewall temporarily
- Click **"Retry"** again

**Step 3:** If still failing:
- Click **"Cancel"** to exit setup
- Open Android Studio anyway
- Install components manually through SDK Manager (Solution 5)

**Step 4:** For Expo development, you **don't need** all components immediately:
- You can use Expo Go app on your phone instead
- Or install emulator components later when needed

---

## Quick Workaround: Use Expo Go Instead

If Android Studio setup is problematic, you can test on a **real Android phone** using Expo Go:

1. **Skip Android Studio setup for now**
2. **Install Expo Go** app on your Android phone (from Google Play Store)
3. **Run your app:**
   ```powershell
   npm start
   ```
4. **Scan the QR code** with Expo Go app
5. Your app will run on your phone!

This is actually **easier** for development and doesn't require Android Studio setup.

---

## After Fixing: Verify Installation

Once components are installed, verify:

```powershell
# Check if adb is available
adb --version

# Check if emulator is available
emulator -version
```

Both should show version numbers if installed correctly.


















