# Permanent Fix for npm in PowerShell

## Step-by-Step Instructions:

### Step 1: Open PowerShell as Administrator
1. Press `Windows Key` on your keyboard
2. Type "PowerShell"
3. **Right-click** on "Windows PowerShell" (or "PowerShell")
4. Select **"Run as Administrator"**
5. Click "Yes" when prompted by User Account Control

### Step 2: Set the Execution Policy
In the Administrator PowerShell window, type:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

You should see a confirmation message.

### Step 3: Verify the Change
Type:
```powershell
Get-ExecutionPolicy -List
```

You should see `RemoteSigned` under `CurrentUser` scope.

### Step 4: Close and Restart VS Code
1. Close VS Code completely
2. Reopen VS Code
3. Open a new terminal
4. Try `npm install` or `npm start` - it should work now!

## What This Does:
- **RemoteSigned** allows:
  - Local scripts (like npm.ps1) to run without signing
  - Downloaded scripts to run only if they're signed by a trusted publisher
  - This is safe and recommended for development

## Alternative: If You Can't Run as Administrator
If you don't have admin rights, you can:
1. Use `npm.cmd` instead of `npm` (works but not as clean)
2. Switch VS Code terminal to Command Prompt (cmd.exe)
3. Ask your IT administrator to set the policy



















