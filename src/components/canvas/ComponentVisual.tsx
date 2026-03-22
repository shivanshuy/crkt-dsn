import type { CircuitComponent } from '../../types/circuit'
import { LED_COLOR_HEX } from '../../constants/ledVisuals'

export function ComponentVisual({ component }: { component: CircuitComponent }) {
  const { kind } = component
  if (kind === 'battery') {
    return (
      <svg className="symbol-svg" viewBox="0 0 64 24" aria-hidden="true">
        <path d="M1 12 H22 M22 6 V18 M32 3 V21 M32 12 H63" />
      </svg>
    )
  }
  if (kind === 'resistor') {
    return (
      <svg className="symbol-svg" viewBox="0 0 64 24" aria-hidden="true">
        <path d="M1 12 H10 L16 6 L24 18 L32 6 L40 18 L48 6 L54 12 H63" />
      </svg>
    )
  }
  if (kind === 'capacitor') {
    return (
      <svg className="symbol-svg" viewBox="0 0 64 24" aria-hidden="true">
        <path d="M1 12 H24 M24 4 V20 M40 4 V20 M40 12 H63" />
      </svg>
    )
  }
  if (kind === 'led') {
    const stroke = LED_COLOR_HEX[component.ledColor]
    return (
      <svg className="symbol-svg symbol-svg-led" viewBox="0 0 64 24" aria-hidden="true">
        <path
          d="M1 12 H18 M46 12 H63 M18 4 V20 M18 4 L46 12 L18 20"
          style={{ stroke }}
        />
      </svg>
    )
  }
  return (
    <svg className="symbol-svg" viewBox="0 0 64 24" aria-hidden="true">
      <path d="M1 12 H18 M46 12 H63 M18 4 V20 M18 4 L46 12 L18 20" />
    </svg>
  )
}
