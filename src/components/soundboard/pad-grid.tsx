import { useState, type MouseEvent } from "react";
import type { Pad } from "@/lib/soundboard/types";
import { PadButton } from "./pad-button";
import { PadContextMenu } from "./pad-context-menu";

type PadGridProps = {
  pads: Pad[];
  cols: number;
  rows: number;
  density?: "regular" | "compact";
  playingIds: Set<string>;
  onPlay: (padId: string) => void;
  onStop: (padId: string) => void;
  onEdit: (padId: string) => void;
  onClear: (padId: string) => void;
  onDropFile: (padId: string, file: File) => void;
  onMove: (fromId: string, toId: string) => void;
};

type MenuState = { padId: string; x: number; y: number } | null;

export function PadGrid({
  pads,
  cols,
  rows,
  density = "regular",
  playingIds,
  onPlay,
  onStop,
  onEdit,
  onClear,
  onDropFile,
  onMove,
}: PadGridProps) {
  const visible = pads.slice(0, cols * rows);
  const [menu, setMenu] = useState<MenuState>(null);

  const openMenu = (padId: string, event: MouseEvent) => {
    event.preventDefault();
    setMenu({ padId, x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <div
        className="grid h-full gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {visible.map((pad) => (
          <PadButton
            key={pad.id}
            pad={pad}
            density={density}
            playing={playingIds.has(pad.id)}
            onPlay={() => onPlay(pad.id)}
            onEdit={() => onEdit(pad.id)}
            onContextMenu={(event) => openMenu(pad.id, event)}
            onDropFile={(file) => onDropFile(pad.id, file)}
            onMove={onMove}
          />
        ))}
      </div>
      {menu ? (
        <PadContextMenu
          x={menu.x}
          y={menu.y}
          pad={pads.find((pad) => pad.id === menu.padId)}
          playing={playingIds.has(menu.padId)}
          onPlay={() => onPlay(menu.padId)}
          onStop={() => onStop(menu.padId)}
          onEdit={() => onEdit(menu.padId)}
          onClear={() => onClear(menu.padId)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
