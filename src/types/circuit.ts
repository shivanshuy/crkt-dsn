import type { LedColor } from '../config/componentDefaults'
import type { ComponentKind } from '../config/supportedComponents'

export type { ComponentKind }
export type Tool = ComponentKind | 'wire' | 'text' | 'none'

/** Free-form description label on the canvas (not part of the electrical netlist). */
export type LayoutTextNote = {
  id: string
  x: number
  y: number
  text: string
  /** Outer width in px */
  width?: number
  /** Outer height in px */
  height?: number
  /** Title bar with {@link headerText}; when false, a small padding area is used to drag. */
  showHeader?: boolean
  /** Label in the title bar when {@link showHeader} is true */
  headerText?: string
  /** Header label size in px (when header is visible) */
  headerFontSizePx?: number
  headerBold?: boolean
  headerItalic?: boolean
  /** Body text size in px */
  textFontSizePx?: number
  textBold?: boolean
  textItalic?: boolean
}

/** Clockwise rotation from default horizontal (0°). Each rotate-handle click adds 90°. */
export type RotationDeg = 0 | 90 | 180 | 270

export type Point = {
  x: number
  y: number
}

export type TerminalSide = 'left' | 'right'

export type TerminalRef = {
  componentId: string
  side: TerminalSide
}

export type CircuitComponent = {
  id: string
  kind: ComponentKind
  x: number
  y: number
  rotationDeg: RotationDeg
  ledColor: LedColor
  voltage: number | null
  current: number | null
  resistance: number | null
  /** uF; only used when kind === 'capacitor' */
  capacitance: number | null
  /**
   * When true, a fixed set of spec fields stay yours after Calculate; which fields depend on
   * `kind` — see `LOCKED_SPEC_FIELD_KEYS` in `utils/componentLock.ts` (single source of truth).
   */
  propertiesLocked?: boolean
}

export type Wire = {
  id: string
  from: TerminalRef
  to: TerminalRef
  waypoints: Point[]
  /**
   * Last solved branch current (A) for this segment, from Calculate in simulate mode.
   * Same value on every wire in a simple series loop; cleared when not applicable.
   */
  currentA?: number | null
}

export type PathEdge = {
  to: string
  points: Point[]
}
