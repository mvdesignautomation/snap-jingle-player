import type { BoardBackup, Pad, PersistedBoard } from "./types";
import { arrayBufferToBase64, base64ToArrayBuffer, getClip } from "./clip-store";
import { MAX_PADS } from "./layout";

export async function buildBackup(state: PersistedBoard): Promise<BoardBackup> {
  const pads = await Promise.all(
    state.pads.slice(0, MAX_PADS).map(async (pad) => {
      let audio: BoardBackup["pads"][number]["audio"] = null;
      if (pad.clipId) {
        const clip = await getClip(pad.clipId);
        if (clip) {
          audio = {
            mime: clip.mime,
            base64: arrayBufferToBase64(clip.bytes),
          };
        }
      }
      return {
        name: pad.name,
        color: pad.color,
        hotkey: pad.hotkey,
        volume: pad.volume,
        loop: pad.loop,
        retrigger: pad.retrigger,
        fileName: pad.fileName,
        audio,
      };
    }),
  );

  return {
    version: 1,
    app: "snap-jingle-player",
    exportedAt: new Date().toISOString(),
    settings: {
      layout: state.layout,
      masterVolume: state.masterVolume,
      muted: state.muted,
      exclusive: state.exclusive,
      stopHotkey: state.stopHotkey,
    },
    pads,
  };
}

export function parseBackup(raw: unknown): BoardBackup {
  if (!raw || typeof raw !== "object") throw new Error("Invalid board file");
  const data = raw as Partial<BoardBackup>;
  if (data.app !== "snap-jingle-player" || data.version !== 1 || !Array.isArray(data.pads)) {
    throw new Error("This file is not a Snap Jingle Player board");
  }
  return data as BoardBackup;
}

export function decodeBackupAudio(base64: string): ArrayBuffer {
  return base64ToArrayBuffer(base64);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function emptyPadPatch(index: number): Partial<Pad> {
  return {
    name: `PAD ${String(index + 1).padStart(2, "0")}`,
    clipId: null,
    fileName: null,
    duration: null,
    missing: false,
    loop: false,
    volume: 1,
  };
}
