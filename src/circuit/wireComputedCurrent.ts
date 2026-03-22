/**
 * Optional computed branch current (A) stored on wires after Calculate, for display in simulate mode.
 */

import type { CircuitComponent, Wire } from '../types/circuit'
import { wireJoinsDistinctLayoutPins } from './graphUtils'
import { roundE } from './electricUtils'

export type WireCurrentPatch =
  | { type: 'clear' }
  /** Same magnitude on every valid layout wire (single series loop). */
  | { type: 'uniformSeries'; currentA: number }

export function applyWireCurrentPatch(
  wires: Wire[],
  patch: WireCurrentPatch,
  terminalKeys: ReadonlySet<string>,
): Wire[] {
  if (patch.type === 'clear') {
    return wires.map((w) => ({ ...w, currentA: null }))
  }
  const i = roundE(Math.abs(patch.currentA))
  return wires.map((w) => {
    if (!wireJoinsDistinctLayoutPins(w, terminalKeys)) {
      return { ...w, currentA: null }
    }
    return { ...w, currentA: i }
  })
}

/** Read a solved series current from calculator output (prefer battery, then any finite `current`). */
export function inferUniformSeriesCurrentFromComponents(
  next: CircuitComponent[],
): number | null {
  const bat = next.find(
    (c) => c.kind === 'battery' && c.current !== null && Number.isFinite(c.current),
  )
  if (bat) {
    return bat.current
  }
  for (const c of next) {
    if (c.current !== null && Number.isFinite(c.current)) {
      return c.current
    }
  }
  return null
}
