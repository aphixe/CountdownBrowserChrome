#!/bin/bash

# Optional: fail fast on errors
set -e

# Change to script directory so relative paths work if needed.
cd "$(dirname "$0")"

# Run on both IPv4 and IPv6 loopback. This keeps both of these working on macOS:
#   http://127.0.0.1:8787/sync
#   http://localhost:8787/sync
node csv-sync-server.js "/Users/your/location/here" --host loopback --token "youchoose"
