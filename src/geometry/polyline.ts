import type { Point } from '../types/circuit'

/** Point along a polyline at normalized distance [0, 1]. */
export function getPathPointAt(points: Point[], normalizedDistance: number): Point | null {
  if (points.length < 2) {
    return null
  }
  const segmentLengths: number[] = []
  let totalLength = 0
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index].x - points[index - 1].x
    const dy = points[index].y - points[index - 1].y
    const length = Math.hypot(dx, dy)
    segmentLengths.push(length)
    totalLength += length
  }
  if (totalLength === 0) {
    return points[0]
  }
  const target = normalizedDistance * totalLength
  let traversed = 0
  for (let index = 1; index < points.length; index += 1) {
    const segmentLength = segmentLengths[index - 1]
    if (traversed + segmentLength >= target) {
      const localRatio = (target - traversed) / segmentLength
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * localRatio,
        y: points[index - 1].y + (points[index].y - points[index - 1].y) * localRatio,
      }
    }
    traversed += segmentLength
  }
  return points[points.length - 1]
}
