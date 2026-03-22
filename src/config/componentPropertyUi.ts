/**
 * **Which spec fields appear** in the properties panel (design vs simulate) and optional hints.
 * Canvas under-node text uses {@link getComponentCanvasLabelFields} (may add solved V/I in simulate
 * while the panel stays minimal — e.g. resistor). `ledColor` is panel-only, not on the canvas line.
 *
 * Keep in sync with solvers / locks: editable fields should match what users expect to set;
 * `LOCKED_SPEC_FIELD_KEYS` in `utils/componentLock.ts` defines what stays fixed when locked.
 */

import type { ComponentKind } from './supportedComponents'

/** Spec keys that can appear as inputs in the properties panel (subset of `CircuitComponent`). */
export type ComponentPropertyField =
  | 'voltage'
  | 'current'
  | 'resistance'
  | 'capacitance'
  | 'ledColor'

export type PropertyPanelHint = {
  text: string
  /** Appended to `hint` (e.g. `hint--ohms`). */
  className?: string
}

/** Canvas under-symbol line (excludes `ledColor`); can differ from the properties panel in simulate. */
export type CanvasLabelFieldSimulate = Exclude<ComponentPropertyField, 'ledColor'>

export type ComponentKindPropertyUi = {
  /** Field order = panel order in **design** (edit) mode */
  fieldsDesign: readonly ComponentPropertyField[]
  /** Field order = panel order in **simulate** mode */
  fieldsSimulate: readonly ComponentPropertyField[]
  /**
   * In **simulate** mode, under-node text can list more than the panel (e.g. solved V & I on a resistor
   * while the panel stays “resistance only”). If omitted, canvas uses `fieldsSimulate` minus `ledColor`.
   */
  canvasLabelFieldsSimulate?: readonly CanvasLabelFieldSimulate[]
  hintDesign?: PropertyPanelHint
  hintSimulate?: PropertyPanelHint
}

export const COMPONENT_PROPERTY_FIELD_LABELS: Record<ComponentPropertyField, string> = {
  voltage: 'Voltage (V)',
  current: 'Current (A)',
  resistance: 'Resistance (Ohm)',
  capacitance: 'Capacitance (uF)',
  ledColor: 'LED color',
}

/** Explicit `Record` typing so optional `hint*` keys are always safely accessible. */
export const COMPONENT_PROPERTY_UI: Record<ComponentKind, ComponentKindPropertyUi> = {
  battery: {
    fieldsDesign: ['voltage'],
    fieldsSimulate: ['voltage'],
    /** After Calculate: show source V and branch I under the symbol. */
    canvasLabelFieldsSimulate: ['voltage', 'current'],
    hintSimulate: { text: 'Battery: source voltage only.' },
  },
  resistor: {
    fieldsDesign: ['resistance'],
    fieldsSimulate: ['resistance'],
    /** After Calculate: voltage across & current through the resistor (panel stays R-only). */
    canvasLabelFieldsSimulate: ['voltage', 'current', 'resistance'],
    hintSimulate: {
      text:
        'Resistor: resistance only. Voltage and current for this part are determined by the circuit when you click Calculate — they are not edited here.',
      className: 'hint--ohms',
    },
  },
  led: {
    fieldsDesign: ['ledColor', 'voltage', 'current'],
    /** Color stays available in simulate (same as previous UI). */
    fieldsSimulate: ['ledColor', 'voltage', 'current'],
    hintSimulate: {
      text: 'LED: forward voltage and operating current only (no resistance).',
      className: 'hint--ohms',
    },
  },
  capacitor: {
    fieldsDesign: ['capacitance'],
    fieldsSimulate: ['capacitance'],
  },
}

export function getComponentPropertyFields(
  kind: ComponentKind,
  isSimulating: boolean,
): readonly ComponentPropertyField[] {
  const row = COMPONENT_PROPERTY_UI[kind]
  return isSimulating ? row.fieldsSimulate : row.fieldsDesign
}

export function getComponentPropertyHint(
  kind: ComponentKind,
  isSimulating: boolean,
): PropertyPanelHint | undefined {
  const row = COMPONENT_PROPERTY_UI[kind]
  return isSimulating ? row.hintSimulate : row.hintDesign
}

/** Fields used for the short text under a part on the canvas (excludes `ledColor`). */
export function getComponentCanvasLabelFields(
  kind: ComponentKind,
  isSimulating: boolean,
): readonly CanvasLabelFieldSimulate[] {
  const row = COMPONENT_PROPERTY_UI[kind]
  if (isSimulating && row.canvasLabelFieldsSimulate) {
    return row.canvasLabelFieldsSimulate
  }
  return getComponentPropertyFields(kind, isSimulating).filter(
    (f): f is CanvasLabelFieldSimulate => f !== 'ledColor',
  )
}
