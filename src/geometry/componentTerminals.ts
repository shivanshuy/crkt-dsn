import type { MouseEvent } from 'react'
import { COMPONENT_HEIGHT, COMPONENT_WIDTH } from '../constants/layout'
import type {
  CircuitComponent,
  Point,
  RotationDeg,
  TerminalRef,
  TerminalSide,
} from '../types/circuit'

/** World position of a component terminal for routing and wires. */
export function getTerminalWorldPoint(
  component: CircuitComponent,
  terminal: TerminalRef,
): Point | null {
  const { x, y, rotationDeg } = component
  const W = COMPONENT_WIDTH
  const H = COMPONENT_HEIGHT

  if (rotationDeg === 0) {
    return {
      x: terminal.side === 'left' ? x : x + W,
      y: y + H / 2,
    }
  }
  if (rotationDeg === 180) {
    return {
      x: terminal.side === 'left' ? x + W : x,
      y: y + H / 2,
    }
  }
  if (rotationDeg === 90) {
    return {
      x: x + W / 2,
      y: terminal.side === 'left' ? y : y + H,
    }
  }
  if (rotationDeg === 270) {
    return {
      x: x + W / 2,
      y: terminal.side === 'left' ? y + H : y,
    }
  }
  return null
}

/**
 * Map a click on the component node to logical terminal (left/right) using rotation,
 * so wiring matches the drawn symbol after any rotation.
 */
export function terminalSideFromPointerEvent(
  component: CircuitComponent,
  event: MouseEvent<HTMLElement>,
): TerminalSide {
  const rect = event.currentTarget.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = event.clientX - cx
  const dy = event.clientY - cy
  const rad = (-component.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos
  const isHorizontal = component.rotationDeg === 0 || component.rotationDeg === 180
  if (isHorizontal) {
    return localX < 0 ? 'left' : 'right'
  }
  return localY < 0 ? 'left' : 'right'
}

export function isVerticalLayout(rotationDeg: RotationDeg): boolean {
  return rotationDeg === 90 || rotationDeg === 270
}
