/**
 * render-flowchart.ts
 *
 * Lightweight flowchart renderer for Mermaid `flowchart TB/LR` subset.
 * Runs both server-side and client-side — no DOM needed, pure string output.
 */

const THEME = {
  nodeFill: '#0d2b22',
  nodeStroke: '#10b981',
  nodeStrokeWidth: 2,
  nodeRadius: 12,
  nodeTextColor: '#e2e8f0',
  cylinderFill: '#0d2b22',
  cylinderStroke: '#10b981',
  edgeColor: '#10b981',
  edgeWidth: 2,
  arrowSize: 8,
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 14,
  lineHeight: 20,
  nodePaddingX: 28,
  nodePaddingY: 16,
  gapX: 60,
  gapY: 60,
}

interface NodeDef {
  id: string
  label: string
  shape: 'rect' | 'cylinder' | 'rounded'
}

interface Edge {
  from: string
  to: string
}

interface MeasuredNode extends NodeDef {
  labelLines: string[]
  w: number
  h: number
  x: number
  y: number
}

// ── Parser ──────────────────────────────────────────────────────────────────

function parse(source: string) {
  const lines = source.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('%%'))
  let direction = 'TB'
  const nodes = new Map<string, NodeDef>()
  const edges: Edge[] = []

  for (const line of lines) {
    const dirMatch = line.match(/^flowchart\s+(TB|BT|LR|RL)\s*$/i)
    if (dirMatch) { direction = dirMatch[1].toUpperCase(); continue }
    if (/^flowchart\s*$/i.test(line)) continue
    if (/^graph\s/i.test(line)) {
      const gm = line.match(/^graph\s+(TB|BT|LR|RL)/i)
      if (gm) direction = gm[1].toUpperCase()
      continue
    }

    if (line.includes('-->')) {
      const segments = line.split(/\s*-->\s*/)
      const segIds = segments.map(seg => parseNodeDecl(seg, nodes))
      for (let i = 0; i < segIds.length - 1; i++) {
        if (segIds[i] && segIds[i + 1]) edges.push({ from: segIds[i]!, to: segIds[i + 1]! })
      }
      continue
    }

    parseNodeDecl(line, nodes)
  }

  return { direction, nodes, edges }
}

