import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import {
  COMPONENT_DEFAULTS,
  DEFAULT_LED_COLOR,
  getLedDefaults,
  LED_COLOR_OPTIONS,
  type LedColor,
} from './config'
import { tryKirchhoffSeriesBatteryLedResistor } from './circuit/kirchhoffSeries'
import { tryParallelResistorsBank } from './circuit/parallelResistors'
import { trySeriesResistorChain } from './circuit/seriesResistorChain'
import './App.css'

type ComponentKind = 'battery' | 'resistor' | 'led' | 'capacitor'
type Tool = ComponentKind | 'wire' | 'none'

const LED_COLOR_HEX: Record<LedColor, string> = {
  red: '#dc2626',
  green: '#16a34a',
  blue: '#2563eb',
  yellow: '#ca8a04',
  orange: '#ea580c',
  white: '#9ca3af',
  purple: '#9333ea',
}

type CircuitComponent = {
  id: string
  kind: ComponentKind
  x: number
  y: number
  orientation: 'horizontal' | 'vertical'
  /** Visual color for LED symbol (ignored for other kinds) */
  ledColor: LedColor
  /** null = not specified (used with Ohm’s-law fill in simulate mode) */
  voltage: number | null
  current: number | null
  resistance: number | null
  capacitance: number
}

type Point = {
  x: number
  y: number
}

type TerminalSide = 'left' | 'right'

type TerminalRef = {
  componentId: string
  side: TerminalSide
}

type Wire = {
  id: string
  from: TerminalRef
  to: TerminalRef
  waypoints: Point[]
}

type PathEdge = {
  to: string
  points: Point[]
}

const GRID_SIZE = 24

const toolLabels: Record<Tool, string> = {
  none: '',
  battery: 'Battery',
  resistor: 'Resistor',
  led: 'LED',
  capacitor: 'Capacitor',
  wire: 'Wire',
}

const kindLabels: Record<ComponentKind, string> = {
  battery: 'Battery',
  resistor: 'Resistor',
  led: 'LED',
  capacitor: 'Capacitor',
}

/** Multiples of GRID_SIZE so tops/edges sit on grid lines */
const COMPONENT_WIDTH = 96
const COMPONENT_HEIGHT = 48

const isElectricValueSet = (n: number | null | undefined): n is number =>
  n !== null && n !== undefined && Number.isFinite(n)

const roundElectric = (n: number) => Math.round(n * 1_000_000) / 1_000_000

/** Ohm’s law: V = I × R — used when user clicks Calculate in simulate mode */
function computeOhmsForComponent(
  component: CircuitComponent,
  kindLabelsMap: Record<ComponentKind, string>,
): { component: CircuitComponent; issues: string[] } {
  const label = kindLabelsMap[component.kind]
  /** LEDs use forward voltage + current only; never compute or store resistance. */
  if (component.kind === 'led') {
    return { component: { ...component, resistance: null }, issues: [] }
  }
  const v = component.voltage
  const i = component.current
  const r = component.resistance

  const hasV = isElectricValueSet(v)
  const hasI = isElectricValueSet(i)
  const hasR = isElectricValueSet(r)
  const knownCount = [hasV, hasI, hasR].filter(Boolean).length

  if (knownCount === 0 || knownCount === 3) {
    return { component, issues: [] }
  }

  if (knownCount === 1) {
    return {
      component,
      issues: [
        `${label}: need two of voltage, current, and resistance to compute the third (V = I × R).`,
      ],
    }
  }

  let nv: number | null = v
  let ni: number | null = i
  let nr: number | null = r

  if (hasV && hasI && !hasR) {
    if (Math.abs(i as number) < 1e-15) {
      return {
        component,
        issues: [`${label}: current is zero — cannot compute resistance (V ÷ I).`],
      }
    }
    nr = roundElectric((v as number) / (i as number))
  } else if (hasV && hasR && !hasI) {
    if (Math.abs(r as number) < 1e-15) {
      return {
        component,
        issues: [`${label}: resistance is zero — cannot compute current (V ÷ R).`],
      }
    }
    ni = roundElectric((v as number) / (r as number))
  } else if (hasI && hasR && !hasV) {
    nv = roundElectric((i as number) * (r as number))
  }

  return { component: { ...component, voltage: nv, current: ni, resistance: nr }, issues: [] }
}

function runOhmsCalculate(
  list: CircuitComponent[],
  kindLabelsMap: Record<ComponentKind, string>,
): { next: CircuitComponent[]; message: string | null } {
  const issues: string[] = []
  const next = list.map((component) => {
    const result = computeOhmsForComponent(component, kindLabelsMap)
    issues.push(...result.issues)
    return result.component
  })
  return {
    next,
    message: issues.length > 0 ? issues.join(' • ') : null,
  }
}

