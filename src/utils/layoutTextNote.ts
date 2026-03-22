import type { LayoutTextNote } from '../types/circuit'
import {
  TEXT_NOTE_DEFAULT_HEIGHT_PX,
  TEXT_NOTE_DEFAULT_WIDTH_PX,
  TEXT_NOTE_FONT_SIZE_DEFAULT_PX,
  TEXT_NOTE_FONT_SIZE_MAX_PX,
  TEXT_NOTE_FONT_SIZE_MIN_PX,
  TEXT_NOTE_HEADER_FONT_DEFAULT_PX,
  TEXT_NOTE_MIN_HEIGHT_PX,
  TEXT_NOTE_MIN_WIDTH_PX,
} from '../constants/layout'

export type ResolvedLayoutTextNote = LayoutTextNote & {
  width: number
  height: number
  showHeader: boolean
  headerText: string
  headerFontSizePx: number
  headerBold: boolean
  headerItalic: boolean
  textFontSizePx: number
  textBold: boolean
  textItalic: boolean
}

export function clampTextFontSize(px: number) {
  return Math.max(
    TEXT_NOTE_FONT_SIZE_MIN_PX,
    Math.min(TEXT_NOTE_FONT_SIZE_MAX_PX, Math.round(px)),
  )
}

export function resolveLayoutTextNote(note: LayoutTextNote): ResolvedLayoutTextNote {
  return {
    ...note,
    width: Math.max(TEXT_NOTE_MIN_WIDTH_PX, note.width ?? TEXT_NOTE_DEFAULT_WIDTH_PX),
    height: Math.max(TEXT_NOTE_MIN_HEIGHT_PX, note.height ?? TEXT_NOTE_DEFAULT_HEIGHT_PX),
    showHeader: note.showHeader ?? true,
    headerText: note.headerText ?? 'T',
    headerFontSizePx: clampTextFontSize(
      note.headerFontSizePx ?? TEXT_NOTE_HEADER_FONT_DEFAULT_PX,
    ),
    headerBold: note.headerBold ?? true,
    headerItalic: note.headerItalic ?? false,
    textFontSizePx: clampTextFontSize(note.textFontSizePx ?? TEXT_NOTE_FONT_SIZE_DEFAULT_PX),
    textBold: note.textBold ?? false,
    textItalic: note.textItalic ?? false,
  }
}

export function clampTextNoteSize(width: number, height: number) {
  return {
    width: Math.max(TEXT_NOTE_MIN_WIDTH_PX, Math.round(width)),
    height: Math.max(TEXT_NOTE_MIN_HEIGHT_PX, Math.round(height)),
  }
}
