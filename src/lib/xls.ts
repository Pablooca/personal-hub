/**
 * Minimal reader for the legacy .xls files banks export (OLE2 container + BIFF8).
 * Reads the first sheet's cells; formulas use their cached value. No dependencies.
 */
export type Cell = string | number | null

const END = 0xfffffffe

function workbookStream(buf: Uint8Array): Uint8Array {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (buf.length < 512 || v.getUint32(0, true) !== 0xe011cfd0 || v.getUint32(4, true) !== 0xe11ab1a1) throw new Error('No es un archivo .xls')
  const ss = 1 << v.getUint16(30, true)
  const mss = 1 << v.getUint16(32, true)
  const sector = (n: number) => (n + 1) * ss
  const perFat = ss / 4
  // FAT: 109 entries in the header, the rest through the DIFAT chain.
  const fatSectors: number[] = []
  for (let i = 0; i < 109; i++) {
    const s = v.getUint32(76 + i * 4, true)
    if (s < END - 1) fatSectors.push(s)
  }
  let dif = v.getUint32(68, true)
  for (let guard = 0; dif < END - 1 && guard < 10_000; guard++) {
    for (let i = 0; i < perFat - 1; i++) {
      const s = v.getUint32(sector(dif) + i * 4, true)
      if (s < END - 1) fatSectors.push(s)
    }
    dif = v.getUint32(sector(dif) + ss - 4, true)
  }
  const next = (n: number) => v.getUint32(sector(fatSectors[Math.floor(n / perFat)]) + (n % perFat) * 4, true)
  const chain = (start: number, size?: number) => {
    const parts: Uint8Array[] = []
    let total = 0
    for (let n = start, guard = 0; n < END - 1 && guard < 1_000_000; n = next(n), guard++) {
      parts.push(buf.subarray(sector(n), sector(n) + ss))
      total += ss
      if (size !== undefined && total >= size) break
    }
    const out = new Uint8Array(total)
    let o = 0
    for (const p of parts) {
      out.set(p, o)
      o += p.length
    }
    return size === undefined ? out : out.subarray(0, size)
  }
  const dir = chain(v.getUint32(48, true))
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength)
  const entries = []
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = dv.getUint16(o + 64, true)
    let name = ''
    for (let i = 0; i + 2 < len; i += 2) name += String.fromCharCode(dv.getUint16(o + i, true))
    entries.push({ name, type: dir[o + 66], start: dv.getUint32(o + 116, true), size: dv.getUint32(o + 120, true) })
  }
  const root = entries.find((e) => e.type === 5)
  const wb = entries.find((e) => e.type === 2 && /^(workbook|book)$/i.test(e.name))
  if (!wb || !root) throw new Error('El archivo .xls no contiene ningún libro')
  if (wb.size >= v.getUint32(56, true)) return chain(wb.start, wb.size)
  // Small streams live in the mini stream.
  const mini = chain(root.start, root.size)
  const miniFat = chain(v.getUint32(60, true))
  const mf = new DataView(miniFat.buffer, miniFat.byteOffset, miniFat.byteLength)
  const out = new Uint8Array(wb.size)
  for (let n = wb.start, o = 0; n < END - 1 && o < wb.size; n = mf.getUint32(n * 4, true), o += mss) out.set(mini.subarray(n * mss, Math.min((n + 1) * mss, n * mss + wb.size - o)), o)
  return out
}

/** RK-encoded number. */
function rk(n: number): number {
  let x: number
  if (n & 2) x = n >> 2
  else {
    const d = new DataView(new ArrayBuffer(8))
    d.setUint32(4, n & 0xfffffffc, true)
    x = d.getFloat64(0, true)
  }
  return n & 1 ? x / 100 : x
}

/** Shared strings may be split between an SST record and its CONTINUE records. */
function readSst(chunks: Uint8Array[]): string[] {
  let c = 0
  let p = 8
  const count = new DataView(chunks[0].buffer, chunks[0].byteOffset).getUint32(4, true)
  const out: string[] = []
  const byte = () => {
    while (c < chunks.length && p >= chunks[c].length) {
      c++
      p = 0
    }
    return c < chunks.length ? chunks[c][p++] : 0
  }
  const u16 = () => byte() | (byte() << 8)
  const u32 = () => (u16() | (u16() << 16)) >>> 0
  for (let i = 0; i < count && c < chunks.length; i++) {
    const len = u16()
    let flags = byte()
    const runs = flags & 8 ? u16() : 0
    const ext = flags & 4 ? u32() : 0
    let s = ''
    for (let k = 0; k < len; k++) {
      // Text that crosses into a CONTINUE record repeats the encoding flag there.
      if (c < chunks.length && p >= chunks[c].length) {
        c++
        p = 0
        flags = (flags & ~1) | (byte() & 1)
      }
      s += String.fromCharCode(flags & 1 ? u16() : byte())
    }
    for (let k = 0; k < runs * 4 + ext; k++) byte()
    out.push(s)
  }
  return out
}

/** Rows of the first sheet (sparse cells are null). */
export function readXls(file: ArrayBuffer): Cell[][] {
  const wb = workbookStream(new Uint8Array(file))
  const v = new DataView(wb.buffer, wb.byteOffset, wb.byteLength)
  const rows: Cell[][] = []
  let sst: string[] = []
  let sheetStart = -1
  const set = (r: number, c: number, x: Cell) => {
    if (r > 65_535 || c > 255) return
    const row = (rows[r] ??= [])
    row[c] = x
  }
  const text = (o: number) => {
    const len = v.getUint16(o, true)
    const wide = wb[o + 2] & 1
    let s = ''
    for (let k = 0; k < len; k++) s += String.fromCharCode(wide ? v.getUint16(o + 3 + k * 2, true) : wb[o + 3 + k])
    return s
  }
  for (let o = 0; o + 4 <= wb.length; ) {
    const id = v.getUint16(o, true)
    const len = v.getUint16(o + 2, true)
    const d = o + 4
    if (id === 0x85 && sheetStart < 0) sheetStart = v.getUint32(d, true)
    else if (id === 0xfc) {
      const chunks = [wb.subarray(d, d + len)]
      let n = d + len
      while (n + 4 <= wb.length && v.getUint16(n, true) === 0x3c) {
        const l = v.getUint16(n + 2, true)
        chunks.push(wb.subarray(n + 4, n + 4 + l))
        n += 4 + l
      }
      sst = readSst(chunks)
    } else if (id === 0x0a && sheetStart >= 0 && o < sheetStart) {
      o = sheetStart
      continue
    } else if (id === 0x0a && o > sheetStart) break
    else if (sheetStart >= 0 && o >= sheetStart) {
      const r = len >= 4 ? v.getUint16(d, true) : 0
      const c = len >= 4 ? v.getUint16(d + 2, true) : 0
      if (id === 0xfd) set(r, c, sst[v.getUint32(d + 6, true)] ?? null)
      else if (id === 0x203) set(r, c, v.getFloat64(d + 6, true))
      else if (id === 0x27e) set(r, c, rk(v.getInt32(d + 6, true)))
      else if (id === 0xbd) for (let k = 0; k * 6 + 6 <= len - 4; k++) set(r, c + k, rk(v.getInt32(d + 4 + k * 6 + 2, true)))
      else if (id === 0x204) set(r, c, text(d + 6))
      else if (id === 0x06 && v.getUint16(d + 12, true) !== 0xffff) set(r, c, v.getFloat64(d + 6, true))
    }
    o = d + len
  }
  return Array.from(rows, (r) => Array.from(r ?? [], (x) => x ?? null))
}
