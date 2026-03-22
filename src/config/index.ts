export {
  COMPONENT_DEFAULTS,
  DEFAULT_LED_COLOR,
  getLedDefaults,
  LED_COLOR_OPTIONS,
  type LedColor,
} from './componentDefaults'
export {
  COMPONENT_KIND_ID_PREFIXES,
  COMPONENT_KIND_LABELS,
  DEFAULT_PROPERTIES_LOCKED_BY_KIND,
  SUPPORTED_CIRCUIT_COMPONENTS,
  SUPPORTED_COMPONENT_KINDS,
  defaultPropertiesLocked,
  isComponentKind,
  isComponentPlacementTool,
  type ComponentKind,
  type SupportedCircuitComponentDescriptor,
} from './supportedComponents'
export {
  COMPONENT_PROPERTY_FIELD_LABELS,
  COMPONENT_PROPERTY_UI,
  getComponentCanvasLabelFields,
  getComponentPropertyFields,
  getComponentPropertyHint,
  type CanvasLabelFieldSimulate,
  type ComponentKindPropertyUi,
  type ComponentPropertyField,
  type PropertyPanelHint,
} from './componentPropertyUi'
/** Re-export id allocation — canonical implementation: `src/ids/layoutEntityIds.ts`. */
export {
  COMPONENT_ID_PREFIXES,
  TEXT_NOTE_ID_PREFIX,
  WIRE_ID_PREFIX,
  createComponentId,
  createTextNoteId,
  createWireId,
} from '../ids'
