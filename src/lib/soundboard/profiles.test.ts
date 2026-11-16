import assert from "node:assert/strict";
import test from "node:test";
import { parseBackupDocument } from "./backup.ts";
import { isValidDeckSize, rectsOverlap, snapCell, workspaceBounds } from "./geometry.ts";
import { CONFIG_BACKUP_KEY, readConfigRecord, upgradeStoredConfig, type KeyValueStore } from "./migrate.ts";
import {
  addDeck,
  createProfile,
  deleteProfile,
  duplicateProfile,
  freshConfig,
  moveDeck,
  renameProfile,
  resizeDeck,
  switchProfile,
} from "./profiles.ts";
import type { Pad } from "./types.ts";

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      return data[key] ?? null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

function legacyPad(index: number, clipId: string | null = null): Pad {
  return {
    id: `pad-${index}`,
    name: clipId ? `SOUND ${index}` : `PAD ${String(index + 1).padStart(2, "0")}`,
    color: "#3e7a78",
    clipId,
    fileName: clipId ? `sound-${index}.wav` : null,
    duration: clipId ? 1.2 : null,
    missing: false,
    hotkey: "Digit1",
    volume: 0.5,
    loop: true,
    retrigger: "restart",
  };
}

function legacyRecord(pads: Pad[]) {
  return JSON.stringify({
    state: {
      pads,
      layout: "4x6",
      masterVolume: 0.4,
      muted: false,
      exclusive: true,
      stopHotkey: "F1",
      seenWelcome: true,
    },
    version: 0,
  });
}

test("deck size limits allow 2x8 and 8x6 but reject 8x7 and 9 columns", () => {
  assert.equal(isValidDeckSize(2, 8), true);
  assert.equal(isValidDeckSize(8, 6), true);
  assert.equal(isValidDeckSize(8, 7), false);
  assert.equal(isValidDeckSize(9, 1), false);
  assert.equal(isValidDeckSize(0, 2), false);
});

test("rectangles that only touch do not overlap", () => {
  assert.equal(rectsOverlap({ x: 0, y: 0, cols: 2, rows: 2 }, { x: 2, y: 0, cols: 2, rows: 2 }), false);
  assert.equal(rectsOverlap({ x: 0, y: 0, cols: 2, rows: 2 }, { x: 1, y: 1, cols: 2, rows: 2 }), true);
  assert.equal(snapCell(-3.2), 0);
  assert.equal(snapCell(2.4), 2);
});

test("workspace grows past the initial canvas", () => {
  const bounds = workspaceBounds([{ x: 20, y: 12, cols: 4, rows: 2 }]);
  assert.ok(bounds.cols > 20);
  assert.ok(bounds.rows > 12);
});

test("legacy config migrates into one profile and a second pass does not duplicate it", () => {
  const pads = Array.from({ length: 48 }, (_, index) => legacyPad(index, index === 30 ? "clip-hidden" : index === 0 ? "clip-a" : null));
  const store = memory({ "sjp-board-v1": legacyRecord(pads) });
  const first = upgradeStoredConfig(store);
  assert.equal(first.error, null);
  const parsed = JSON.parse(store.data["sjp-board-v1"]!);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.state.profiles.length, 1);
  assert.equal(parsed.state.profiles[0].name, "Main");
  assert.equal(parsed.state.activeProfileId, "profile-main");
  assert.equal(parsed.state.exclusive, true);
  assert.equal(parsed.state.stopHotkey, "F1");
  const mainDeck = parsed.state.profiles[0].decks[0];
  assert.equal(mainDeck.cols, 6);
  assert.equal(mainDeck.rows, 4);
  assert.equal(mainDeck.pads[0].clipId, "clip-a");
  assert.equal(mainDeck.pads[0].loop, true);
  assert.ok(parsed.state.profiles[0].decks.length > 1);
  const overflow = parsed.state.profiles[0].decks.flatMap((deck: { pads: Pad[] }) => deck.pads);
  assert.ok(overflow.some((pad: Pad) => pad.clipId === "clip-hidden"));
  assert.ok(store.data[CONFIG_BACKUP_KEY]?.includes("clip-hidden"));

  const profileId = parsed.state.profiles[0].id;
  const second = upgradeStoredConfig(store);
  assert.equal(second.error, null);
  const again = JSON.parse(store.data["sjp-board-v1"]!);
  assert.equal(again.state.profiles.length, 1);
  assert.equal(again.state.profiles[0].id, profileId);
});

test("failed and interrupted migration keep the original record", () => {
  const original = JSON.stringify({ state: { pads: "nope" }, version: 0 });
  const store = memory({ "sjp-board-v1": original });
  const failed = upgradeStoredConfig(store);
  assert.match(failed.error ?? "", /could not be migrated/i);
  assert.equal(store.data["sjp-board-v1"], original);
  assert.equal(store.data[CONFIG_BACKUP_KEY], undefined);

  const quota = memory({ "sjp-board-v1": legacyRecord([legacyPad(0, "clip-a")]) });
  quota.setItem = () => {
    throw new Error("storage unavailable");
  };
  const blocked = upgradeStoredConfig(quota);
  assert.match(blocked.error ?? "", /storage unavailable/);
  assert.match(quota.data["sjp-board-v1"]!, /clip-a/);

  const interrupted = memory({ "sjp-board-v1": legacyRecord([legacyPad(0, "clip-a")]) });
  const prepared = readConfigRecord(interrupted.data["sjp-board-v1"]!);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.record.state.profiles.length, 1);
  const retry = readConfigRecord(interrupted.data["sjp-board-v1"]!);
  assert.equal(retry.ok && retry.migrated, true);
  assert.equal(retry.ok && retry.record.state.profiles.length, 1);
});

