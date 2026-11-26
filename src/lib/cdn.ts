/**
 * Heavy libraries loaded only when used (reading a PDF, exporting one), from a
 * pinned CDN version, so they don't weigh on the app bundle.
 */
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'

interface PdfTextItem {
  str: string
  hasEOL?: boolean
}
interface PdfDoc {
  numPages: number
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: PdfTextItem[] }> }>
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfDoc> }
}

let pdfjs: Promise<PdfJs> | null = null
const loadPdfJs = () =>
  (pdfjs ??= import(/* @vite-ignore */ PDFJS).then((m: PdfJs) => {
    m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
    return m
  }))

/** Page count and the text of the first pages (where the index is), one line per text line. */
export async function readPdfStart(file: File, pages = 8): Promise<{ numPages: number; text: string }> {
  const lib = await loadPdfJs()
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise
  let text = ''
  for (let p = 1; p <= Math.min(pages, doc.numPages); p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    for (const it of content.items) text += it.str + (it.hasEOL ? '\n' : '')
    text += '\n'
  }
  return { numPages: doc.numPages, text }
}

/** The subset of jsPDF used to write the plan. */
export interface JsPdf {
  internal: { pageSize: { getWidth(): number; getHeight(): number } }
  setFont(name: string, style?: string): JsPdf
  setFontSize(n: number): JsPdf
  setTextColor(r: number, g?: number, b?: number): JsPdf
  setDrawColor(r: number, g?: number, b?: number): JsPdf
  setFillColor(r: number, g?: number, b?: number): JsPdf
  setLineWidth(n: number): JsPdf
  text(t: string | string[], x: number, y: number, opts?: object): JsPdf
  splitTextToSize(t: string, w: number): string[]
  getTextWidth(t: string): number
  rect(x: number, y: number, w: number, h: number, style?: string): JsPdf
  line(x1: number, y1: number, x2: number, y2: number): JsPdf
  addPage(): JsPdf
  setPage(n: number): JsPdf
  getNumberOfPages(): number
  setProperties(p: object): JsPdf
  save(name: string): void
  output(type: 'blob'): Blob
}
type JsPdfCtor = new (opts: object) => JsPdf

const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'
let jspdf: Promise<JsPdfCtor> | null = null
/** jsPDF writes real text (searchable, light, any length), unlike tools that photograph the page. */
export function loadJsPdf(): Promise<JsPdfCtor> {
  return (jspdf ??= new Promise((resolve, reject) => {
    const w = window as unknown as { jspdf?: { jsPDF: JsPdfCtor } }
    if (w.jspdf) return resolve(w.jspdf.jsPDF)
    const s = document.createElement('script')
    s.src = JSPDF
    s.async = true
    s.onload = () => (w.jspdf ? resolve(w.jspdf.jsPDF) : reject(new Error('jsPDF no se ha cargado')))
    s.onerror = () => {
      jspdf = null
      reject(new Error('No se ha podido descargar el generador de PDF (¿sin conexión?)'))
    }
    document.head.appendChild(s)
  }))
}
