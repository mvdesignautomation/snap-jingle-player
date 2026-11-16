import { firstFreeOrigin, isValidDeckSize, MAX_DECKS, overlapsAny, remapPads, snapCell } from "./geometry.ts";
import { layoutById, type LayoutId } from "./layout.ts";
import { createId, createPad, isConfiguredPad } from "./pads.ts";
import type { Deck, Pad, PersistedConfig, Profile } from "./types.ts";

export type ResizeStatus = "ok" | "invalid-size" | "overlap" | "needs-confirm";

export function clipIdsIn(profiles: Profile[]): Set<string> {
  const ids = new Set<string>();
  for (const profile of profiles) {
    for (const deck of profile.decks) {
      for (const pad of deck.pads) {
        if (pad.clipId) ids.add(pad.clipId);
      }
    }
  }
  return ids;
}

export function activeProfile(config: PersistedConfig): Profile | null {
  return config.profiles.find((profile) => profile.id === config.activeProfileId) ?? config.profiles[0] ?? null;
}

export function freshConfig(): PersistedConfig {
  const pads: Pad[] = [];
  for (let index = 0; index < 24; index += 1) {
    pads.push({ ...createPad(index, 6, true), id: `pad-${index}` });
  }
  const profile: Profile = {
    id: "profile-main",
    name: "Main",
    decks: [{ id: "deck-main", name: "Deck 1", cols: 6, rows: 4, x: 0, y: 0, pads }],
  };
  return {
    profiles: [profile],
    activeProfileId: profile.id,
    masterVolume: 0.9,
    muted: false,
    exclusive: false,
    stopHotkey: "Escape",
    seenWelcome: false,
  };
}

export function createEmptyProfile(name: string): Profile {
  const deck = createDeck("Deck 1", 6, 4, 0, 0, true);
  return { id: createId("profile"), name: name.trim() || "Profile", decks: deck ? [deck] : [] };
}

export function createDeck(
  name: string,
  cols: number,
  rows: number,
  x: number,
  y: number,
  withHotkeys: boolean,
): Deck | null {
  if (!isValidDeckSize(cols, rows)) return null;
  const pads: Pad[] = [];
  const count = cols * rows;
  for (let index = 0; index < count; index += 1) pads.push(createPad(index, cols, withHotkeys));
  return { id: createId("deck"), name: name.trim() || "Deck", cols, rows, x: snapCell(x), y: snapCell(y), pads };
}

export function createProfile(config: PersistedConfig, name: string): PersistedConfig | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const profile = createEmptyProfile(trimmed);
  return { ...config, profiles: [...config.profiles, profile], activeProfileId: profile.id };
}

export function renameProfile(config: PersistedConfig, profileId: string, name: string): PersistedConfig | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (!config.profiles.some((profile) => profile.id === profileId)) return null;
  return {
    ...config,
    profiles: config.profiles.map((profile) => (profile.id === profileId ? { ...profile, name: trimmed } : profile)),
  };
}

export function duplicateProfile(config: PersistedConfig, profileId: string): PersistedConfig | null {
  const source = config.profiles.find((profile) => profile.id === profileId);
  if (!source) return null;
  const copy: Profile = {
    id: createId("profile"),
    name: `${source.name} copy`.slice(0, 48),
    decks: source.decks.map((deck) => ({
      ...deck,
      id: createId("deck"),
      pads: deck.pads.map((pad) => ({ ...pad, id: createId("pad") })),
    })),
  };
  return { ...config, profiles: [...config.profiles, copy], activeProfileId: copy.id };
}

export function switchProfile(config: PersistedConfig, profileId: string): PersistedConfig | null {
  if (!config.profiles.some((profile) => profile.id === profileId)) return null;
  return { ...config, activeProfileId: profileId };
}

export function deleteProfile(
  config: PersistedConfig,
  profileId: string,
): { ok: true; config: PersistedConfig; releasedClipIds: string[] } | { ok: false; reason: "last-profile" | "missing" } {
  const target = config.profiles.find((profile) => profile.id === profileId);
  if (!target) return { ok: false, reason: "missing" };
  if (config.profiles.length <= 1) return { ok: false, reason: "last-profile" };
  const remaining = config.profiles.filter((profile) => profile.id !== profileId);
  const stillUsed = clipIdsIn(remaining);
  const releasedClipIds = [...clipIdsIn([target])].filter((id) => !stillUsed.has(id));
  const activeProfileId = remaining.some((profile) => profile.id === config.activeProfileId)
    ? config.activeProfileId
    : remaining[0]!.id;
  return { ok: true, config: { ...config, profiles: remaining, activeProfileId }, releasedClipIds };
}

export function replaceProfile(config: PersistedConfig, profile: Profile): PersistedConfig {
  return { ...config, profiles: config.profiles.map((item) => (item.id === profile.id ? profile : item)) };
}

