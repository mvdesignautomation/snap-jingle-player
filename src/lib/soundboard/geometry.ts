import type { Pad } from "./types.ts";

export const MAX_DECK_COLS = 8;
export const MAX_DECK_ROWS = 8;
export const MAX_DECK_BUTTONS = 48;
export const MAX_DECKS = 32;

export type Rect = { x: number; y: number; cols: number; rows: number };

export function isValidDeckSize(cols: number, rows: number): boolean {
  return (
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    cols >= 1 &&
    rows >= 1 &&
    cols <= MAX_DECK_COLS &&
    rows <= MAX_DECK_ROWS &&
    cols * rows <= MAX_DECK_BUTTONS
  );
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.cols && a.x + a.cols > b.x && a.y < b.y + b.rows && a.y + a.rows > b.y;
}

export function overlapsAny(decks: Rect[], candidate: Rect, ignoreIndex = -1): boolean {
  return decks.some((deck, index) => index !== ignoreIndex && rectsOverlap(deck, candidate));
}

export function snapCell(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function workspaceBounds(decks: Rect[], minCols = 10, minRows = 8, margin = 3): { cols: number; rows: number } {
  let cols = minCols;
  let rows = minRows;
  for (const deck of decks) {
    cols = Math.max(cols, deck.x + deck.cols + margin);
    rows = Math.max(rows, deck.y + deck.rows + margin);
  }
  return { cols, rows };
}

export function firstFreeOrigin(decks: Rect[], cols: number, rows: number): { x: number; y: number } {
  const bounds = workspaceBounds(decks, cols, rows, 0);
  const limitX = Math.max(bounds.cols, 1) + cols;
  const limitY = Math.max(bounds.rows, 1) + rows;
  for (let y = 0; y < limitY; y += 1) {
    for (let x = 0; x < limitX; x += 1) {
      if (!overlapsAny(decks, { x, y, cols, rows })) return { x, y };
    }
  }
  return { x: bounds.cols, y: 0 };
}

export function remapPads(
  pads: Pad[],
  oldCols: number,
  oldRows: number,
  newCols: number,
  newRows: number,
  createEmpty: (index: number) => Pad,
): { pads: Pad[]; dropped: Pad[] } {
  const next: Pad[] = [];
  for (let row = 0; row < newRows; row += 1) {
    for (let col = 0; col < newCols; col += 1) {
      if (row < oldRows && col < oldCols) {
        const current = pads[row * oldCols + col];
        next.push(current ?? createEmpty(next.length));
      } else {
        next.push(createEmpty(next.length));
      }
    }
  }
  const dropped: Pad[] = [];
  for (let row = 0; row < oldRows; row += 1) {
    for (let col = 0; col < oldCols; col += 1) {
      if (row >= newRows || col >= newCols) {
        const pad = pads[row * oldCols + col];
        if (pad) dropped.push(pad);
      }
    }
  }
  return { pads: next, dropped };
}
