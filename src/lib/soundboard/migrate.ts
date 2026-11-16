import { isValidDeckSize } from "./geometry.ts";
import { DEFAULT_LAYOUT, layoutById } from "./layout.ts";
import { decksFromLegacyPads, freshConfig } from "./profiles.ts";
import type { Deck, LayoutId, Pad, PersistedConfig, Profile, RetriggerMode } from "./types.ts";

export const CONFIG_STORAGE_KEY = "sjp-board-v1";
export const CONFIG_BACKUP_KEY = "sjp-board-v1-premigration";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type StoredRecord = { state: PersistedConfig; version: 2 };

const LAYOUT_IDS = new Set<LayoutId>(["3x4", "4x4", "4x6", "5x6", "6x8"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizePad(raw: unknown, index: number): Pad | null {
  if (!isRecord(raw)) return null;
  const retrigger: RetriggerMode = raw.retrigger === "restart" ? "restart" : "overlap";
  return {
    id: asString(raw.id, `pad-legacy-${index}`),
    name: asString(raw.name, `PAD ${String(index + 1).padStart(2, "0")}`),
    color: asString(raw.color, "#3e7a78"),
    clipId: typeof raw.clipId === "string" ? raw.clipId : null,
    fileName: typeof raw.fileName === "string" ? raw.fileName : null,
    duration: typeof raw.duration === "number" && Number.isFinite(raw.duration) ? raw.duration : null,
    missing: raw.missing === true,
    hotkey: typeof raw.hotkey === "string" ? raw.hotkey : null,
    volume: Math.min(1, Math.max(0, asNumber(raw.volume, 1))),
    loop: raw.loop === true,
    retrigger,
  };
}

function normalizeDeck(raw: unknown): Deck | null {
  if (!isRecord(raw) || !Array.isArray(raw.pads)) return null;
  const cols = raw.cols;
  const rows = raw.rows;
  if (typeof cols !== "number" || typeof rows !== "number" || !isValidDeckSize(cols, rows)) return null;
  if (!Number.isInteger(raw.x) || !Number.isInteger(raw.y) || (raw.x as number) < 0 || (raw.y as number) < 0) return null;
  if (raw.pads.length !== cols * rows) return null;
  const pads: Pad[] = [];
  for (let index = 0; index < raw.pads.length; index += 1) {
    const pad = normalizePad(raw.pads[index], index);
    if (!pad) return null;
    pads.push(pad);
  }
  return {
    id: asString(raw.id, `deck-legacy-${cols}x${rows}`),
    name: asString(raw.name, "Deck"),
    cols,
    rows,
    x: raw.x as number,
    y: raw.y as number,
    pads,
  };
}

function decksOverlap(decks: Deck[]): boolean {
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

export function validateConfig(raw: unknown): PersistedConfig | null {
  if (!isRecord(raw) || !Array.isArray(raw.profiles) || raw.profiles.length === 0) return null;
  const profiles: Profile[] = [];
  for (const item of raw.profiles) {
    if (!isRecord(item) || !Array.isArray(item.decks)) return null;
    const decks: Deck[] = [];
    for (const deckRaw of item.decks) {
      const deck = normalizeDeck(deckRaw);
      if (!deck) return null;
      decks.push(deck);
    }
    if (decksOverlap(decks)) return null;
    profiles.push({ id: asString(item.id, ""), name: asString(item.name, "Profile"), decks });
  }
  if (profiles.some((profile) => !profile.id)) return null;
  const activeProfileId = asString(raw.activeProfileId, profiles[0]!.id);
  if (!profiles.some((profile) => profile.id === activeProfileId)) return null;
  return {
    profiles,
    activeProfileId,
    masterVolume: Math.min(1, Math.max(0, asNumber(raw.masterVolume, 0.9))),
    muted: asBoolean(raw.muted, false),
    exclusive: asBoolean(raw.exclusive, false),
    stopHotkey: asString(raw.stopHotkey, "Escape"),
    seenWelcome: asBoolean(raw.seenWelcome, false),
  };
}

function migrateLegacyState(state: Record<string, unknown>): PersistedConfig | null {
  if (!Array.isArray(state.pads)) return null;
  const pads: Pad[] = [];
  for (let index = 0; index < state.pads.length; index += 1) {
    const pad = normalizePad(state.pads[index], index);
    if (!pad) return null;
    pads.push(pad);
  }
  const layout = LAYOUT_IDS.has(state.layout as LayoutId) ? (state.layout as LayoutId) : DEFAULT_LAYOUT;
  if (!layoutById(layout)) return null;
  const profile: Profile = {
    id: "profile-main",
    name: "Main",
    decks: decksFromLegacyPads(pads, layout),
  };
  return {
    profiles: [profile],
    activeProfileId: profile.id,
    masterVolume: Math.min(1, Math.max(0, asNumber(state.masterVolume, 0.9))),
    muted: asBoolean(state.muted, false),
    exclusive: asBoolean(state.exclusive, false),
    stopHotkey: asString(state.stopHotkey, "Escape"),
    seenWelcome: asBoolean(state.seenWelcome, true),
  };
}

export function readConfigRecord(raw: string): { ok: true; record: StoredRecord; migrated: boolean } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Saved board is not valid JSON" };
  }
  if (!isRecord(parsed)) return { ok: false, error: "Saved board has an unexpected shape" };
  const version = parsed.version;
  const state = isRecord(parsed.state) ? parsed.state : parsed;
  if (version === 2 || (Array.isArray(state.profiles) && state.activeProfileId)) {
    const config = validateConfig(state);
    if (!config) return { ok: false, error: "Saved profiles could not be verified" };
    return { ok: true, migrated: false, record: { version: 2, state: config } };
  }
  if (version !== undefined && version !== 0 && version !== 1 && !Array.isArray(state.pads)) {
    return { ok: false, error: `Unsupported board version ${String(version)}` };
  }
  const migrated = migrateLegacyState(state);
  if (!migrated) return { ok: false, error: "Existing board could not be migrated" };
  const verified = validateConfig(migrated);
  if (!verified) return { ok: false, error: "Migrated board failed verification" };
  return { ok: true, migrated: true, record: { version: 2, state: verified } };
}

export function upgradeStoredConfig(
  store: KeyValueStore,
  key = CONFIG_STORAGE_KEY,
): { json: string | null; error: string | null } {
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch (error) {
    return { json: null, error: error instanceof Error ? error.message : "Could not read saved board" };
  }
  if (!raw) return { json: null, error: null };
  const parsed = readConfigRecord(raw);
  if (!parsed.ok) return { json: null, error: parsed.error };
  if (!parsed.migrated) return { json: JSON.stringify(parsed.record), error: null };
  const encoded = JSON.stringify(parsed.record);
  try {
    if (!store.getItem(CONFIG_BACKUP_KEY)) store.setItem(CONFIG_BACKUP_KEY, raw);
    store.setItem(key, encoded);
  } catch (error) {
    return { json: null, error: error instanceof Error ? error.message : "Could not save migrated board" };
  }
  return { json: encoded, error: null };
}

export function defaultStoredRecord(): StoredRecord {
  return { version: 2, state: freshConfig() };
}
