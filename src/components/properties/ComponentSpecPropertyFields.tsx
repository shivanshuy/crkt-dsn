import {
  COMPONENT_PROPERTY_FIELD_LABELS,
  COMPONENT_PROPERTY_UI,
  type ComponentPropertyField,
} from '../../config/componentPropertyUi'
import { LED_COLOR_OPTIONS, type LedColor } from '../../config/componentDefaults'
import type { CircuitComponent } from '../../types/circuit'
import { parseNumberOrNull } from '../../utils/parse'

type NumericSpecKey = 'voltage' | 'current' | 'resistance' | 'capacitance'

function isNumericSpecField(f: ComponentPropertyField): f is NumericSpecKey {
  return f !== 'ledColor'
}

export type ComponentSpecPropertyFieldsProps = {
  component: CircuitComponent
  isSimulating: boolean
  locked: boolean
  onNumericChange: (field: NumericSpecKey, value: number | null) => void
  onLedColorChange: (color: LedColor) => void
}

/**
 * Renders the configurable spec inputs for one component (same config as canvas label fields,
 * plus `ledColor` when listed for design mode).
 */
export function ComponentSpecPropertyFields({
  component,
  isSimulating,
  locked,
  onNumericChange,
  onLedColorChange,
}: ComponentSpecPropertyFieldsProps) {
  const row = COMPONENT_PROPERTY_UI[component.kind]
  const fields = isSimulating ? row.fieldsSimulate : row.fieldsDesign
  const hint = isSimulating ? row.hintSimulate : row.hintDesign

  return (
    <>
      {hint ? (
        <p className={hint.className ? `hint ${hint.className}` : 'hint'}>{hint.text}</p>
      ) : null}
      {fields.map((field) => {
        if (field === 'ledColor') {
          return (
            <label key={field}>
              {COMPONENT_PROPERTY_FIELD_LABELS.ledColor}
              <select
                value={component.ledColor}
                disabled={locked}
                onChange={(event) => onLedColorChange(event.target.value as LedColor)}
              >
                {LED_COLOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )
        }
        if (!isNumericSpecField(field)) {
          return null
        }
        const value = component[field]
        return (
          <label key={field}>
            {COMPONENT_PROPERTY_FIELD_LABELS[field]}
            <input
              type="number"
              step="any"
              disabled={locked}
              value={value ?? ''}
              onChange={(event) => onNumericChange(field, parseNumberOrNull(event.target.value))}
            />
          </label>
        )
      })}
    </>
  )
}
