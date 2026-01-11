# How to Test Geolocation on Mobile Browser with HTTPS

## Problem
Mobile browsers require HTTPS for geolocation API, but Expo's `--https` flag doesn't work well with `--lan` for network IPs.

## Solution: Use Cloudflare Tunnel (Free & Easy)

Need pani nimo og 'navigator.geolocation.getCurrentPosition' na function patudlo ra kay cursor- para lang na sa mobile browser, wala nay labot ang web browser og mobile app 


### Step 1: Install cloudflared
Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/


download nimo ni sa terminal
Or use package manager:
- Windows (Chocolatey): `choco install cloudflared`
- Or download the .exe from the website


tapos diri 
### Step 2: Start Expo in HTTP mode with LAN access
```bash
npm start -- --lan
```
This will start on `http://192.168.1.6:8081` (or your actual IP)

**⚠️ IMPORTANT: Keep this terminal running! Don't close it.**


tapos open ka new terminal
### Step 3: Create HTTPS tunnel
Open a NEW terminal window (keep Step 2 running!) and run:
```bash
npx cloudflared tunnel --url http://192.168.1.6:8081
```
(Replace `192.168.1.5` with your actual IP from `ipconfig` - look for "IPv4 Address" under "Wireless LAN adapter Wi-Fi")

**⚠️ Make sure Step 2 (Expo server) is running BEFORE running this command, otherwise you'll get a 502 Bad Gateway error!**



This will give you an HTTPS URL like: `https://random-name.trycloudflare.com` - maka kita kag murag rectangle na naay 'You quick tunnel has..' naa dira ang link icopy paste nimo dira naka mag open 


### Step 4: Access from Mobile Browser
1. Copy the HTTPS URL from the cloudflared output
2. Open it on your mobile browser
3. Accept any security warnings (cloudflare tunnels are safe)
4. Test the geolocation feature - the native permission prompt should now appear!




AYAW NANI
## Alternative: Use ngrok (Also Free)

### Step 1: Install ngrok
Download from: https://ngrok.com/download

### Step 2: Start Expo
```bash
npm start
```

### Step 3: Create tunnel
```bash
ngrok http 8081
```

### Step 4: Use the HTTPS URL
Copy the `https://` URL from ngrok output and use it on your mobile browser.

## Quick Test (Localhost Only)
If you want to test quickly on your computer's browser (not mobile):
- Use `http://localhost:8081` - localhost works with HTTP for geolocation
- But this won't work from your mobile device

