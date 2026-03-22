import { COMPONENT_HEIGHT, COMPONENT_WIDTH } from '../constants/layout'
import { EXPORT_EXTRA_BOTTOM_PX } from '../constants/export'
import type { CircuitComponent, LayoutTextNote, Point } from '../types/circuit'
import { resolveLayoutTextNote } from '../utils/layoutTextNote'

export type DiagramBounds = { minX: number; minY: number; maxX: number; maxY: number }

export type ExportCropRect = { x: number; y: number; width: number; height: number }

/** Padding around component box (labels, terminals, value text). */
const PAD_TOP = 22
const PAD_BOTTOM = 20
const PAD_H = 8
const WIRE_PAD = 4

function componentAabb(component: CircuitComponent) {
  const rot = component.rotationDeg
  const w = rot === 90 || rot === 270 ? COMPONENT_HEIGHT : COMPONENT_WIDTH
  const h = rot === 90 || rot === 270 ? COMPONENT_WIDTH : COMPONENT_HEIGHT
  return {
    minX: component.x - PAD_H,
    minY: component.y - PAD_TOP,
    maxX: component.x + w + PAD_H,
    maxY: component.y + h + PAD_BOTTOM,
  }
}

/**
 * Bounding box of all components and wire geometry in canvas coordinates.
 */
export function computeDiagramBounds(
  components: CircuitComponent[],
  wirePolylines: { points: Point[] }[],
  textNotes: LayoutTextNote[] = [],
): DiagramBounds | null {
  if (components.length === 0 && wirePolylines.length === 0 && textNotes.length === 0) {
    return null
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const expand = (x0: number, y0: number, x1: number, y1: number) => {
    minX = Math.min(minX, x0)
    minY = Math.min(minY, y0)
    maxX = Math.max(maxX, x1)
    maxY = Math.max(maxY, y1)
  }

  for (const component of components) {
    const b = componentAabb(component)
    expand(b.minX, b.minY, b.maxX, b.maxY)
  }

  for (const line of wirePolylines) {
    for (const p of line.points) {
      expand(p.x - WIRE_PAD, p.y - WIRE_PAD, p.x + WIRE_PAD, p.y + WIRE_PAD)
    }
  }

  for (const note of textNotes) {
    const r = resolveLayoutTextNote(note)
    expand(note.x, note.y, note.x + r.width, note.y + r.height)
  }

  if (!Number.isFinite(minX)) {
    return null
  }

  return { minX, minY, maxX, maxY }
}

/**
 * - If the whole diagram lies inside the current scroll viewport, export that viewport only.
 * - Otherwise export from the top of the canvas (y = 0) through the bottom of the diagram
 *   plus {@link EXPORT_EXTRA_BOTTOM_PX}, full canvas width.
 */
export function getExportCropRect(
  scrollEl: HTMLElement,
  canvasEl: HTMLElement,
  diagramBounds: DiagramBounds | null,
): ExportCropRect {
  const scrollLeft = scrollEl.scrollLeft
  const scrollTop = scrollEl.scrollTop
  const vw = scrollEl.clientWidth
  const vh = scrollEl.clientHeight

  const viewportRect = {
    left: scrollLeft,
    top: scrollTop,
    right: scrollLeft + vw,
    bottom: scrollTop + vh,
  }

  if (!diagramBounds) {
    return { x: scrollLeft, y: scrollTop, width: vw, height: vh }
  }

  const { minX, minY, maxX, maxY } = diagramBounds
  const epsilon = 1

  const fitsInViewport =
    minX >= viewportRect.left - epsilon &&
    maxX <= viewportRect.right + epsilon &&
    minY >= viewportRect.top - epsilon &&
    maxY <= viewportRect.bottom + epsilon

  if (fitsInViewport) {
    return { x: scrollLeft, y: scrollTop, width: vw, height: vh }
  }

  const canvasW = canvasEl.scrollWidth
  const canvasH = canvasEl.scrollHeight
  const exportHeight = Math.min(maxY + EXPORT_EXTRA_BOTTOM_PX, canvasH)

  return {
    x: 0,
    y: 0,
    width: canvasW,
    height: Math.max(exportHeight, 1),
  }
}
