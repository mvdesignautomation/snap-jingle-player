import { useEffect, useState } from "react";
import { FolderOpen, RotateCcw, Square, Trash2 } from "lucide-react";
import { PAD_COLORS } from "@/lib/soundboard/colors";
import { codeToLabel, isModifierOnly } from "@/lib/soundboard/hotkeys";
import { pickAudioFile, useBoardStore } from "@/lib/soundboard/store";
import type { Pad, RetriggerMode } from "@/lib/soundboard/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

type PadEditorProps = {
  pad: Pad | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PadEditor({ pad, open, onOpenChange }: PadEditorProps) {
  const updatePad = useBoardStore((s) => s.updatePad);
  const assignFile = useBoardStore((s) => s.assignFile);
  const clearPadAudio = useBoardStore((s) => s.clearPadAudio);
  const resetPad = useBoardStore((s) => s.resetPad);
  const triggerPad = useBoardStore((s) => s.triggerPad);
  const stopPad = useBoardStore((s) => s.stopPad);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setRecording(false);
        return;
      }
      if (event.code === "Backspace" && pad) {
        updatePad(pad.id, { hotkey: null });
        setRecording(false);
        return;
      }
      if (isModifierOnly(event.code) || !pad) return;
      updatePad(pad.id, { hotkey: event.code });
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, pad, updatePad]);

  if (!pad) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit pad</DialogTitle>
          <DialogDescription>Name, color, audio, hotkey, and playback for this pad.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="pad-name">Name</Label>
            <Input
              id="pad-name"
              value={pad.name}
              maxLength={24}
              onChange={(event) => updatePad(pad.id, { name: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="grid grid-cols-6 gap-2">
              {PAD_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  title={color.label}
                  onClick={() => updatePad(pad.id, { color: color.value })}
                  className="h-8 rounded-md border border-border"
                  style={{
                    background: color.value,
                    outline: pad.color === color.value ? "2px solid var(--color-foreground)" : undefined,
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Audio file</Label>
            <div className="rounded-lg border border-border bg-card-2 p-3">
              <p className="truncate text-sm">{pad.fileName ?? "No file assigned"}</p>
              {pad.missing ? (
                <p className="mt-1 text-xs text-warn">Audio file not found. Locate or replace it.</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const file = await pickAudioFile();
                    if (file) await assignFile(pad.id, file);
                  }}
                >
                  <FolderOpen className="size-3.5" />
                  {pad.clipId ? "Replace" : "Assign"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => triggerPad(pad.id)} disabled={!pad.clipId}>
                  Play
                </Button>
                <Button size="sm" variant="ghost" onClick={() => stopPad(pad.id)}>
                  <Square className="size-3.5" />
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => clearPadAudio(pad.id)}
                  disabled={!pad.clipId && !pad.fileName}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Hotkey</Label>
            <Button
              type="button"
              variant="secondary"
              data-hotkey-ignore
              className="w-full justify-between"
              onClick={() => setRecording(true)}
            >
              <span>{recording ? "Press a key… Backspace clears" : pad.hotkey ? codeToLabel(pad.hotkey) : "None"}</span>
              <span className="text-xs text-muted">Click to record</span>
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Pad volume</Label>
              <span className="text-xs tabular-nums text-muted">{Math.round(pad.volume * 100)}%</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[pad.volume]}
              onValueChange={([value]) => updatePad(pad.id, { volume: value ?? 0 })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Loop</Label>
              <p className="text-xs text-dim">Repeat until stopped</p>
            </div>
            <Switch checked={pad.loop} onCheckedChange={(checked) => updatePad(pad.id, { loop: checked })} />
          </div>

          <div className="space-y-2">
            <Label>If this pad is already playing</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["overlap", "restart"] as RetriggerMode[]).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={pad.retrigger === mode ? "default" : "secondary"}
                  onClick={() => updatePad(pad.id, { retrigger: mode })}
                >
                  {mode === "overlap" ? "Overlap" : "Restart"}
                </Button>
              ))}
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={() => resetPad(pad.id)}>
            <RotateCcw className="size-3.5" />
            Reset pad
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
