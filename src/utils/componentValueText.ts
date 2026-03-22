import { getComponentCanvasLabelFields } from '../config/componentPropertyUi'
import type { ComponentPropertyField } from '../config/componentPropertyUi'
import type { CircuitComponent } from '../types/circuit'

type CanvasLabelField = Exclude<ComponentPropertyField, 'ledColor'>

function formatFieldPart(component: CircuitComponent, field: CanvasLabelField): string | null {
  switch (field) {
    case 'voltage':
      return component.voltage !== null ? `${component.voltage} V` : null
    case 'current':
      return component.current !== null ? `${component.current} A` : null
    case 'resistance':
      return component.resistance !== null ? `${component.resistance} Ohm` : null
    case 'capacitance':
      return component.capacitance !== null ? `${component.capacitance} uF` : null
    default:
      return null
  }
}

/**
 * Text under a part on the layout. Uses {@link getComponentCanvasLabelFields} — same field sets as
 * the properties panel minus `ledColor` (color is not repeated under the symbol).
 */
export function getComponentValueText(component: CircuitComponent, isSimulating: boolean): string {
  const fields = getComponentCanvasLabelFields(component.kind, isSimulating)
  const parts: string[] = []
  for (const field of fields) {
    const s = formatFieldPart(component, field)
    if (s) {
      parts.push(s)
    }
  }
  return parts.join(' · ')
}
