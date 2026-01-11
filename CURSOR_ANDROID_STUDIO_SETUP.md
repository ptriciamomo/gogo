# Running Expo App from Cursor to Android Studio Emulator

## How It Works

**Cursor and Android Studio don't need to be "connected"** - they work together automatically:

1. **Android Studio** provides the Android emulator
2. **Cursor** runs your Expo commands
3. **Expo** automatically detects the running emulator and deploys your app

The connection happens through:
- Android SDK tools (`adb` - Android Debug Bridge)
- The running emulator that Expo detects
- Metro bundler that serves your app

---

## Setup Steps

### Step 1: Set Up Android SDK Path (One-Time Setup)

Expo needs to find your Android SDK. Let's set it up:

1. **Find your Android SDK path:**
   - Usually: `C:\Users\YourUsername\AppData\Local\Android\Sdk`
   - Or check in Android Studio: **File → Settings → Appearance & Behavior → System Settings → Android SDK**

2. **Add to Environment Variables:**
   - Press `Windows Key` → Type "Environment Variables"
   - Click "Edit the system environment variables"
   - Click "Environment Variables"
   - Under "User variables", create or edit:
     - **Variable name:** `ANDROID_HOME`
     - **Variable value:** `C:\Users\patricia\AppData\Local\Android\Sdk` (your actual path)
   - Edit "Path" variable and add:
     - `%ANDROID_HOME%\platform-tools`
     - `%ANDROID_HOME%\tools`
   - Click "OK" on all dialogs

3. **Restart Cursor/VS Code** after setting environment variables

### Step 2: Create and Start Android Emulator

1. **Open Android Studio**
2. **Create an AVD (Android Virtual Device):**
   - Click **Tools → Device Manager** (or More Actions → Virtual Device Manager)
   - Click **"Create Device"**
   - Choose a device (e.g., Pixel 5)
   - Select System Image (API 33 or 34)
   - Click "Finish"

3. **Start the Emulator:**
   - In Device Manager, click the **▶ Play button** next to your AVD
   - Wait for it to fully boot (home screen appears)

### Step 3: Verify Connection

Open a terminal in Cursor and check if Expo can see the emulator:

```powershell
# Check if adb can see the emulator
adb devices
```

You should see something like:
```
List of devices attached
emulator-5554    device
```

If you see this, you're good to go!

### Step 4: Run Your App from Cursor

1. **Make sure the emulator is running** (from Step 2)

2. **In Cursor terminal, run:**
   ```powershell
   npm run android
   ```

   This will:
   - Start the Expo dev server
   - Detect your running emulator
   - Build and install your app
   - Open it automatically in the emulator

3. **Your app should appear in the Android Studio emulator!**

---

## Workflow

**Every time you want to run your app:**

1. **Start Android Studio emulator:**
   - Open Android Studio
   - Tools → Device Manager
   - Click ▶ Play button on your AVD
   - Wait for it to boot

2. **Run from Cursor:**
   ```powershell
   npm run android
   ```

3. **Your app appears in the emulator!**

---

## Alternative: Use `npm start` (Manual)

If you prefer more control:

1. **Start the emulator** (as above)

2. **In Cursor, run:**
   ```powershell
   npm start
   ```

3. **In the Expo dev server menu, press `a`** to open on Android

---

## Troubleshooting

### Issue: "No Android emulator found"

**Solution:**
- Make sure emulator is running (check Android Studio)
- Verify with: `adb devices` (should show your emulator)
- Restart both emulator and Expo server

### Issue: "ANDROID_HOME is not set"

**Solution:**
- Follow Step 1 above to set environment variables
- Restart Cursor after setting

### Issue: "Command 'adb' not found"

**Solution:**
- Add `%ANDROID_HOME%\platform-tools` to PATH (Step 1)
- Restart terminal/Cursor

### Issue: Expo can't connect to emulator

**Solution:**
```powershell
# Forward Metro bundler port
adb reverse tcp:8081 tcp:8081
```

### Issue: Emulator is slow

**Solution:**
- Allocate more RAM in AVD settings
- Use x86_64 system image (not ARM)
- Enable hardware acceleration

---

## Quick Test

To verify everything works:

1. Start emulator in Android Studio
2. In Cursor terminal:
   ```powershell
   adb devices
   ```
   Should show your emulator

3. Run:
   ```powershell
   npm run android
   ```

4. App should appear in emulator!

---

## Summary

- **Cursor** = Where you write code and run commands
- **Android Studio** = Provides the emulator
- **Expo** = Connects them automatically when you run `npm run android`

They work together seamlessly - no special connection needed!


















