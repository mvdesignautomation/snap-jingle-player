import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { toast } from "sonner";
import { audioEngine } from "./audio-engine";
import { buildLibraryBackup, decodeBackupAudio, downloadJson, parseBackupDocument, type ImportDocument } from "./backup";
import { deleteClip, getClip, guessMime, putClip } from "./clip-store";
import { DEMO_SOUNDS, sampleUrl } from "./demo";
import { CONFIG_STORAGE_KEY, upgradeStoredConfig } from "./migrate";
import { blankPad } from "./pads";
import { createId } from "./pads";
import {
  activeProfile,
  addDeck as addDeckToProfile,
  clipIdsIn,
  createDeck,
  createProfile as createProfileConfig,
  deleteProfile as deleteProfileConfig,
  duplicateProfile as duplicateProfileConfig,
  freshConfig,
  mapActivePad,
  moveDeck as moveDeckOnProfile,
  removeDeck as removeDeckFromProfile,
  renameDeck as renameDeckOnProfile,
  renameProfile as renameProfileConfig,
  replaceProfile,
  resizeDeck as resizeDeckOnProfile,
  switchProfile as switchProfileConfig,
  decksFromLegacyPads,
  type ResizeStatus,
} from "./profiles";
import type { BackupPad, Deck, Pad, PersistedConfig, Profile } from "./types";

type BoardState = PersistedConfig & {
  hydrated: boolean;
  migrationError: string | null;
  setMasterVolume: (value: number) => void;
  setMuted: (muted: boolean) => void;
  setExclusive: (exclusive: boolean) => void;
  setStopHotkey: (code: string) => void;
  markWelcomeSeen: () => void;
  createProfile: (name: string) => void;
  renameProfile: (profileId: string, name: string) => void;
  duplicateProfile: (profileId: string) => void;
  switchProfile: (profileId: string) => void;
  deleteProfile: (profileId: string) => Promise<boolean>;
  addDeck: (input: { name: string; cols: number; rows: number }) => boolean;
  renameDeck: (deckId: string, name: string) => void;
  resizeDeck: (deckId: string, cols: number, rows: number, confirmDrop: boolean) => { status: ResizeStatus; dropped: number };
  moveDeck: (deckId: string, x: number, y: number) => boolean;
  removeDeck: (deckId: string) => Promise<void>;
  updatePad: (padId: string, patch: Partial<Pad>) => void;
  assignFile: (padId: string, file: File) => Promise<void>;
  clearPadAudio: (padId: string) => Promise<void>;
  resetPad: (padId: string) => Promise<void>;
  triggerPad: (padId: string) => void;
  stopPad: (padId: string) => void;
  stopAll: () => void;
  movePad: (fromId: string, toId: string) => void;
  hydrateClips: () => Promise<void>;
  loadDemo: () => Promise<void>;
  exportBoard: () => Promise<void>;
  importBoard: (file: File, mode: "add" | "replace") => Promise<void>;
  resetBoard: () => Promise<void>;
};

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

let migrationError: string | null = null;

const configStorage = {
  getItem: (name: string) => {
    const result = upgradeStoredConfig(localStorage, name);
    migrationError = result.error;
    return result.json;
  },
  setItem: (name: string, value: string) => {
    if (migrationError) return;
    localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (migrationError) return;
    localStorage.removeItem(name);
  },
};

function currentProfile(state: PersistedConfig): Profile | null {
  return activeProfile(state);
}

async function releaseClip(get: () => BoardState, clipId: string | null) {
  if (!clipId) return;
  if (clipIdsIn(get().profiles).has(clipId)) return;
  audioEngine.unloadClip(clipId);
  await deleteClip(clipId);
}

async function padsFromBackup(items: BackupPad[], cols: number): Promise<Pad[]> {
  const pads: Pad[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const incoming = items[index]!;
    const base = blankPad(
      { id: createId("pad"), name: "", color: "", clipId: null, fileName: null, duration: null, missing: false, hotkey: null, volume: 1, loop: false, retrigger: "overlap" },
      index,
      cols,
    );
    let clipId: string | null = null;
    let duration: number | null = null;
    let missing = Boolean(incoming.fileName && !incoming.audio);
    if (incoming.audio) {
      clipId = crypto.randomUUID();
      const bytes = decodeBackupAudio(incoming.audio.base64);
      try {
        await putClip({ id: clipId, name: incoming.fileName ?? `clip-${index + 1}`, mime: incoming.audio.mime, bytes });
        duration = await audioEngine.loadClip(clipId, bytes);
        missing = false;
      } catch {
        missing = true;
      }
    }
    pads.push({
      ...base,
      name: incoming.name,
      color: incoming.color,
      hotkey: incoming.hotkey,
      volume: incoming.volume,
      loop: incoming.loop,
      retrigger: incoming.retrigger,
      clipId,
      fileName: incoming.fileName,
      duration,
      missing,
    });
  }
  return pads;
}

