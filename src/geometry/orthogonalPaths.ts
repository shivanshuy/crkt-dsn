import type { Point } from '../types/circuit'

export function appendOrthogonalPoint(from: Point, to: Point): Point {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  if (dx >= dy) {
    return { x: to.x, y: from.y }
  }
  return { x: from.x, y: to.y }
}

export function expandOrthogonalPath(points: Point[]): Point[] {
  if (points.length < 2) {
    return points
  }
  const expanded: Point[] = [points[0]]
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]
    const current = points[i]
    if (previous.x === current.x || previous.y === current.y) {
      expanded.push(current)
    } else {
      expanded.push({ x: current.x, y: previous.y }, current)
    }
  }
  return expanded
}
