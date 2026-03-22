import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import {
  COMPONENT_DEFAULTS,
  DEFAULT_LED_COLOR,
  defaultPropertiesLocked,
  getLedDefaults,
  isComponentPlacementTool,
  type LedColor,
} from './config'
import {
  createComponentId,
  createTextNoteId,
  createWireId,
  resetLayoutEntityIdCounters,
} from './ids'
import { getAllTerminalKeys } from './circuit/graphUtils'
import { runCircuitCalculate } from './circuit/ohmsCompute'
import { applyWireCurrentPatch } from './circuit/wireComputedCurrent'
import {
  CANVAS_MIN_HEIGHT,
  CANVAS_MIN_WIDTH,
  GRID_SIZE,
  TEXT_NOTE_DEFAULT_HEIGHT_PX,
  TEXT_NOTE_DEFAULT_WIDTH_PX,
  TEXT_NOTE_FONT_SIZE_DEFAULT_PX,
  TEXT_NOTE_FONT_SIZE_MAX_PX,
  TEXT_NOTE_FONT_SIZE_MIN_PX,
  TEXT_NOTE_HEADER_FONT_DEFAULT_PX,
  TEXT_NOTE_MIN_HEIGHT_PX,
  TEXT_NOTE_MIN_WIDTH_PX,
} from './constants/layout'
import { EXPORT_DEFAULT_BASENAME } from './constants/export'
import { kindLabels, toolLabels } from './constants/labels'
import { ComponentVisual } from './components/canvas/ComponentVisual'
import { LayoutTextNoteCanvas } from './components/canvas/LayoutTextNoteCanvas'
import { DrawerCloseChevronIcon, DrawerOpenChevronIcon } from './components/canvas/DrawerIcons'
import {
  RibbonCloseIcon,
  RibbonCollapseIcon,
  RibbonExpandIcon,
} from './components/canvas/RibbonIcons'
import { CrktDsnWordmark } from './components/brand/CrktDsnWordmark'
import { ToolIcon } from './components/canvas/ToolIcons'
import { ComponentSpecPropertyFields } from './components/properties/ComponentSpecPropertyFields'
import { computeDiagramBounds, getExportCropRect } from './export/exportCrop'
import { getLayoutExportHtml2CanvasOptions } from './export/html2canvasLayout'
import { getTerminalWorldPoint, terminalSideFromPointerEvent } from './geometry/componentTerminals'
import { appendOrthogonalPoint, expandOrthogonalPath } from './geometry/orthogonalPaths'
import { getPathPointAt } from './geometry/polyline'
import type {
  CircuitComponent,
  LayoutTextNote,
  PathEdge,
  Point,
  RotationDeg,
  TerminalRef,
  TerminalSide,
  Tool,
  Wire,
} from './types/circuit'
import {
  applyCalculationByComponentId,
  getComponentById,
  isComponentPropertiesLocked,
  patchComponentById,
} from './utils/componentIdentity'
import { getComponentValueText } from './utils/componentValueText'
import { sanitizeExportBaseName } from './utils/exportFile'
import { gridDeltaFromArrowKey } from './utils/gridNavigation'
import { isEditableKeyboardTarget } from './utils/keyboardCanvas'
import { parseNumberOrNull } from './utils/parse'
import {
  clampTextFontSize,
  clampTextNoteSize,
  resolveLayoutTextNote,
} from './utils/layoutTextNote'
import { terminalKey } from './utils/terminal'

