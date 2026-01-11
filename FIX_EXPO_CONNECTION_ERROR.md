# Fix "Could not connect to the server" Error

## Error Message
```
There was a problem running the requested app.
Unknown error: Could not connect to the server.
exp://127.0.0.1:8081
```

## Quick Fixes (Try in Order)

### Solution 1: Start the Expo Dev Server

The most common cause is that the dev server isn't running.

1. **Open a terminal in your project directory**
2. **Start the Expo dev server:**
   ```powershell
   npm start
   ```
   or
   ```powershell
   npx expo start
   ```

3. **Wait for the server to start** - You should see a QR code and menu options
4. **On your device/emulator:**
   - If using **Android emulator**: Press `a` in the terminal
   - If using **iOS simulator**: Press `i` in the terminal
   - If using **physical device**: Scan the QR code with Expo Go app

---

### Solution 2: Use Tunnel Mode (For Physical Devices)

If you're using a **physical device** on the same WiFi network, use tunnel mode:

```powershell
npx expo start --tunnel
```

This creates a tunnel that works even if your device can't reach your computer's local IP.

---

### Solution 3: Use LAN Mode with Your Computer's IP

If tunnel doesn't work, use your computer's local IP address:

1. **Find your computer's IP address:**
   ```powershell
   ipconfig
   ```
   Look for "IPv4 Address" under your active network adapter (usually starts with 192.168.x.x or 10.x.x.x)

2. **Start Expo with LAN mode:**
   ```powershell
   npx expo start --lan
   ```

3. **If it still shows 127.0.0.1, manually set the host:**
   ```powershell
   npx expo start --host tunnel
   ```
   or
   ```powershell
   set EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
   npx expo start
   ```

---

### Solution 4: Fix Port Forwarding (Android Emulator)

If using an **Android emulator**, set up port forwarding:

```powershell
adb reverse tcp:8081 tcp:8081
```

Then restart the Expo server:
```powershell
npm start
```

---

### Solution 5: Check Firewall Settings

Windows Firewall might be blocking the connection:

1. **Open Windows Security** (Windows Key → "Windows Security")
2. **Go to Firewall & network protection**
3. **Click "Allow an app through firewall"**
4. **Find "Node.js"** and make sure both **Private** and **Public** are checked
5. If Node.js isn't listed, click **"Allow another app"** and add:
   - `C:\Program Files\nodejs\node.exe` (or wherever Node.js is installed)

**Or temporarily disable firewall** (see `DISABLE_WINDOWS_DEFENDER_FIREWALL.md` for instructions)

---

### Solution 6: Clear Cache and Restart

Sometimes cached data causes issues:

```powershell
# Clear Expo cache
npx expo start --clear

# Or clear Metro bundler cache
npm start -- --reset-cache
```

---

### Solution 7: Check if Port 8081 is Already in Use

Another process might be using port 8081:

```powershell
# Check what's using port 8081
netstat -ano | findstr :8081

# If something is using it, kill that process (replace PID with the number shown)
taskkill /PID <PID> /F
```

Then restart Expo:
```powershell
npm start
```

---

### Solution 8: Use Different Port

If port 8081 is blocked, use a different port:

```powershell
npx expo start --port 8082
```

Then manually connect using: `exp://127.0.0.1:8082`

---

## For Physical iOS Device

If using a physical iPhone/iPad:

1. Make sure your **computer and device are on the same WiFi network**
2. Start Expo with:
   ```powershell
   npx expo start --tunnel
   ```
3. Scan the QR code with the **Camera app** (iOS) or **Expo Go app**

---

## For Physical Android Device

1. Make sure your **computer and device are on the same WiFi network**
2. Start Expo with:
   ```powershell
   npx expo start --tunnel
   ```
3. Open **Expo Go app** on your Android device
4. Scan the QR code or manually enter the connection URL

---

## Complete Reset (Last Resort)

If nothing works, try a complete reset:

```powershell
# Stop all Node processes
taskkill /F /IM node.exe

# Clear all caches
npx expo start --clear
npm start -- --reset-cache

# Restart Expo
npm start
```

---

## Most Common Solution

**90% of the time, the issue is simply that the dev server isn't running.**

Just run:
```powershell
npm start
```

Then:
- **Android emulator**: Press `a` in the terminal
- **iOS simulator**: Press `i` in the terminal  
- **Physical device**: Scan the QR code

---

## Still Not Working?

1. Make sure you're in the correct project directory
2. Make sure all dependencies are installed: `npm install`
3. Check that Node.js and npm are working: `node --version` and `npm --version`
4. Try restarting your computer
5. Check if antivirus software is blocking Node.js
















