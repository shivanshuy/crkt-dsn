/** Public entry for layout id allocation — implementation is in `./layoutEntityIds`. */

export {
  COMPONENT_ID_PREFIXES,
  TEXT_NOTE_ID_PREFIX,
  WIRE_ID_PREFIX,
  createComponentId,
  createTextNoteId,
  createWireId,
  resetLayoutEntityIdCounters,
} from './layoutEntityIds'
