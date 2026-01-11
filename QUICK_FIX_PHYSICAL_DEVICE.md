# Quick Fix for Physical Device Connection

## Your Computer's IP: `192.168.1.6`

## Step-by-Step Fix:

### 1. Make Sure Both Devices Are on Same WiFi
- Your computer and iPhone must be on the **same WiFi network**
- Check WiFi name on both devices

### 2. Start Expo Server in LAN Mode
```powershell
cd C:\Users\patricia\Downloads\gogo
npx expo start --lan
```

### 3. Connect Your iPhone

**Option A: Scan QR Code (Easiest)**
- Look at the terminal where Expo is running
- You should see a QR code
- Open **Camera app** on iPhone
- Point at the QR code
- Tap the notification that appears

**Option B: Manual Connection**
- Open **Expo Go** app on iPhone
- Tap "Enter URL manually"
- Enter: `exp://192.168.1.6:8081`
- Tap "Connect"

### 4. If Still Not Working - Try Tunnel Mode

Stop the current server (Ctrl+C in terminal), then:
```powershell
npx expo start --tunnel
```

Wait for it to generate a new URL/QR code, then scan again.

### 5. Check Firewall

Windows Firewall might be blocking:

1. Open **Windows Security** (Windows Key → "Windows Security")
2. Go to **Firewall & network protection**
3. Click **"Allow an app through firewall"**
4. Find **"Node.js"** and check both **Private** and **Public**
5. If not listed, click **"Allow another app"** → **Browse**
6. Find: `C:\Program Files\nodejs\node.exe` (or wherever Node.js is installed)
7. Check both **Private** and **Public**
8. Click **OK**

### 6. Alternative: Disable Firewall Temporarily

**⚠️ Only do this temporarily, then re-enable!**

1. Windows Security → Firewall & network protection
2. Turn OFF firewall for your active network (Private)
3. Try connecting again
4. **Remember to turn it back ON!**

---

## Quick Commands Reference

```powershell
# Start in LAN mode (for same WiFi network)
npx expo start --lan

# Start in tunnel mode (works across networks, slower)
npx expo start --tunnel

# Start normally (only works for emulator/simulator)
npm start

# Clear cache and start
npx expo start --clear
```

---

## Troubleshooting

### "Still can't connect"
1. Verify both devices on same WiFi
2. Check firewall settings (see above)
3. Try tunnel mode instead
4. Restart both your computer's WiFi and iPhone's WiFi
5. Make sure no VPN is active on either device

### "Server not found"
- Make sure the Expo server is actually running
- Check terminal for any error messages
- Try: `netstat -ano | findstr :8081` to verify port is open

### "Connection timeout"
- Firewall is likely blocking - follow firewall steps above
- Try tunnel mode: `npx expo start --tunnel`
















