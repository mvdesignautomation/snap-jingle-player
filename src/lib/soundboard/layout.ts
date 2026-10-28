import type { LayoutId } from "./types";

export type { LayoutId };

export const MAX_PADS = 48;

export const LAYOUTS: { id: LayoutId; rows: number; cols: number; label: string }[] = [
  { id: "3x4", rows: 3, cols: 4, label: "12 pads · 3×4" },
  { id: "4x4", rows: 4, cols: 4, label: "16 pads · 4×4" },
  { id: "4x6", rows: 4, cols: 6, label: "24 pads · 4×6" },
  { id: "5x6", rows: 5, cols: 6, label: "30 pads · 5×6" },
  { id: "6x8", rows: 6, cols: 8, label: "48 pads · 6×8" },
];

export const DEFAULT_LAYOUT: LayoutId = "4x6";

export function layoutById(id: LayoutId) {
  return LAYOUTS.find((item) => item.id === id) ?? LAYOUTS[2]!;
}

export function visibleCount(id: LayoutId) {
  const layout = layoutById(id);
  return layout.rows * layout.cols;
}
