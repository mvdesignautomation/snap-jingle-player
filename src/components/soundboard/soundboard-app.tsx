import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Toaster, toast } from "sonner";
import { audioEngine } from "@/lib/soundboard/audio-engine";
import { isTypingTarget } from "@/lib/soundboard/hotkeys";
import { pickAudioFile, useBoardStore } from "@/lib/soundboard/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PadEditor } from "./pad-editor";
import { PadGrid } from "./pad-grid";
import { SettingsDialog } from "./settings-dialog";
import { TransportBar } from "./transport-bar";
import { Welcome } from "./welcome";

export function SoundboardApp() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pads = useBoardStore((s) => s.pads);
  const layout = useBoardStore((s) => s.layout);
  const seenWelcome = useBoardStore((s) => s.seenWelcome);
  const stopHotkey = useBoardStore((s) => s.stopHotkey);
  const triggerPad = useBoardStore((s) => s.triggerPad);
  const stopPad = useBoardStore((s) => s.stopPad);
  const stopAll = useBoardStore((s) => s.stopAll);
  const assignFile = useBoardStore((s) => s.assignFile);
  const clearPadAudio = useBoardStore((s) => s.clearPadAudio);
  const movePad = useBoardStore((s) => s.movePad);

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
      if (event.code === stopHotkey) {
        event.preventDefault();
        stopAll();
        return;
      }
      const pad = useBoardStore.getState().pads.find((item) => item.hotkey === event.code);
      if (!pad) return;
      event.preventDefault();
      triggerPad(pad.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stopHotkey, stopAll, triggerPad]);

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
    const pad = useBoardStore.getState().pads.find((item) => item.id === padId);
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
        <TransportBar playingCount={playingIds.size} onOpenSettings={() => setSettingsOpen(true)} />
        <main className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-5">
          <PadGrid
            pads={pads}
            layoutId={layout}
            playingIds={playingIds}
            onPlay={(id) => void playPad(id)}
            onStop={stopPad}
            onEdit={setEditingId}
            onClear={(id) => void clearPadAudio(id)}
            onDropFile={(id, file) => {
              void assignFile(id, file).then(() => toast.success("Sound assigned"));
            }}
            onMove={movePad}
          />
          <p className="mt-4 text-xs text-dim">
            Drop audio onto a pad · Right-click to edit · Drag the grip to reorder ·{" "}
            {stopHotkey === "Escape" ? "Esc" : stopHotkey} stops all
          </p>
        </main>
        <PadEditor pad={editing} open={Boolean(editing)} onOpenChange={(open) => !open && setEditingId(null)} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        {!seenWelcome ? <Welcome /> : null}
        <Toaster theme="dark" position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
