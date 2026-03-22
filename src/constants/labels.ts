import {
  COMPONENT_KIND_LABELS,
  SUPPORTED_COMPONENT_KINDS,
} from '../config/supportedComponents'
import type { ComponentKind, Tool } from '../types/circuit'

const componentToolLabels = SUPPORTED_COMPONENT_KINDS.reduce(
  (acc, kind) => {
    acc[kind] = COMPONENT_KIND_LABELS[kind]
    return acc
  },
  {} as Record<ComponentKind, string>,
)

export const toolLabels = {
  none: '',
  ...componentToolLabels,
  wire: 'Wire',
  text: 'Text note',
} as const satisfies Record<Tool, string>

/** Display name per schematic kind (Calculate messages, properties, canvas). */
export const kindLabels: Record<ComponentKind, string> = COMPONENT_KIND_LABELS