function App() {
  const [activeTool, setActiveTool] = useState<Tool>('none')
  const [components, setComponents] = useState<CircuitComponent[]>([])
  const [wires, setWires] = useState<Wire[]>([])
  const [textNotes, setTextNotes] = useState<LayoutTextNote[]>([])
  const [selectedTextNoteId, setSelectedTextNoteId] = useState<string | null>(null)
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
  /** Right properties / export panel — closed by default; persisted only when explicitly opened (`'1'`). */
  const [isPropertiesDrawerOpen, setIsPropertiesDrawerOpen] = useState(() => {
    try {
      return localStorage.getItem('crkt-dsn-properties-drawer') === '1'
    } catch {
      return false
    }
  })
  const [exportFileName, setExportFileName] = useState('')
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'pdf'>('png')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const layoutPanelScrollRef = useRef<HTMLDivElement | null>(null)
  const dragInfoRef = useRef<{
    id: string
    offsetX: number
    offsetY: number
  } | null>(null)
  const bendDragRef = useRef<{ wireId: string; waypointIndex: number } | null>(null)
  const noteDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  /** Same object as the matching canvas node — keyed only by {@link selectedComponentId}. */
  const selectedComponent = useMemo(
    () => getComponentById(components, selectedComponentId),
    [components, selectedComponentId],
  )

  const selectedTextNote = useMemo(
    () => textNotes.find((note) => note.id === selectedTextNoteId) ?? null,
    [textNotes, selectedTextNoteId],
  )

  const selectedWire = useMemo(
    () => wires.find((w) => w.id === selectedWireId) ?? null,
    [wires, selectedWireId],
  )

  const resolvedSelectedTextNote = useMemo(
    () => (selectedTextNote ? resolveLayoutTextNote(selectedTextNote) : null),
    [selectedTextNote],
  )

  const isCircuitEmpty = components.length === 0 && wires.length === 0
  const isLayoutEmpty = isCircuitEmpty && textNotes.length === 0

  /**
   * When any part is locked, Calculate updates exactly one unlocked part; that row is marked on canvas.
   */
  const calculateTargetComponentId = useMemo(() => {
    if (components.length === 0) {
      return null
    }
    const anyLocked = components.some(isComponentPropertiesLocked)
    if (!anyLocked) {
      return null
    }
    const unlocked = components.filter((c) => !isComponentPropertiesLocked(c))
    if (unlocked.length !== 1) {
      return null
    }
    return unlocked[0].id
  }, [components])

  const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE
  const batteryId = components.find((component) => component.kind === 'battery')?.id ?? null

  /** Clear highlighted tool on the left toolbar and cancel an in-progress wire. */
  const clearPlacementTool = useCallback(() => {
    setActiveTool('none')
    setDraftWire(null)
  }, [])

  /** Remove everything on the canvas, reset simulation/calculate UI, id counters, and drag state. */
  const clearEntireLayout = useCallback(() => {
    if (
      !window.confirm(
        'Clear the entire layout? All components, wires, and notes will be removed and new parts will get fresh ids (B_1, R_1, …).',
      )
    ) {
      return
    }
    clearPlacementTool()
    resetLayoutEntityIdCounters()
    dragInfoRef.current = null
    bendDragRef.current = null
    noteDragRef.current = null
    setComponents([])
    setWires([])
    setTextNotes([])
    setSelectedComponentId(null)
    setSelectedWireId(null)
    setSelectedTextNoteId(null)
    setIsSimulating(false)
    setSimulationProgress(0)
    setCalculationMessage(null)
    setCalculationRibbonDismissed(false)
    setCalculationRibbonExpanded(false)
    setShowExportPanel(false)
    setExportFileName('')
    setIsExporting(false)
    layoutPanelScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [clearPlacementTool])

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
    return getTerminalWorldPoint(component, terminal)
  }

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const clickedElement = event.target as HTMLElement
    if (clickedElement.closest('.component-node')) {
      return
    }
    if (clickedElement.closest('.layout-text-note')) {
      return
    }
    if (isComponentPlacementTool(activeTool)) {
      const point = getCanvasPoint(event)
      const id = createComponentId(activeTool)
      const ledPlace = getLedDefaults(COMPONENT_DEFAULTS.led.defaultColor)
      setComponents((previous) => [
        ...previous,
        {
          id,
          kind: activeTool,
          x: snap(point.x),
          y: snap(point.y),
          rotationDeg: 0,
          ledColor: DEFAULT_LED_COLOR,
          voltage:
            activeTool === 'battery'
              ? COMPONENT_DEFAULTS.battery.voltage
              : activeTool === 'led'
                ? ledPlace.voltage
                : null,
          current: activeTool === 'led' ? ledPlace.current : null,
          resistance: null,
          capacitance: activeTool === 'capacitor' ? null : 0,
          propertiesLocked: defaultPropertiesLocked(activeTool),
        },
      ])
      setSelectedComponentId(id)
      setSelectedWireId(null)
      setSelectedTextNoteId(null)
    } else if (activeTool === 'text') {
      const point = getCanvasPoint(event)
      const id = createTextNoteId()
      setTextNotes((previous) => [
        ...previous,
        {
          id,
          x: snap(point.x),
          y: snap(point.y),
          text: '',
          width: TEXT_NOTE_DEFAULT_WIDTH_PX,
          height: TEXT_NOTE_DEFAULT_HEIGHT_PX,
          showHeader: true,
          headerText: 'T',
          headerFontSizePx: TEXT_NOTE_HEADER_FONT_DEFAULT_PX,
          headerBold: true,
          headerItalic: false,
          textFontSizePx: TEXT_NOTE_FONT_SIZE_DEFAULT_PX,
          textBold: false,
          textItalic: false,
        },
      ])
      setSelectedTextNoteId(id)
      setSelectedComponentId(null)
      setSelectedWireId(null)
      setDraftWire(null)
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
      setSelectedTextNoteId(null)
      setDraftWire(null)
    }
  }

  const beginDrag = (event: React.MouseEvent, component: CircuitComponent) => {
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
      const dragId = dragInfoRef.current.id
      setComponents((previous) => patchComponentById(previous, dragId, { x: nextX, y: nextY }))
    }

    const onMouseUp = () => {
      dragInfoRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const beginTextNoteDrag = (event: React.MouseEvent, note: LayoutTextNote) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    setSelectedTextNoteId(note.id)
    setSelectedComponentId(null)
    setSelectedWireId(null)
    noteDragRef.current = {
      id: note.id,
      offsetX: event.clientX - rect.left - note.x,
      offsetY: event.clientY - rect.top - note.y,
    }
    const onMouseMove = (moveEvent: MouseEvent) => {
      const r = canvasRef.current?.getBoundingClientRect()
      if (!r || !noteDragRef.current) {
        return
      }
      const nextX = snap(moveEvent.clientX - r.left - noteDragRef.current.offsetX)
      const nextY = snap(moveEvent.clientY - r.top - noteDragRef.current.offsetY)
      setTextNotes((previous) =>
        previous.map((item) =>
          item.id === noteDragRef.current?.id ? { ...item, x: nextX, y: nextY } : item,
        ),
      )
    }
    const onMouseUp = () => {
      noteDragRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleTextNoteClick = (event: React.MouseEvent, note: LayoutTextNote) => {
    event.stopPropagation()
    setSelectedTextNoteId(note.id)
    setSelectedComponentId(null)
    setSelectedWireId(null)
    if (activeTool === 'wire') {
      setDraftWire(null)
    }
  }

  const handleComponentClick = (
    event: React.MouseEvent<HTMLElement>,
    component: CircuitComponent,
  ) => {
    event.stopPropagation()
    setSelectedComponentId(component.id)
    setSelectedWireId(null)
    setSelectedTextNoteId(null)
    if (activeTool === 'wire') {
      const side: TerminalSide = terminalSideFromPointerEvent(component, event)
      const clickedTerminal: TerminalRef = { componentId: component.id, side }
      if (!draftWire) {
        setDraftWire({ from: clickedTerminal, waypoints: [] })
        return
      }
      if (terminalKey(draftWire.from) === terminalKey(clickedTerminal)) {
        setDraftWire(null)
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
          id: createWireId(),
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
    const id = selectedComponentId
    setComponents((previous) => {
      const c = getComponentById(previous, id)
      if (!c || isComponentPropertiesLocked(c)) {
        return previous
      }
      return patchComponentById(previous, id, { [field]: value })
    })
  }

  /** Apply config defaults for V/I when the user picks another LED color (they can still edit after). */
  const updateSelectedLedColor = (color: LedColor) => {
    if (!selectedComponentId) {
      return
    }
    const id = selectedComponentId
    const { voltage, current } = getLedDefaults(color)
    setComponents((previous) => {
      const c = getComponentById(previous, id)
      if (!c || c.kind !== 'led' || isComponentPropertiesLocked(c)) {
        return previous
      }
      return patchComponentById(previous, id, { ledColor: color, voltage, current })
    })
  }

  const toggleSelectedPropertiesLocked = () => {
    if (!selectedComponentId) {
      return
    }
    const id = selectedComponentId
    setComponents((previous) => {
      const c = getComponentById(previous, id)
      if (!c) {
        return previous
      }
      return patchComponentById(previous, id, {
        propertiesLocked: !isComponentPropertiesLocked(c),
      })
    })
  }

  /** Rotate handle: 90° clockwise per click (cycles 0 → 90 → 180 → 270 → 0). */
  const rotateSelectedComponent = () => {
    if (!selectedComponentId) {
      return
    }
    const id = selectedComponentId
    setComponents((previous) => {
      const c = getComponentById(previous, id)
      if (!c) {
        return previous
      }
      const next = ((c.rotationDeg + 90) % 360) as RotationDeg
      return patchComponentById(previous, id, { rotationDeg: next })
    })
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

  const deleteSelection = useCallback(() => {
    if (selectedTextNoteId) {
      const id = selectedTextNoteId
      setTextNotes((previous) => previous.filter((note) => note.id !== id))
      setSelectedTextNoteId(null)
      return
    }
    if (selectedComponentId) {
      const id = selectedComponentId
      setComponents((previous) => previous.filter((component) => component.id !== id))
      setWires((previous) =>
        previous.filter(
          (wire) => wire.from.componentId !== id && wire.to.componentId !== id,
        ),
      )
      setDraftWire((dw) => (dw?.from.componentId === id ? null : dw))
      setSelectedComponentId(null)
      return
    }
    if (selectedWireId) {
      const id = selectedWireId
      setWires((previous) => previous.filter((wire) => wire.id !== id))
      setSelectedWireId(null)
    }
  }, [selectedTextNoteId, selectedComponentId, selectedWireId])

  const updateSelectedTextNote = (text: string) => {
    if (!selectedTextNoteId) {
      return
    }
    setTextNotes((previous) =>
      previous.map((note) =>
        note.id === selectedTextNoteId ? { ...note, text } : note,
      ),
    )
  }

  const patchTextNote = useCallback((id: string, patch: Partial<LayoutTextNote>) => {
    setTextNotes((previous) =>
      previous.map((note) => (note.id === id ? { ...note, ...patch } : note)),
    )
  }, [])

  const patchSelectedTextNote = (patch: Partial<LayoutTextNote>) => {
    if (!selectedTextNoteId) {
      return
    }
    setTextNotes((previous) =>
      previous.map((note) =>
        note.id === selectedTextNoteId ? { ...note, ...patch } : note,
      ),
    )
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete') {
        if (!isEditableKeyboardTarget(event.target)) {
          deleteSelection()
        }
        return
      }
      if (selectedTextNoteId) {
        if (isEditableKeyboardTarget(event.target)) {
          return
        }
        const delta = gridDeltaFromArrowKey(event.key)
        if (!delta) {
          return
        }
        event.preventDefault()
        setTextNotes((previous) =>
          previous.map((note) =>
            note.id === selectedTextNoteId
              ? { ...note, x: note.x + delta.dx, y: note.y + delta.dy }
              : note,
          ),
        )
        return
      }
      if (!selectedComponentId) {
        return
      }
      if (isEditableKeyboardTarget(event.target)) {
        return
      }
      const delta = gridDeltaFromArrowKey(event.key)
      if (!delta) {
        return
      }
      event.preventDefault()
      const moveId = selectedComponentId
      setComponents((previous) => {
        const c = getComponentById(previous, moveId)
        if (!c) {
          return previous
        }
        return patchComponentById(previous, moveId, {
          x: c.x + delta.dx,
          y: c.y + delta.dy,
        })
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedComponentId, selectedTextNoteId, deleteSelection])

  useEffect(() => {
    if (!isSimulating) {
      return
    }
    const timer = window.setInterval(() => {
      setSimulationProgress((previous) => (previous + 0.00625) % 1)
    }, 30)
    return () => window.clearInterval(timer)
  }, [isSimulating])

  /** Stop simulation when there is no circuit (notes-only layout is allowed). */
  useEffect(() => {
    if (!isCircuitEmpty) {
      return
    }
    setIsSimulating(false)
    setSimulationProgress(0)
    setCalculationMessage(null)
    setCalculationRibbonDismissed(false)
    setCalculationRibbonExpanded(false)
  }, [isCircuitEmpty])

  useEffect(() => {
    if (!isLayoutEmpty) {
      return
    }
    setShowExportPanel(false)
  }, [isLayoutEmpty])

  useEffect(() => {
    if (calculationMessage === null) {
      setCalculationRibbonDismissed(false)
      setCalculationRibbonExpanded(false)
    }
  }, [calculationMessage])

  useEffect(() => {
    try {
      localStorage.setItem('crkt-dsn-properties-drawer', isPropertiesDrawerOpen ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [isPropertiesDrawerOpen])

  /** Open properties drawer when user selects a component or text note */
  useEffect(() => {
    if (selectedComponentId !== null || selectedTextNoteId !== null) {
      setIsPropertiesDrawerOpen(true)
    }
  }, [selectedComponentId, selectedTextNoteId])

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
        currentA: wire.currentA ?? null,
      }
    })
    .filter(
      (line): line is {
        id: string
        points: Point[]
        waypoints: Point[]
        currentA: number | null
      } => !!line,
    )

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

  const runLayoutExport = async (baseFileName: string, format: 'png' | 'jpeg' | 'pdf') => {
    const element = canvasRef.current
    const scrollEl = layoutPanelScrollRef.current
    if (!element || isExporting) {
      return
    }
    setIsExporting(true)
    try {
      const diagramBounds = computeDiagramBounds(components, wirePolylines, textNotes)
      const cropRect =
        scrollEl && element
          ? getExportCropRect(scrollEl, element, diagramBounds)
          : { x: 0, y: 0, width: element.offsetWidth, height: element.offsetHeight }
      const snapshot = await html2canvas(element, {
        ...getLayoutExportHtml2CanvasOptions(),
        x: cropRect.x,
        y: cropRect.y,
        width: cropRect.width,
        height: cropRect.height,
      })
      if (format === 'pdf') {
        const { downloadLayoutPdf } = await import('./export/pdfLayout')
        downloadLayoutPdf(snapshot, baseFileName)
      } else {
        const dataUrl =
          format === 'png'
            ? snapshot.toDataURL('image/png')
            : snapshot.toDataURL('image/jpeg', 0.92)
        const extension = format === 'png' ? 'png' : 'jpg'
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = `${baseFileName}.${extension}`
        link.click()
      }
      setShowExportPanel(false)
    } catch (error) {
      console.error(error)
      window.alert('Could not export the layout. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = exportFileName.trim()
    const baseName =
      trimmed === '' ? EXPORT_DEFAULT_BASENAME : sanitizeExportBaseName(trimmed)
    const format = exportFormat
    void runLayoutExport(baseName, format)
  }

  return (
    <main className="app-shell">
      <section
        className={`layout-panel ${isPropertiesDrawerOpen ? 'layout-panel--drawer-open' : ''}`}
      >
        <header className="toolbar">
          <div className="toolbar-brand">
            <CrktDsnWordmark className="toolbar-brand-logo" />
          </div>
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
                const next = activeTool === tool ? ('none' as Tool) : tool
                setActiveTool(next)
                if (next !== 'wire') {
                  setDraftWire(null)
                }
              }}
            >
              <ToolIcon tool={tool} />
            </button>
          ))}
          <button
            className="tool-button toolbar-tool--text delete-button"
            type="button"
            onClick={() => {
              clearPlacementTool()
              deleteSelection()
            }}
            disabled={!selectedComponentId && !selectedWireId && !selectedTextNoteId}
          >
            Delete
          </button>
          <button
            className={`tool-button toolbar-tool--text simulate-button ${isSimulating ? 'active' : ''}`}
            type="button"
            disabled={isCircuitEmpty}
            onClick={() => {
              clearPlacementTool()
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
            className="tool-button toolbar-tool--text"
            type="button"
            disabled={!isSimulating}
            onClick={() => {
              clearPlacementTool()
              setComponents((previous) => {
                const terminalKeys = getAllTerminalKeys(previous)
                const { next, message, wireCurrentPatch } = runCircuitCalculate(
                  previous,
                  wires,
                  kindLabels,
                )
                queueMicrotask(() => {
                  setCalculationMessage(message)
                  setCalculationRibbonDismissed(false)
                  setCalculationRibbonExpanded(false)
                })
                setWires((wPrev) => applyWireCurrentPatch(wPrev, wireCurrentPatch, terminalKeys))
                return applyCalculationByComponentId(previous, next)
              })
            }}
          >
            Calculate
          </button>
          <button
            className="tool-button toolbar-tool--text"
            type="button"
            disabled={isLayoutEmpty}
            title="Export layout as image"
            onClick={() => {
              clearPlacementTool()
              setShowExportPanel(true)
              setIsPropertiesDrawerOpen(true)
              setExportFileName('')
              setExportFormat('png')
              setSelectedComponentId(null)
              setSelectedWireId(null)
              setSelectedTextNoteId(null)
            }}
          >
            Export
          </button>
          <button
            className="tool-button toolbar-tool--text toolbar-clear-button"
            type="button"
            disabled={isLayoutEmpty}
            title={
              isLayoutEmpty
                ? 'Nothing on the layout to clear'
                : 'Remove all components, wires, and notes; reset simulation and id counters'
            }
            aria-label="Clear layout"
            onClick={() => {
              clearEntireLayout()
            }}
          >
            Clear
          </button>
        </header>
        {calculationMessage && !calculationRibbonDismissed && (
          <div className="calculation-ribbon" role="alert">
            <div className="calculation-ribbon-toolbar">
              <button
                type="button"
                className="ribbon-tool-button ribbon-toggle-button"
                onClick={() => {
                  clearPlacementTool()
                  setCalculationRibbonExpanded((expanded) => !expanded)
                }}
                title={calculationRibbonExpanded ? 'Collapse' : 'Expand'}
                aria-expanded={calculationRibbonExpanded}
                aria-label={calculationRibbonExpanded ? 'Collapse calculation message' : 'Expand calculation message'}
              >
                {calculationRibbonExpanded ? <RibbonCollapseIcon /> : <RibbonExpandIcon />}
              </button>
              <button
                type="button"
                className="ribbon-tool-button ribbon-close-button"
                onClick={() => {
                  clearPlacementTool()
                  setCalculationRibbonDismissed(true)
                }}
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
        <div className="layout-panel-scroll" ref={layoutPanelScrollRef}>
          <div
            className="canvas"
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{
              minHeight: CANVAS_MIN_HEIGHT,
              minWidth: `max(100%, ${CANVAS_MIN_WIDTH}px)`,
            }}
          >
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
                    setSelectedTextNoteId(null)
                  }}
                />
                {isSimulating &&
                  line.currentA !== null &&
                  (() => {
                    const p = getPathPointAt(line.points, 0.5)
                    if (!p) {
                      return null
                    }
                    return (
                      <text
                        className="wire-current-label"
                        x={p.x}
                        y={p.y - 8}
                        textAnchor="middle"
                      >
                        {line.currentA} A
                      </text>
                    )
                  })()}
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
              id={`layout-component-${component.id}`}
              data-component-id={component.id}
              role="button"
              tabIndex={0}
              className={`component-node${selectedComponentId === component.id ? ' selected' : ''}${
                isComponentPropertiesLocked(component) ? ' component-node--spec-locked' : ''
              }`}
              style={{
                left: component.x,
                top: component.y,
              }}
              aria-label={`${kindLabels[component.kind]} ${component.id}`}
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
              <div className="component-node-body">
                <div
                  className="component-node-rotated"
                  style={{ transform: `rotate(${component.rotationDeg}deg)` }}
                >
                  <ComponentVisual component={component} />
                  {/*
                    Dots always use left/right in local frame; wrapper rotate(deg) places them on
                    the real ends. (top/bottom + rotate(90) incorrectly put them on screen left/right.)
                  */}
                  <span className="terminal-dot left" />
                  <span className="terminal-dot right" />
                  {component.kind === 'battery' && (
                    <>
                      <span className="battery-terminal-label minus">-</span>
                      <span className="battery-terminal-label plus">+</span>
                    </>
                  )}
                </div>
              </div>
              {selectedComponentId === component.id && (
                <button
                  type="button"
                  className="rotate-handle"
                  onClick={(event) => {
                    event.stopPropagation()
                    rotateSelectedComponent()
                  }}
                  title="Rotate 90° clockwise"
                >
                  ↻
                </button>
              )}
              {isComponentPropertiesLocked(component) && (
                <span
                  className="component-lock-badge"
                  role="img"
                  aria-label="Electrical properties locked"
                  title="Electrical properties locked — unlock in the properties panel to edit"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 1 0-4 0v2z"
                    />
                  </svg>
                </span>
              )}
              {calculateTargetComponentId === component.id && (
                <span
                  className="component-calculate-target-badge"
                  role="img"
                  aria-label="Calculate target: Simulate mode Calculate will update this part’s electric values"
                  title="This is the only unlocked part — click Calculate (in Simulate mode) to recompute its properties from the locked parts"
                >
                  <svg
                    className="component-calculate-target-badge__svg"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    aria-hidden="true"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="20"
                      height="20"
                      rx="4.5"
                      ry="4.5"
                      fill="currentColor"
                    />
                    <g
                      className="component-calculate-target-badge__face"
                      fill="none"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="4.75" x2="12" y2="19.25" />
                      <line x1="4.75" y1="12" x2="19.25" y2="12" />
                      <line x1="6.25" y1="8" x2="9.75" y2="8" />
                      <line x1="8" y1="6.25" x2="8" y2="9.75" />
                      <line x1="14.25" y1="8" x2="17.75" y2="8" />
                      <line x1="5.9" y1="15.35" x2="10.1" y2="18.65" />
                      <line x1="10.1" y1="15.35" x2="5.9" y2="18.65" />
                      <line x1="14.25" y1="15.35" x2="17.75" y2="15.35" />
                      <line x1="14.25" y1="17.65" x2="17.75" y2="17.65" />
                    </g>
                  </svg>
                </span>
              )}
              <span className="component-value">
                {getComponentValueText(component, isSimulating)}
              </span>
            </div>
          ))}
          {textNotes.map((note) => (
            <LayoutTextNoteCanvas
              key={note.id}
              note={note}
              selected={selectedTextNoteId === note.id}
              onPatch={patchTextNote}
              onSelect={handleTextNoteClick}
              onBeginDrag={beginTextNoteDrag}
              onTextChange={(id, text) => {
                setTextNotes((previous) =>
                  previous.map((n) => (n.id === id ? { ...n, text } : n)),
                )
              }}
            />
          ))}
          </div>
        </div>
      </section>

      <div
        className="properties-drawer-root"
        onPointerDownCapture={clearPlacementTool}
      >
        {!isPropertiesDrawerOpen && (
          <button
            type="button"
            className="drawer-tab-button"
            onClick={() => setIsPropertiesDrawerOpen(true)}
            aria-label="Open properties panel"
            title="Open properties panel"
          >
            <DrawerOpenChevronIcon />
          </button>
        )}
        <aside
          className={`properties-panel properties-drawer ${isPropertiesDrawerOpen ? 'properties-drawer--open' : ''}`}
          aria-hidden={!isPropertiesDrawerOpen}
        >
          <div className="properties-drawer-header">
            <h2 className="properties-drawer-title">
              {showExportPanel
                ? 'Export layout'
                : selectedTextNote
                  ? 'Text note'
                  : selectedWire && !selectedComponent
                    ? 'Wire'
                    : 'Component Values'}
            </h2>
            <button
              type="button"
              className="drawer-collapse-button tool-button toolbar-tool"
              onClick={() => setIsPropertiesDrawerOpen(false)}
              aria-label="Close properties panel"
              title="Close panel"
            >
              <DrawerCloseChevronIcon />
            </button>
          </div>
          <div className="properties-drawer-body">
        {showExportPanel ? (
          <>
            <p className="hint">
              Choose a file name and format, then export. Leave name empty to use{' '}
              <strong>{EXPORT_DEFAULT_BASENAME}</strong>; format defaults to <strong>PNG</strong>.{' '}
              <strong>PDF</strong> embeds the same snapshot as a single A4 page (scaled to fit). If the whole
              circuit fits in the current view, only that view is exported; if the circuit extends below the
              view, the export runs from the top of the canvas through the circuit plus a little margin below.
            </p>
            <form className="property-form" onSubmit={handleExportSubmit}>
              <label>
                File name (without extension)
                <input
                  type="text"
                  value={exportFileName}
                  placeholder={EXPORT_DEFAULT_BASENAME}
                  onChange={(event) => setExportFileName(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                Format
                <select
                  value={exportFormat}
                  onChange={(event) =>
                    setExportFormat(event.target.value as 'png' | 'jpeg' | 'pdf')
                  }
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="pdf">PDF (A4)</option>
                </select>
              </label>
              <button className="export-submit-button" type="submit" disabled={isExporting}>
                {isExporting ? 'Exporting…' : 'Export'}
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
            {activeTool === 'wire' && draftWire && (
              <p className="hint">Click canvas for 90 degree bends, then click a component end to finish.</p>
            )}
            {activeTool === 'text' && (
              <p className="hint">
                Click the canvas to place a pale yellow note. Resize from the corner; drag from the header
                (or from the edge when the header is hidden).
              </p>
            )}
            {resolvedSelectedTextNote && selectedTextNote && (
              <form className="property-form">
                <label>
                  Note ID
                  <input
                    className="property-form-id"
                    value={selectedTextNote.id}
                    readOnly
                    spellCheck={false}
                  />
                </label>
                <label className="property-form-checkbox">
                  <input
                    type="checkbox"
                    checked={resolvedSelectedTextNote.showHeader}
                    onChange={(event) =>
                      patchSelectedTextNote({ showHeader: event.target.checked })
                    }
                  />
                  Show header bar
                </label>
                {resolvedSelectedTextNote.showHeader ? (
                  <>
                    <p className="note-section-label">Header</p>
                    <label>
                      Header text
                      <input
                        type="text"
                        value={resolvedSelectedTextNote.headerText}
                        onChange={(event) =>
                          patchSelectedTextNote({ headerText: event.target.value })
                        }
                        placeholder="T"
                        autoComplete="off"
                        style={{
                          fontSize: `${resolvedSelectedTextNote.headerFontSizePx}px`,
                          fontWeight: resolvedSelectedTextNote.headerBold ? 700 : 400,
                          fontStyle: resolvedSelectedTextNote.headerItalic ? 'italic' : 'normal',
                        }}
                      />
                    </label>
                    <div className="note-font-size-field">
                      <span className="note-font-size-label">Header size</span>
                      <div className="note-font-size-controls">
                        <button
                          type="button"
                          className="note-font-step-button"
                          aria-label="Decrease header font size"
                          title="Smaller"
                          onClick={() =>
                            patchSelectedTextNote({
                              headerFontSizePx: clampTextFontSize(
                                (resolvedSelectedTextNote.headerFontSizePx ??
                                  TEXT_NOTE_HEADER_FONT_DEFAULT_PX) - 1,
                              ),
                            })
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          className="note-font-size-input"
                          min={TEXT_NOTE_FONT_SIZE_MIN_PX}
                          max={TEXT_NOTE_FONT_SIZE_MAX_PX}
                          step={1}
                          value={resolvedSelectedTextNote.headerFontSizePx}
                          onChange={(event) => {
                            const v = parseNumberOrNull(event.target.value)
                            if (v === null) {
                              return
                            }
                            patchSelectedTextNote({ headerFontSizePx: clampTextFontSize(v) })
                          }}
                        />
                        <button
                          type="button"
                          className="note-font-step-button"
                          aria-label="Increase header font size"
                          title="Larger"
                          onClick={() =>
                            patchSelectedTextNote({
                              headerFontSizePx: clampTextFontSize(
                                (resolvedSelectedTextNote.headerFontSizePx ??
                                  TEXT_NOTE_HEADER_FONT_DEFAULT_PX) + 1,
                              ),
                            })
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="property-form-checkbox-row">
                      <label className="property-form-checkbox">
                        <input
                          type="checkbox"
                          checked={resolvedSelectedTextNote.headerBold}
                          onChange={(event) =>
                            patchSelectedTextNote({ headerBold: event.target.checked })
                          }
                        />
                        Bold
                      </label>
                      <label className="property-form-checkbox">
                        <input
                          type="checkbox"
                          checked={resolvedSelectedTextNote.headerItalic}
                          onChange={(event) =>
                            patchSelectedTextNote({ headerItalic: event.target.checked })
                          }
                        />
                        Italic
                      </label>
                    </div>
                  </>
                ) : null}
                <label>
                  Width (px)
                  <input
                    type="number"
                    min={TEXT_NOTE_MIN_WIDTH_PX}
                    step={1}
                    value={resolvedSelectedTextNote.width}
                    onChange={(event) => {
                      const v = parseNumberOrNull(event.target.value)
                      if (v === null) {
                        return
                      }
                      patchSelectedTextNote({
                        width: clampTextNoteSize(v, resolvedSelectedTextNote.height).width,
                      })
                    }}
                  />
                </label>
                <label>
                  Height (px)
                  <input
                    type="number"
                    min={TEXT_NOTE_MIN_HEIGHT_PX}
                    step={1}
                    value={resolvedSelectedTextNote.height}
                    onChange={(event) => {
                      const v = parseNumberOrNull(event.target.value)
                      if (v === null) {
                        return
                      }
                      patchSelectedTextNote({
                        height: clampTextNoteSize(resolvedSelectedTextNote.width, v).height,
                      })
                    }}
                  />
                </label>
                <p className="note-section-label">Note body</p>
                <div className="note-font-size-field">
                  <span className="note-font-size-label">Body text size</span>
                  <div className="note-font-size-controls">
                    <button
                      type="button"
                      className="note-font-step-button"
                      aria-label="Decrease body font size"
                      title="Smaller"
                      onClick={() =>
                        patchSelectedTextNote({
                          textFontSizePx: clampTextFontSize(
                            resolvedSelectedTextNote.textFontSizePx - 1,
                          ),
                        })
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      className="note-font-size-input"
                      min={TEXT_NOTE_FONT_SIZE_MIN_PX}
                      max={TEXT_NOTE_FONT_SIZE_MAX_PX}
                      step={1}
                      value={resolvedSelectedTextNote.textFontSizePx}
                      onChange={(event) => {
                        const v = parseNumberOrNull(event.target.value)
                        if (v === null) {
                          return
                        }
                        patchSelectedTextNote({ textFontSizePx: clampTextFontSize(v) })
                      }}
                    />
                    <button
                      type="button"
                      className="note-font-step-button"
                      aria-label="Increase body font size"
                      title="Larger"
                      onClick={() =>
                        patchSelectedTextNote({
                          textFontSizePx: clampTextFontSize(
                            resolvedSelectedTextNote.textFontSizePx + 1,
                          ),
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="property-form-checkbox-row">
                  <label className="property-form-checkbox">
                    <input
                      type="checkbox"
                      checked={resolvedSelectedTextNote.textBold}
                      onChange={(event) =>
                        patchSelectedTextNote({ textBold: event.target.checked })
                      }
                    />
                    Bold
                  </label>
                  <label className="property-form-checkbox">
                    <input
                      type="checkbox"
                      checked={resolvedSelectedTextNote.textItalic}
                      onChange={(event) =>
                        patchSelectedTextNote({ textItalic: event.target.checked })
                      }
                    />
                    Italic
                  </label>
                </div>
                <label>
                  Body text
                  <textarea
                    value={selectedTextNote.text}
                    onChange={(event) => updateSelectedTextNote(event.target.value)}
                    rows={6}
                    spellCheck
                    placeholder="Description…"
                    style={{
                      fontSize: `${resolvedSelectedTextNote.textFontSizePx}px`,
                      fontWeight: resolvedSelectedTextNote.textBold ? 700 : 400,
                      fontStyle: resolvedSelectedTextNote.textItalic ? 'italic' : 'normal',
                    }}
                  />
                </label>
              </form>
            )}
            {selectedWire && !selectedComponent && !selectedTextNote && (
              <form className="property-form" aria-label={`Wire ${selectedWire.id}`}>
                <label>
                  Wire ID
                  <input className="property-form-id" value={selectedWire.id} readOnly spellCheck={false} />
                </label>
                <p className="hint">
                  {selectedWire.from.componentId}:{selectedWire.from.side} →{' '}
                  {selectedWire.to.componentId}:{selectedWire.to.side}
                </p>
                {isSimulating ? (
                  selectedWire.currentA != null ? (
                    <label>
                      Branch current (A)
                      <input type="text" readOnly value={String(selectedWire.currentA)} />
                    </label>
                  ) : (
                    <p className="hint">
                      After <strong>Calculate</strong>, series-loop solves show the same current on every
                      wire segment (KCL). Other topologies may leave this blank until extended.
                    </p>
                  )
                ) : (
                  <p className="hint">Turn on <strong>Simulate</strong> to see solved currents on wires.</p>
                )}
              </form>
            )}
            {!selectedComponent && !selectedTextNote && !selectedWire && (
              <p className="hint">
                Select a component, wire, or text note on the layout, choose the <strong>T</strong> tool to
                add notes, or use Export in the toolbar.
              </p>
            )}
            {selectedComponent && (
          <form
            className="property-form"
            id={`properties-panel-component-${selectedComponent.id}`}
            aria-label={`Component values for ${selectedComponent.id}`}
          >
            <label>
              Component ID
              <input
                className="property-form-id"
                id={`property-component-id-${selectedComponent.id}`}
                value={selectedComponent.id}
                readOnly
                spellCheck={false}
                aria-describedby={`property-component-id-hint-${selectedComponent.id}`}
              />
            </label>
            <p
              id={`property-component-id-hint-${selectedComponent.id}`}
              className="property-form-id-hint"
            >
              Same id as the canvas node (
              <code>{`layout-component-${selectedComponent.id}`}</code>) and wire endpoints; Calculate
              updates this part by id; locked parts keep certain specs while analysis still fills V/I/R
              where appropriate.
            </p>
            <label className="property-form-checkbox property-form-lock-row">
              <input
                type="checkbox"
                checked={isComponentPropertiesLocked(selectedComponent)}
                onChange={toggleSelectedPropertiesLocked}
                aria-describedby={`property-lock-hint-${selectedComponent.id}`}
              />
              Lock electrical properties
            </label>
            <p id={`property-lock-hint-${selectedComponent.id}`} className="hint hint--lock">
              When locked, fields below are read-only. If <strong>any</strong> part is locked but not all,{' '}
              <strong>Calculate</strong> needs <strong>exactly one</strong> unlocked part so it can be
              recomputed from the others. If <strong>every</strong> part is locked, Calculate still runs a
              full readout: wire currents (series loops) and voltages/currents where the solver can fill
              them without changing your locked specs. With <strong>no</strong> locks, Calculate works on
              all parts as before. You can still move and rotate the part.
            </p>
            <label>
              Component
              <input value={kindLabels[selectedComponent.kind]} readOnly />
            </label>
            <ComponentSpecPropertyFields
              component={selectedComponent}
              isSimulating={isSimulating}
              locked={isComponentPropertiesLocked(selectedComponent)}
              onNumericChange={updateSelectedValue}
              onLedColorChange={updateSelectedLedColor}
            />
          </form>
            )}
          </>
        )}
          </div>
        </aside>
      </div>
    </main>
  )
}

export default App
