import { Download, FolderInput, FolderOutput, RotateCcw } from "lucide-react";
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
  const exclusive = useBoardStore((s) => s.exclusive);
  const stopHotkey = useBoardStore((s) => s.stopHotkey);
  const setExclusive = useBoardStore((s) => s.setExclusive);
  const setStopHotkey = useBoardStore((s) => s.setStopHotkey);
  const exportBoard = useBoardStore((s) => s.exportBoard);
  const importBoard = useBoardStore((s) => s.importBoard);
  const loadDemo = useBoardStore((s) => s.loadDemo);
  const resetBoard = useBoardStore((s) => s.resetBoard);
  const [recording, setRecording] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);

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
          <DialogDescription>Playback, backup, and the active profile.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-muted">Deck size and position are changed with Arrange. Each profile keeps its own decks.</p>

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
              Export includes every profile, deck layout, and a copy of each assigned sound that is still in the local
              library. A file is marked as including audio only when those copies are actually present.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void exportBoard()}>
                <FolderOutput className="size-3.5" />
                Export library
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const file = await pickBackupFile();
                  if (file) setPendingImport(file);
                }}
              >
                <FolderInput className="size-3.5" />
                Import
              </Button>
            </div>
            {pendingImport ? (
              <div className="rounded-lg border border-border bg-card-2 p-3">
                <p className="text-sm">
                  Import <span className="font-medium">{pendingImport.name}</span>. Adding keeps your current profiles.
                  Replacing removes them.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      void importBoard(pendingImport, "add");
                      setPendingImport(null);
                    }}
                  >
                    Add profiles
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm("Replace every profile with this backup? This cannot be undone.")) {
                        void importBoard(pendingImport, "replace");
                        setPendingImport(null);
                      }
                    }}
                  >
                    Replace library
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setPendingImport(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
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
                if (window.confirm("Reset the active profile? Other profiles and their sounds stay.")) {
                  void resetBoard();
                }
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset profile
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
