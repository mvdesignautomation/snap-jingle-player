import { useEffect, type ReactNode } from "react";
import { Pencil, Play, Square, Trash2 } from "lucide-react";
import type { Pad } from "@/lib/soundboard/types";

type PadContextMenuProps = {
  x: number;
  y: number;
  pad?: Pad;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onEdit: () => void;
  onClear: () => void;
  onClose: () => void;
};

export function PadContextMenu({
  x,
  y,
  pad,
  playing,
  onPlay,
  onStop,
  onEdit,
  onClear,
  onClose,
}: PadContextMenuProps) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  if (!pad) return null;

  const item = (label: string, icon: ReactNode, action: () => void, danger = false) => (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${danger ? "text-danger hover:bg-danger/10" : "text-foreground hover:bg-card-2"}`}
      onClick={(event) => {
        event.stopPropagation();
        action();
        onClose();
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      className="fixed z-50 min-w-44 rounded-lg border border-border bg-card p-1 shadow-panel"
      style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 180) }}
      onClick={(event) => event.stopPropagation()}
    >
      {item(playing ? "Retrigger" : "Play", <Play className="size-3.5" />, onPlay)}
      {item("Stop", <Square className="size-3.5" />, onStop)}
      {item("Edit pad", <Pencil className="size-3.5" />, onEdit)}
      {item("Clear audio", <Trash2 className="size-3.5" />, onClear, true)}
    </div>
  );
}
