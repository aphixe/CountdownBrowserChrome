# ⏱️ Countdown Master Pro (Chrome Extension)

**Countdown Master Pro** is a Chrome-based browser extension designed to **automatically track your immersion time**—no manual timers needed but you can manually start and stop the time, no guesswork.

This project is a reimagined version of the original Countdown Pro Python app, built to work seamlessly in your browser while consuming any type of media.

---

## 🚀 Features

### New timer badge
- Shows the time in extension badge icon when clock is running.

### 🎧 Automatic Time Tracking
- Detects when audio is playing and **automatically starts/stops tracking**
- Works across **any media** (YouTube, Netflix, podcasts, etc.)
- No manual input required
- * UPDATED!! now can toggle this off

### 🧠 Migaku / Anki Integration
- When using the **Migaku Memory site**, time is automatically recorded to your profile
- Designed to integrate with immersion-based learning workflows
- Note: timing may not be perfectly precise, but it is **fully automated**

### 👤 Profiles
- Create and manage multiple profiles
- Track immersion time separately for different goals or users

### 📅 Calendar View
- Visual blocks showing your immersion sessions
- Easy way to see **when and how long** you studied

### 📈 Trends View
- Graph-based overview of your total immersion time
- Track progress over days, weeks, or longer periods

### 🎯 Super Goal System
- Set a **daily time goal** (hours + minutes)
- Fully customizable in settings
- Helps you stay consistent and accountable

### 📤 CSV Export / Import
- Export your data as a `.csv` file
- Easily transfer your progress to another browser or machine
- Great for backups

### CSV Sync Server
- Settings can sync CSV files every 10 minutes
- Downloads mode writes to `Downloads/CountDown Pro`
- Local sync server mode reads from and writes to a folder you choose outside Chrome, which works well with Syncthing

Run the helper server with Node:

```powershell
node tools/csv-sync-server.js "D:\Syncthing\CountDown Pro" --token "choose-a-token"
```

On macOS, you can use the bundled helper script:

```bash
./tools/run-sync.sh
```

Then set the extension's CSV Sync target to `Local sync server`, URL to `http://127.0.0.1:8787/sync`, and token to the same value.
For a LAN sync server, run with `--host 0.0.0.0` and use that machine's LAN IP in the extension.

---

## 🧩 Installation (Chrome / Chromium Browsers)

Since this extension is not on the Chrome Web Store, you’ll install it manually:

### Step 1: Download the Project
- Clone or download this repository via download zip in the green code button and unzip it:
```bash
git clone https://github.com/aphixe/CountdownBrowserChrome.git


### Step 2: Open Extensions Page
Open Chrome (or any Chromium browser)
Go to:
- chrome://extensions/
### Step 3: Enable Developer Mode
Toggle Developer mode (top-right corner)
### Step 4: Load the Extension
Click "Load unpacked"
Select the folder where this project is located (the root folder containing manifest.json)
### Step 5: Done ✅
The extension should now appear in your browser
Pin it to your toolbar for easy access
