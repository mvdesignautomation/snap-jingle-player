import { PAD_COLORS } from "./colors";

export const DEMO_SOUNDS = [
  { file: "sting.wav", name: "STING", color: PAD_COLORS[0].value },
  { file: "hit.wav", name: "HIT", color: PAD_COLORS[3].value },
  { file: "punch.wav", name: "PUNCH", color: PAD_COLORS[5].value },
  { file: "click.wav", name: "CLICK", color: PAD_COLORS[1].value },
  { file: "rise.wav", name: "RISE", color: PAD_COLORS[4].value },
  { file: "sweep.wav", name: "SWEEP", color: PAD_COLORS[9].value },
  { file: "chord.wav", name: "CHORD", color: PAD_COLORS[2].value },
  { file: "drop.wav", name: "DROP", color: PAD_COLORS[8].value },
  { file: "blip.wav", name: "BLIP", color: PAD_COLORS[7].value },
  { file: "thud.wav", name: "THUD", color: PAD_COLORS[11].value },
  { file: "tick.wav", name: "TICK", color: PAD_COLORS[6].value },
  { file: "shimmer.wav", name: "SHIMMER", color: PAD_COLORS[10].value },
] as const;

export function sampleUrl(file: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}samples/${file}`;
}
