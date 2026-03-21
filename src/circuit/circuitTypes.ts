import type { LedColor } from '../config'

/** Matches App.tsx — used so analysis results can be passed to setComponents. */
export type CircuitComponent = {
  id: string
  kind: 'battery' | 'resistor' | 'led' | 'capacitor'
  x: number
  y: number
  orientation: 'horizontal' | 'vertical'
  ledColor: LedColor
  voltage: number | null
  current: number | null
  resistance: number | null
  capacitance: number
}

export type Wire = {
  id: string
  from: { componentId: string; side: 'left' | 'right' }
  to: { componentId: string; side: 'left' | 'right' }
}
