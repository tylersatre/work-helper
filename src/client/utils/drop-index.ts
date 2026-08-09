export function computeDropIndex(pointerY: number, midpoints: number[]): number {
  const index = midpoints.findIndex((midpoint) => pointerY < midpoint);
  return index === -1 ? midpoints.length : index;
}
