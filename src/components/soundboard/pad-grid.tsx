import { useEffect, useState, type MouseEvent } from "react";
import { layoutById } from "@/lib/soundboard/layout";
import type { LayoutId } from "@/lib/soundboard/types";
import type { Pad } from "@/lib/soundboard/types";
import { PadButton } from "./pad-button";
import { PadContextMenu } from "./pad-context-menu";

type PadGridProps = {
  pads: Pad[];
  layoutId: LayoutId;
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
  layoutId,
  playingIds,
  onPlay,
  onStop,
  onEdit,
  onClear,
  onDropFile,
  onMove,
}: PadGridProps) {
  const layout = layoutById(layoutId);
  const visible = pads.slice(0, layout.rows * layout.cols);
  const [menu, setMenu] = useState<MenuState>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const cols = narrow ? Math.min(2, layout.cols) : layout.cols;

  const openMenu = (padId: string, event: MouseEvent) => {
    event.preventDefault();
    setMenu({ padId, x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <div
        className="grid gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {visible.map((pad) => (
          <PadButton
            key={pad.id}
            pad={pad}
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
