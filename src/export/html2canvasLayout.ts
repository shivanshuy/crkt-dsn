import type { Options } from 'html2canvas'

/** Options for exporting the schematic canvas (excludes sim animation dot). */
export function getLayoutExportHtml2CanvasOptions(): Partial<Options> {
  return {
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    useCORS: true,
    ignoreElements: (node) =>
      node instanceof Element && node.classList.contains('sim-dot'),
    onclone: (clonedDoc) => {
      clonedDoc.querySelectorAll('.sim-dot').forEach((el) => el.remove())
    },
  }
}
