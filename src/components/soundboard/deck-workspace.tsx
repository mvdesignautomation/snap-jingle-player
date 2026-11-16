import { useRef, useState, type PointerEvent } from "react";
import { Minus, Move, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { workspaceBounds } from "@/lib/soundboard/geometry";
import type { Deck } from "@/lib/soundboard/types";
import { Button } from "@/components/ui/button";
import { PadGrid } from "./pad-grid";

const CELL_W = 136;
const CELL_H = 108;

type DeckWorkspaceProps = {
  decks: Deck[];
  editing: boolean;
  playingIds: Set<string>;
  onPlay: (padId: string) => void;
  onStop: (padId: string) => void;
  onEditPad: (padId: string) => void;
  onClearPad: (padId: string) => void;
  onDropFile: (padId: string, file: File) => void;
  onMovePad: (fromId: string, toId: string) => void;
  onMoveDeck: (deckId: string, x: number, y: number) => boolean;
  onEditDeck: (deckId: string) => void;
  onRemoveDeck: (deckId: string) => void;
};

type DragState = { id: string; originX: number; originY: number; pointerX: number; pointerY: number; x: number; y: number; valid: boolean };

export function DeckWorkspace({
  decks,
  editing,
  playingIds,
  onPlay,
  onStop,
  onEditPad,
  onClearPad,
  onDropFile,
  onMovePad,
  onMoveDeck,
  onEditDeck,
  onRemoveDeck,
}: DeckWorkspaceProps) {
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const bounds = workspaceBounds(decks);
  const placed = decks.map((deck) => {
    if (drag?.id !== deck.id) return deck;
    return { ...deck, x: drag.x, y: drag.y };
  });

  const startDrag = (deck: Deck, event: PointerEvent<HTMLButtonElement>) => {
    if (!editing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: deck.id,
      originX: deck.x,
      originY: deck.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: deck.x,
      y: deck.y,
      valid: true,
    });
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dx = Math.round((event.clientX - drag.pointerX) / (CELL_W * zoomRef.current));
    const dy = Math.round((event.clientY - drag.pointerY) / (CELL_H * zoomRef.current));
    const x = Math.max(0, drag.originX + dx);
    const y = Math.max(0, drag.originY + dy);
    const deck = decks.find((item) => item.id === drag.id);
    if (!deck) return;
    const valid = !decks.some(
      (other) =>
        other.id !== deck.id &&
        x < other.x + other.cols &&
        x + deck.cols > other.x &&
        y < other.y + other.rows &&
        y + deck.rows > other.y,
    );
    setDrag({ ...drag, x, y, valid });
  };

  const endDrag = () => {
    if (!drag) return;
    if (drag.x !== drag.originX || drag.y !== drag.originY) {
      if (!drag.valid || !onMoveDeck(drag.id, drag.x, drag.y)) toast.error("Decks can't overlap");
    }
    setDrag(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))} aria-label="Zoom out">
          <Minus className="size-3.5" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="secondary" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))} aria-label="Zoom in">
          <Plus className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setZoom(1)}>
          <RotateCcw className="size-3.5" />
          Reset zoom
        </Button>
      </div>
      <div className="relative h-[calc(100dvh-9.5rem)] overflow-auto rounded-lg border border-border bg-card">
        <div style={{ width: bounds.cols * CELL_W * zoom, height: bounds.rows * CELL_H * zoom }}>
          <div
            className="relative origin-top-left"
            style={{
              width: bounds.cols * CELL_W,
              height: bounds.rows * CELL_H,
              transform: `scale(${zoom})`,
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklab, var(--color-border) 80%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-border) 80%, transparent) 1px, transparent 1px)",
              backgroundSize: `${CELL_W}px ${CELL_H}px`,
            }}
          >
            {placed.map((deck) => {
              const dragging = drag?.id === deck.id;
              return (
                <section
                  key={deck.id}
                  className="absolute flex flex-col overflow-hidden rounded-lg border bg-background/90 shadow-panel"
                  style={{
                    left: deck.x * CELL_W + 4,
                    top: deck.y * CELL_H + 4,
                    width: deck.cols * CELL_W - 8,
                    height: deck.rows * CELL_H - 8,
                    borderColor: dragging ? (drag?.valid ? "var(--color-accent)" : "var(--color-danger)") : "var(--color-border)",
                  }}
                >
                  <header className="flex items-center gap-1 border-b border-border bg-card px-1.5 py-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-muted disabled:opacity-60"
                      aria-label={`Move ${deck.name}`}
                      disabled={!editing}
                      onPointerDown={(event) => startDrag(deck, event)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    >
                      <Move className="size-3.5" />
                      <span className="truncate">{deck.name}</span>
                    </button>
                    <span className="ml-auto text-xs text-dim">
                      {deck.cols}×{deck.rows}
                    </span>
                    {editing ? (
                      <>
                        <button type="button" className="rounded p-1 text-muted hover:text-foreground" aria-label={`Edit ${deck.name}`} onClick={() => onEditDeck(deck.id)}>
                          <Pencil className="size-3.5" />
                        </button>
                        <button type="button" className="rounded p-1 text-muted hover:text-danger" aria-label={`Remove ${deck.name}`} onClick={() => onRemoveDeck(deck.id)}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    ) : null}
                  </header>
                  <div className="min-h-0 flex-1 p-1.5">
                    <PadGrid
                      pads={deck.pads}
                      cols={deck.cols}
                      rows={deck.rows}
                      density="compact"
                      playingIds={playingIds}
                      onPlay={onPlay}
                      onStop={onStop}
                      onEdit={onEditPad}
                      onClear={onClearPad}
                      onDropFile={onDropFile}
                      onMove={onMovePad}
                    />
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
