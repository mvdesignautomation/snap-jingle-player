import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBoardStore } from "@/lib/soundboard/store";

export function Welcome() {
  const loadDemo = useBoardStore((s) => s.loadDemo);
  const markWelcomeSeen = useBoardStore((s) => s.markWelcomeSeen);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-panel sm:p-8">
        <p className="text-xs font-medium tracking-widest text-accent uppercase">Live soundboard</p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">Snap Jingle Player</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Assign local audio to large pads, trigger them instantly, and keep several sounds overlapping for live use.
          Everything stays on this device.
        </p>
        <ul className="mt-5 space-y-2 text-sm text-muted">
          <li>Click a pad to play. Drop a WAV, MP3, or OGG file onto it to assign.</li>
          <li>Right-click a pad to edit name, color, volume, loop, and hotkey.</li>
          <li>
            <span className="text-foreground">Esc</span> stops everything. Sounds overlap unless you turn on cut mode.
          </li>
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => void loadDemo()}>
            Load demo sounds
          </Button>
          <Button className="flex-1" variant="secondary" onClick={markWelcomeSeen}>
            Start empty
          </Button>
        </div>
        <Button className="mt-2 w-full" variant="outline" asChild>
          <a href="/downloads/SnapJinglePlayer-Setup.exe" download="SnapJinglePlayer-Setup.exe">
            <Download className="size-4" />
            Download Windows installer
          </a>
        </Button>
      </div>
    </div>
  );
}
