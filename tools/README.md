# CountDown Pro CSV Sync Server

This folder contains the local CSV sync server used by the extension. The server lets Chrome read and write CSV files in a normal folder on your computer, so that folder can be synced by Syncthing, Dropbox, iCloud Drive, OneDrive, or another file sync tool.

## Requirements

- Node.js installed
- CountDown Pro installed in Chrome
- A folder where the CSV files should live

## Basic Setup

Choose a folder path and a token. The folder can be anywhere you want, including inside a Syncthing or Dropbox folder. The token can be any text you choose; use the same token in the extension settings.

macOS/Linux:

```bash
node csv-sync-server.js "/Users/you/Syncthing/CountDown Pro" --token "your-private-token"
```

Windows:

```powershell
node csv-sync-server.js "D:\Syncthing\CountDown Pro" --token "your-private-token"
```

When it starts, the server prints the sync URL. The default local URL is:

```text
http://127.0.0.1:8787/sync
```

## Extension Settings

Open CountDown Pro settings and go to CSV Sync:

1. Set Server URL to `http://127.0.0.1:8787/sync`
2. Set Token to the same token you used with `--token`
3. Click Test Server
4. Click Sync Now, or enable Auto sync every 10 minutes

If you leave `--token` out when starting the server, leave the token field empty in the extension too. A token is recommended if you use the server on your LAN.

## Syncing Between Computers

Use a file sync tool to sync the folder you gave to the server:

- Syncthing
- Dropbox
- iCloud Drive
- OneDrive
- Google Drive

Run the local server on each computer, pointing each one at that computer's synced folder copy. Use the same token in the browser extension on each computer.

## Helper Scripts

This folder includes example scripts you can copy or edit:

- `example-run-sync.sh` for macOS/Linux
- `example-run-sync.bat` for Windows

Change the folder path and token inside the script before using it.

## Options

```bash
node csv-sync-server.js "/path/to/sync/folder" --token "your-private-token"
```

Optional flags:

- `--token "text"` protects the server with a token
- `--port 8787` changes the server port
- `--host 127.0.0.1` listens only on this computer
- `--host 0.0.0.0` listens on your LAN
- `--host loopback` listens on both IPv4 and IPv6 loopback where available

For LAN use, start the server with `--host 0.0.0.0`, then use that computer's LAN IP in the extension URL, such as:

```text
http://192.168.1.25:8787/sync
```