async function profilesFromImport(document: ImportDocument): Promise<{ profiles: Profile[]; settings: ImportDocument["backup"]["settings"] }> {
  if (document.kind === "legacy") {
    const pads = await padsFromBackup(document.backup.pads, 6);
    return {
      settings: document.backup.settings,
      profiles: [
        {
          id: createId("profile"),
          name: "Imported board",
          decks: decksFromLegacyPads(pads, document.backup.settings.layout),
        },
      ],
    };
  }
  const profiles: Profile[] = [];
  for (const profile of document.backup.profiles) {
    const decks: Deck[] = [];
    for (const deck of profile.decks) {
      decks.push({
        id: createId("deck"),
        name: deck.name,
        cols: deck.cols,
        rows: deck.rows,
        x: deck.x,
        y: deck.y,
        pads: await padsFromBackup(deck.pads, deck.cols),
      });
    }
    profiles.push({ id: createId("profile"), name: profile.name, decks });
  }
  return { profiles, settings: document.backup.settings };
}

const initial = freshConfig();

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      ...initial,
      hydrated: false,
      migrationError: null,

      setMasterVolume: (value) => {
        audioEngine.setMasterVolume(value);
        set({ masterVolume: value });
      },
      setMuted: (muted) => {
        audioEngine.setMuted(muted);
        set({ muted });
      },
      setExclusive: (exclusive) => set({ exclusive }),
      setStopHotkey: (code) => set({ stopHotkey: code }),
      markWelcomeSeen: () => set({ seenWelcome: true }),

      createProfile: (name) => {
        const next = createProfileConfig(get(), name);
        if (!next) {
          toast.error("Enter a profile name");
          return;
        }
        set(next);
      },
      renameProfile: (profileId, name) => {
        const next = renameProfileConfig(get(), profileId, name);
        if (next) set(next);
      },
      duplicateProfile: (profileId) => {
        const next = duplicateProfileConfig(get(), profileId);
        if (next) {
          set(next);
          toast.success("Profile duplicated");
        }
      },
      switchProfile: (profileId) => {
        const next = switchProfileConfig(get(), profileId);
        if (next) set(next);
      },
      deleteProfile: async (profileId) => {
        const result = deleteProfileConfig(get(), profileId);
        if (!result.ok) {
          toast.error(result.reason === "last-profile" ? "Keep at least one profile" : "Profile not found");
          return false;
        }
        set(result.config);
        for (const clipId of result.releasedClipIds) await releaseClip(get, clipId);
        return true;
      },

      addDeck: (input) => {
        const profile = currentProfile(get());
        if (!profile) return false;
        const result = addDeckToProfile(profile, input);
        if (!result.ok) {
          toast.error(result.reason === "limit" ? "This profile already has 32 decks" : "That deck size is not allowed");
          return false;
        }
        set(replaceProfile(get(), result.profile));
        return true;
      },
      renameDeck: (deckId, name) => {
        const profile = currentProfile(get());
        if (!profile) return;
        const next = renameDeckOnProfile(profile, deckId, name);
        if (next) set(replaceProfile(get(), next));
      },
      resizeDeck: (deckId, cols, rows, confirmDrop) => {
        const profile = currentProfile(get());
        if (!profile) return { status: "invalid-size", dropped: 0 };
        const result = resizeDeckOnProfile(profile, deckId, cols, rows, confirmDrop);
        if (result.status !== "ok") return { status: result.status, dropped: result.dropped };
        const previous = profile.decks.find((deck) => deck.id === deckId);
        set(replaceProfile(get(), result.profile));
        if (previous) {
          const kept = new Set(
            result.profile.decks
              .find((deck) => deck.id === deckId)
              ?.pads.map((pad) => pad.clipId)
              .filter((id): id is string => Boolean(id)),
          );
          for (const pad of previous.pads) {
            if (pad.clipId && !kept.has(pad.clipId)) void releaseClip(get, pad.clipId);
          }
        }
        return { status: "ok", dropped: result.dropped };
      },
      moveDeck: (deckId, x, y) => {
        const profile = currentProfile(get());
        if (!profile) return false;
        const result = moveDeckOnProfile(profile, deckId, x, y);
        if (!result.ok) return false;
        set(replaceProfile(get(), result.profile));
        return true;
      },
      removeDeck: async (deckId) => {
        const profile = currentProfile(get());
        if (!profile) return;
        const deck = profile.decks.find((item) => item.id === deckId);
        set(replaceProfile(get(), removeDeckFromProfile(profile, deckId)));
        if (!deck) return;
        for (const pad of deck.pads) await releaseClip(get, pad.clipId);
      },

      updatePad: (padId, patch) => {
        const profile = currentProfile(get());
        if (!profile) return;
        const next = mapActivePad(profile, padId, (pad) => ({ ...pad, ...patch, id: pad.id }));
        if (next) set(replaceProfile(get(), next));
      },

      assignFile: async (padId, file) => {
        const profile = currentProfile(get());
        const pad = profile?.decks.flatMap((deck) => deck.pads).find((item) => item.id === padId);
        if (!profile || !pad) return;
        const clipId = crypto.randomUUID();
        const bytes = await file.arrayBuffer();
        try {
          await putClip({ id: clipId, name: file.name, mime: file.type || guessMime(file.name), bytes });
          const duration = await audioEngine.loadClip(clipId, bytes);
          const previous = pad.clipId;
          const next = mapActivePad(currentProfile(get()) ?? profile, padId, (item) => ({
            ...item,
            clipId,
            fileName: file.name,
            duration,
            missing: false,
            name: item.fileName ? item.name : file.name.replace(/\.[^.]+$/, "").toUpperCase(),
          }));
          if (next) set(replaceProfile(get(), next));
          await releaseClip(get, previous);
        } catch (error) {
          await deleteClip(clipId).catch(() => undefined);
          const message = error instanceof Error ? error.message : "Could not decode that file";
          toast.error("Could not load audio", { description: message });
          throw error;
        }
      },

      clearPadAudio: async (padId) => {
        const profile = currentProfile(get());
        const pad = profile?.decks.flatMap((deck) => deck.pads).find((item) => item.id === padId);
        if (!profile || !pad) return;
        audioEngine.stopPad(padId);
        const next = mapActivePad(profile, padId, (item) => ({
          ...item,
          clipId: null,
          fileName: null,
          duration: null,
          missing: false,
        }));
        if (next) set(replaceProfile(get(), next));
        await releaseClip(get, pad.clipId);
      },

      resetPad: async (padId) => {
        const profile = currentProfile(get());
        if (!profile) return;
        const deck = profile.decks.find((item) => item.pads.some((pad) => pad.id === padId));
        if (!deck) return;
        const index = deck.pads.findIndex((pad) => pad.id === padId);
        await get().clearPadAudio(padId);
        const latest = currentProfile(get());
        if (!latest) return;
        const next = mapActivePad(latest, padId, (pad) => blankPad(pad, index, deck.cols));
        if (next) set(replaceProfile(get(), next));
      },

      triggerPad: (padId) => {
        const { exclusive, masterVolume, muted } = get();
        const profile = currentProfile(get());
        const pad = profile?.decks.flatMap((deck) => deck.pads).find((item) => item.id === padId);
        if (!pad) return;
        audioEngine.ensureContext();
        audioEngine.setMasterVolume(masterVolume);
        audioEngine.setMuted(muted);
        if (!pad.clipId) return;
        if (pad.missing || !audioEngine.hasClip(pad.clipId)) {
          const next = mapActivePad(profile!, padId, (item) => ({ ...item, missing: true }));
          if (next) set(replaceProfile(get(), next));
          toast.error("Audio file not found", { description: "Edit the pad to locate or replace the sound." });
          return;
        }
        try {
          audioEngine.play(padId, pad.clipId, {
            volume: pad.volume,
            loop: pad.loop,
            exclusive,
            retrigger: pad.retrigger,
          });
        } catch {
          toast.error("Playback failed", { description: pad.fileName ?? "Unknown clip" });
        }
      },

      stopPad: (padId) => audioEngine.stopPad(padId),
      stopAll: () => audioEngine.stopAll(),

      movePad: (fromId, toId) => {
        if (fromId === toId) return;
        const profile = currentProfile(get());
        if (!profile) return;
        const decks = profile.decks.map((deck) => {
          const from = deck.pads.findIndex((pad) => pad.id === fromId);
          const to = deck.pads.findIndex((pad) => pad.id === toId);
          if (from < 0 || to < 0) return deck;
          const pads = [...deck.pads];
          const [moved] = pads.splice(from, 1);
          if (!moved) return deck;
          pads.splice(to, 0, moved);
          return { ...deck, pads };
        });
        set(replaceProfile(get(), { ...profile, decks }));
      },

      hydrateClips: async () => {
        const { profiles, masterVolume, muted } = get();
        audioEngine.setMasterVolume(masterVolume);
        audioEngine.setMuted(muted);
        const nextProfiles = await Promise.all(
          profiles.map(async (profile) => ({
            ...profile,
            decks: await Promise.all(
              profile.decks.map(async (deck) => ({
                ...deck,
                pads: await Promise.all(
                  deck.pads.map(async (pad) => {
                    if (!pad.clipId) return pad;
                    const clip = await getClip(pad.clipId);
                    if (!clip) return { ...pad, missing: true };
                    try {
                      const duration = await audioEngine.loadClip(pad.clipId, clip.bytes);
                      return { ...pad, duration, missing: false, fileName: pad.fileName ?? clip.name };
                    } catch {
                      return { ...pad, missing: true };
                    }
                  }),
                ),
              })),
            ),
          })),
        );
        set({ profiles: nextProfiles, hydrated: true, migrationError });
      },

      loadDemo: async () => {
        const profile = currentProfile(get());
        const deck = profile?.decks[0];
        if (!deck) return;
        for (let index = 0; index < Math.min(DEMO_SOUNDS.length, deck.pads.length); index += 1) {
          const demo = DEMO_SOUNDS[index]!;
          const pad = currentProfile(get())?.decks[0]?.pads[index];
          if (!pad) continue;
          try {
            const response = await fetch(sampleUrl(demo.file));
            if (!response.ok) continue;
            const file = new File([await response.arrayBuffer()], demo.file, { type: "audio/wav" });
            await get().assignFile(pad.id, file);
            get().updatePad(pad.id, { name: demo.name, color: demo.color });
          } catch {
            /* skip a missing demo clip */
          }
        }
        set({ seenWelcome: true });
        toast.success("Demo sounds loaded");
      },

      exportBoard: async () => {
        const backup = await buildLibraryBackup(get());
        downloadJson("snap-jingle-library.json", backup);
        toast.success(backup.audioIncluded ? "Library exported with audio" : "Library exported", {
          description: backup.audioIncluded ? "Every assigned sound is inside the file." : "Some sounds were missing and were not included.",
        });
      },

      importBoard: async (file, mode) => {
        let document: ImportDocument;
        try {
          document = parseBackupDocument(JSON.parse(await file.text()));
        } catch (error) {
          toast.error("Could not import", { description: error instanceof Error ? error.message : "Invalid file" });
          return;
        }
        const imported = await profilesFromImport(document);
        if (mode === "replace") {
          audioEngine.stopAll();
          const previous = clipIdsIn(get().profiles);
          set({
            profiles: imported.profiles,
            activeProfileId: imported.profiles[0]!.id,
            masterVolume: imported.settings.masterVolume,
            muted: imported.settings.muted,
            exclusive: imported.settings.exclusive,
            stopHotkey: imported.settings.stopHotkey || "Escape",
            seenWelcome: true,
          });
          audioEngine.setMasterVolume(imported.settings.masterVolume);
          audioEngine.setMuted(imported.settings.muted);
          const kept = clipIdsIn(get().profiles);
          for (const clipId of previous) {
            if (!kept.has(clipId)) await releaseClip(get, clipId);
          }
          toast.success("Library replaced");
          return;
        }
        const profiles = [...get().profiles, ...imported.profiles];
        set({ profiles, activeProfileId: imported.profiles[0]!.id, seenWelcome: true });
        toast.success(imported.profiles.length === 1 ? "Profile added" : `${imported.profiles.length} profiles added`);
      },

      resetBoard: async () => {
        const profile = currentProfile(get());
        if (!profile) return;
        audioEngine.stopAll();
        const deck = createDeck("Deck 1", 6, 4, 0, 0, true);
        if (!deck) return;
        const removed = clipIdsIn([profile]);
        set(replaceProfile(get(), { ...profile, decks: [deck] }));
        for (const clipId of removed) await releaseClip(get, clipId);
        toast.success("Profile reset");
      },
    }),
    {
      name: CONFIG_STORAGE_KEY,
      storage: createJSONStorage(() => (typeof window === "undefined" ? noopStorage : configStorage)),
      skipHydration: true,
      version: 2,
      partialize: (state) => ({
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
        masterVolume: state.masterVolume,
        muted: state.muted,
        exclusive: state.exclusive,
        stopHotkey: state.stopHotkey,
        seenWelcome: state.seenWelcome,
      }),
    },
  ),
);

export function pickAudioFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.wav,.mp3,.ogg,.oga,.flac,.m4a,.aac,.webm";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
