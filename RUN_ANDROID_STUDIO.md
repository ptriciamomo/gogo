# Running Your Expo App in Android Studio

## Prerequisites

1. **Android Studio** must be installed
2. **Android SDK** must be installed
3. **Android Virtual Device (AVD)** must be created

---

## Step 1: Install Android Studio (if not already installed)

1. Download Android Studio from: https://developer.android.com/studio
2. Run the installer
3. During installation, make sure to install:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device (AVD)
   - Performance (Intel HAXM) - if you have an Intel processor

---

## Step 2: Set Up Android Virtual Device (AVD)

1. **Open Android Studio**
2. Click **"More Actions"** → **"Virtual Device Manager"** (or Tools → Device Manager)
3. Click **"Create Device"**
4. Select a device (e.g., **Pixel 5** or **Pixel 6**)
5. Click **"Next"**
6. Select a **System Image** (recommended: **API 33** or **API 34** - Android 13/14)
   - If you see "Download" next to it, click it to download first
7. Click **"Next"** → **"Finish"**
8. Your AVD is now created

---

## Step 3: Set Up Environment Variables (Important!)

You need to add Android SDK to your PATH:

1. **Find your Android SDK path** (usually):
   - `C:\Users\YourUsername\AppData\Local\Android\Sdk`
   - Or check in Android Studio: **File → Settings → Appearance & Behavior → System Settings → Android SDK**

2. **Add to System Environment Variables:**
   - Press `Windows Key` → Type "Environment Variables"
   - Click **"Edit the system environment variables"**
   - Click **"Environment Variables"** button
   - Under **"User variables"**, find or create **"ANDROID_HOME"**:
     - Variable name: `ANDROID_HOME`
     - Variable value: `C:\Users\YourUsername\AppData\Local\Android\Sdk`
   - Edit **"Path"** variable and add:
     - `%ANDROID_HOME%\platform-tools`
     - `%ANDROID_HOME%\tools`
     - `%ANDROID_HOME%\tools\bin`

3. **Restart VS Code** after adding environment variables

---

## Step 4: Start Android Emulator

### Option A: From Android Studio
1. Open **Android Studio**
2. Go to **Device Manager** (Tools → Device Manager)
3. Click the **▶ Play button** next to your AVD
4. Wait for the emulator to boot (may take 1-2 minutes)

### Option B: From Command Line
```powershell
# List available emulators
emulator -list-avds

# Start a specific emulator (replace "Pixel_5_API_33" with your AVD name)
emulator -avd Pixel_5_API_33
```

---

## Step 5: Run Your Expo App

### Method 1: Using npm script (Recommended)
```powershell
npm run android
```

This will:
- Start the Expo dev server
- Automatically detect the running Android emulator
- Build and install the app on the emulator

### Method 2: Manual start
1. **Start the Expo dev server:**
   ```powershell
   npm start
   ```

2. **In the Expo dev server menu:**
   - Press `a` to open on Android emulator
   - Or scan the QR code with Expo Go app (on physical device)

---

## Troubleshooting

### Issue: "ANDROID_HOME is not set"
**Solution:** Follow Step 3 above to set environment variables, then restart VS Code.

### Issue: "No Android emulator found"
**Solution:** 
- Make sure the emulator is running (check Android Studio Device Manager)
- Verify with: `adb devices` (should show your emulator)

### Issue: "Command 'adb' not found"
**Solution:** 
- Add `%ANDROID_HOME%\platform-tools` to your PATH (see Step 3)
- Restart terminal/VS Code

### Issue: Emulator is slow
**Solution:**
- Enable **Hardware Acceleration** in AVD settings
- Allocate more RAM to the emulator (Settings → Advanced → RAM: 2048 MB or more)
- Use a **x86_64** system image (not ARM)

### Issue: "SDK location not found"
**Solution:**
- Create a file `local.properties` in your project root:
  ```
  sdk.dir=C:\\Users\\YourUsername\\AppData\\Local\\Android\\Sdk
  ```
  (Replace with your actual SDK path)

### Issue: Expo can't connect to emulator
**Solution:**
- Make sure emulator is fully booted (wait for home screen)
- Try: `adb reverse tcp:8081 tcp:8081` (for Metro bundler)
- Restart both Expo server and emulator

---

## Quick Commands Reference

```powershell
# Check if Android SDK is set up
adb --version

# List running Android devices/emulators
adb devices

# Start Expo with Android
npm run android

# Or start Expo normally and press 'a' for Android
npm start
```

---

## Alternative: Use Physical Android Device

If you prefer using a real Android phone:

1. **Enable Developer Options** on your phone:
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times

2. **Enable USB Debugging:**
   - Settings → Developer Options → USB Debugging (ON)

3. **Connect phone via USB** to your computer

4. **Verify connection:**
   ```powershell
   adb devices
   ```
   Should show your device

5. **Run:**
   ```powershell
   npm run android
   ```

---

## Next Steps

Once your app is running:
- The app will **hot reload** when you save changes
- Press `r` in the Expo terminal to reload
- Press `m` to toggle menu
- Press `Ctrl+C` to stop the server

Happy coding! 🚀


















