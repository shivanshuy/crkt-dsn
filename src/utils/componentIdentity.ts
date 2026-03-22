import type { CircuitComponent } from '../types/circuit'
import {
  isComponentPropertiesLocked,
  mergeLockedComponentWithCalculated,
} from './componentLock'

export { isComponentPropertiesLocked }

/**
 * Lookup / patch / merge by **existing** layout id. New ids are allocated only in `src/ids/layoutEntityIds.ts`.
 */
export function getComponentById(
  components: readonly CircuitComponent[],
  id: string | null | undefined,
): CircuitComponent | null {
  if (!id) {
    return null
  }
  return components.find((c) => c.id === id) ?? null
}

/** Immutable update: replace fields on the component with the given id. */
export function patchComponentById(
  components: CircuitComponent[],
  id: string,
  patch: Partial<CircuitComponent>,
): CircuitComponent[] {
  return components.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

/**
 * Merge `runCircuitCalculate` output back into the current list by **component id**, not array index.
 * Keeps layout order and identity stable while applying new V/I/R (and related) from analysis.
 * Locked rows use `LOCKED_SPEC_FIELD_KEYS` in `utils/componentLock.ts`.
 */
export function applyCalculationByComponentId(
  previous: CircuitComponent[],
  calculated: CircuitComponent[],
): CircuitComponent[] {
  const byIdPrev = new Map<string, CircuitComponent>()
  const duplicateIdWarned = new Set<string>()
  for (const c of previous) {
    if (byIdPrev.has(c.id) && !duplicateIdWarned.has(c.id)) {
      duplicateIdWarned.add(c.id)
      console.warn(
        `[crkt-dsn] Duplicate component id "${c.id}" in layout; later entry wins for calculate merge.`,
      )
    }
    byIdPrev.set(c.id, c)
  }

  if (calculated.length !== previous.length) {
    console.warn(
      '[crkt-dsn] Calculation result length differs from layout; using calculator order.',
    )
    return calculated.map((calc) => {
      const prev = byIdPrev.get(calc.id)
      return prev && isComponentPropertiesLocked(prev)
        ? mergeLockedComponentWithCalculated(prev, calc)
        : calc
    })
  }
  const byId = new Map<string, CircuitComponent>()
  for (const c of calculated) {
    byId.set(c.id, c)
  }
  let missingInResultWarned = false
  return previous.map((c) => {
    const calc = byId.get(c.id)
    if (!calc) {
      if (!missingInResultWarned) {
        missingInResultWarned = true
        console.warn(
          '[crkt-dsn] Calculate result missing one or more component ids; those parts are left unchanged.',
        )
      }
      return c
    }
    return isComponentPropertiesLocked(c)
      ? mergeLockedComponentWithCalculated(c, calc)
      : calc
  })
}
