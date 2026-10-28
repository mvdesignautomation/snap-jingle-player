import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { toast } from "sonner";
import { audioEngine } from "./audio-engine";
import { clearAllClips, deleteClip, getClip, guessMime, putClip } from "./clip-store";
import { padColorAt } from "./colors";
import { DEMO_SOUNDS, sampleUrl } from "./demo";
import { defaultHotkey } from "./hotkeys";
import { DEFAULT_LAYOUT, MAX_PADS, visibleCount } from "./layout";
import type { LayoutId } from "./layout";
import type { BoardBackup, Pad } from "./types";
import { buildBackup, decodeBackupAudio, downloadJson, parseBackup } from "./backup";

function createPad(index: number): Pad {
  return {
    id: `pad-${index}`,
    name: `PAD ${String(index + 1).padStart(2, "0")}`,
    color: padColorAt(index),
    clipId: null,
    fileName: null,
    duration: null,
    missing: false,
    hotkey: defaultHotkey(index),
    volume: 1,
    loop: false,
    retrigger: "overlap",
  };
}

function createPads(): Pad[] {
  return Array.from({ length: MAX_PADS }, (_, index) => createPad(index));
}

type BoardState = {
  pads: Pad[];
  layout: LayoutId;
  masterVolume: number;
  muted: boolean;
  exclusive: boolean;
  stopHotkey: string;
  seenWelcome: boolean;
  hydrated: boolean;
  setLayout: (layout: LayoutId) => void;
  setMasterVolume: (value: number) => void;
  setMuted: (muted: boolean) => void;
  setExclusive: (exclusive: boolean) => void;
  setStopHotkey: (code: string) => void;
  markWelcomeSeen: () => void;
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
  importBoard: (file: File) => Promise<void>;
  resetBoard: () => Promise<void>;
};

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

