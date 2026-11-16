import { Download, LayoutGrid, MoreHorizontal, Settings2, Square, Volume2, VolumeX } from "lucide-react";
import { codeToLabel } from "@/lib/soundboard/hotkeys";
import { useBoardStore } from "@/lib/soundboard/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type TransportBarProps = {
  playingCount: number;
  editingLayout: boolean;
  onToggleLayout: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
  onAddDeck: () => void;
};

function LogoMark() {
  return (
    <span className="grid size-8 grid-cols-2 gap-0.5 rounded-md bg-card-2 p-1" aria-hidden>
      <span className="rounded-sm bg-accent" />
      <span className="rounded-sm bg-warn/80" />
      <span className="rounded-sm bg-danger/80" />
      <span className="rounded-sm bg-ok/80" />
    </span>
  );
}

export function TransportBar({
  playingCount,
  editingLayout,
  onToggleLayout,
  onOpenProfiles,
  onOpenSettings,
  onAddDeck,
}: TransportBarProps) {
  const masterVolume = useBoardStore((s) => s.masterVolume);
  const muted = useBoardStore((s) => s.muted);
  const exclusive = useBoardStore((s) => s.exclusive);
  const profiles = useBoardStore((s) => s.profiles);
  const activeProfileId = useBoardStore((s) => s.activeProfileId);
  const stopHotkey = useBoardStore((s) => s.stopHotkey);
  const setMasterVolume = useBoardStore((s) => s.setMasterVolume);
  const setMuted = useBoardStore((s) => s.setMuted);
  const setExclusive = useBoardStore((s) => s.setExclusive);
  const switchProfile = useBoardStore((s) => s.switchProfile);
  const stopAll = useBoardStore((s) => s.stopAll);
  const exportBoard = useBoardStore((s) => s.exportBoard);
  const active = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-5">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <LogoMark />
          <div className="min-w-0">
            <p className="font-display truncate text-sm font-semibold tracking-tight sm:text-base">Snap Jingle Player</p>
            <p className="hidden text-xs text-muted sm:block">
              {active?.name ?? "Profile"} · {active?.decks.length ?? 0} decks · {exclusive ? "cut mode" : "overlap"} · {playingCount}{" "}
              playing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
          <button
            type="button"
            className="text-muted hover:text-foreground"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <Slider
            className="hidden w-28 sm:flex"
            min={0}
            max={1}
            step={0.01}
            value={[muted ? 0 : masterVolume]}
            onValueChange={([value]) => {
              if (muted) setMuted(false);
              setMasterVolume(value ?? 0);
            }}
            aria-label="Master volume"
          />
          <span className="hidden w-10 text-right text-xs tabular-nums text-muted sm:inline">
            {muted ? "Mute" : `${Math.round(masterVolume * 100)}%`}
          </span>
        </div>

        <label className="flex items-center gap-2">
          <span className="sr-only">Profile</span>
          <select
            className="h-9 max-w-40 rounded-md border border-border bg-card px-2 text-sm"
            value={active?.id ?? ""}
            onChange={(event) => switchProfile(event.target.value)}
            aria-label="Profile"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" size="sm" onClick={onOpenProfiles}>
          Profiles
        </Button>
        <Button variant={editingLayout ? "default" : "secondary"} size="sm" onClick={onToggleLayout}>
          <LayoutGrid className="size-3.5" />
          <span className="hidden sm:inline">{editingLayout ? "Done" : "Arrange"}</span>
        </Button>
        {editingLayout ? (
          <Button variant="secondary" size="sm" onClick={onAddDeck}>
            Add deck
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={exclusive ? "default" : "secondary"}
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => setExclusive(!exclusive)}
            >
              {exclusive ? "Cut" : "Overlap"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>When cut is on, a new sound stops the others</TooltipContent>
        </Tooltip>

        <Button variant="secondary" size="sm" asChild>
          <a href="/downloads/SnapJinglePlayer-Setup.exe" download="SnapJinglePlayer-Setup.exe">
            <Download className="size-4" />
            <span className="hidden sm:inline">Download</span>
          </a>
        </Button>

        <Button variant="danger" size="lg" className="min-w-32 font-display tracking-wide" onClick={stopAll}>
          <Square className="size-4 fill-current" />
          STOP ALL
          <kbd className="hidden rounded bg-background/25 px-1.5 py-0.5 text-xs font-sans font-medium lg:inline">
            {codeToLabel(stopHotkey)}
          </kbd>
        </Button>

        <Button variant="secondary" size="icon" onClick={onOpenSettings} aria-label="Settings">
          <Settings2 className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setExclusive(!exclusive)}>
              {exclusive ? "Switch to overlap" : "Switch to cut mode"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportBoard()}>Export board</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/downloads/SnapJinglePlayer-Setup.exe" download className="flex items-center gap-2">
                <Download className="size-3.5" />
                Windows installer
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