function parseNodeDecl(segment: string, nodes: Map<string, NodeDef>): string | null {
  segment = segment.trim()
  if (!segment) return null

  let m: RegExpMatchArray | null

  // Cylinder: ID[("Label")]
  m = segment.match(/^([A-Za-z_]\w*)\s*\[\(\s*"([^"]*)"\s*\)\]$/)
  if (m) { nodes.set(m[1], { id: m[1], label: m[2], shape: 'cylinder' }); return m[1] }

  // Cylinder alt: ID(["Label"])
  m = segment.match(/^([A-Za-z_]\w*)\s*\(\[\s*"([^"]*)"\s*\]\)$/)
  if (m) { nodes.set(m[1], { id: m[1], label: m[2], shape: 'cylinder' }); return m[1] }

  // Rect: ID["Label"]
  m = segment.match(/^([A-Za-z_]\w*)\s*\[\s*"([^"]*)"\s*\]$/)
  if (m) { nodes.set(m[1], { id: m[1], label: m[2], shape: 'rect' }); return m[1] }

  // Rounded: ID("Label")
  m = segment.match(/^([A-Za-z_]\w*)\s*\(\s*"([^"]*)"\s*\)$/)
  if (m) { nodes.set(m[1], { id: m[1], label: m[2], shape: 'rounded' }); return m[1] }

  // Plain ID
  m = segment.match(/^([A-Za-z_]\w*)$/)
  if (m) {
    if (!nodes.has(m[1])) nodes.set(m[1], { id: m[1], label: m[1], shape: 'rect' })
    return m[1]
  }

  return null
}

// ── Layout ──────────────────────────────────────────────────────────────────

function layout(parsed: ReturnType<typeof parse>) {
  const { direction, nodes, edges } = parsed
  const isVertical = direction === 'TB' || direction === 'BT'

  const measured = new Map<string, MeasuredNode>()
  for (const [id, node] of nodes) {
    const labelLines = node.label.replace(/\\n/g, '\n').split('\n')
    const maxLineChars = Math.max(...labelLines.map(l => l.length))
    const textWidth = maxLineChars * THEME.fontSize * 0.62
    const textHeight = labelLines.length * THEME.lineHeight
    const w = Math.max(textWidth + THEME.nodePaddingX * 2, 80)
    const h = textHeight + THEME.nodePaddingY * 2 + (node.shape === 'cylinder' ? 16 : 0)
    measured.set(id, { ...node, labelLines, w, h, x: 0, y: 0 })
  }

  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  for (const id of nodes.keys()) { children.set(id, []); parents.set(id, []) }
  for (const e of edges) {
    children.get(e.from)?.push(e.to)
    parents.get(e.to)?.push(e.from)
  }

  const layers = new Map<string, number>()
  const roots = [...nodes.keys()].filter(id => (parents.get(id)?.length ?? 0) === 0)
  if (roots.length === 0 && nodes.size > 0) roots.push([...nodes.keys()][0])

  function assignLayer(id: string, layer: number) {
    if (layers.has(id) && layers.get(id)! >= layer) return
    layers.set(id, layer)
    for (const child of children.get(id) || []) assignLayer(child, layer + 1)
  }
  for (const root of roots) assignLayer(root, 0)
  for (const id of nodes.keys()) { if (!layers.has(id)) layers.set(id, 0) }

  // Backward pass: pull nodes down toward their children (tight edge minimization)
  // This places nodes with only lower connections (like WAWI -> DB) in the layer directly above their target
  const nodesByLayerDesc = [...nodes.keys()].sort((a, b) => (layers.get(b) ?? 0) - (layers.get(a) ?? 0))
  for (const id of nodesByLayerDesc) {
    const nodeChildren = children.get(id) || []
    if (nodeChildren.length > 0) {
      const minChildLayer = Math.min(...nodeChildren.map(c => layers.get(c) ?? 0))
      const targetLayer = minChildLayer - 1
      const maxParentLayer = (parents.get(id) || []).length > 0
        ? Math.max(...(parents.get(id) || []).map(p => layers.get(p) ?? 0))
        : -1
      if (targetLayer > (layers.get(id) ?? 0) && targetLayer > maxParentLayer) {
        layers.set(id, targetLayer)
      }
    }
  }

  const layerGroups = new Map<number, string[]>()
  for (const id of nodes.keys()) {
    const layer = layers.get(id) ?? 0
    if (!layerGroups.has(layer)) layerGroups.set(layer, [])
    layerGroups.get(layer)!.push(id)
  }

  const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b)
  const crossGap = isVertical ? THEME.gapX : THEME.gapY

  // Compute main-axis (Y for TB, X for LR) offsets for each layer
  let currentMain = 40
  const layerMainPos = new Map<number, number>()
  for (const layerIdx of sortedLayers) {
    const group = layerGroups.get(layerIdx)!
    const mainSizes = group.map(id => { const m = measured.get(id)!; return isVertical ? m.h : m.w })
    layerMainPos.set(layerIdx, currentMain)
    currentMain += Math.max(...mainSizes) + (isVertical ? THEME.gapY : THEME.gapX)
  }

  // Find anchor layer (layer with largest total cross-axis extent)
  let anchorLayerIdx = sortedLayers[0]
  let maxExtent = -1
  for (const layerIdx of sortedLayers) {
    const group = layerGroups.get(layerIdx)!
    const sizes = group.map(id => { const m = measured.get(id)!; return isVertical ? m.w : m.h })
    const total = sizes.reduce((sum, s) => sum + s, 0) + Math.max(0, sizes.length - 1) * crossGap
    if (total > maxExtent) {
      maxExtent = total
      anchorLayerIdx = layerIdx
    }
  }

  const positions = new Map<string, { x: number; y: number }>()

  // Position anchor layer sequentially from 0
  let offset = 0
  for (const id of layerGroups.get(anchorLayerIdx)!) {
    const m = measured.get(id)!
    const size = isVertical ? m.w : m.h
    positions.set(id, {
      x: isVertical ? offset : layerMainPos.get(anchorLayerIdx)!,
      y: isVertical ? layerMainPos.get(anchorLayerIdx)! : offset,
    })
    offset += size + crossGap
  }

  // Place a layer's nodes centered relative to their connected contributors
  function placeLayer(layerIdx: number, isDown: boolean) {
    const group = layerGroups.get(layerIdx)!
    const mainPos = layerMainPos.get(layerIdx)!

    const desiredCenters = group.map(id => {
      const connected = isDown
        ? (parents.get(id) || []).filter(p => positions.has(p))
        : (children.get(id) || []).filter(c => positions.has(c))

      if (connected.length > 0) {
        const minCross = Math.min(...connected.map(c => isVertical ? positions.get(c)!.x : positions.get(c)!.y))
        const maxCross = Math.max(...connected.map(c => {
          const m = measured.get(c)!
          return (isVertical ? positions.get(c)!.x + m.w : positions.get(c)!.y + m.h)
        }))
        return (minCross + maxCross) / 2
      }
      return maxExtent / 2
    })

    if (group.length === 1) {
      const id = group[0]
      const m = measured.get(id)!
      const size = isVertical ? m.w : m.h
      const cross = desiredCenters[0] - size / 2
      positions.set(id, {
        x: isVertical ? cross : mainPos,
        y: isVertical ? mainPos : cross,
      })
      return
    }

    // Multiple nodes: place with desired centers while preventing overlaps
    let currentCross = desiredCenters[0] - (isVertical ? measured.get(group[0])!.w : measured.get(group[0])!.h) / 2
    for (let i = 0; i < group.length; i++) {
      const id = group[i]
      const m = measured.get(id)!
      const size = isVertical ? m.w : m.h
      const idealCross = desiredCenters[i] - size / 2
      currentCross = Math.max(currentCross, idealCross)
      positions.set(id, {
        x: isVertical ? currentCross : mainPos,
        y: isVertical ? mainPos : currentCross,
      })
      currentCross += size + crossGap
    }
  }

  // Downward propagation from anchor + 1
  for (let i = sortedLayers.indexOf(anchorLayerIdx) + 1; i < sortedLayers.length; i++) {
    placeLayer(sortedLayers[i], true)
  }

  // Upward propagation from anchor - 1
  for (let i = sortedLayers.indexOf(anchorLayerIdx) - 1; i >= 0; i--) {
    placeLayer(sortedLayers[i], false)
  }

  // Normalize: ensure minimum cross coordinate is at 0
  let minCross = Infinity
  for (const [, pos] of positions) {
    minCross = Math.min(minCross, isVertical ? pos.x : pos.y)
  }
  if (minCross < 0) {
    for (const [, pos] of positions) {
      if (isVertical) pos.x -= minCross
      else pos.y -= minCross
    }
  }

  for (const [id, pos] of positions) { measured.get(id)!.x = pos.x; measured.get(id)!.y = pos.y }

  return { measured, edges, isVertical }
}

// ── SVG Rendering ───────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderSvg(layoutResult: ReturnType<typeof layout>): string {
  const { measured, edges, isVertical } = layoutResult
  const parts: string[] = []

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [, n] of measured) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h)
  }
  const pad = 30

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}" style="width:100%;height:auto;min-height:280px;max-width:100%;background:transparent;">`)
  // refX=0 attaches the line to the BACK of the arrow; the tip extends forward by arrowSize
  parts.push(`<defs><marker id="arrowhead" markerWidth="${THEME.arrowSize}" markerHeight="${THEME.arrowSize}" refX="0" refY="${THEME.arrowSize / 2}" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, ${THEME.arrowSize} ${THEME.arrowSize / 2}, 0 ${THEME.arrowSize}" fill="${THEME.edgeColor}" /></marker></defs>`)

  for (const edge of edges) {
    const from = measured.get(edge.from); const to = measured.get(edge.to)
    if (!from || !to) continue
    const fromCx = from.x + from.w / 2, fromCy = from.y + from.h / 2
    const toCx = to.x + to.w / 2, toCy = to.y + to.h / 2
    let x1: number, y1: number, x2: number, y2: number
    if (isVertical) {
      x1 = fromCx
      x2 = toCx
      if (fromCy < toCy) {
        y1 = from.y + from.h
        // Stop line arrowSize before node top border so arrow tip touches the border
        y2 = to.y - THEME.arrowSize
      } else {
        y1 = from.y
        y2 = to.y + to.h + THEME.arrowSize
      }
      const midY = (y1 + y2) / 2
      parts.push(`<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="${THEME.edgeColor}" stroke-width="${THEME.edgeWidth}" marker-end="url(#arrowhead)" />`)
    } else {
      y1 = fromCy
      y2 = toCy
      if (fromCx < toCx) {
        x1 = from.x + from.w
        x2 = to.x - THEME.arrowSize
      } else {
        x1 = from.x
        x2 = to.x + to.w + THEME.arrowSize
      }
      const midX = (x1 + x2) / 2
      parts.push(`<path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" fill="none" stroke="${THEME.edgeColor}" stroke-width="${THEME.edgeWidth}" marker-end="url(#arrowhead)" />`)
    }
  }

  for (const [, node] of measured) {
    const { x, y, w, h, shape, labelLines } = node
    if (shape === 'cylinder') {
      const ry = 10; const bodyH = h - ry * 2
      parts.push(`<path d="M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + ry + bodyH} A ${w / 2} ${ry} 0 0 1 ${x} ${y + ry + bodyH} Z" fill="${THEME.cylinderFill}" stroke="${THEME.cylinderStroke}" stroke-width="${THEME.nodeStrokeWidth}" />`)
      parts.push(`<ellipse cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="${THEME.cylinderFill}" stroke="${THEME.cylinderStroke}" stroke-width="${THEME.nodeStrokeWidth}" />`)
    } else {
      const r = shape === 'rounded' ? h / 2 : THEME.nodeRadius
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${THEME.nodeFill}" stroke="${THEME.nodeStroke}" stroke-width="${THEME.nodeStrokeWidth}" />`)
    }
    const textX = x + w / 2
    const totalTextH = labelLines.length * THEME.lineHeight
    const textStartY = y + (h - totalTextH) / 2 + THEME.lineHeight * 0.75
    for (let li = 0; li < labelLines.length; li++) {
      parts.push(`<text x="${textX}" y="${textStartY + li * THEME.lineHeight}" text-anchor="middle" fill="${THEME.nodeTextColor}" font-family="${THEME.fontFamily}" font-size="${THEME.fontSize}px">${escapeXml(labelLines[li])}</text>`)
    }
  }

  parts.push(`</svg>`)
  return parts.join('\n')
}

// ── Public API ──────────────────────────────────────────────────────────────

export function renderFlowchart(source: string): string {
  const parsed = parse(source)
  const layoutResult = layout(parsed)
  return renderSvg(layoutResult)
}
