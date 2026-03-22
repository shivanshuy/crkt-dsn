/**
 * Single place for **properties lock** behavior: which fields stay user-defined after Calculate,
 * and how series solvers treat locked branch current. Add kinds or fields here only.
 */

import type { CircuitComponent, ComponentKind } from '../types/circuit'
import { isSet, roundE } from '../circuit/electricUtils'

export function isComponentPropertiesLocked(c: CircuitComponent): boolean {
  return c.propertiesLocked === true
}

/**
 * For each kind, layout fields kept when `propertiesLocked` is true; all other electric/spec fields
 * on that row come from the calculator output.
 */
export const LOCKED_SPEC_FIELD_KEYS: Record<
  ComponentKind,
  readonly (keyof CircuitComponent)[]
> = {
  battery: ['voltage'],
  resistor: ['resistance'],
  led: ['voltage', 'current', 'ledColor'],
  capacitor: ['capacitance'],
}

function lockedSpecPreservesKey(c: CircuitComponent, key: keyof CircuitComponent): boolean {
  if (!isComponentPropertiesLocked(c)) {
    return false
  }
  return (LOCKED_SPEC_FIELD_KEYS[c.kind] as readonly string[]).includes(key as string)
}

/** True if this locked part’s spec includes branch current (series solvers may fix KCL to it). */
export function lockedComponentPreservesCurrent(c: CircuitComponent): boolean {
  return lockedSpecPreservesKey(c, 'current')
}

/**
 * If any part in `seriesParts` is locked and preserves `current`, all such parts must agree;
 * that value becomes the forced series current. Otherwise `I` is null (solver chooses).
 */
export function getForcedSeriesCurrentFromLockedParts(
  seriesParts: readonly CircuitComponent[],
):
  | { ok: true; I: number | null }
  | { ok: false; message: string } {
  const candidates = seriesParts.filter(
    (c) => lockedComponentPreservesCurrent(c) && isSet(c.current),
  )
  if (candidates.length === 0) {
    return { ok: true, I: null }
  }
  const i0 = candidates[0].current!
  for (let i = 1; i < candidates.length; i += 1) {
    const ic = candidates[i].current!
    if (Math.abs(ic - i0) > 1e-6 * Math.max(1, Math.abs(i0))) {
      return {
        ok: false,
        message: `Series: locked parts disagree on branch current (${i0} A vs ${ic} A).`,
      }
    }
  }
  return { ok: true, I: roundE(i0) }
}

/**
 * When **any** part is locked but not all:
 * - **Exactly one** unlocked part → solve that part from the others.
 * When **all** parts are locked → Calculate still runs to analyze the circuit (wire currents + drops)
 * where a matching solver applies; otherwise you may see solver messages as before.
 * If nothing is locked, the usual multi-unknown behavior applies.
 */
export function validateCalculateLockConstraint(
  components: CircuitComponent[],
): { ok: true } | { ok: false; message: string } {
  const hasAnyLocked = components.some(isComponentPropertiesLocked)
  if (!hasAnyLocked) {
    return { ok: true }
  }
  const unlocked = components.filter((c) => !isComponentPropertiesLocked(c))
  if (unlocked.length === 0) {
    return { ok: true }
  }
  if (unlocked.length > 1) {
    return {
      ok: false,
      message: `With locked parts: only one component may be unlocked for Calculate (you have ${unlocked.length} unlocked). Lock the others so a single unknown can be solved.`,
    }
  }
  return { ok: true }
}

export function allComponentsPropertiesLocked(components: CircuitComponent[]): boolean {
  return components.length > 0 && components.every(isComponentPropertiesLocked)
}

export function mergeLockedComponentWithCalculated(
  previous: CircuitComponent,
  calculated: CircuitComponent,
): CircuitComponent {
  if (!isComponentPropertiesLocked(previous)) {
    return calculated
  }
  if (previous.id !== calculated.id || previous.kind !== calculated.kind) {
    console.warn(
      '[crkt-dsn] mergeLockedComponentWithCalculated: id/kind mismatch between layout and calculate result; keeping layout identity.',
    )
  }
  const keys = LOCKED_SPEC_FIELD_KEYS[previous.kind]
  /** Canvas placement and identity always follow the layout row, not the solver copy. */
  const out: CircuitComponent = {
    ...calculated,
    id: previous.id,
    kind: previous.kind,
    x: previous.x,
    y: previous.y,
    rotationDeg: previous.rotationDeg,
    propertiesLocked: previous.propertiesLocked,
  }
  for (const k of keys) {
    const v = previous[k]
    ;(out as Record<string, unknown>)[k as string] = v
  }
  return out
}
