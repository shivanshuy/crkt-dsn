import { useEffect, useRef } from 'react'
import {
  TEXT_NOTE_MIN_HEIGHT_PX,
  TEXT_NOTE_MIN_WIDTH_PX,
} from '../../constants/layout'
import type { LayoutTextNote } from '../../types/circuit'
import { resolveLayoutTextNote } from '../../utils/layoutTextNote'

type Props = {
  note: LayoutTextNote
  selected: boolean
  onPatch: (id: string, patch: Partial<LayoutTextNote>) => void
  onSelect: (event: React.MouseEvent, note: LayoutTextNote) => void
  onBeginDrag: (event: React.MouseEvent, note: LayoutTextNote) => void
  onTextChange: (id: string, text: string) => void
}

export function LayoutTextNoteCanvas({
  note,
  selected,
  onPatch,
  onSelect,
  onBeginDrag,
  onTextChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef(note)
  const onPatchRef = useRef(onPatch)
  noteRef.current = note
  onPatchRef.current = onPatch

  const resolved = resolveLayoutTextNote(note)
  const showHeader = resolved.showHeader

  useEffect(() => {
    const el = rootRef.current
    if (!el) {
      return
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      const box = entry.borderBoxSize?.[0]
      const w = Math.round(box?.inlineSize ?? entry.target.getBoundingClientRect().width)
      const h = Math.round(box?.blockSize ?? entry.target.getBoundingClientRect().height)
      if (w < TEXT_NOTE_MIN_WIDTH_PX || h < TEXT_NOTE_MIN_HEIGHT_PX) {
        return
      }
      const n = noteRef.current
      const r = resolveLayoutTextNote(n)
      if (Math.abs(w - r.width) <= 1 && Math.abs(h - r.height) <= 1) {
        return
      }
      onPatchRef.current(n.id, { width: w, height: h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [note.id])

  return (
    <div
      ref={rootRef}
      className={`layout-text-note${selected ? ' selected' : ''}${showHeader ? '' : ' layout-text-note--no-header'}`}
      style={{
        left: note.x,
        top: note.y,
        width: resolved.width,
        height: resolved.height,
        minWidth: TEXT_NOTE_MIN_WIDTH_PX,
        minHeight: TEXT_NOTE_MIN_HEIGHT_PX,
      }}
      onClick={(event) => onSelect(event, note)}
      onMouseDown={(event) => {
        if (showHeader) {
          return
        }
        if ((event.target as HTMLElement).closest('textarea')) {
          return
        }
        onBeginDrag(event, note)
      }}
      role="group"
      aria-label="Layout text note"
    >
      {showHeader ? (
        <div
          className="layout-text-note-drag"
          style={{
            fontSize: `${resolved.headerFontSizePx}px`,
            fontWeight: resolved.headerBold ? 700 : 400,
            fontStyle: resolved.headerItalic ? 'italic' : 'normal',
          }}
          onMouseDown={(event) => {
            event.stopPropagation()
            onBeginDrag(event, note)
          }}
          title="Drag to move"
        >
          {resolved.headerText}
        </div>
      ) : null}
      <textarea
        className="layout-text-note-input"
        style={{
          fontSize: `${resolved.textFontSizePx}px`,
          fontWeight: resolved.textBold ? 700 : 400,
          fontStyle: resolved.textItalic ? 'italic' : 'normal',
        }}
        value={note.text}
        onChange={(event) => onTextChange(note.id, event.target.value)}
        onMouseDown={(event) => event.stopPropagation()}
        placeholder="Description…"
        spellCheck
      />
    </div>
  )
}
