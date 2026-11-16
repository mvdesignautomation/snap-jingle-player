import { padColorAt } from "./colors.ts";
import { defaultHotkey } from "./hotkeys.ts";
import type { Pad } from "./types.ts";

export function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPad(index: number, cols = 6, withHotkey = true): Pad {
  return {
    id: createId("pad"),
    name: `PAD ${String(index + 1).padStart(2, "0")}`,
    color: padColorAt(index),
    clipId: null,
    fileName: null,
    duration: null,
    missing: false,
    hotkey: withHotkey ? defaultHotkey(index, cols) : null,
    volume: 1,
    loop: false,
    retrigger: "overlap",
  };
}

export function isConfiguredPad(pad: Pad): boolean {
  return Boolean(pad.clipId || pad.fileName);
}

export function blankPad(pad: Pad, index: number, cols: number): Pad {
  return { ...createPad(index, cols, false), id: pad.id, hotkey: defaultHotkey(index, cols) };
}