async function dropClip(clipId: string | null, remaining: Pad[]) {
  if (!clipId) return;
  const used = remaining.some((pad) => pad.clipId === clipId);
  if (used) return;
  audioEngine.unloadClip(clipId);
  await deleteClip(clipId);
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      pads: createPads(),
      layout: DEFAULT_LAYOUT,
      masterVolume: 0.9,
      muted: false,
      exclusive: false,
      stopHotkey: "Escape",
      seenWelcome: false,
      hydrated: false,

      setLayout: (layout) => set({ layout }),

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

      updatePad: (padId, patch) =>
        set((state) => ({
          pads: state.pads.map((pad) => (pad.id === padId ? { ...pad, ...patch } : pad)),
        })),

      assignFile: async (padId, file) => {
        const pad = get().pads.find((item) => item.id === padId);
        if (!pad) return;
        const clipId = crypto.randomUUID();
        const mime = file.type || guessMime(file.name);
        const bytes = await file.arrayBuffer();
        try {
          await putClip({ id: clipId, name: file.name, mime, bytes });
          const duration = await audioEngine.loadClip(clipId, bytes);
          const previous = pad.clipId;
          set((state) => ({
            pads: state.pads.map((item) =>
              item.id === padId
                ? {
                    ...item,
                    clipId,
                    fileName: file.name,
                    duration,
                    missing: false,
                    name: item.fileName ? item.name : file.name.replace(/\.[^.]+$/, "").toUpperCase(),
                  }
                : item,
            ),
          }));
          await dropClip(previous, get().pads);
        } catch (error) {
          await deleteClip(clipId).catch(() => undefined);
          const message = error instanceof Error ? error.message : "Could not decode that file";
          toast.error("Could not load audio", { description: message });
          throw error;
        }
      },

      clearPadAudio: async (padId) => {
        const pad = get().pads.find((item) => item.id === padId);
        if (!pad) return;
        audioEngine.stopPad(padId);
        set((state) => ({
          pads: state.pads.map((item) =>
            item.id === padId
              ? { ...item, clipId: null, fileName: null, duration: null, missing: false }
              : item,
          ),
        }));
        await dropClip(pad.clipId, get().pads);
      },

      resetPad: async (padId) => {
        const index = get().pads.findIndex((item) => item.id === padId);
        if (index < 0) return;
        await get().clearPadAudio(padId);
        set((state) => ({
          pads: state.pads.map((item, i) => (i === index ? createPad(index) : item)),
        }));
      },

      triggerPad: (padId) => {
        const { pads, exclusive, masterVolume, muted } = get();
        const pad = pads.find((item) => item.id === padId);
        if (!pad) return;
        audioEngine.ensureContext();
        audioEngine.setMasterVolume(masterVolume);
        audioEngine.setMuted(muted);
        if (!pad.clipId) return;
        if (pad.missing || !audioEngine.hasClip(pad.clipId)) {
          set((state) => ({
            pads: state.pads.map((item) => (item.id === padId ? { ...item, missing: true } : item)),
          }));
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
        set((state) => {
          const pads = [...state.pads];
          const from = pads.findIndex((pad) => pad.id === fromId);
          const to = pads.findIndex((pad) => pad.id === toId);
          if (from < 0 || to < 0) return state;
          const [moved] = pads.splice(from, 1);
          if (!moved) return state;
          pads.splice(to, 0, moved);
          return { pads };
        });
      },

      hydrateClips: async () => {
        const { pads, masterVolume, muted } = get();
        audioEngine.setMasterVolume(masterVolume);
        audioEngine.setMuted(muted);
        const next = [...pads];
        await Promise.all(
          next.map(async (pad, index) => {
            if (!pad.clipId) return;
            const clip = await getClip(pad.clipId);
            if (!clip) {
              next[index] = { ...pad, missing: true };
              return;
            }
            try {
              const duration = await audioEngine.loadClip(pad.clipId, clip.bytes);
              next[index] = { ...pad, duration, missing: false, fileName: pad.fileName ?? clip.name };
            } catch {
              next[index] = { ...pad, missing: true };
            }
          }),
        );
        set({ pads: next, hydrated: true });
      },

      loadDemo: async () => {
        const assignFile = get().assignFile;
        const count = Math.min(DEMO_SOUNDS.length, visibleCount(get().layout), get().pads.length);
        for (let i = 0; i < count; i += 1) {
          const demo = DEMO_SOUNDS[i]!;
          const pad = get().pads[i]!;
          try {
            const response = await fetch(sampleUrl(demo.file));
            if (!response.ok) continue;
            const buffer = await response.arrayBuffer();
            const file = new File([buffer], demo.file, { type: "audio/wav" });
            await assignFile(pad.id, file);
            get().updatePad(pad.id, { name: demo.name, color: demo.color });
          } catch {
            /* skip a missing demo clip */
          }
        }
        set({ seenWelcome: true });
        toast.success("Demo sounds loaded");
      },

      exportBoard: async () => {
        const backup = await buildBackup({
          pads: get().pads,
          layout: get().layout,
          masterVolume: get().masterVolume,
          muted: get().muted,
          exclusive: get().exclusive,
          stopHotkey: get().stopHotkey,
          seenWelcome: get().seenWelcome,
        });
        downloadJson(`snap-jingle-board.json`, backup);
        toast.success("Board exported");
      },

      importBoard: async (file) => {
        const text = await file.text();
        let parsed: BoardBackup;
        try {
          parsed = parseBackup(JSON.parse(text));
        } catch (error) {
          toast.error("Could not import board", {
            description: error instanceof Error ? error.message : "Invalid file",
          });
          return;
        }
        audioEngine.stopAll();
        await clearAllClips();
        const pads = createPads();
        const limit = Math.min(parsed.pads.length, MAX_PADS);
        for (let i = 0; i < limit; i += 1) {
          const incoming = parsed.pads[i]!;
          const clipId = incoming.audio ? crypto.randomUUID() : null;
          if (incoming.audio && clipId) {
            const bytes = decodeBackupAudio(incoming.audio.base64);
            await putClip({
              id: clipId,
              name: incoming.fileName ?? `clip-${i + 1}`,
              mime: incoming.audio.mime,
              bytes,
            });
            try {
              const duration = await audioEngine.loadClip(clipId, bytes);
              pads[i] = {
                ...pads[i]!,
                name: incoming.name,
                color: incoming.color,
                hotkey: incoming.hotkey,
                volume: incoming.volume,
                loop: incoming.loop,
                retrigger: incoming.retrigger,
                clipId,
                fileName: incoming.fileName,
                duration,
                missing: false,
              };
            } catch {
              pads[i] = {
                ...pads[i]!,
                name: incoming.name,
                color: incoming.color,
                hotkey: incoming.hotkey,
                volume: incoming.volume,
                loop: incoming.loop,
                retrigger: incoming.retrigger,
                clipId,
                fileName: incoming.fileName,
                duration: null,
                missing: true,
              };
            }
          } else {
            pads[i] = {
              ...pads[i]!,
              name: incoming.name,
              color: incoming.color,
              hotkey: incoming.hotkey,
              volume: incoming.volume,
              loop: incoming.loop,
              retrigger: incoming.retrigger,
              clipId: null,
              fileName: incoming.fileName,
              duration: null,
              missing: Boolean(incoming.fileName),
            };
          }
        }
        set({
          pads,
          layout: parsed.settings.layout ?? DEFAULT_LAYOUT,
          masterVolume: parsed.settings.masterVolume,
          muted: parsed.settings.muted,
          exclusive: parsed.settings.exclusive,
          stopHotkey: parsed.settings.stopHotkey || "Escape",
          seenWelcome: true,
        });
        audioEngine.setMasterVolume(parsed.settings.masterVolume);
        audioEngine.setMuted(parsed.settings.muted);
        toast.success("Board imported");
      },

      resetBoard: async () => {
        audioEngine.stopAll();
        await clearAllClips();
        set({
          pads: createPads(),
          layout: DEFAULT_LAYOUT,
          masterVolume: 0.9,
          muted: false,
          exclusive: false,
          stopHotkey: "Escape",
          seenWelcome: true,
        });
        audioEngine.setMasterVolume(0.9);
        audioEngine.setMuted(false);
        toast.success("Board reset");
      },
    }),
    {
      name: "sjp-board-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? noopStorage : localStorage)),
      skipHydration: true,
      partialize: (state) => ({
        pads: state.pads,
        layout: state.layout,
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
