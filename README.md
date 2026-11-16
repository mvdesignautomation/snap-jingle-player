# Snap Jingle Player

A lightweight, offline jingle / soundboard player. Large pads, instant playback, overlapping sounds, and a local Windows installer. Nothing here is a clone of any commercial product — original interface, original demo tones, no accounts, no cloud.

Source: https://github.com/mvdesignautomation/snap-jingle-player

Windows installer: [SnapJinglePlayer-Setup.exe](https://github.com/mvdesignautomation/snap-jingle-player/releases/latest)

## Features

- Grid of large pads, arranged in one or more decks
- Multiple profiles (for example Podcast, Gaming, Live show) with independent decks
- Arrange mode: add, rename, resize, and drag decks on an expanding grid
- Deck sizes up to 8×8 and 48 buttons, including 2×8
- Zoom and scroll the workspace; decks snap to the grid and cannot overlap
- Click a pad to play; drop a WAV / MP3 / OGG file onto a pad to assign it
- Custom pad name, color, volume, loop, retrigger, and keyboard shortcut
- Overlapping playback by default (applause + airhorn + applause)
- Optional cut mode that stops other sounds when a new one starts
- Individual stop, plus a large **STOP ALL** control (Esc by default)
- Master volume and mute
- Configuration saved locally and restored on the next launch
- Missing audio is flagged instead of crashing — locate, replace, or remove it
- Export / import a library of profiles, or add one backup as new profiles without replacing the rest

## Installation (Windows)

1. Download `SnapJinglePlayer-Setup.exe`
2. Run the installer
3. Choose whether to add a desktop shortcut (Start Menu shortcut is created automatically)
4. Launch **Snap Jingle Player**

No Python, Node.js, Rust, Docker, or developer tools are required. The app is installed per-user under `%LOCALAPPDATA%\Programs\SnapJinglePlayer` and can be removed from **Windows Settings → Apps**.

Windows 10 (recent) and Windows 11 already include the Edge WebView2 runtime the desktop shell uses. If that runtime is missing, the player opens in your default browser instead and still runs fully offline.

## How to add sounds

- Click an empty pad and choose a file
- Or drag a file from Explorer onto a pad
- Supported: WAV, MP3, OGG (plus M4A / AAC / FLAC / WebM when the system decoder allows it)
- Demo tones are original synthesized hits, not copyrighted jingles

Audio is copied into the app’s local store when you assign it. That is deliberate: a live board should not break because a file later moved on disk.

## How to configure pads

Open **Arrange** to add or move decks. Each deck has its own columns and rows (up to 8 by 8, and at most 48 buttons). Drag a deck by its header. Zoom controls sit above the workspace.

Open **Profiles** to create, rename, duplicate, switch, or delete a board. Switching does not stop sounds that are already playing. The last profile you used is restored on the next launch.

Right-click a pad, or click the pencil on hover.

You can change:

- Name and color
- Assigned file (replace / remove)
- Hotkey
- Pad volume
- Loop
- Overlap vs restart if the same pad is hit again
- Reset the pad

Drag the small grip on a pad to reorder.

Open **Settings** for cut vs overlap, the Stop All hotkey, backup, and reset of the active profile. Deck size is edited from Arrange, not from a single global layout.

## Keyboard shortcuts

Hotkeys work while the application window is focused.

Defaults on a 24-pad board:

| Keys | Pads |
| --- | --- |
| `1`–`6` | First row |
| `Q` `W` `E` `R` `T` `Y` | Second row |
| `A` `S` `D` `F` `G` `H` | Third row |
| `Z` `X` `C` `V` `B` `N` | Fourth row |
| `Esc` | Stop all |

Click a pad’s hotkey field and press a key to reassign. Backspace clears it.

System-wide hotkeys (while another app is in front) are **not** registered, so a live host’s other shortcuts are not stolen. Keep Snap Jingle Player focused during a show.

## Where configuration is stored

**Web / preview**

- Profiles, decks, and settings: browser `localStorage` key `sjp-board-v1` (version 2)
- A copy of the pre-migration board is kept in `sjp-board-v1-premigration` the first time an older board is upgraded
- Audio data: IndexedDB database `sjp-clips-v1`

**Windows app**

- Same data, inside the WebView2 user folder: `%LOCALAPPDATA%\SnapJinglePlayer\UserData`
- Application files: `%LOCALAPPDATA%\Programs\SnapJinglePlayer`

## Backup / import

Settings → **Export library** writes `snap-jingle-library.json`.

That file contains every profile, deck position, pad names, colors, hotkeys, volumes, and a copy of each assigned sound that is still stored locally. `audioIncluded` is true only when those copies are actually in the file. Older single-board backups still import. Adding a backup keeps your current profiles; replacing the library asks for confirmation first.

Settings → **Import board** replaces the current board with a previously exported file.

## How to build

### Web app (this project)

```bash
npm install
npm run dev          # development
npm run build        # production web build
```

### Windows installer

Needs Go 1.22+ (the published installer is already compiled; you only need this to rebuild).

```bash
npm install
npx vite build --config vite.desktop.config.ts
mkdir -p desktop/ui/samples
cp public/samples/*.wav desktop/ui/samples/
mv desktop/ui/desktop.html desktop/ui/index.html
cd desktop
# Linux / macOS cross-compile:
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w -H windowsgui" -o dist/SnapJinglePlayer-Setup.exe .
```

`desktop/build.sh` wraps the Go step. The result is a single `SnapJinglePlayer-Setup.exe` that both installs and contains the player.

The desktop shell is a small native Windows host (WebView2) plus the same React soundboard. Tauri was considered; a Go + WebView2 host is what actually produces a real Windows `.exe` installer from a Linux build environment without MSVC, NSIS, or Wine.

## Known limitations

- Hotkeys require the window to be focused (not global OS hooks)
- Very large files (tens of MB) make export JSON bigger because audio is bundled
- WebView2 is expected on current Windows. Older machines may fall back to the browser window
- This Linux/web preview cannot execute the Windows installer; the `.exe` is a real PE binary you run on a PC
- Demo sounds are short synthesized cues for testing, not a production music library

## Uninstall

Windows Settings → Apps → Snap Jingle Player → Uninstall, or run the installed app with `--uninstall`. You will be asked whether to keep saved pads and sounds.
