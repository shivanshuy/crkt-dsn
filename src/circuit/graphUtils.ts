/**
 * Shared terminal / net graph for DC analysis (wires merge terminals into nets).
 */

import type { CircuitComponent, Wire } from '../types/circuit'
import { terminalKey } from '../utils/terminal'

/** All left/right pin keys for components on the canvas (for stale-wire filtering). */
export function getAllTerminalKeys(components: readonly CircuitComponent[]): Set<string> {
  const keys = new Set<string>()
  for (const c of components) {
    keys.add(terminalKey({ componentId: c.id, side: 'left' }))
    keys.add(terminalKey({ componentId: c.id, side: 'right' }))
  }
  return keys
}

/**
 * True when both wire ends are existing pins and they are not the same terminal
 * (ignores deleted parts and zero-length / same-pin wires).
 */
export function wireJoinsDistinctLayoutPins(w: Wire, terminalKeys: ReadonlySet<string>): boolean {
  const a = terminalKey(w.from)
  const b = terminalKey(w.to)
  return terminalKeys.has(a) && terminalKeys.has(b) && a !== b
}

export class UnionFind {
  private readonly parent = new Map<string, string>()

  find(a: string): string {
    if (!this.parent.has(a)) {
      this.parent.set(a, a)
    }
    const p = this.parent.get(a)!
    if (p !== a) {
      this.parent.set(a, this.find(p))
    }
    return this.parent.get(a)!
  }

  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) {
      this.parent.set(ra, rb)
    }
  }
}

export function buildUnionFind(components: CircuitComponent[], wires: Wire[]) {
  const uf = new UnionFind()
  const allTerminalKeys = getAllTerminalKeys(components)
  for (const key of allTerminalKeys) {
    uf.find(key)
  }
  for (const w of wires) {
    if (!wireJoinsDistinctLayoutPins(w, allTerminalKeys)) {
      continue
    }
    uf.union(terminalKey(w.from), terminalKey(w.to))
  }
  const roots = new Set<string>()
  for (const key of allTerminalKeys) {
    roots.add(uf.find(key))
  }
  return { uf, allTerminalKeys, roots, netCount: roots.size }
}

export function netOf(uf: UnionFind, componentId: string, side: 'left' | 'right') {
  return uf.find(terminalKey({ componentId, side }))
}

/** True if the resistor connects exactly these two nets (order-independent). */
export function resistorSpansNets(
  uf: UnionFind,
  resistorId: string,
  netA: string,
  netB: string,
): boolean {
  const a = netOf(uf, resistorId, 'left')
  const b = netOf(uf, resistorId, 'right')
  return (a === netA && b === netB) || (a === netB && b === netA)
}
