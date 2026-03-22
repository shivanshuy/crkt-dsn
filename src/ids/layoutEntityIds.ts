/**
 * Single source for **allocating** new layout entity string ids (circuit parts, wires, text notes).
 *
 * - Prefixes and sequential counters live only in this file.
 * - Call sites use `createComponentId`, `createWireId`, or `createTextNoteId` — do not build id strings elsewhere.
 * - Lookup / merge by id is in `utils/componentIdentity.ts` (different concern).
 */

import {
  COMPONENT_KIND_ID_PREFIXES as COMPONENT_ID_PREFIXES,
  SUPPORTED_COMPONENT_KINDS,
  type ComponentKind,
} from '../config/supportedComponents'

export { COMPONENT_ID_PREFIXES }

/** Wire (net connection) ids, e.g. `W_1` */
export const WIRE_ID_PREFIX = 'W_'

/** Layout text note ids (not in netlist), e.g. `N_1` */
export const TEXT_NOTE_ID_PREFIX = 'N_'

function nextSequentialId(prefix: string, counter: { n: number }): string {
  counter.n += 1
  return `${prefix}${counter.n}`
}

const componentCounter = Object.fromEntries(
  SUPPORTED_COMPONENT_KINDS.map((kind) => [kind, { n: 0 }]),
) as Record<ComponentKind, { n: number }>

const wireCounter = { n: 0 }
const textNoteCounter = { n: 0 }

/** Reset all sequential counters (call when clearing the canvas so new ids start at `_1` again). */
export function resetLayoutEntityIdCounters(): void {
  for (const kind of SUPPORTED_COMPONENT_KINDS) {
    componentCounter[kind].n = 0
  }
  wireCounter.n = 0
  textNoteCounter.n = 0
}

/** Next unique id for a placed circuit component (per kind), e.g. `R_3`. */
export function createComponentId(kind: ComponentKind): string {
  return nextSequentialId(COMPONENT_ID_PREFIXES[kind], componentCounter[kind])
}

/** Next unique id for a wire. */
export function createWireId(): string {
  return nextSequentialId(WIRE_ID_PREFIX, wireCounter)
}

/** Next unique id for a layout text note. */
export function createTextNoteId(): string {
  return nextSequentialId(TEXT_NOTE_ID_PREFIX, textNoteCounter)
}