/**
 * Kirchhoff-based analysis when topology matches (see Kuphaldt DC Ch.6 — dividers & KVL/KCL):
 * 1) battery + LED + resistor series loop, 2) battery + N resistors in series, 3) parallel resistor bank.
 * Otherwise per-component Ohm’s law.
 */
function runCircuitCalculate(
  list: CircuitComponent[],
  wires: Wire[],
  kindLabelsMap: Record<ComponentKind, string>,
): { next: CircuitComponent[]; message: string | null } {
  const ledLoop = tryKirchhoffSeriesBatteryLedResistor(list, wires)
  if (ledLoop.applicable) {
    if (ledLoop.ok) {
      return { next: ledLoop.next, message: ledLoop.explanation }
    }
    return { next: list, message: ledLoop.message }
  }
  const seriesR = trySeriesResistorChain(list, wires)
  if (seriesR.applicable) {
    if (seriesR.ok) {
      return { next: seriesR.next, message: seriesR.explanation }
    }
    return { next: list, message: seriesR.message }
  }
  const parallelR = tryParallelResistorsBank(list, wires)
  if (parallelR.applicable) {
    if (parallelR.ok) {
      return { next: parallelR.next, message: parallelR.explanation }
    }
    return { next: list, message: parallelR.message }
  }
  return runOhmsCalculate(list, kindLabelsMap)
}

function parseNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function sanitizeExportBaseName(name: string): string {
  const stripped = name
    .replace(/\.(png|jpg|jpeg)$/i, '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim()
  const collapsed = stripped.replace(/\s+/g, '-').replace(/-+/g, '-')
  const clipped = collapsed.slice(0, 120)
  return clipped.length > 0 ? clipped : 'crkt-export'
}

const toolIconSvgProps = {
  className: 'tool-icon-svg',
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.65,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

function ToolIcon({ tool }: { tool: Exclude<Tool, 'none'> }) {
  switch (tool) {
    case 'battery':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M3 12h4M17 12h4" />
          <path d="M8 7v10M12 5v14" />
        </svg>
      )
    case 'resistor':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M2 12h2.5l2-3.5 2.5 7 2.5-7 2.5 7 2.5-7 2.5 3.5H22" />
        </svg>
      )
    case 'led':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M3 12h4l7-6v12L7 12H3" />
          <path d="M14 7l3 3-3 3M14 17l3-3-3-3" />
          <path d="M19 12h2.5" />
        </svg>
      )
    case 'capacitor':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M3 12h5M16 12h5" />
          <path d="M10 5v14M14 5v14" />
        </svg>
      )
    case 'wire':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M3 12h18" />
        </svg>
      )
  }
}