export function addDeck(
  profile: Profile,
  input: { name: string; cols: number; rows: number },
): { ok: true; profile: Profile; deckId: string } | { ok: false; reason: "invalid-size" | "limit" } {
  if (!isValidDeckSize(input.cols, input.rows)) return { ok: false, reason: "invalid-size" };
  if (profile.decks.length >= MAX_DECKS) return { ok: false, reason: "limit" };
  const origin = firstFreeOrigin(profile.decks, input.cols, input.rows);
  const deck = createDeck(input.name, input.cols, input.rows, origin.x, origin.y, profile.decks.length === 0);
  if (!deck) return { ok: false, reason: "invalid-size" };
  return { ok: true, profile: { ...profile, decks: [...profile.decks, deck] }, deckId: deck.id };
}

export function renameDeck(profile: Profile, deckId: string, name: string): Profile | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (!profile.decks.some((deck) => deck.id === deckId)) return null;
  return {
    ...profile,
    decks: profile.decks.map((deck) => (deck.id === deckId ? { ...deck, name: trimmed } : deck)),
  };
}

export function resizeDeck(
  profile: Profile,
  deckId: string,
  cols: number,
  rows: number,
  confirmDrop: boolean,
): { status: ResizeStatus; profile: Profile; dropped: number } {
  const deck = profile.decks.find((item) => item.id === deckId);
  if (!deck) return { status: "invalid-size", profile, dropped: 0 };
  if (!isValidDeckSize(cols, rows)) return { status: "invalid-size", profile, dropped: 0 };
  if (cols === deck.cols && rows === deck.rows) return { status: "ok", profile, dropped: 0 };
  const candidate = { x: deck.x, y: deck.y, cols, rows };
  const index = profile.decks.findIndex((item) => item.id === deckId);
  if (overlapsAny(profile.decks, candidate, index)) return { status: "overlap", profile, dropped: 0 };
  const remapped = remapPads(deck.pads, deck.cols, deck.rows, cols, rows, (padIndex) => createPad(padIndex, cols, false));
  const dropped = remapped.dropped.filter(isConfiguredPad);
  if (dropped.length > 0 && !confirmDrop) {
    return { status: "needs-confirm", profile, dropped: dropped.length };
  }
  const next: Deck = { ...deck, cols, rows, pads: remapped.pads };
  return {
    status: "ok",
    dropped: dropped.length,
    profile: { ...profile, decks: profile.decks.map((item) => (item.id === deckId ? next : item)) },
  };
}

export function moveDeck(
  profile: Profile,
  deckId: string,
  x: number,
  y: number,
): { ok: true; profile: Profile } | { ok: false; reason: "missing" | "overlap" | "bounds" } {
  const deck = profile.decks.find((item) => item.id === deckId);
  if (!deck) return { ok: false, reason: "missing" };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: "bounds" };
  const nextX = snapCell(x);
  const nextY = snapCell(y);
  if (nextX !== x || nextY !== y) return { ok: false, reason: "bounds" };
  const index = profile.decks.findIndex((item) => item.id === deckId);
  if (overlapsAny(profile.decks, { x: nextX, y: nextY, cols: deck.cols, rows: deck.rows }, index)) {
    return { ok: false, reason: "overlap" };
  }
  return {
    ok: true,
    profile: {
      ...profile,
      decks: profile.decks.map((item) => (item.id === deckId ? { ...item, x: nextX, y: nextY } : item)),
    },
  };
}

export function removeDeck(profile: Profile, deckId: string): Profile {
  return { ...profile, decks: profile.decks.filter((deck) => deck.id !== deckId) };
}

export function decksFromLegacyPads(pads: Pad[], layout: LayoutId): Deck[] {
  const spec = layoutById(layout);
  const visible = spec.cols * spec.rows;
  const primaryPads = pads.slice(0, visible);
  while (primaryPads.length < visible) primaryPads.push(createPad(primaryPads.length, spec.cols, false));
  const decks: Deck[] = [
    {
      id: createId("deck"),
      name: "Deck 1",
      cols: spec.cols,
      rows: spec.rows,
      x: 0,
      y: 0,
      pads: primaryPads,
    },
  ];
  const overflow = pads.slice(visible).filter(isConfiguredPad);
  const chunkCols = Math.min(spec.cols, 8);
  const chunkRows = Math.min(8, Math.floor(48 / chunkCols));
  const chunkSize = chunkCols * chunkRows;
  for (let offset = 0; offset < overflow.length; offset += chunkSize) {
    const slice = overflow.slice(offset, offset + chunkSize);
    const rows = Math.max(1, Math.ceil(slice.length / chunkCols));
    while (slice.length < chunkCols * rows) slice.push(createPad(slice.length, chunkCols, false));
    const origin = firstFreeOrigin(decks, chunkCols, rows);
    decks.push({
      id: createId("deck"),
      name: `Deck ${decks.length + 1}`,
      cols: chunkCols,
      rows,
      x: origin.x,
      y: origin.y,
      pads: slice,
    });
  }
  return decks;
}

export function mapActivePad(profile: Profile, padId: string, update: (pad: Pad) => Pad): Profile | null {
  let found = false;
  const decks = profile.decks.map((deck) => {
    if (!deck.pads.some((pad) => pad.id === padId)) return deck;
    found = true;
    return { ...deck, pads: deck.pads.map((pad) => (pad.id === padId ? update(pad) : pad)) };
  });
  return found ? { ...profile, decks } : null;
}
