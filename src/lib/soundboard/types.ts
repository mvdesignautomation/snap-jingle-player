export type RetriggerMode = "overlap" | "restart";

export type Pad = {
  id: string;
  name: string;
  color: string;
  clipId: string | null;
  fileName: string | null;
  duration: number | null;
  missing: boolean;
  hotkey: string | null;
  volume: number;
  loop: boolean;
  retrigger: RetriggerMode;
};

export type LayoutId = "3x4" | "4x4" | "4x6" | "5x6" | "6x8";

export type BoardSettings = {
  layout: LayoutId;
  masterVolume: number;
  muted: boolean;
  exclusive: boolean;
  stopHotkey: string;
  seenWelcome: boolean;
};

export type PersistedBoard = BoardSettings & {
  pads: Pad[];
};

export type ClipRecord = {
  id: string;
  name: string;
  mime: string;
  bytes: ArrayBuffer;
};

export type BackupPad = {
  name: string;
  color: string;
  hotkey: string | null;
  volume: number;
  loop: boolean;
  retrigger: RetriggerMode;
  fileName: string | null;
  audio: { mime: string; base64: string } | null;
};

export type BoardBackup = {
  version: 1;
  app: "snap-jingle-player";
  exportedAt: string;
  settings: Pick<BoardSettings, "layout" | "masterVolume" | "muted" | "exclusive" | "stopHotkey">;
  pads: BackupPad[];
};
