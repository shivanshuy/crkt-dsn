/**
 * Quick checks for whether the schematic is one connected piece (wires between parts).
 */

import type { CircuitComponent, Wire } from '../types/circuit'
import { getAllTerminalKeys, wireJoinsDistinctLayoutPins } from './graphUtils'
import { terminalKey } from '../utils/terminal'

export type CircuitFullyConnectedOptions = {
  /**
   * When true, every component pin (left/right) must appear on at least one wire end.
   * Use for “no dangling terminals” (e.g. a closed loop), not just one big wiring island.
   * Default false.
   */
  requireAllTerminalsWired?: boolean
}

/**
 * True when all **components** lie in a single connected group, using only **wires between
 * different parts** (same-part wires are ignored for connectivity).
 *
 * - Empty layout → true.
 * - Single component → true (nothing to connect to).
 * - Two or more components → there must be a path of wires joining them all into one graph.
 */
export function isCircuitFullyConnected(
  components: CircuitComponent[],
  wires: Wire[],
  options?: CircuitFullyConnectedOptions,
): boolean {
  if (components.length === 0) {
    return true
  }
  if (components.length === 1) {
    if (!options?.requireAllTerminalsWired) {
      return true
    }
    return areAllTerminalsWired(components, wires)
  }

  const idSet = new Set(components.map((c) => c.id))
  const terminalKeys = getAllTerminalKeys(components)

  const adj = new Map<string, Set<string>>()
  for (const c of components) {
    adj.set(c.id, new Set())
  }

  for (const w of wires) {
    if (!wireJoinsDistinctLayoutPins(w, terminalKeys)) {
      continue
    }
    const a = w.from.componentId
    const b = w.to.componentId
    if (!idSet.has(a) || !idSet.has(b) || a === b) {
      continue
    }
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }

  const start = components[0].id
  const seen = new Set<string>([start])
  const queue = [start]
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]
    for (const v of adj.get(u) ?? []) {
      if (!seen.has(v)) {
        seen.add(v)
        queue.push(v)
      }
    }
  }

  if (seen.size !== components.length) {
    return false
  }

  if (options?.requireAllTerminalsWired) {
    return areAllTerminalsWired(components, wires)
  }

  return true
}

/** Every existing component terminal is the endpoint of at least one non-stale wire. */
export function areAllTerminalsWired(components: CircuitComponent[], wires: Wire[]): boolean {
  if (components.length === 0) {
    return true
  }
  const terminalKeys = getAllTerminalKeys(components)
  const touched = new Set<string>()
  for (const w of wires) {
    const a = terminalKey(w.from)
    const b = terminalKey(w.to)
    if (terminalKeys.has(a)) {
      touched.add(a)
    }
    if (terminalKeys.has(b)) {
      touched.add(b)
    }
  }
  for (const key of terminalKeys) {
    if (!touched.has(key)) {
      return false
    }
  }
  return true
}
