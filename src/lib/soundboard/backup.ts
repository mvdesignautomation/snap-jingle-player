import { isValidDeckSize } from "./geometry.ts";
import { DEFAULT_LAYOUT } from "./layout.ts";
import { arrayBufferToBase64, base64ToArrayBuffer, getClip } from "./clip-store.ts";
import type {
  BackupPad,
  BoardBackup,
  Deck,
  LayoutId,
  LibraryBackup,
  Pad,
  PersistedConfig,
  Profile,
} from "./types.ts";

const LAYOUTS = new Set<LayoutId>(["3x4", "4x4", "4x6", "5x6", "6x8"]);

export type ImportDocument =
  | { kind: "legacy"; backup: BoardBackup }
  | { kind: "library"; backup: LibraryBackup };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBackupPad(raw: unknown, index: number): BackupPad {
  if (!isRecord(raw)) throw new Error(`Pad ${index + 1} is invalid`);
  const retrigger = raw.retrigger === "restart" ? "restart" : "overlap";
  let audio: BackupPad["audio"] = null;
  if (raw.audio != null) {
    if (!isRecord(raw.audio) || typeof raw.audio.base64 !== "string" || typeof raw.audio.mime !== "string") {
      throw new Error(`Pad ${index + 1} has invalid audio`);
    }
    audio = { mime: raw.audio.mime, base64: raw.audio.base64 };
  }
  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : `PAD ${index + 1}`,
    color: typeof raw.color === "string" ? raw.color : "#3e7a78",
    hotkey: typeof raw.hotkey === "string" ? raw.hotkey : null,
    volume: typeof raw.volume === "number" && Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : 1,
    loop: raw.loop === true,
    retrigger,
    fileName: typeof raw.fileName === "string" ? raw.fileName : null,
    audio,
  };
}

function audioIncluded(profiles: LibraryBackup["profiles"]): boolean {
  for (const profile of profiles) {
    for (const deck of profile.decks) {
      for (const pad of deck.pads) {
        if (pad.fileName && !pad.audio) return false;
      }
    }
  }
  return true;
}

export async function buildLibraryBackup(config: PersistedConfig): Promise<LibraryBackup> {
  const profiles = await Promise.all(
    config.profiles.map(async (profile) => ({
      name: profile.name,
      decks: await Promise.all(
        profile.decks.map(async (deck) => ({
          name: deck.name,
          cols: deck.cols,
          rows: deck.rows,
          x: deck.x,
          y: deck.y,
          pads: await Promise.all(deck.pads.map((pad) => backupPad(pad))),
        })),
      ),
    })),
  );
  return {
    version: 2,
    app: "snap-jingle-player",
    exportedAt: new Date().toISOString(),
    settings: {
      masterVolume: config.masterVolume,
      muted: config.muted,
      exclusive: config.exclusive,
      stopHotkey: config.stopHotkey,
    },
    profiles,
    audioIncluded: audioIncluded(profiles),
  };
}

async function backupPad(pad: Pad): Promise<BackupPad> {
  let audio: BackupPad["audio"] = null;
  if (pad.clipId) {
    const clip = await getClip(pad.clipId);
    if (clip) audio = { mime: clip.mime, base64: arrayBufferToBase64(clip.bytes) };
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
}

export function parseBackupDocument(raw: unknown): ImportDocument {
  if (!isRecord(raw) || raw.app !== "snap-jingle-player") throw new Error("This file is not a Snap Jingle Player backup");
  if (raw.version === 1) return { kind: "legacy", backup: parseLegacy(raw) };
  if (raw.version === 2) return { kind: "library", backup: parseLibrary(raw) };
  throw new Error("Unsupported backup version");
}

function readSettings(raw: unknown): LibraryBackup["settings"] {
  const settings = isRecord(raw) ? raw : {};
  return {
    masterVolume:
      typeof settings.masterVolume === "number" && Number.isFinite(settings.masterVolume)
        ? Math.min(1, Math.max(0, settings.masterVolume))
        : 0.9,
    muted: settings.muted === true,
    exclusive: settings.exclusive === true,
    stopHotkey: typeof settings.stopHotkey === "string" && settings.stopHotkey ? settings.stopHotkey : "Escape",
  };
}

function parseLegacy(raw: Record<string, unknown>): BoardBackup {
  if (!Array.isArray(raw.pads)) throw new Error("This file is not a Snap Jingle Player board");
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const layout = LAYOUTS.has(settings.layout as LayoutId) ? (settings.layout as LayoutId) : DEFAULT_LAYOUT;
  return {
    version: 1,
    app: "snap-jingle-player",
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
    settings: { ...readSettings(settings), layout },
    pads: raw.pads.map((pad, index) => readBackupPad(pad, index)),
  };
}

function parseLibrary(raw: Record<string, unknown>): LibraryBackup {
  if (!Array.isArray(raw.profiles) || raw.profiles.length === 0) throw new Error("Backup does not contain a profile");
  const profiles = raw.profiles.map((profile, profileIndex) => {
    if (!isRecord(profile) || !Array.isArray(profile.decks)) throw new Error(`Profile ${profileIndex + 1} is invalid`);
    const decks = profile.decks.map((deck, deckIndex) => parseDeck(deck, profileIndex, deckIndex));
    if (decksOverlap(decks)) throw new Error(`Profile ${profileIndex + 1} has overlapping decks`);
    return { name: typeof profile.name === "string" && profile.name.trim() ? profile.name : `Profile ${profileIndex + 1}`, decks };
  });
  return {
    version: 2,
    app: "snap-jingle-player",
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
    settings: readSettings(raw.settings),
    profiles,
    audioIncluded: raw.audioIncluded === true && audioIncluded(profiles),
  };
}

function parseDeck(raw: unknown, profileIndex: number, deckIndex: number): LibraryBackup["profiles"][number]["decks"][number] {
  if (!isRecord(raw) || !Array.isArray(raw.pads)) throw new Error(`Deck ${deckIndex + 1} in profile ${profileIndex + 1} is invalid`);
  const cols = raw.cols;
  const rows = raw.rows;
  const x = raw.x;
  const y = raw.y;
  if (typeof cols !== "number" || typeof rows !== "number" || !isValidDeckSize(cols, rows)) {
    throw new Error(`Deck ${deckIndex + 1} has an unsupported size`);
  }
  if (typeof x !== "number" || typeof y !== "number" || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
    throw new Error(`Deck ${deckIndex + 1} has an invalid position`);
  }
  if (raw.pads.length !== cols * rows) throw new Error(`Deck ${deckIndex + 1} has the wrong number of buttons`);
  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : `Deck ${deckIndex + 1}`,
    cols,
    rows,
    x,
    y,
    pads: raw.pads.map((pad, index) => readBackupPad(pad, index)),
  };
}

function decksOverlap(decks: { x: number; y: number; cols: number; rows: number }[]): boolean {
  for (let i = 0; i < decks.length; i += 1) {
    for (let j = i + 1; j < decks.length; j += 1) {
      const a = decks[i]!;
      const b = decks[j]!;
      const separated = a.x + a.cols <= b.x || b.x + b.cols <= a.x || a.y + a.rows <= b.y || b.y + b.rows <= a.y;
      if (!separated) return true;
    }
  }
  return false;
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

export function padsOf(profile: Profile): Pad[] {
  return profile.decks.flatMap((deck: Deck) => deck.pads);
}
