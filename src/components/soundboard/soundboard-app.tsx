import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Toaster, toast } from "sonner";
import { audioEngine } from "@/lib/soundboard/audio-engine";
import { isTypingTarget } from "@/lib/soundboard/hotkeys";
import { activeProfile } from "@/lib/soundboard/profiles";
import { pickAudioFile, useBoardStore } from "@/lib/soundboard/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeckEditor, type DeckDraft } from "./deck-editor";
import { DeckWorkspace } from "./deck-workspace";
import { PadEditor } from "./pad-editor";
import { ProfilesDialog } from "./profiles-dialog";
import { SettingsDialog } from "./settings-dialog";
import { TransportBar } from "./transport-bar";
import { Welcome } from "./welcome";

export function SoundboardApp() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deckEditor, setDeckEditor] = useState<{ mode: "create" | "edit"; deckId?: string; initial: DeckDraft } | null>(null);

  const profiles = useBoardStore((s) => s.profiles);
  const activeProfileId = useBoardStore((s) => s.activeProfileId);
  const seenWelcome = useBoardStore((s) => s.seenWelcome);
  const stopHotkey = useBoardStore((s) => s.stopHotkey);
  const migrationError = useBoardStore((s) => s.migrationError);
  const triggerPad = useBoardStore((s) => s.triggerPad);
  const stopPad = useBoardStore((s) => s.stopPad);
  const assignFile = useBoardStore((s) => s.assignFile);
  const clearPadAudio = useBoardStore((s) => s.clearPadAudio);
  const movePad = useBoardStore((s) => s.movePad);
  const moveDeck = useBoardStore((s) => s.moveDeck);
  const resizeDeck = useBoardStore((s) => s.resizeDeck);
  const addDeck = useBoardStore((s) => s.addDeck);
  const removeDeck = useBoardStore((s) => s.removeDeck);

  const profile = profiles.find((item) => item.id === activeProfileId) ?? profiles[0] ?? null;
  const pads = profile?.decks.flatMap((deck) => deck.pads) ?? [];

  const playingKey = useSyncExternalStore(
    (listener) => audioEngine.subscribe(listener),
    () => audioEngine.snapshot(),
    () => "",
  );
  const playingIds = useMemo(() => new Set(playingKey ? playingKey.split(",") : []), [playingKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await useBoardStore.persist.rehydrate();
        if (!cancelled) await useBoardStore.getState().hydrateClips();
      } catch (error) {
        console.error(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isTypingTarget(event.target)) return;
      const state = useBoardStore.getState();
      if (event.code === state.stopHotkey) {
        event.preventDefault();
        state.stopAll();
        return;
      }
      const current = activeProfile(state);
      const pad = current?.decks.flatMap((deck) => deck.pads).find((item) => item.hotkey === event.code);
      if (!pad) return;
      event.preventDefault();
      state.triggerPad(pad.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeProfileId, stopHotkey]);

  useEffect(() => {
    const resume = () => {
      try {
        audioEngine.ensureContext();
      } catch {
        /* ignore until a real gesture */
      }
    };
    window.addEventListener("pointerdown", resume, { once: true });
    return () => window.removeEventListener("pointerdown", resume);
  }, []);

  const editing = pads.find((pad) => pad.id === editingId) ?? null;

  const playPad = async (padId: string) => {
    const pad = pads.find((item) => item.id === padId);
    if (!pad) return;
    if (!pad.clipId) {
      const file = await pickAudioFile();
      if (file) {
        try {
          await assignFile(padId, file);
          toast.success("Sound assigned");
        } catch {
          /* toast already shown */
        }
      }
      return;
    }
    triggerPad(padId);
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <TransportBar
          playingCount={playingIds.size}
          editingLayout={editingLayout}
          onToggleLayout={() => setEditingLayout((value) => !value)}
          onOpenProfiles={() => setProfilesOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onAddDeck={() => setDeckEditor({ mode: "create", initial: { name: `Deck ${(profile?.decks.length ?? 0) + 1}`, cols: 4, rows: 2 } })}
        />
        <main className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col px-3 py-4 sm:px-5">
          {migrationError ? (
            <p className="mb-3 rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-warn">
              Saved board could not be upgraded. The previous configuration was left untouched. {migrationError}
            </p>
          ) : null}
          <DeckWorkspace
            decks={profile?.decks ?? []}
            editing={editingLayout}
            playingIds={playingIds}
            onPlay={(id) => void playPad(id)}
            onStop={stopPad}
            onEditPad={setEditingId}
            onClearPad={(id) => void clearPadAudio(id)}
            onDropFile={(id, file) => {
              void assignFile(id, file).then(() => toast.success("Sound assigned"));
            }}
            onMovePad={movePad}
            onMoveDeck={moveDeck}
            onEditDeck={(deckId) => {
              const deck = profile?.decks.find((item) => item.id === deckId);
              if (!deck) return;
              setDeckEditor({ mode: "edit", deckId, initial: { name: deck.name, cols: deck.cols, rows: deck.rows } });
            }}
            onRemoveDeck={(deckId) => {
              const deck = profile?.decks.find((item) => item.id === deckId);
              const configured = deck?.pads.some((pad) => pad.clipId || pad.fileName) ?? false;
              if (configured && !window.confirm(`Remove ${deck?.name ?? "this deck"} and its button assignments?`)) return;
              void removeDeck(deckId);
            }}
          />
          <p className="mt-3 text-xs text-dim">
            Drop audio onto a pad · Right-click to edit · {editingLayout ? "Drag a deck header to move it" : "Arrange decks from the header"} ·{" "}
            {stopHotkey === "Escape" ? "Esc" : stopHotkey} stops all
          </p>
        </main>
        <PadEditor pad={editing} open={Boolean(editing)} onOpenChange={(open) => !open && setEditingId(null)} />
        <DeckEditor
          open={Boolean(deckEditor)}
          mode={deckEditor?.mode ?? "create"}
          initial={deckEditor?.initial ?? { name: "Deck", cols: 4, rows: 2 }}
          onOpenChange={(open) => !open && setDeckEditor(null)}
          onSubmit={(draft, confirmDrop) => {
            if (!deckEditor) return "invalid-size";
            let status: "ok" | "invalid-size" | "overlap" | "needs-confirm" = "invalid-size";
            if (deckEditor.mode === "create") {
              status = addDeck(draft) ? "ok" : "invalid-size";
            } else if (deckEditor.deckId) {
              useBoardStore.getState().renameDeck(deckEditor.deckId, draft.name);
              status = resizeDeck(deckEditor.deckId, draft.cols, draft.rows, confirmDrop).status;
            }
            if (status === "ok") setDeckEditor(null);
            return status;
          }}
        />
        <ProfilesDialog open={profilesOpen} onOpenChange={setProfilesOpen} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        {!seenWelcome ? <Welcome /> : null}
        <Toaster theme="dark" position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
