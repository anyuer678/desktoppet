export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface AlphaMap {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function contentRectFrom(
  naturalWidth: number,
  naturalHeight: number,
  rectWidth: number,
  rectHeight: number
): Rect {
  if (naturalWidth <= 0 || naturalHeight <= 0 || rectWidth <= 0 || rectHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const scale = Math.min(rectWidth / naturalWidth, rectHeight / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return { x: (rectWidth - width) / 2, y: (rectHeight - height) / 2, width, height }
}

export function alphaAt(map: AlphaMap, x: number, y: number): number {
  if (map.width <= 0 || map.height <= 0) return 0
  const bx = Math.min(map.width - 1, Math.max(0, Math.floor(x)))
  const by = Math.min(map.height - 1, Math.max(0, Math.floor(y)))
  return map.data[(by * map.width + bx) * 4 + 3] ?? 0
}

export function pointInRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

export interface HitCheckInput {
  map: AlphaMap
  content: Rect
  panels: Rect[]
  x: number
  y: number
  threshold: number
}

export function shouldIgnorePointer(input: HitCheckInput): boolean {
  for (const panel of input.panels) {
    if (pointInRect(panel, input.x, input.y)) return false
  }
  if (input.content.width <= 0 || input.content.height <= 0) return false
  if (!pointInRect(input.content, input.x, input.y)) return true
  const fx = (input.x - input.content.x) / input.content.width
  const fy = (input.y - input.content.y) / input.content.height
  return alphaAt(input.map, fx * input.map.width, fy * input.map.height) < input.threshold
}