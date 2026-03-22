import { jsPDF } from 'jspdf'

const PAGE_MARGIN_MM = 10

/**
 * Embeds a raster snapshot (from html2canvas) in a single A4 PDF, scaled to fit with margins.
 */
export function downloadLayoutPdf(canvas: HTMLCanvasElement, baseFileName: string): void {
  const wPx = canvas.width
  const hPx = canvas.height
  if (wPx < 1 || hPx < 1) {
    throw new Error('Invalid canvas size for PDF')
  }

  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({
    orientation: wPx >= hPx ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const maxW = pageW - 2 * PAGE_MARGIN_MM
  const maxH = pageH - 2 * PAGE_MARGIN_MM

  const imgAspect = wPx / hPx
  const boxAspect = maxW / maxH

  let drawW: number
  let drawH: number
  if (imgAspect > boxAspect) {
    drawW = maxW
    drawH = maxW / imgAspect
  } else {
    drawH = maxH
    drawW = maxH * imgAspect
  }

  const x = PAGE_MARGIN_MM + (maxW - drawW) / 2
  const y = PAGE_MARGIN_MM + (maxH - drawH) / 2

  pdf.addImage(imgData, 'PNG', x, y, drawW, drawH)
  pdf.save(`${baseFileName}.pdf`)
}
