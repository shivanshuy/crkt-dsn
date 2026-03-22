/**
 * **Single source of truth** for which schematic component kinds the app supports.
 *
 * - Add one row to {@link SUPPORTED_CIRCUIT_COMPONENTS} to introduce a kind (then add visuals, locks, solvers).
 * - {@link ComponentKind}, id prefixes, UI labels, and default lock state are all derived from this list.
 */

export const SUPPORTED_CIRCUIT_COMPONENTS = [
  {
    kind: 'battery',
    idPrefix: 'B_',
    label: 'Battery',
    defaultPropertiesLocked: true,
  },
  {
    kind: 'resistor',
    idPrefix: 'R_',
    label: 'Resistor',
    defaultPropertiesLocked: false,
  },
  {
    kind: 'led',
    idPrefix: 'L_',
    label: 'LED',
    defaultPropertiesLocked: true,
  },
  {
    kind: 'capacitor',
    idPrefix: 'C_',
    label: 'Capacitor',
    defaultPropertiesLocked: false,
  },
] as const

export type SupportedCircuitComponentDescriptor = (typeof SUPPORTED_CIRCUIT_COMPONENTS)[number]

/** Union of all supported `kind` strings — use everywhere instead of ad-hoc string unions. */
export type ComponentKind = SupportedCircuitComponentDescriptor['kind']

/** Toolbar / palette order (same as {@link SUPPORTED_CIRCUIT_COMPONENTS}). */
export const SUPPORTED_COMPONENT_KINDS: readonly ComponentKind[] =
  SUPPORTED_CIRCUIT_COMPONENTS.map((d) => d.kind)

/** Prefix per schematic kind, e.g. `B_` → `B_1`, `B_2`, … */
export const COMPONENT_KIND_ID_PREFIXES = Object.fromEntries(
  SUPPORTED_CIRCUIT_COMPONENTS.map((d) => [d.kind, d.idPrefix]),
) as Record<ComponentKind, string>

/** Short names for toolbar, aria-labels, and Calculate messages. */
export const COMPONENT_KIND_LABELS = Object.fromEntries(
  SUPPORTED_CIRCUIT_COMPONENTS.map((d) => [d.kind, d.label]),
) as Record<ComponentKind, string>

/**
 * Whether **newly placed** parts start with `propertiesLocked`.
 * Which fields are preserved when locked: `LOCKED_SPEC_FIELD_KEYS` in `utils/componentLock.ts`.
 */
export const DEFAULT_PROPERTIES_LOCKED_BY_KIND = Object.fromEntries(
  SUPPORTED_CIRCUIT_COMPONENTS.map((d) => [d.kind, d.defaultPropertiesLocked]),
) as Record<ComponentKind, boolean>

export function defaultPropertiesLocked(kind: ComponentKind): boolean {
  return DEFAULT_PROPERTIES_LOCKED_BY_KIND[kind]
}

export function isComponentKind(value: string): value is ComponentKind {
  return (SUPPORTED_COMPONENT_KINDS as readonly string[]).includes(value)
}

/** Alias for {@link isComponentKind} — reads clearly at placement / toolbar call sites. */
export const isComponentPlacementTool = isComponentKind
