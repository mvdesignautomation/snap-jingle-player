import { useEffect, useState } from "react";
import { isValidDeckSize, MAX_DECK_BUTTONS, MAX_DECK_COLS, MAX_DECK_ROWS } from "@/lib/soundboard/geometry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DeckDraft = { name: string; cols: number; rows: number };

type DeckEditorProps = {
  open: boolean;
  mode: "create" | "edit";
  initial: DeckDraft;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: DeckDraft, confirmDrop: boolean) => "ok" | "invalid-size" | "overlap" | "needs-confirm";
};

export function DeckEditor({ open, mode, initial, onOpenChange, onSubmit }: DeckEditorProps) {
  const [name, setName] = useState(initial.name);
  const [cols, setCols] = useState(initial.cols);
  const [rows, setRows] = useState(initial.rows);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setCols(initial.cols);
    setRows(initial.rows);
    setConfirmDrop(false);
    setNeedsConfirm(false);
    setMessage(null);
  }, [open, initial.name, initial.cols, initial.rows]);

  const count = cols * rows;
  const valid = isValidDeckSize(cols, rows) && name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add deck" : "Edit deck"}</DialogTitle>
          <DialogDescription>
            Up to {MAX_DECK_COLS} columns, {MAX_DECK_ROWS} rows, and {MAX_DECK_BUTTONS} buttons. 2×8 is allowed.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const result = onSubmit({ name: name.trim(), cols, rows }, confirmDrop);
            if (result === "ok") {
              onOpenChange(false);
              return;
            }
            if (result === "needs-confirm") {
              setNeedsConfirm(true);
              setMessage("Resizing will remove configured buttons that no longer fit. Confirm to continue.");
              return;
            }
            setNeedsConfirm(false);
            if (result === "overlap") setMessage("The larger deck would cover another deck. Move it first.");
            else setMessage("Use 1–8 columns and rows, with 48 buttons or fewer.");
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="deck-name">Name</Label>
            <Input id="deck-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="deck-cols">Columns</Label>
              <Input
                id="deck-cols"
                type="number"
                min={1}
                max={MAX_DECK_COLS}
                value={cols}
                onChange={(event) => setCols(Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deck-rows">Rows</Label>
              <Input
                id="deck-rows"
                type="number"
                min={1}
                max={MAX_DECK_ROWS}
                value={rows}
                onChange={(event) => setRows(Number(event.target.value))}
              />
            </div>
          </div>
          <p className="text-sm text-muted">
            {valid ? `${cols}×${rows} · ${count} buttons` : `${count || 0} buttons · outside the limit`}
          </p>
          {needsConfirm ? (
            <label className="flex items-start gap-2 text-sm text-warn">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmDrop}
                onChange={(event) => setConfirmDrop(event.target.checked)}
              />
              <span>{message}</span>
            </label>
          ) : message ? (
            <p className="text-sm text-warn">{message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || (needsConfirm && !confirmDrop)}>
              {mode === "create" ? "Create" : "Apply"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
