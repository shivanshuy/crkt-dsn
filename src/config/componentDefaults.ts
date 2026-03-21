/**
 * Factory defaults for circuit components. Values shown when placing a part or switching
 * a variant (e.g. LED color); the user can always override in the properties panel.
 *
 * Extend this module when adding new kinds (e.g. `ic`) with package- or part-specific defaults.
 */

/** Typical forward voltage (V) and operating current (A) for indicator-style LEDs at ~20 mA. */
export const LED_DEFAULTS_BY_COLOR = {
  red: { voltage: 1.9, current: 0.02 },
  green: { voltage: 2.1, current: 0.02 },
  blue: { voltage: 3.2, current: 0.02 },
  yellow: { voltage: 2.0, current: 0.02 },
  orange: { voltage: 2.0, current: 0.02 },
  white: { voltage: 3.2, current: 0.02 },
  purple: { voltage: 3.0, current: 0.02 },
} as const

export type LedColor = keyof typeof LED_DEFAULTS_BY_COLOR

export const DEFAULT_LED_COLOR: LedColor = 'red'

export function getLedDefaults(color: LedColor) {
  return LED_DEFAULTS_BY_COLOR[color]
}

/** Order of colors in the LED dropdown (matches previous UI). */
export const LED_COLOR_OPTIONS: { value: LedColor; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'orange', label: 'Orange' },
  { value: 'white', label: 'White' },
  { value: 'purple', label: 'Purple' },
]

/**
 * Default electric / physical values when placing components on the canvas.
 * Add sections here for new component kinds (e.g. `ic: { packages: { ... } }`).
 */
export const COMPONENT_DEFAULTS = {
  led: {
    defaultColor: DEFAULT_LED_COLOR,
    byColor: LED_DEFAULTS_BY_COLOR,
  },
  battery: {
    voltage: 9,
  },
  resistor: {
    resistance: 100,
  },
  capacitor: {
    capacitance: 1,
  },
  // Future: integrated circuits, motors, etc.
  // ic: {},
} as const
