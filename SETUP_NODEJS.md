# Installing Node.js and npm on Windows

## Quick Steps:

1. **Download Node.js:**
   - Go to https://nodejs.org/
   - Download the **LTS (Long Term Support)** version for Windows
   - This will be a `.msi` installer file

2. **Install Node.js:**
   - Run the downloaded `.msi` installer
   - Follow the installation wizard (accept defaults)
   - Make sure "Add to PATH" is checked (it should be by default)
   - Complete the installation

3. **Restart Your Terminal:**
   - Close VS Code completely
   - Reopen VS Code
   - Open a new terminal

4. **Verify Installation:**
   ```powershell
   node --version
   npm --version
   ```
   Both commands should show version numbers.

5. **Install Project Dependencies:**
   ```powershell
   npm install
   ```

6. **Start the Project:**
   ```powershell
   npm start
   ```

## Alternative: Using a Package Manager

If you prefer using a package manager:

### Using Chocolatey (if installed):
```powershell
choco install nodejs
```

### Using winget (Windows Package Manager):
```powershell
winget install OpenJS.NodeJS.LTS
```

## Troubleshooting:

- **If npm is still not recognized after installation:**
  - Restart your computer
  - Check if Node.js is in your PATH: `$env:PATH -split ';' | Select-String node`
  - Manually add Node.js to PATH if needed (usually `C:\Program Files\nodejs\`)

- **If you get permission errors:**
  - Run PowerShell as Administrator
  - Or use `npx` instead of global installs

- **If you get "running scripts is disabled" error:**
  - **Quick fix:** Use `npm.cmd` instead of `npm`:
    ```powershell
    npm.cmd install
    npm.cmd start
    ```
  - **Permanent fix:** Run PowerShell as Administrator and execute:
    ```powershell
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    ```
    Then restart VS Code.
  - **Alternative:** Use Command Prompt (cmd.exe) instead of PowerShell - npm works there without issues.


