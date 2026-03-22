import type { CircuitComponent, ComponentKind, Wire } from '../types/circuit'
import {
  allComponentsPropertiesLocked,
  validateCalculateLockConstraint,
} from '../utils/componentLock'
import { isSet as isElectricValueSet, roundE as roundElectric } from './electricUtils'
import { tryKirchhoffSeriesBatteryLedResistor } from './kirchhoffSeries'
import { tryParallelResistorsBank } from './parallelResistors'
import { trySeriesResistorChain } from './seriesResistorChain'
import {
  inferUniformSeriesCurrentFromComponents,
  type WireCurrentPatch,
} from './wireComputedCurrent'

export type CircuitCalculateResult = {
  next: CircuitComponent[]
  message: string | null
  wireCurrentPatch: WireCurrentPatch
}

const CLEAR_WIRES: WireCurrentPatch = { type: 'clear' }

function withAllLockedWireNote(
  list: CircuitComponent[],
  message: string | null,
  patch: WireCurrentPatch,
): string | null {
  if (!message || !allComponentsPropertiesLocked(list) || patch.type !== 'uniformSeries') {
    return message
  }
  return `${message}\n\n— All parts locked: each wire segment shows I ≈ ${patch.currentA} A (same everywhere in this series loop, KCL). Part voltages/currents update where your lock allows (see labels & properties panel).`
}

/** Ohm’s law: V = I × R — used when user clicks Calculate in simulate mode */
function computeOhmsForComponent(
  component: CircuitComponent,
  kindLabelsMap: Record<ComponentKind, string>,
): { component: CircuitComponent; issues: string[] } {
  const label = kindLabelsMap[component.kind]
  if (component.kind === 'led') {
    return { component: { ...component, resistance: null }, issues: [] }
  }
  const v = component.voltage
  const i = component.current
  const r = component.resistance

  const hasV = isElectricValueSet(v)
  const hasI = isElectricValueSet(i)
  const hasR = isElectricValueSet(r)
  const knownCount = [hasV, hasI, hasR].filter(Boolean).length

  if (knownCount === 0) {
    return { component, issues: [] }
  }

  /** After a prior Calculate, V/I/R may all be filled; re-solve so edited values propagate. */
  if (knownCount === 3) {
    if (hasV && hasI) {
      if (Math.abs(i as number) < 1e-15) {
        return {
          component,
          issues: [`${label}: current is zero — cannot compute resistance (V ÷ I).`],
        }
      }
      const nr = roundElectric((v as number) / (i as number))
      return { component: { ...component, voltage: v, current: i, resistance: nr }, issues: [] }
    }
    if (hasV && hasR) {
      if (Math.abs(r as number) < 1e-15) {
        return {
          component,
          issues: [`${label}: resistance is zero — cannot compute current (V ÷ R).`],
        }
      }
      const ni = roundElectric((v as number) / (r as number))
      return { component: { ...component, voltage: v, current: ni, resistance: r }, issues: [] }
    }
    if (hasI && hasR) {
      const nv = roundElectric((i as number) * (r as number))
      return { component: { ...component, voltage: nv, current: i, resistance: r }, issues: [] }
    }
    return { component, issues: [] }
  }

  if (knownCount === 1) {
    return {
      component,
      issues: [
        `${label}: need two of voltage, current, and resistance to compute the third (V = I × R).`,
      ],
    }
  }

  let nv: number | null = v
  let ni: number | null = i
  let nr: number | null = r

  if (hasV && hasI && !hasR) {
    if (Math.abs(i as number) < 1e-15) {
      return {
        component,
        issues: [`${label}: current is zero — cannot compute resistance (V ÷ I).`],
      }
    }
    nr = roundElectric((v as number) / (i as number))
  } else if (hasV && hasR && !hasI) {
    if (Math.abs(r as number) < 1e-15) {
      return {
        component,
        issues: [`${label}: resistance is zero — cannot compute current (V ÷ R).`],
      }
    }
    ni = roundElectric((v as number) / (r as number))
  } else if (hasI && hasR && !hasV) {
    nv = roundElectric((i as number) * (r as number))
  }

  return { component: { ...component, voltage: nv, current: ni, resistance: nr }, issues: [] }
}

function runOhmsCalculate(
  list: CircuitComponent[],
  kindLabelsMap: Record<ComponentKind, string>,
): CircuitCalculateResult {
  const issues: string[] = []
  const next = list.map((component) => {
    const result = computeOhmsForComponent(component, kindLabelsMap)
    issues.push(...result.issues)
    return result.component
  })
  return {
    next,
    message: issues.length > 0 ? issues.join(' • ') : null,
    wireCurrentPatch: CLEAR_WIRES,
  }
}

/**
 * Kirchhoff-based analysis when topology matches (see Kuphaldt DC Ch.6 — dividers & KVL/KCL).
 * Otherwise per-component Ohm’s law.
 *
 * The returned `next` array has the **same length and `CircuitComponent.id` values** as `list`;
 * only electric fields (and related) are updated. The UI merges with `applyCalculationByComponentId`
 * so canvas nodes and the properties panel stay aligned by component id. Components with
 * `propertiesLocked` merge uses `LOCKED_SPEC_FIELD_KEYS` in `utils/componentLock.ts`.
 */
export function runCircuitCalculate(
  list: CircuitComponent[],
  wires: Wire[],
  kindLabelsMap: Record<ComponentKind, string>,
): CircuitCalculateResult {
  const lockCheck = validateCalculateLockConstraint(list)
  if (!lockCheck.ok) {
    return { next: list, message: lockCheck.message, wireCurrentPatch: CLEAR_WIRES }
  }

  const ledLoop = tryKirchhoffSeriesBatteryLedResistor(list, wires)
  if (ledLoop.applicable) {
    if (ledLoop.ok) {
      const I = inferUniformSeriesCurrentFromComponents(ledLoop.next)
      const wireCurrentPatch: WireCurrentPatch =
        I !== null ? { type: 'uniformSeries', currentA: I } : CLEAR_WIRES
      return {
        next: ledLoop.next,
        message: withAllLockedWireNote(list, ledLoop.explanation, wireCurrentPatch),
        wireCurrentPatch,
      }
    }
    return { next: list, message: ledLoop.message, wireCurrentPatch: CLEAR_WIRES }
  }
  const seriesR = trySeriesResistorChain(list, wires)
  if (seriesR.applicable) {
    if (seriesR.ok) {
      const I = inferUniformSeriesCurrentFromComponents(seriesR.next)
      const wireCurrentPatch: WireCurrentPatch =
        I !== null ? { type: 'uniformSeries', currentA: I } : CLEAR_WIRES
      return {
        next: seriesR.next,
        message: withAllLockedWireNote(list, seriesR.explanation, wireCurrentPatch),
        wireCurrentPatch,
      }
    }
    return { next: list, message: seriesR.message, wireCurrentPatch: CLEAR_WIRES }
  }
  const parallelR = tryParallelResistorsBank(list, wires)
  if (parallelR.applicable) {
    if (parallelR.ok) {
      return {
        next: parallelR.next,
        message: withAllLockedWireNote(list, parallelR.explanation, CLEAR_WIRES),
        wireCurrentPatch: CLEAR_WIRES,
      }
    }
    return { next: list, message: parallelR.message, wireCurrentPatch: CLEAR_WIRES }
  }
  return runOhmsCalculate(list, kindLabelsMap)
}