test("profiles can be created, renamed, duplicated, switched, and deleted without dropping shared audio", () => {
  let config = freshConfig();
  const created = createProfile(config, "Podcast");
  assert.ok(created);
  config = created!;
  assert.equal(config.profiles.length, 2);
  assert.equal(config.profiles[1]!.name, "Podcast");
  const renamed = renameProfile(config, config.profiles[1]!.id, "Radio");
  assert.equal(renamed?.profiles[1]!.name, "Radio");
  config = renamed!;
  const source = config.profiles[1]!;
  source.decks[0]!.pads[0] = { ...source.decks[0]!.pads[0]!, clipId: "shared-clip", fileName: "bed.wav" };
  const duplicated = duplicateProfile(config, source.id);
  assert.ok(duplicated);
  config = duplicated!;
  const copy = config.profiles[2]!;
  assert.equal(copy.decks[0]!.pads[0]!.clipId, "shared-clip");
  assert.notEqual(copy.decks[0]!.pads[0]!.id, source.decks[0]!.pads[0]!.id);
  const switched = switchProfile(config, source.id);
  assert.equal(switched?.activeProfileId, source.id);
  const removed = deleteProfile(switched!, copy.id);
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.deepEqual(removed.releasedClipIds, []);
  assert.equal(removed.config.profiles.some((profile) => profile.decks[0]?.pads[0]?.clipId === "shared-clip"), true);
  const last = deleteProfile(
    { ...removed.config, profiles: [removed.config.profiles[0]!], activeProfileId: removed.config.profiles[0]!.id },
    removed.config.profiles[0]!.id,
  );
  assert.equal(last.ok, false);
});

test("decks resize from the top left, move on the grid, and refuse overlaps", () => {
  let config = freshConfig();
  const profile = config.profiles[0]!;
  profile.decks[0]!.pads[0] = { ...profile.decks[0]!.pads[0]!, clipId: "keep" };
  profile.decks[0]!.pads[5] = { ...profile.decks[0]!.pads[5]!, clipId: "edge" };
  const grown = resizeDeck(profile, profile.decks[0]!.id, 8, 4, false);
  assert.equal(grown.status, "ok");
  assert.equal(grown.profile.decks[0]!.pads[0]!.clipId, "keep");
  const shrunk = resizeDeck(grown.profile, grown.profile.decks[0]!.id, 4, 4, false);
  assert.equal(shrunk.status, "needs-confirm");
  assert.equal(shrunk.dropped > 0, true);
  assert.equal(shrunk.profile.decks[0]!.cols, 8);
  const confirmed = resizeDeck(grown.profile, grown.profile.decks[0]!.id, 4, 4, true);
  assert.equal(confirmed.status, "ok");
  assert.equal(confirmed.profile.decks[0]!.pads.length, 16);
  const added = addDeck(confirmed.profile, { name: "Stingers", cols: 2, rows: 8 });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(added.profile.decks[1]!.cols * added.profile.decks[1]!.rows, 16);
  const blocked = moveDeck(added.profile, added.profile.decks[1]!.id, 0, 0);
  assert.equal(blocked.ok, false);
  const placed = moveDeck(added.profile, added.profile.decks[1]!.id, 10, 3);
  assert.equal(placed.ok, true);
  if (!placed.ok) return;
  config = { ...config, profiles: [placed.profile] };
  const bounds = workspaceBounds(placed.profile.decks);
  assert.ok(bounds.cols >= 12);
  assert.ok(bounds.rows >= 8);
});

test("backup parser accepts a legacy board and rejects an overlapping library", () => {
  const legacy = parseBackupDocument({
    version: 1,
    app: "snap-jingle-player",
    exportedAt: "2026-01-01T00:00:00.000Z",
    settings: { layout: "3x4", masterVolume: 1, muted: false, exclusive: false, stopHotkey: "Escape" },
    pads: [{ name: "INTRO", color: "#3e7a78", hotkey: "Digit1", volume: 1, loop: false, retrigger: "overlap", fileName: "intro.wav", audio: null }],
  });
  assert.equal(legacy.kind, "legacy");
  assert.throws(
    () =>
      parseBackupDocument({
        version: 2,
        app: "snap-jingle-player",
        settings: { masterVolume: 1, muted: false, exclusive: false, stopHotkey: "Escape" },
        profiles: [
          {
            name: "Bad",
            decks: [
              { name: "A", cols: 2, rows: 2, x: 0, y: 0, pads: blankPads(4) },
              { name: "B", cols: 2, rows: 2, x: 1, y: 0, pads: blankPads(4) },
            ],
          },
        ],
      }),
    /overlapping/i,
  );
  assert.throws(() => parseBackupDocument({ version: 2, app: "other", profiles: [] }), /not a Snap Jingle Player/);
});

function blankPads(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `PAD ${index}`,
    color: "#3e7a78",
    hotkey: null,
    volume: 1,
    loop: false,
    retrigger: "overlap",
    fileName: null,
    audio: null,
  }));
}
