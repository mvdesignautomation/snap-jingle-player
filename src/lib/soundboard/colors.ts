export const PAD_COLORS = [
  { id: "teal", value: "#3e7a78", label: "Teal" },
  { id: "steel", value: "#4a6f8c", label: "Steel" },
  { id: "forest", value: "#4a6d58", label: "Forest" },
  { id: "brick", value: "#8a4a44", label: "Brick" },
  { id: "slate", value: "#5a6578", label: "Slate" },
  { id: "rust", value: "#8a5a3c", label: "Rust" },
  { id: "ink", value: "#3a4a5c", label: "Ink" },
  { id: "moss", value: "#5a6a3c", label: "Moss" },
  { id: "wine", value: "#6a3a44", label: "Wine" },
  { id: "dusk", value: "#4a5a6a", label: "Dusk" },
  { id: "copper", value: "#7a5a44", label: "Copper" },
  { id: "pine", value: "#2f5548", label: "Pine" },
] as const;

export function padColorAt(index: number): string {
  return PAD_COLORS[index % PAD_COLORS.length]!.value;
}
