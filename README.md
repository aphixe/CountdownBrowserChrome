# CountDown Pro

CountDown Pro is a Chromium browser extension for tracking focused time across named profiles. It gives you a quick timer in the toolbar popup, profile-based daily goals, streak tracking, yearly totals, a heatmap, a weekly calendar view, and a trends graph.

It is built as a plain Manifest V3 extension, so there is no build step required. You can load this project directly into Chrome, Brave, Edge, Opera, or most other Chrome-based browsers as an unpacked extension.

## What It Does

- Tracks timed sessions per profile
- Lets you switch between profiles like `Activate Immersion`, `Passive Immersion`, and `Anki/Migaku`
- Shows today's timer, day time remaining, yearly total, current streak, and longest streak
- Displays goal progress and counts streaks after a profile reaches its daily goal
- Includes a calendar view for reviewing time blocks
- Includes a trends graph for viewing progress over time
- Lets you configure your tracking day window and profile goals
- Supports CSV import and export for saved session data

## Project Structure

- `manifest.json` - Chrome extension manifest
- `popup.html` / `popup.js` - main extension popup UI
- `options.html` / `options.js` - settings page
- `calendar.html` / `calendar.js` - calendar view
- `trends.html` / `trends.js` - trends graph view
- `background.js` - background service worker
- `shared.js` - shared logic for settings, sessions, totals, and formatting
- `icons/` - extension icons and UI assets

## Install In Chrome, Brave, Edge, Or Another Chromium Browser

These steps are almost the same in every Chrome-based browser.

### 1. Download or Clone This Project

If you already have the folder on your computer, you can use it directly.

Otherwise:

```powershell
git clone https://github.com/your-username/CountdownBrowserChrome.git
```

Or download the repository as a ZIP from GitHub and extract it.

### 2. Open The Extensions Page

Use the extensions page for your browser:

- Chrome: `chrome://extensions`
- Brave: `brave://extensions`
- Edge: `edge://extensions`
- Opera: `opera://extensions`

If you use another Chromium-based browser, open its extensions page and look for developer tools or unpacked extension loading.

### 3. Turn On Developer Mode

Enable `Developer mode` on the extensions page. In most browsers this is a toggle near the top-right.

### 4. Load The Extension

Click `Load unpacked`, then select the project folder:

```text
CountdownBrowserChrome
```

Select the folder that contains `manifest.json`.

### 5. Pin And Open It

After the extension loads:

- Pin `CountDown Pro` to the toolbar if you want quick access
- Click the extension icon to open the popup
- Open `Settings` to configure your day window, goals, and profiles

## Updating After You Change The Code

If you edit the extension locally:

1. Save your file changes.
2. Go back to the browser's extensions page.
3. Click `Reload` on the CountDown Pro extension card.

Then reopen the popup or settings page to test the changes.

## Permissions

This extension currently uses:

- `storage` for saving settings and tracked sessions
- `tabs` for tab-based background behavior
- `alarms` for scheduled background syncing/tasks

## Notes

- This project is a local/unpacked extension, not a Chrome Web Store package.
- Because it is a Manifest V3 extension, the background logic runs through `background.js` as a service worker.
- Most Chromium browsers support the same loading flow, so the install process is nearly identical across Chrome, Brave, Edge, and similar browsers.
