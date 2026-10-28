#!/bin/sh
set -eu
cd "$(dirname "$0")"
export PATH="/usr/local/go/bin:${PATH}"
export GOOS=windows
export GOARCH=amd64
export CGO_ENABLED=0
mkdir -p ui dist
if [ ! -f ui/index.html ]; then
  printf '%s\n' '<!doctype html><title>Snap Jingle Player</title><p>UI missing</p>' > ui/index.html
fi
go build -trimpath -ldflags="-s -w -H windowsgui -X main.appVersion=1.0.0" -o dist/SnapJinglePlayer-Setup.exe .
echo "Wrote $(pwd)/dist/SnapJinglePlayer-Setup.exe"
