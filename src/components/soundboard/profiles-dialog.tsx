import { useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { useBoardStore } from "@/lib/soundboard/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ProfilesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProfilesDialog({ open, onOpenChange }: ProfilesDialogProps) {
  const profiles = useBoardStore((s) => s.profiles);
  const activeProfileId = useBoardStore((s) => s.activeProfileId);
  const createProfile = useBoardStore((s) => s.createProfile);
  const renameProfile = useBoardStore((s) => s.renameProfile);
  const duplicateProfile = useBoardStore((s) => s.duplicateProfile);
  const switchProfile = useBoardStore((s) => s.switchProfile);
  const deleteProfile = useBoardStore((s) => s.deleteProfile);
  const [name, setName] = useState("Podcast");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pending = profiles.find((profile) => profile.id === pendingDelete) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profiles</DialogTitle>
          <DialogDescription>Each profile keeps its own decks, pads, and hotkeys. Switching does not stop audio.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            createProfile(name);
            setName("");
          }}
        >
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Profile name" aria-label="New profile name" />
          <Button type="submit">Create</Button>
        </form>
        <ul className="space-y-2">
          {profiles.map((profile) => {
            const active = profile.id === activeProfileId;
            return (
              <li key={profile.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card-2 p-2">
                <Input
                  defaultValue={profile.name}
                  key={`${profile.id}-${profile.name}`}
                  aria-label={`Rename ${profile.name}`}
                  className="min-w-36 flex-1"
                  onBlur={(event) => {
                    if (event.target.value.trim() && event.target.value.trim() !== profile.name) {
                      renameProfile(profile.id, event.target.value);
                    }
                  }}
                />
                {active ? (
                  <span className="text-xs tracking-wide text-accent uppercase">Active</span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => switchProfile(profile.id)}>
                    Switch
                  </Button>
                )}
                <Button size="icon-sm" variant="ghost" aria-label={`Duplicate ${profile.name}`} onClick={() => duplicateProfile(profile.id)}>
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${profile.name}`}
                  disabled={profiles.length <= 1}
                  onClick={() => setPendingDelete(profile.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
        {pending ? (
          <div className="rounded-lg border border-warn/50 bg-warn/10 p-3">
            <p className="text-sm">
              Delete <span className="font-medium">{pending.name}</span>? Sounds still used by other profiles stay in the library.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  void deleteProfile(pending.id);
                  setPendingDelete(null);
                }}
              >
                Delete profile
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