const ribbonIconSvgProps = {
  className: 'ribbon-icon-svg',
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

/** Maximize-style corners — “show more” */
function RibbonExpandIcon() {
  return (
    <svg {...ribbonIconSvgProps}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

/** Minimize-style corners — “show less” */
function RibbonCollapseIcon() {
  return (
    <svg {...ribbonIconSvgProps}>
      <path d="M4 14v6h6M20 10h-6V4M4 10l6-6M20 14l-6 6" />
    </svg>
  )
}

function RibbonCloseIcon() {
  return (
    <svg {...ribbonIconSvgProps}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

const ComponentVisual = ({ component }: { component: CircuitComponent }) => {
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

function App() {
  const [activeTool, setActiveTool] = useState<Tool>('none')
  const [components, setComponents] = useState<CircuitComponent[]>([])
  const [wires, setWires] = useState<Wire[]>([])
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null)
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null)
  const [draftWire, setDraftWire] = useState<{ from: TerminalRef; waypoints: Point[] } | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationProgress, setSimulationProgress] = useState(0)
  const [calculationMessage, setCalculationMessage] = useState<string | null>(null)
  /** User closed the ribbon; hidden until the next Calculate (or message cleared). */
  const [calculationRibbonDismissed, setCalculationRibbonDismissed] = useState(false)
  /** Expanded = taller scroll area; collapsed = short preview. */
  const [calculationRibbonExpanded, setCalculationRibbonExpanded] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportPanel, setShowExportPanel] = useState(false)
  const [exportFileName, setExportFileName] = useState('')
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragInfoRef = useRef<{
    id: string
    offsetX: number
    offsetY: number
  } | null>(null)
  const bendDragRef = useRef<{ wireId: string; waypointIndex: number } | null>(null)

  const selectedComponent = useMemo(
    () => components.find((component) => component.id === selectedComponentId) ?? null,
    [components, selectedComponentId],
  )

  const isLayoutEmpty = components.length === 0 && wires.length === 0

  const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE
  const batteryId = components.find((component) => component.kind === 'battery')?.id ?? null

  const getCanvasPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      return { x: 0, y: 0 }
    }
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const getTerminalPoint = (terminal: TerminalRef): Point | null => {
    const component = components.find((item) => item.id === terminal.componentId)
    if (!component) {
      return null
    }
    if (component.orientation === 'vertical') {
      return {
        x: component.x + COMPONENT_WIDTH / 2,
        y: terminal.side === 'left' ? component.y : component.y + COMPONENT_HEIGHT,
      }
    }
    return {
      x: terminal.side === 'left' ? component.x : component.x + COMPONENT_WIDTH,
      y: component.y + COMPONENT_HEIGHT / 2,
    }
  }

  const getPathPointAt = (points: Point[], normalizedDistance: number): Point | null => {
    if (points.length < 2) {
      return null
    }
    const segmentLengths: number[] = []
    let totalLength = 0
    for (let index = 1; index < points.length; index += 1) {
      const dx = points[index].x - points[index - 1].x
      const dy = points[index].y - points[index - 1].y
      const length = Math.hypot(dx, dy)
      segmentLengths.push(length)
      totalLength += length
    }
    if (totalLength === 0) {
      return points[0]
    }
    const target = normalizedDistance * totalLength
    let traversed = 0
    for (let index = 1; index < points.length; index += 1) {
      const segmentLength = segmentLengths[index - 1]
      if (traversed + segmentLength >= target) {
        const localRatio = (target - traversed) / segmentLength
        return {
          x: points[index - 1].x + (points[index].x - points[index - 1].x) * localRatio,
          y: points[index - 1].y + (points[index].y - points[index - 1].y) * localRatio,
        }
      }
      traversed += segmentLength
    }
    return points[points.length - 1]
  }

  const terminalKey = (terminal: TerminalRef) => `${terminal.componentId}:${terminal.side}`

  const appendOrthogonalPoint = (from: Point, to: Point): Point => {
    const dx = Math.abs(to.x - from.x)
    const dy = Math.abs(to.y - from.y)
    if (dx >= dy) {
      return { x: to.x, y: from.y }
    }
    return { x: from.x, y: to.y }
  }

  const expandOrthogonalPath = (points: Point[]): Point[] => {
    if (points.length < 2) {
      return points
    }
    const expanded: Point[] = [points[0]]
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1]
      const current = points[i]
      if (previous.x === current.x || previous.y === current.y) {
        expanded.push(current)
      } else {
        expanded.push({ x: current.x, y: previous.y }, current)
      }
    }
    return expanded
  }

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const clickedElement = event.target as HTMLElement
    if (clickedElement.closest('.component-node')) {
      return
    }
    if (
      activeTool === 'battery' ||
      activeTool === 'resistor' ||
      activeTool === 'led' ||
      activeTool === 'capacitor'
    ) {
      const point = getCanvasPoint(event)
      const id = crypto.randomUUID()
      const ledPlace = getLedDefaults(COMPONENT_DEFAULTS.led.defaultColor)
      setComponents((previous) => [
        ...previous,
        {
          id,
          kind: activeTool,
          x: snap(point.x),
          y: snap(point.y),
          orientation: 'horizontal',
          ledColor: DEFAULT_LED_COLOR,
          voltage:
            activeTool === 'battery'
              ? COMPONENT_DEFAULTS.battery.voltage
              : activeTool === 'led'
                ? ledPlace.voltage
                : null,
          current: activeTool === 'led' ? ledPlace.current : null,
          resistance: activeTool === 'resistor' ? COMPONENT_DEFAULTS.resistor.resistance : null,
          capacitance: activeTool === 'capacitor' ? COMPONENT_DEFAULTS.capacitor.capacitance : 0,
        },
      ])
      setSelectedComponentId(id)
      setSelectedWireId(null)
    } else if (activeTool === 'wire' && draftWire) {
      const point = getCanvasPoint(event)
      const snappedPoint = { x: snap(point.x), y: snap(point.y) }
      const fromPoint =
        draftWire.waypoints[draftWire.waypoints.length - 1] ?? getTerminalPoint(draftWire.from)
      if (!fromPoint) {
        return
      }
      const nextWaypoint = appendOrthogonalPoint(fromPoint, snappedPoint)
      if (nextWaypoint.x === fromPoint.x && nextWaypoint.y === fromPoint.y) {
        return
      }
      setDraftWire((previous) =>
        previous ? { ...previous, waypoints: [...previous.waypoints, nextWaypoint] } : previous,
      )
    } else {
      setSelectedComponentId(null)
      setSelectedWireId(null)
      setDraftWire(null)
    }
  }

  const beginDrag = (event: React.MouseEvent, component: CircuitComponent) => {
    if (activeTool === 'wire') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    setSelectedComponentId(component.id)
    setSelectedWireId(null)
    dragInfoRef.current = {
      id: component.id,
      offsetX: event.clientX - rect.left - component.x,
      offsetY: event.clientY - rect.top - component.y,
    }
    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect || !dragInfoRef.current) {
        return
      }
      const nextX = snap(moveEvent.clientX - rect.left - dragInfoRef.current.offsetX)
      const nextY = snap(moveEvent.clientY - rect.top - dragInfoRef.current.offsetY)
      setComponents((previous) =>
        previous.map((item) =>
          item.id === dragInfoRef.current?.id ? { ...item, x: nextX, y: nextY } : item,
        ),
      )
    }

    const onMouseUp = () => {
      dragInfoRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleComponentClick = (
    event: React.MouseEvent<HTMLElement>,
    component: CircuitComponent,
  ) => {
    event.stopPropagation()
    setSelectedComponentId(component.id)
    setSelectedWireId(null)
    if (activeTool === 'wire') {
      const rect = event.currentTarget.getBoundingClientRect()
      const side: TerminalSide =
        component.orientation === 'vertical'
          ? event.clientY < rect.top + rect.height / 2
            ? 'left'
            : 'right'
          : event.clientX < rect.left + rect.width / 2
            ? 'left'
            : 'right'
      const clickedTerminal: TerminalRef = { componentId: component.id, side }
      if (!draftWire) {
        setDraftWire({ from: clickedTerminal, waypoints: [] })
        return
      }
      const startPoint = getTerminalPoint(draftWire.from)
      const endPoint = getTerminalPoint(clickedTerminal)
      if (!startPoint || !endPoint) {
        return
      }
      const tailPoint = draftWire.waypoints[draftWire.waypoints.length - 1] ?? startPoint
      const extraWaypoint =
        tailPoint.x === endPoint.x || tailPoint.y === endPoint.y
          ? null
          : appendOrthogonalPoint(tailPoint, endPoint)
      const waypoints = extraWaypoint
        ? [...draftWire.waypoints, extraWaypoint]
        : draftWire.waypoints
      setWires((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          from: draftWire.from,
          to: clickedTerminal,
          waypoints,
        },
      ])
      setDraftWire(null)
    } else {
      setActiveTool(component.kind)
    }
  }

  const updateSelectedValue = (
    field: 'voltage' | 'current' | 'resistance' | 'capacitance',
    value: number | null,
  ) => {
    if (!selectedComponentId) {
      return
    }
    setComponents((previous) =>
      previous.map((component) =>
        component.id === selectedComponentId ? { ...component, [field]: value } : component,
      ),
    )
  }

  /** Apply config defaults for V/I when the user picks another LED color (they can still edit after). */
  const updateSelectedLedColor = (color: LedColor) => {
    if (!selectedComponentId) {
      return
    }
    const { voltage, current } = getLedDefaults(color)
    setComponents((previous) =>
      previous.map((component) =>
        component.id === selectedComponentId && component.kind === 'led'
          ? { ...component, ledColor: color, voltage, current }
          : component,
      ),
    )
  }

  const updateSelectedOrientation = (orientation: 'horizontal' | 'vertical') => {
    if (!selectedComponentId) {
      return
    }
    setComponents((previous) =>
      previous.map((component) =>
        component.id === selectedComponentId ? { ...component, orientation } : component,
      ),
    )
  }

  const toggleSelectedOrientation = () => {
    if (!selectedComponent) {
      return
    }
    updateSelectedOrientation(
      selectedComponent.orientation === 'horizontal' ? 'vertical' : 'horizontal',
    )
  }

  const startBendDrag = (
    event: React.MouseEvent<SVGCircleElement>,
    wireId: string,
    waypointIndex: number,
  ) => {
    event.stopPropagation()
    bendDragRef.current = { wireId, waypointIndex }
    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const dragState = bendDragRef.current
      if (!rect || !dragState) {
        return
      }
      const nextPoint = {
        x: snap(moveEvent.clientX - rect.left),
        y: snap(moveEvent.clientY - rect.top),
      }
      setWires((previous) =>
        previous.map((wire) => {
          if (wire.id !== dragState.wireId) {
            return wire
          }
          const nextWaypoints = wire.waypoints.map((waypoint, index) =>
            index === dragState.waypointIndex ? nextPoint : waypoint,
          )
          return { ...wire, waypoints: nextWaypoints }
        }),
      )
    }
    const onMouseUp = () => {
      bendDragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const deleteSelectedComponent = () => {
    if (!selectedComponentId) {
      return
    }
    setComponents((previous) => previous.filter((component) => component.id !== selectedComponentId))
    setWires((previous) =>
      previous.filter(
        (wire) =>
          wire.from.componentId !== selectedComponentId && wire.to.componentId !== selectedComponentId,
      ),
    )
    if (draftWire?.from.componentId === selectedComponentId) {
      setDraftWire(null)
    }
    setSelectedComponentId(null)
  }

  const deleteSelectedWire = () => {
    if (!selectedWireId) {
      return
    }
    setWires((previous) => previous.filter((wire) => wire.id !== selectedWireId))
    setSelectedWireId(null)
  }

  const deleteSelection = () => {
    if (selectedComponentId) {
      deleteSelectedComponent()
      return
    }
    if (selectedWireId) {
      deleteSelectedWire()
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete') {
        deleteSelection()
        return
      }
      if (!selectedComponentId) {
        return
      }
      let deltaX = 0
      let deltaY = 0
      if (event.key === 'ArrowLeft') {
        deltaX = -GRID_SIZE
      } else if (event.key === 'ArrowRight') {
        deltaX = GRID_SIZE
      } else if (event.key === 'ArrowUp') {
        deltaY = -GRID_SIZE
      } else if (event.key === 'ArrowDown') {
        deltaY = GRID_SIZE
      } else {
        return
      }
      event.preventDefault()
      setComponents((previous) =>
        previous.map((component) =>
          component.id === selectedComponentId
            ? { ...component, x: component.x + deltaX, y: component.y + deltaY }
            : component,
        ),
      )
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedComponentId, selectedWireId, draftWire])

  useEffect(() => {
    if (!isSimulating) {
      return
    }
    const timer = window.setInterval(() => {
      setSimulationProgress((previous) => (previous + 0.00625) % 1)
    }, 30)
    return () => window.clearInterval(timer)
  }, [isSimulating])

  useEffect(() => {
    if (!isLayoutEmpty) {
      return
    }
    setIsSimulating(false)
    setSimulationProgress(0)
    setCalculationMessage(null)
    setCalculationRibbonDismissed(false)
    setCalculationRibbonExpanded(false)
    setShowExportPanel(false)
  }, [isLayoutEmpty])

  useEffect(() => {
    if (calculationMessage === null) {
      setCalculationRibbonDismissed(false)
      setCalculationRibbonExpanded(false)
    }
  }, [calculationMessage])

  const wirePolylines = wires
    .map((wire) => {
      const start = getTerminalPoint(wire.from)
      const end = getTerminalPoint(wire.to)
      if (!start || !end) {
        return null
      }
      const controlPoints = [start, ...wire.waypoints, end]
      return {
        id: wire.id,
        points: expandOrthogonalPath(controlPoints),
        waypoints: wire.waypoints,
      }
    })
    .filter((line): line is { id: string; points: Point[]; waypoints: Point[] } => !!line)

  const formatElectric = (value: number | null) => (value === null ? '—' : String(value))

  const getComponentValueText = (component: CircuitComponent) => {
    if (isSimulating) {
      if (component.kind === 'led') {
        return `V:${formatElectric(component.voltage)} I:${formatElectric(component.current)}`
      }
      return `V:${formatElectric(component.voltage)} I:${formatElectric(component.current)} R:${formatElectric(component.resistance)}`
    }
    if (component.kind === 'battery') {
      return component.voltage !== null ? `${component.voltage} V` : ''
    }
    if (component.kind === 'resistor') {
      return component.resistance !== null ? `${component.resistance} Ohm` : ''
    }
    if (component.kind === 'capacitor') {
      return `${component.capacitance} uF`
    }
    if (component.kind === 'led') {
      const parts: string[] = []
      if (component.voltage !== null) {
        parts.push(`${component.voltage} V`)
      }
      if (component.current !== null) {
        parts.push(`${component.current} A`)
      }
      return parts.join(' · ')
    }
    return ''
  }

  const simulationPath = useMemo(() => {
    if (!batteryId) {
      return null
    }
    const startKey = `${batteryId}:right`
    const endKey = `${batteryId}:left`
    const graph = new Map<string, PathEdge[]>()
    const addEdge = (from: string, to: string, points: Point[]) => {
      const list = graph.get(from) ?? []
      list.push({ to, points })
      graph.set(from, list)
    }

    wires.forEach((wire) => {
      const fromKey = terminalKey(wire.from)
      const toKey = terminalKey(wire.to)
      const start = getTerminalPoint(wire.from)
      const end = getTerminalPoint(wire.to)
      if (!start || !end) {
        return
      }
      const points = expandOrthogonalPath([start, ...wire.waypoints, end])
      addEdge(fromKey, toKey, points)
      addEdge(toKey, fromKey, [...points].reverse())
    })

    components.forEach((component) => {
      if (component.kind === 'battery') {
        return
      }
      const left: TerminalRef = { componentId: component.id, side: 'left' }
      const right: TerminalRef = { componentId: component.id, side: 'right' }
      const leftPoint = getTerminalPoint(left)
      const rightPoint = getTerminalPoint(right)
      if (!leftPoint || !rightPoint) {
        return
      }
      const leftKey = terminalKey(left)
      const rightKey = terminalKey(right)
      addEdge(leftKey, rightKey, [leftPoint, rightPoint])
      addEdge(rightKey, leftKey, [rightPoint, leftPoint])
    })

    const queue: string[] = [startKey]
    const visited = new Set<string>([startKey])
    const previous = new Map<string, { from: string; points: Point[] }>()

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) {
        break
      }
      if (current === endKey) {
        break
      }
      const edges = graph.get(current) ?? []
      edges.forEach((edge) => {
        if (visited.has(edge.to)) {
          return
        }
        visited.add(edge.to)
        previous.set(edge.to, { from: current, points: edge.points })
        queue.push(edge.to)
      })
    }

    if (!previous.has(endKey)) {
      return null
    }

    const pathSegments: Point[][] = []
    let walker = endKey
    while (walker !== startKey) {
      const step = previous.get(walker)
      if (!step) {
        break
      }
      pathSegments.push(step.points)
      walker = step.from
    }

    pathSegments.reverse()
    const merged: Point[] = []
    pathSegments.forEach((segment, index) => {
      if (index === 0) {
        merged.push(...segment)
      } else {
        merged.push(...segment.slice(1))
      }
    })
    return merged.length >= 2 ? merged : null
  }, [batteryId, components, wires])

  const animatedDotPoint = useMemo(() => {
    if (!isSimulating || !simulationPath) {
      return null
    }
    return getPathPointAt(simulationPath, simulationProgress)
  }, [isSimulating, simulationPath, simulationProgress])

  const runLayoutExport = async (baseFileName: string, format: 'png' | 'jpeg') => {
    const element = canvasRef.current
    if (!element || isExporting) {
      return
    }
    setIsExporting(true)
    try {
      const snapshot = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        /** Skip simulation animation dot (not part of schematic). */
        ignoreElements: (node) =>
          node instanceof Element && node.classList.contains('sim-dot'),
        /** Backup: strip sim-dot from clone (some engines still rasterize ignored SVG nodes). */
        onclone: (clonedDoc) => {
          clonedDoc.querySelectorAll('.sim-dot').forEach((el) => el.remove())
        },
      })
      const dataUrl =
        format === 'png'
          ? snapshot.toDataURL('image/png')
          : snapshot.toDataURL('image/jpeg', 0.92)
      const extension = format === 'png' ? 'png' : 'jpg'
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${baseFileName}.${extension}`
      link.click()
      setShowExportPanel(false)
    } catch (error) {
      console.error(error)
      window.alert('Could not export the layout as an image. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = exportFileName.trim()
    const baseName =
      trimmed === '' ? 'crkt-export' : sanitizeExportBaseName(trimmed)
    const format = exportFormat
    void runLayoutExport(baseName, format)
  }

  return (
    <main className="app-shell">
      <section className="layout-panel">
        <header className="toolbar">
          {(Object.keys(toolLabels) as Tool[])
            .filter((tool) => tool !== 'none')
            .map((tool) => (
            <button
              key={tool}
              type="button"
              className={`tool-button toolbar-tool ${tool === activeTool ? 'active' : ''}`}
              title={toolLabels[tool]}
              aria-label={toolLabels[tool]}
              onClick={() => {
                setActiveTool(tool)
                if (tool !== 'wire') {
                  setDraftWire(null)
                }
              }}
            >
              <ToolIcon tool={tool} />
            </button>
          ))}
          <button
            className="tool-button delete-button"
            type="button"
            onClick={deleteSelection}
            disabled={!selectedComponentId && !selectedWireId}
          >
            Delete
          </button>
          <button
            className={`tool-button simulate-button ${isSimulating ? 'active' : ''}`}
            type="button"
            disabled={isLayoutEmpty}
            onClick={() => {
              setIsSimulating((previous) => {
                if (previous) {
                  setCalculationMessage(null)
                }
                return !previous
              })
              setSimulationProgress(0)
            }}
          >
            Simulate
          </button>
          <button
            className="tool-button calculate-button"
            type="button"
            disabled={!isSimulating}
            onClick={() => {
              const { next, message } = runCircuitCalculate(components, wires, kindLabels)
              setComponents(next)
              setCalculationMessage(message)
              setCalculationRibbonDismissed(false)
              setCalculationRibbonExpanded(false)
            }}
          >
            Calculate
          </button>
          <button
            className="tool-button export-button"
            type="button"
            disabled={isLayoutEmpty}
            title="Export layout as image"
            onClick={() => {
              setShowExportPanel(true)
              setExportFileName('')
              setExportFormat('png')
              setSelectedComponentId(null)
              setSelectedWireId(null)
            }}
          >
            Export
          </button>
        </header>
        {calculationMessage && !calculationRibbonDismissed && (
          <div className="calculation-ribbon" role="alert">
            <div className="calculation-ribbon-toolbar">
              <button
                type="button"
                className="ribbon-tool-button ribbon-toggle-button"
                onClick={() => setCalculationRibbonExpanded((expanded) => !expanded)}
                title={calculationRibbonExpanded ? 'Collapse' : 'Expand'}
                aria-expanded={calculationRibbonExpanded}
                aria-label={calculationRibbonExpanded ? 'Collapse calculation message' : 'Expand calculation message'}
              >
                {calculationRibbonExpanded ? <RibbonCollapseIcon /> : <RibbonExpandIcon />}
              </button>
              <button
                type="button"
                className="ribbon-tool-button ribbon-close-button"
                onClick={() => setCalculationRibbonDismissed(true)}
                title="Close"
                aria-label="Close calculation message"
              >
                <RibbonCloseIcon />
              </button>
            </div>
            <div
              className={`calculation-ribbon-body ${calculationRibbonExpanded ? 'calculation-ribbon-body--expanded' : 'calculation-ribbon-body--collapsed'}`}
            >
              {calculationMessage}
            </div>
          </div>
        )}
        <div className="canvas" ref={canvasRef} onClick={handleCanvasClick}>
          <svg className="wires" aria-hidden="true">
            {wirePolylines.map((line) => (
              <g key={line.id}>
                <polyline
                  className={`wire-line ${selectedWireId === line.id ? 'selected' : ''}`}
                  points={line.points.map((point) => `${point.x},${point.y}`).join(' ')}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedWireId(line.id)
                    setSelectedComponentId(null)
                  }}
                />
                {selectedWireId === line.id &&
                  line.waypoints.map((waypoint, index) => (
                    <circle
                      key={`${line.id}-${index}`}
                      className="bend-handle"
                      cx={waypoint.x}
                      cy={waypoint.y}
                      r={5}
                      onMouseDown={(event) => startBendDrag(event, line.id, index)}
                    />
                  ))}
              </g>
            ))}
            {isSimulating && animatedDotPoint && (
              <circle className="sim-dot" cx={animatedDotPoint.x} cy={animatedDotPoint.y} r={5} />
            )}
          </svg>
          {components.map((component) => (
            <div
              key={component.id}
              role="button"
              tabIndex={0}
              className={`component-node ${component.orientation} ${selectedComponentId === component.id ? 'selected' : ''}`}
              style={{ left: component.x, top: component.y }}
              onMouseDown={(event) => beginDrag(event, component)}
              onClick={(event) => handleComponentClick(event, component)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedComponentId(component.id)
                  setSelectedWireId(null)
                  if (activeTool !== 'wire') {
                    setActiveTool(component.kind)
                  }
                }
              }}
            >
              <ComponentVisual component={component} />
              <span className={`terminal-dot ${component.orientation === 'vertical' ? 'top' : 'left'}`} />
              <span
                className={`terminal-dot ${component.orientation === 'vertical' ? 'bottom' : 'right'}`}
              />
              {component.kind === 'battery' && (
                <>
                  <span
                    className={`battery-terminal-label ${
                      component.orientation === 'vertical' ? 'top' : 'minus'
                    }`}
                  >
                    -
                  </span>
                  <span
                    className={`battery-terminal-label ${
                      component.orientation === 'vertical' ? 'bottom' : 'plus'
                    }`}
                  >
                    +
                  </span>
                </>
              )}
              {selectedComponentId === component.id && (
                <button
                  type="button"
                  className="rotate-handle"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSelectedOrientation()
                  }}
                  title="Rotate component"
                >
                  ↻
                </button>
              )}
              <span className="component-value">{getComponentValueText(component)}</span>
            </div>
          ))}
        </div>
      </section>

      <aside className="properties-panel">
        {showExportPanel ? (
          <>
            <h2>Export layout</h2>
            <p className="hint">
              Choose a file name and image format, then export. Leave name empty to use{' '}
              <strong>crkt-export</strong>; format defaults to <strong>PNG</strong>.
            </p>
            <form className="property-form" onSubmit={handleExportSubmit}>
              <label>
                File name (without extension)
                <input
                  type="text"
                  value={exportFileName}
                  placeholder="crkt-export"
                  onChange={(event) => setExportFileName(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                Format
                <select
                  value={exportFormat}
                  onChange={(event) =>
                    setExportFormat(event.target.value as 'png' | 'jpeg')
                  }
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </select>
              </label>
              <button className="export-submit-button" type="submit" disabled={isExporting}>
                {isExporting ? 'Exporting…' : 'Export image'}
              </button>
              <button
                className="export-cancel-button"
                type="button"
                disabled={isExporting}
                onClick={() => setShowExportPanel(false)}
              >
                Cancel
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>Component Values</h2>
            {activeTool === 'wire' && draftWire && (
              <p className="hint">Click canvas for 90 degree bends, then click a component end to finish.</p>
            )}
            {!selectedComponent && (
              <p className="hint">Select a component from the layout, or use Export in the toolbar.</p>
            )}
            {selectedComponent && (
          <form className="property-form">
            <label>
              Component
              <input value={kindLabels[selectedComponent.kind]} readOnly />
            </label>
            {selectedComponent.kind === 'led' && (
              <label>
                LED color
                <select
                  value={selectedComponent.ledColor}
                  onChange={(event) => updateSelectedLedColor(event.target.value as LedColor)}
                >
                  {LED_COLOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isSimulating ? (
              <>
                {selectedComponent.kind === 'led' ? (
                  <p className="hint ohms-hint">
                    LED: forward voltage and operating current only (no resistance).
                  </p>
                ) : (
                  <p className="hint ohms-hint">
                    Ohm’s law (V = I × R): enter any two of voltage, current, or resistance, then click
                    Calculate to fill the third.                     For a matching topology, Calculate uses Kirchhoff’s laws (KVL/KCL) from the
                    voltage/current divider ideas in DC Ch.6 — e.g. battery + LED + resistor in one
                    loop; battery with N series resistors (voltage divider); or several resistors in
                    parallel across the battery. Otherwise Ohm’s law fills a single part’s missing V,
                    I, or R.
                  </p>
                )}
                <label>
                  Voltage (V)
                  <input
                    type="number"
                    step="any"
                    value={selectedComponent.voltage ?? ''}
                    onChange={(event) => updateSelectedValue('voltage', parseNumberOrNull(event.target.value))}
                  />
                </label>
                <label>
                  Current (A)
                  <input
                    type="number"
                    step="any"
                    value={selectedComponent.current ?? ''}
                    onChange={(event) => updateSelectedValue('current', parseNumberOrNull(event.target.value))}
                  />
                </label>
                {selectedComponent.kind !== 'led' && (
                  <label>
                    Resistance (Ohm)
                    <input
                      type="number"
                      step="any"
                      value={selectedComponent.resistance ?? ''}
                      onChange={(event) => updateSelectedValue('resistance', parseNumberOrNull(event.target.value))}
                    />
                  </label>
                )}
                {selectedComponent.kind === 'capacitor' && (
                  <label>
                    Capacitance (uF)
                    <input
                      type="number"
                      step="any"
                      value={selectedComponent.capacitance}
                      onChange={(event) => updateSelectedValue('capacitance', Number(event.target.value))}
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                {selectedComponent.kind === 'battery' && (
                  <label>
                    Voltage (V)
                    <input
                      type="number"
                      step="any"
                      value={selectedComponent.voltage ?? ''}
                      onChange={(event) => updateSelectedValue('voltage', parseNumberOrNull(event.target.value))}
                    />
                  </label>
                )}
                {selectedComponent.kind === 'resistor' && (
                  <label>
                    Resistance (Ohm)
                    <input
                      type="number"
                      step="any"
                      value={selectedComponent.resistance ?? ''}
                      onChange={(event) => updateSelectedValue('resistance', parseNumberOrNull(event.target.value))}
                    />
                  </label>
                )}
                {selectedComponent.kind === 'capacitor' && (
                  <label>
                    Capacitance (uF)
                    <input
                      type="number"
                      step="any"
                      value={selectedComponent.capacitance}
                      onChange={(event) => updateSelectedValue('capacitance', Number(event.target.value))}
                    />
                  </label>
                )}
                {selectedComponent.kind === 'led' && (
                  <label>
                    Voltage (V)
                    <input
                      type="number"
                      step="any"
                      value={selectedComponent.voltage ?? ''}
                      onChange={(event) =>
                        updateSelectedValue('voltage', parseNumberOrNull(event.target.value))
                      }
                    />
                  </label>
                )}
                <label>
                  Current (A)
                  <input
                    type="number"
                    step="any"
                    value={selectedComponent.current ?? ''}
                    onChange={(event) => updateSelectedValue('current', parseNumberOrNull(event.target.value))}
                  />
                </label>
              </>
            )}
          </form>
            )}
          </>
        )}
      </aside>
    </main>
  )
}

export default App
