import { Download, FolderInput, FolderOutput, RotateCcw } from "lucide-react";
import { LAYOUTS } from "@/lib/soundboard/layout";
import { codeToLabel, isModifierOnly } from "@/lib/soundboard/hotkeys";
import { pickBackupFile, useBoardStore } from "@/lib/soundboard/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const layout = useBoardStore((s) => s.layout);
  const exclusive = useBoardStore((s) => s.exclusive);
  const stopHotkey = useBoardStore((s) => s.stopHotkey);
  const setLayout = useBoardStore((s) => s.setLayout);
  const setExclusive = useBoardStore((s) => s.setExclusive);
  const setStopHotkey = useBoardStore((s) => s.setStopHotkey);
  const exportBoard = useBoardStore((s) => s.exportBoard);
  const importBoard = useBoardStore((s) => s.importBoard);
  const loadDemo = useBoardStore((s) => s.loadDemo);
  const resetBoard = useBoardStore((s) => s.resetBoard);
  const [recording, setRecording] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setRecording(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Board settings</DialogTitle>
          <DialogDescription>Layout, playback behavior, backup, and reset.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Layout</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {LAYOUTS.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={layout === item.id ? "default" : "secondary"}
                  onClick={() => setLayout(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Cut previous sounds</Label>
              <p className="text-xs text-dim">When on, a new pad stops everything else</p>
            </div>
            <Switch checked={exclusive} onCheckedChange={setExclusive} />
          </div>

          <div className="space-y-2">
            <Label>Stop all hotkey</Label>
            <Button
              type="button"
              variant="secondary"
              data-hotkey-ignore
              className="w-full justify-between"
              onClick={() => {
                const onKey = (event: KeyboardEvent) => {
                  event.preventDefault();
                  if (isModifierOnly(event.code)) return;
                  setStopHotkey(event.code);
                  setRecording(false);
                  window.removeEventListener("keydown", onKey, true);
                };
                setRecording(true);
                window.addEventListener("keydown", onKey, true);
              }}
            >
              <span>{recording ? "Press a key…" : codeToLabel(stopHotkey)}</span>
              <span className="text-xs text-muted">Click to record</span>
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Backup</Label>
            <p className="text-xs text-dim">
              Export includes pad setup and a copy of each assigned sound. Original files on disk are not required after
              import.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => exportBoard()}>
                <FolderOutput className="size-3.5" />
                Export board
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const file = await pickBackupFile();
                  if (file) await importBoard(file);
                }}
              >
                <FolderInput className="size-3.5" />
                Import board
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Windows installer</Label>
            <p className="text-xs text-dim">
              Download the offline installer for a local desktop copy. No Node, Python, or development tools required.
            </p>
            <Button size="sm" variant="secondary" asChild>
              <a href="/downloads/SnapJinglePlayer-Setup.exe" download>
                <Download className="size-3.5" />
                SnapJinglePlayer-Setup.exe
              </a>
            </Button>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => loadDemo()}>
              Load demo sounds
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm("Reset every pad, hotkey, and saved sound on this board?")) {
                  void resetBoard();
                }
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset board
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
