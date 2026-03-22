/**
 * Factory defaults for circuit components.
 *
 * Which fields stay fixed when the user locks a part (after Calculate) are **not** listed here — see
 * `LOCKED_SPEC_FIELD_KEYS` in `utils/componentLock.ts`. Values shown when placing a part or switching
 * a variant (e.g. LED color); the user can always override in the properties panel.
 *
 * Add a **new kind** in `supportedComponents.ts` first, then extend defaults here (e.g. `ic` packages).
 */

/**
 * Average safe operating values (Vf, If) for indicator LEDs — reference table.
 * Current is stored in amperes (10 mA → 0.01, 12 mA → 0.012).
 */
export const LED_DEFAULTS_BY_COLOR = {
  red: { voltage: 1.8, current: 0.01 },
  orange: { voltage: 2.0, current: 0.01 },
  yellow: { voltage: 2.1, current: 0.01 },
  /** “Green (old)” — lower Vf, 10 mA */
  green: { voltage: 2.2, current: 0.01 },
  /** “Green (pure)” — higher Vf, 12 mA */
  greenPure: { voltage: 3.0, current: 0.012 },
  blue: { voltage: 3.1, current: 0.012 },
  white: { voltage: 3.2, current: 0.012 },
  /** Violet in table */
  purple: { voltage: 3.2, current: 0.012 },
} as const

export type LedColor = keyof typeof LED_DEFAULTS_BY_COLOR

export const DEFAULT_LED_COLOR: LedColor = 'red'

export function getLedDefaults(color: LedColor) {
  return LED_DEFAULTS_BY_COLOR[color]
}

/** Order of colors in the LED dropdown (matches reference table). */
export const LED_COLOR_OPTIONS: { value: LedColor; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green (old)' },
  { value: 'greenPure', label: 'Green (pure)' },
  { value: 'blue', label: 'Blue' },
  { value: 'white', label: 'White' },
  { value: 'purple', label: 'Violet' },
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
  // Future: integrated circuits, motors, etc.
  // ic: {},
} as const
