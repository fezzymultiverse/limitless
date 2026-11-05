#!/usr/bin/env bash
# Serve the app on http://localhost:8080 (Termux). Stop with Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")/../www"
echo "LIMITLESS NOTEPAD -> http://localhost:8080"
exec python -m http.server 8080
