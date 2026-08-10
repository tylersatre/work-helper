export const TAG_PALETTE = [
  '#3B82F6',
  '#22C55E',
  '#EAB308',
  '#EF4444',
  '#A855F7',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#06B6D4',
  '#84CC16',
] as const;

export function nextTagColor(lastColor: string | null | undefined): string {
  if (lastColor == null) {
    return TAG_PALETTE[0];
  }

  const index = TAG_PALETTE.indexOf(lastColor as (typeof TAG_PALETTE)[number]);
  if (index === -1) {
    return TAG_PALETTE.find((color) => color !== lastColor) ?? TAG_PALETTE[0];
  }

  return TAG_PALETTE[(index + 1) % TAG_PALETTE.length]!;
}
