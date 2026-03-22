import { GRID_SIZE } from '../constants/layout'

/** One grid step for layout arrow-key nudging, or null if not an arrow key. */
export function gridDeltaFromArrowKey(key: string): { dx: number; dy: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -GRID_SIZE, dy: 0 }
    case 'ArrowRight':
      return { dx: GRID_SIZE, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -GRID_SIZE }
    case 'ArrowDown':
      return { dx: 0, dy: GRID_SIZE }
    default:
      return null
  }
}
