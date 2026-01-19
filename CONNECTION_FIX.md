# Fix Expo Connection Issues

## Quick Fix (Choose One Method)

### Method 1: Allow Firewall Port (Recommended - Requires Admin)

1. **Open PowerShell as Administrator:**
   - Press `Windows Key + X`
   - Select "Windows PowerShell (Admin)" or "Terminal (Admin)"

2. **Run this command:**
   ```powershell
   netsh advfirewall firewall add rule name="Expo Metro Bundler" dir=in action=allow protocol=TCP localport=8081
   ```

3. **Start Expo:**
   ```bash
   npm start
   ```

### Method 2: Use Cloudflare Tunnel (No Firewall Changes Needed)

1. **Start Expo in LAN mode:**
   ```bash
   npm start
   ```
   Keep this terminal running!

2. **Open a NEW terminal and run:**
   ```bash
   npx cloudflared tunnel --url http://192.168.1.5:8081
   ```

3. **Copy the HTTPS URL** from cloudflared output (looks like `https://xxxxx.trycloudflare.com`)

4. **On your device**, use the cloudflare URL instead of the exp:// URL

### Method 3: Manual Connection

1. **Make sure your device is on the same Wi-Fi network**

2. **Start Expo:**
   ```bash
   npm start
   ```

3. **In Expo Go app**, manually enter:
   ```
   exp://192.168.1.5:8081
   ```

### Method 4: Use USB Connection (Android Only)

If you're using an Android device:

1. **Connect device via USB**
2. **Enable USB Debugging** on your phone
3. **Run:**
   ```bash
   npm run android
   ```

## Troubleshooting

- **"Could not connect to server"**: Check firewall, ensure same Wi-Fi network
- **"Tunnel error"**: Use Method 2 (Cloudflare) or Method 1 (Firewall fix)
- **Different IP**: Run `ipconfig` and look for your IPv4 address, update the URL accordingly
