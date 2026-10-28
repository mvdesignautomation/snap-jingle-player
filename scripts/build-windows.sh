#!/bin/sh
set -eu
cd /workspace
export PATH="/usr/local/go/bin:${PATH}"
npm run build:desktop
mkdir -p desktop/ui/samples
cp -f public/samples/*.wav desktop/ui/samples/
if [ -f desktop/ui/desktop.html ]; then
  mv -f desktop/ui/desktop.html desktop/ui/index.html
fi
chmod +x desktop/build.sh
sh desktop/build.sh
mkdir -p public/downloads artifacts
cp -f desktop/dist/SnapJinglePlayer-Setup.exe public/downloads/SnapJinglePlayer-Setup.exe
cp -f desktop/dist/SnapJinglePlayer-Setup.exe artifacts/SnapJinglePlayer-Setup.exe
ls -lh public/downloads/SnapJinglePlayer-Setup.exe
