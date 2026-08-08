export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function ensurePositionVisible(
  pos: { x: number; y: number },
  size: number,
  primary: Rect,
  workAreas: Rect[]
): { x: number; y: number } | null {
  if (workAreas.length === 0) return null
  const win = { x: pos.x, y: pos.y, width: size, height: size }
  const visible = workAreas.some((area) => rectsOverlap(area, win))
  if (visible) return null
  return {
    x: Math.max(primary.x, primary.x + primary.width - size),
    y: primary.y
  }
}