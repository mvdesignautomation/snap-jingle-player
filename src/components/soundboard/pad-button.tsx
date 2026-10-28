import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { AlertTriangle, GripVertical, Pencil, Play } from "lucide-react";
import { audioEngine } from "@/lib/soundboard/audio-engine";
import { codeToLabel } from "@/lib/soundboard/hotkeys";
import type { Pad } from "@/lib/soundboard/types";
import { cn } from "@/lib/utils";

type PadButtonProps = {
  pad: Pad;
  playing: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onDropFile: (file: File) => void;
  onMove: (fromId: string, toId: string) => void;
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

export function PadButton({
  pad,
  playing,
  onPlay,
  onEdit,
  onContextMenu,
  onDropFile,
  onMove,
}: PadButtonProps) {
  const [hover, setHover] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (!playing) {
      setProgress(0);
      return;
    }
    const tick = () => {
      setProgress(audioEngine.getProgress(pad.id) ?? 0);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, pad.id]);

  const empty = !pad.clipId;
  const missing = pad.missing;

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const fromId = event.dataTransfer.getData("text/pad-id");
    if (fromId) {
      onMove(fromId, pad.id);
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) onDropFile(file);
  };

  return (
    <div
      className={cn(
        "group relative flex min-h-28 flex-col justify-between overflow-hidden rounded-lg border p-3 text-left transition-[transform,background-color,border-color] duration-150 ease-out sm:min-h-32",
        dragOver && "ring-2 ring-accent",
        playing && "brightness-110",
      )}
      style={{
        background: `color-mix(in oklab, ${pad.color} ${playing ? 42 : empty ? 10 : 24}%, #121318)`,
        borderColor: missing
          ? "var(--color-warn)"
          : `color-mix(in oklab, ${pad.color} ${empty ? 28 : 58}%, #2a2b36)`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
    >
      {playing ? (
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1 origin-left bg-foreground/80"
          style={{ transform: `scaleX(${progress})` }}
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/pad-id", pad.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          className="rounded-sm p-0.5 text-foreground/40 hover:text-foreground"
          aria-label="Reorder pad"
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className={cn(
            "rounded-md p-1 text-foreground/70 transition-opacity duration-150 hover:bg-background/20 hover:text-foreground",
            hover ? "opacity-100" : "opacity-0 sm:opacity-0 group-hover:opacity-100",
          )}
          aria-label={`Edit ${pad.name}`}
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      <button type="button" onClick={onPlay} className="flex min-h-16 flex-1 flex-col items-start justify-end text-left">
        <span className="font-display text-lg leading-tight font-semibold tracking-wide uppercase sm:text-xl">
          {pad.name}
        </span>
        <span className="mt-2 flex w-full items-center justify-between gap-2 text-xs tracking-wide text-foreground/70">
          <span className="inline-flex items-center gap-1.5">
            {missing ? <AlertTriangle className="size-3 text-warn" /> : null}
            {empty ? (
              "Drop audio"
            ) : missing ? (
              "File missing"
            ) : (
              <>
                <Play className="size-3 fill-current" />
                {pad.hotkey ? codeToLabel(pad.hotkey) : "Play"}
              </>
            )}
          </span>
          <span className="tabular-nums">{empty ? "" : formatDuration(pad.duration)}</span>
        </span>
      </button>
    </div>
  );
}
