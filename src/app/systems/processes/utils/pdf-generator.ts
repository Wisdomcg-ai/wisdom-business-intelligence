import jsPDF from 'jspdf'
import type { ProcessSnapshot, ProcessStepData, DecisionOption } from '@/types/process-builder'
import { calculateSVGLayout, SVG, type LayoutOverrides } from './svg-layout'
import { calculateAllConnectorPaths } from './connector-math'

// PDF Generator v8 — white cards, teal connectors, fit-to-page scaling
// ─── Color palette ──────────────────────────────────────────────────

const COLORS = {
  navy: [62, 63, 87] as [number, number, number],
  orange: [232, 119, 34] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  gray: [148, 163, 184] as [number, number, number],
  darkGray: [75, 85, 99] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  text: [30, 41, 59] as [number, number, number],
  subtext: [100, 116, 139] as [number, number, number],
  green: [16, 185, 129] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  blue: [59, 130, 246] as [number, number, number],
}

const FLOW_COLOR_MAP: Record<string, [number, number, number]> = {
  green: [16, 185, 129],
  red: [239, 68, 68],
  blue: [59, 130, 246],
  orange: [232, 119, 34],
}

export interface PDFExportOptions {
  paperSize: 'a3' | 'a4'
  showAnnotations: boolean
  showLegend: boolean
}

function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

// ─── Main export ─────────────────────────────────────────────────────

export function generateProcessPDF(
  snapshot: ProcessSnapshot,
  processName: string,
  options: PDFExportOptions
): jsPDF {
  const sorted = [...snapshot.swimlanes].sort((a, b) => a.order - b.order)

  // First pass: calculate default layout to measure column count
  const defaultLayout = calculateSVGLayout(sorted, snapshot.steps, snapshot.flows, undefined, undefined, snapshot.phases)
  const columnCount = defaultLayout.columnCount

  // Lane heights with compact annotation space (single-line text, no pills)
  const pdfOverrides: LayoutOverrides = columnCount > 14
    ? { cardW: 100, gapX: 20, laneH: 115, sidebarW: 44, pad: 14, branchOffsetY: 55 }
    : columnCount > 10
    ? { cardW: 120, gapX: 25, laneH: 130, sidebarW: 48, pad: 16, branchOffsetY: 60 }
    : columnCount > 8
    ? { cardW: 140, gapX: 35, laneH: 140, sidebarW: 56, pad: 20 }
    : { laneH: 150 }

  // Don't pass processName — PDF has its own header, no need for in-diagram title offset
  const layout = calculateSVGLayout(sorted, snapshot.steps, snapshot.flows, undefined, pdfOverrides, snapshot.phases)

  // ─── Page sizing: scale by width, page height flexes to content ─────
  const standardW = options.paperSize === 'a3' ? 420 : 297
  const maxW = standardW * 2
  const headerH = 12
  const footerH = options.showLegend ? 14 : 6
  const margin = 8

  // Scale to fit standard page width; expand page if scale would be too small
  const scaleByStdW = Math.min((standardW - margin * 2) / layout.totalW, 1)
  const scaleByMaxW = (maxW - margin * 2) / layout.totalW
  const scale = scaleByStdW >= 0.25 ? scaleByStdW : Math.min(scaleByMaxW, 1)

  // Page width: standard unless diagram needs more room
  const contentW = layout.totalW * scale + margin * 2
  const pageW = Math.max(standardW, Math.min(maxW, contentW))

  // Page height flexes to fit content — no vertical cramping
  const diagramH = layout.totalH * scale
  const minPageH = options.paperSize === 'a3' ? 297 : 210
  const pageH = Math.max(minPageH, diagramH + headerH + footerH + margin * 2)
  const availableH = pageH - headerH - footerH - margin * 2

  // Center the diagram
  const diagramW = layout.totalW * scale
  const offsetX = margin + Math.max(0, (pageW - margin * 2 - diagramW) / 2)
  const offsetY = headerH + margin + Math.max(0, (availableH - diagramH) / 2)

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [pageW, pageH],
  })

  // ─── Coordinate transforms ────────────────────────────────────
  const px = (x: number) => offsetX + x * scale
  const py = (y: number) => offsetY + y * scale
  const ps = (s: number) => s * scale

  // ─── Font sizes: absolute floors ensure readability ───────────
  const effectiveCardW = pdfOverrides?.cardW ?? SVG.CARD_W
  const cardW_mm = effectiveCardW * scale
  const fontCard = Math.max(7, Math.min(10, cardW_mm * 0.22))
  const fontAnnotation = Math.max(5.5, Math.min(7, cardW_mm * 0.16))
  const fontBadge = Math.max(4, Math.min(6, cardW_mm * 0.14))
  const fontPhase = Math.max(9, Math.min(13, cardW_mm * 0.28))
  const fontLane = Math.max(7, Math.min(9, cardW_mm * 0.22))
  const fontFlowLabel = Math.max(5.5, Math.min(7, cardW_mm * 0.18))

  // ─── Header: simple centered title on white ─────────────────
  doc.setTextColor(...COLORS.text)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(processName, pageW / 2, 8, { align: 'center' })

  // ─── Phase zones: full-height colored border + header bar (like Trades PDF) ─────
  if (layout.phaseHeaders.length > 0) {
    const phHeaderY = py(pdfOverrides?.pad ?? SVG.PAD)
    const phHeaderH = ps(SVG.PHASE_HEADER_H - 4)

    // Zone extends from header top to bottom of last lane
    const lastLane = layout.lanePositions[layout.lanePositions.length - 1]
    const zoneBottom = lastLane ? py(lastLane.y + lastLane.h) : phHeaderY + phHeaderH
    const zoneH = zoneBottom - phHeaderY
    const bodyY = phHeaderY + phHeaderH

    layout.phaseHeaders.forEach((phase, idx) => {
      const bgColor = hexToRGB(phase.color.bg)
      const txtColor = hexToRGB(phase.color.text)
      const phX = px(phase.x)
      const phW = ps(phase.w)

      // Header bar only — no border outline (SVG uses 4% opacity tint which is barely visible)
      doc.setFillColor(...bgColor)
      doc.rect(phX, phHeaderY, phW, phHeaderH, 'F')

      // Phase label
      doc.setTextColor(...txtColor)
      doc.setFontSize(fontPhase)
      doc.setFont('helvetica', 'bold')
      doc.text(phase.name, phX + phW / 2, phHeaderY + phHeaderH / 2 + fontPhase * 0.15, { align: 'center' })
    })
  }

  // ─── Swimlane rows ────────────────────────────────────────────
  layout.lanePositions.forEach((lane) => {
    const barColor = hexToRGB(lane.color.border)
    const tintColor = hexToRGB(lane.color.tint)

    // Lane background tint
    doc.setFillColor(...tintColor)
    doc.rect(px(0), py(lane.y), ps(layout.totalW), ps(lane.h), 'F')

    // Colored sidebar bar (matches SVG sidebar)
    const lnSidebarW = pdfOverrides?.sidebarW ?? SVG.SIDEBAR_W
    doc.setFillColor(...barColor)
    doc.rect(px(0), py(lane.y), ps(lnSidebarW), ps(lane.h), 'F')

    // Rotated lane label — manually centered in sidebar
    // jsPDF's align:'center' only shifts x (broken for rotated text), so we center manually.
    // angle:90 = CCW = text reads bottom-to-top, matching SVG rotate(-90).
    const lnFontSize = Math.max(10, fontLane)
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(lnFontSize)
    doc.setFont('helvetica', 'bold')
    const label = lane.name.length > 22 ? lane.name.slice(0, 20) + '...' : lane.name
    const textW = doc.getTextWidth(label) // mm
    // Text flows upward from anchor → shift anchor DOWN by textW/2 to center vertically
    const lnCy = py(lane.y + lane.h / 2) + textW / 2
    // After 90° CCW rotation, characters extend LEFT of anchor → shift RIGHT to center in sidebar
    const baselineShift = lnFontSize * 0.35 * 0.3528 // pt → mm
    const lnCx = px(lnSidebarW / 2) + baselineShift
    doc.text(label, lnCx, lnCy, { angle: 90 })
  })

  // ─── Connectors (drawn behind cards) ──────────────────────────
  const allPaths = calculateAllConnectorPaths(
    snapshot.flows,
    snapshot.steps,
    layout.stepPositions,
    layout.lanePositions,
    layout.stepLaneMap
  )

  snapshot.flows.forEach((flow) => {
    const connector = allPaths.get(flow.id)
    if (!connector) return

    const color: [number, number, number] = (flow.condition_color && FLOW_COLOR_MAP[flow.condition_color]) || [13, 148, 136]  // teal #0D9488

    doc.setDrawColor(...color)
    doc.setLineWidth(Math.max(0.5, 1.0 * scale))

    // Draw line segments
    for (let i = 0; i < connector.points.length - 1; i++) {
      const p1 = connector.points[i]
      const p2 = connector.points[i + 1]
      doc.line(px(p1.x), py(p1.y), px(p2.x), py(p2.y))
    }

    // Direction-aware arrowhead
    if (connector.points.length >= 2) {
      const last = connector.points[connector.points.length - 1]
      const prev = connector.points[connector.points.length - 2]
      const angle = Math.atan2(py(last.y) - py(prev.y), px(last.x) - px(prev.x))
      const arrowLen = Math.max(2, 3 * scale)
      const arrowW = arrowLen * 0.55

      doc.setFillColor(...color)
      const tipX = px(last.x)
      const tipY = py(last.y)
      const x1 = tipX - arrowLen * Math.cos(angle) + arrowW * Math.sin(angle)
      const y1 = tipY - arrowLen * Math.sin(angle) - arrowW * Math.cos(angle)
      const x2 = tipX - arrowLen * Math.cos(angle) - arrowW * Math.sin(angle)
      const y2 = tipY - arrowLen * Math.sin(angle) + arrowW * Math.cos(angle)
      doc.triangle(tipX, tipY, x1, y1, x2, y2, 'F')
    }

    // Condition label pill — skip for decision sources (diamond already shows Yes/No labels)
    const fromStep = snapshot.steps.find((s) => s.id === flow.from_step_id)
    if (connector.label && connector.labelPosition && fromStep?.step_type !== 'decision') {
      const lx = px(connector.labelPosition.x)
      const ly = py(connector.labelPosition.y)
      doc.setFontSize(fontFlowLabel)
      doc.setFont('helvetica', 'bold')
      const labelW = doc.getTextWidth(connector.label) + 5
      const labelH = fontFlowLabel * 0.45 + 3
      doc.setFillColor(...COLORS.white)
      doc.setDrawColor(...color)
      doc.setLineWidth(0.5)
      doc.roundedRect(lx - labelW / 2, ly - labelH / 2, labelW, labelH, labelH / 2, labelH / 2, 'FD')
      doc.setTextColor(...color)
      doc.text(connector.label, lx, ly + fontFlowLabel * 0.15, { align: 'center' })
    }
  })

  // ─── Step cards ───────────────────────────────────────────────
  snapshot.steps.forEach((step) => {
    const pos = layout.stepPositions.get(step.id)
    if (!pos) return

    const lane = sorted.find((l) => l.id === step.swimlane_id)
    if (!lane) return

    const borderColor = hexToRGB(lane.color.border)
    const primaryColor = hexToRGB(lane.color.primary)

    const sx = px(pos.x)
    const sy = py(pos.y)
    const sw = ps(pos.w)
    const sh = ps(pos.h)

    if (step.step_type === 'decision') {
      renderDecisionDiamond(doc, step, sx, sy, sw, sh, borderColor, scale, fontCard, fontAnnotation, options.showAnnotations)
    } else {
      renderActionCard(doc, step, snapshot, sorted, sx, sy, sw, sh, borderColor, primaryColor, scale, fontCard, fontBadge, fontAnnotation, options.showAnnotations)
    }
  })

  // ─── Legend ────────────────────────────────────────────────────
  if (options.showLegend) {
    const legendY = pageH - footerH
    doc.setFillColor(...COLORS.lightGray)
    doc.rect(0, legendY, pageW, footerH, 'F')
    doc.setDrawColor(...COLORS.gray)
    doc.line(0, legendY, pageW, legendY)

    doc.setTextColor(...COLORS.text)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text('Swimlanes:', margin, legendY + 5.5)

    doc.setFont('helvetica', 'normal')
    let legendX = margin + 22
    sorted.forEach((lane) => {
      const c = hexToRGB(lane.color.border)
      doc.setFillColor(...c)
      doc.roundedRect(legendX, legendY + 2.5, 6, 6, 1.5, 1.5, 'F')
      doc.setTextColor(...COLORS.text)
      doc.text(lane.name, legendX + 8, legendY + 6)
      legendX += doc.getTextWidth(lane.name) + 16
    })

    doc.setFont('helvetica', 'bold')
    doc.text('Step Types:', legendX + 4, legendY + 5.5)
    doc.setFont('helvetica', 'normal')
    legendX += doc.getTextWidth('Step Types:') + 10
    const types = ['Action', 'Decision', 'Wait', 'Automation']
    types.forEach((t, idx) => {
      // Draw a small colored indicator before each type label
      const dotY = legendY + 4.5
      const dotR = 1.5
      if (idx === 0) doc.setFillColor(13, 148, 136)       // teal - action
      else if (idx === 1) doc.setFillColor(232, 119, 34)   // orange - decision
      else if (idx === 2) doc.setFillColor(148, 163, 184)  // gray - wait
      else doc.setFillColor(59, 130, 246)                   // blue - automation
      doc.circle(legendX + dotR, dotY, dotR, 'F')
      doc.setTextColor(...COLORS.text)
      doc.text(t, legendX + dotR * 2 + 2, legendY + 6)
      legendX += doc.getTextWidth(t) + dotR * 2 + 12
    })
  }

  // ─── Footer ────────────────────────────────────────────────────
  doc.setTextColor(...COLORS.subtext)
  doc.setFontSize(5)
  doc.text(
    `Generated ${new Date().toLocaleDateString()} | ${snapshot.steps.length} steps`,
    pageW - margin,
    pageH - 2,
    { align: 'right' }
  )

  return doc
}

// ─── Action card renderer ───────────────────────────────────────────

function renderActionCard(
  doc: jsPDF,
  step: ProcessStepData,
  snapshot: ProcessSnapshot,
  sortedLanes: ProcessSnapshot['swimlanes'],
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  borderColor: [number, number, number],
  primaryColor: [number, number, number],
  scale: number,
  fontCard: number,
  fontBadge: number,
  fontAnnotation: number,
  showAnnotations: boolean
) {
  const r = Math.max(1.5, 3 * scale)
  const accentW = Math.max(1.2, 2 * scale)  // colored accent bar width

  // White card body with thin gray border
  doc.setFillColor(...COLORS.white)
  doc.setDrawColor(229, 231, 235)  // #E5E7EB
  doc.setLineWidth(0.3)
  doc.roundedRect(sx, sy, sw, sh, r, r, 'FD')

  // Colored left accent bar (inset to stay within rounded corners)
  doc.setFillColor(...borderColor)
  doc.rect(sx + 0.3, sy + r, accentW, sh - r * 2, 'F')

  // Step name (dark text, word-wrapped up to 3 lines)
  doc.setTextColor(55, 65, 81)  // #374151
  doc.setFontSize(fontCard)
  doc.setFont('helvetica', 'bold')
  const textPad = Math.max(2, 4 * scale)
  const maxTextW = sw - textPad * 2
  const nameLines = doc.splitTextToSize(step.action_name, maxTextW) as string[]
  const lineH = fontCard * 0.45
  const maxLines = Math.min(nameLines.length, 3)
  const textBlockH = maxLines * lineH
  const textStartY = sy + sh / 2 - textBlockH / 2 + lineH * 0.7
  for (let i = 0; i < maxLines; i++) {
    let line = nameLines[i]
    if (i === maxLines - 1 && nameLines.length > maxLines) {
      line = line.slice(0, -1) + '…'
    }
    doc.text(line, sx + sw / 2, textStartY + i * lineH, { align: 'center' })
  }

  // Order badge (top-right circle) — smaller
  const badgeR = Math.max(1.8, 3 * scale)
  const badgeX = sx + sw - badgeR - Math.max(1, 1.5 * scale)
  const badgeY = sy + badgeR + Math.max(1, 1.5 * scale)
  doc.setFillColor(...borderColor)
  doc.circle(badgeX, badgeY, badgeR, 'F')
  doc.setTextColor(...COLORS.white)
  doc.setFontSize(fontBadge)
  doc.setFont('helvetica', 'bold')
  const stepIndex = snapshot.steps
    .filter((s) => s.swimlane_id === step.swimlane_id)
    .sort((a, b) => a.order_num - b.order_num)
    .findIndex((s) => s.id === step.id)
  doc.text(String(stepIndex + 1), badgeX, badgeY + fontBadge * 0.15, { align: 'center' })

  // Duration pill above card (matching SVG layout)
  if (showAnnotations && step.estimated_duration) {
    renderDurationPill(doc, step.estimated_duration, sx, sy, sw, scale, fontAnnotation)
  }

  // Annotations below card
  if (showAnnotations) {
    renderAnnotations(doc, step, sx, sy + sh, sw, scale, fontAnnotation)
  }
}

// ─── Decision diamond renderer ──────────────────────────────────────

function renderDecisionDiamond(
  doc: jsPDF,
  step: ProcessStepData,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  borderColor: [number, number, number],
  scale: number,
  fontCard: number,
  fontAnnotation: number,
  showAnnotations: boolean
) {
  const cx = sx + sw / 2
  const cy = sy + sh / 2
  // Make diamond fill more of the bounding box
  const hw = sw / 2
  const hh = sh / 1.8

  // White fill diamond with thick colored border
  doc.setFillColor(...COLORS.white)
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(Math.max(0.8, 1.5 * scale))

  doc.lines(
    [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]],
    cx, cy - hh,
    [1, 1],
    'FD',
    true
  )

  // Light inner fill for visual weight
  doc.setFillColor(...borderColor)
  const inset = 4
  doc.lines(
    [[hw - inset, hh - inset * 0.8], [-(hw - inset), hh - inset * 0.8], [-(hw - inset), -(hh - inset * 0.8)], [hw - inset, -(hh - inset * 0.8)]],
    cx, cy - (hh - inset * 0.8),
    [1, 1],
    'F',
    true
  )
  // Overlay semi-transparent white to make it a tint
  doc.setFillColor(...COLORS.white)
  doc.lines(
    [[hw - inset, hh - inset * 0.8], [-(hw - inset), hh - inset * 0.8], [-(hw - inset), -(hh - inset * 0.8)], [hw - inset, -(hh - inset * 0.8)]],
    cx, cy - (hh - inset * 0.8),
    [1, 1],
    'F',
    true
  )

  // Step name (colored text on white, word-wrapped)
  doc.setTextColor(...borderColor)
  doc.setFontSize(fontCard)
  doc.setFont('helvetica', 'bold')
  const maxNameW = hw * 1.2
  const nameLines = doc.splitTextToSize(step.action_name, maxNameW) as string[]
  const lineH = fontCard * 0.45
  const maxLines = Math.min(nameLines.length, 2)
  const textBlockH = maxLines * lineH
  const textStartY = cy - textBlockH / 2 + lineH * 0.65
  for (let i = 0; i < maxLines; i++) {
    doc.text(nameLines[i], cx, textStartY + i * lineH, { align: 'center' })
  }

  // Decision option labels — positioned to match SVG (offset from diamond edges)
  const decOptions = getDecisionOptionsForPDF(step)
  const labelSize = Math.max(6, fontAnnotation)
  const gap = Math.max(2, 3 * scale)
  const labelOffset = Math.max(3, 5 * scale) // extra offset like SVG's +8/+12px

  if (decOptions.length >= 1) {
    const optColor = FLOW_COLOR_MAP[decOptions[0].color] || COLORS.green
    doc.setTextColor(...optColor)
    doc.setFontSize(labelSize)
    doc.setFont('helvetica', 'bold')
    doc.text(decOptions[0].label, cx + hw + gap, cy - labelOffset, { align: 'left' })
  }
  if (decOptions.length >= 2) {
    const optColor = FLOW_COLOR_MAP[decOptions[1].color] || COLORS.red
    doc.setTextColor(...optColor)
    doc.setFontSize(labelSize)
    doc.setFont('helvetica', 'bold')
    doc.text(decOptions[1].label, cx + labelOffset, cy + hh + gap + labelSize * 0.3, { align: 'left' })
  }
  if (decOptions.length >= 3) {
    const optColor = FLOW_COLOR_MAP[decOptions[2].color] || COLORS.blue
    doc.setTextColor(...optColor)
    doc.setFontSize(labelSize)
    doc.setFont('helvetica', 'bold')
    doc.text(decOptions[2].label, cx - hw - gap, cy - labelOffset, { align: 'right' })
  }
  if (decOptions.length >= 4) {
    const optColor = FLOW_COLOR_MAP[decOptions[3].color] || [232, 119, 34]
    doc.setTextColor(...optColor)
    doc.setFontSize(labelSize)
    doc.setFont('helvetica', 'bold')
    doc.text(decOptions[3].label, cx, cy - hh - gap, { align: 'center' })
  }

  // Annotations below diamond
  if (showAnnotations) {
    renderAnnotations(doc, step, sx, sy + sh, sw, scale, fontAnnotation)
  }
}

// ─── Duration pill above card (matching SVG) ────────────────────────

function renderDurationPill(
  doc: jsPDF,
  duration: string,
  sx: number,
  sy: number,
  sw: number,
  scale: number,
  fontSize: number
) {
  const text = duration
  const pillH = Math.max(4, 6 * scale)
  const textW = doc.setFontSize(fontSize).getTextWidth(text)
  const pillW = textW + Math.max(4, 6 * scale)
  const pillX = sx + sw / 2 - pillW / 2
  const pillY = sy - pillH - Math.max(1.5, 2.5 * scale)

  // White pill with light gray border
  doc.setFillColor(...COLORS.white)
  doc.setDrawColor(209, 213, 219)  // #D1D5DB
  doc.setLineWidth(0.3)
  doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2, pillH / 2, 'FD')

  // Text
  doc.setTextColor(75, 85, 99)  // #4B5563
  doc.setFontSize(fontSize)
  doc.setFont('helvetica', 'normal')
  doc.text(text, sx + sw / 2, pillY + pillH / 2 + fontSize * 0.13, { align: 'center' })
}

// ─── Compact annotations renderer (below card) ─────────────────────

function renderAnnotations(
  doc: jsPDF,
  step: ProcessStepData,
  sx: number,
  topY: number,
  sw: number,
  scale: number,
  fontSize: number
) {
  const hasAnnotations = step.description ||
    step.systems_used.length > 0 || step.documents_needed.length > 0
  if (!hasAnnotations) return

  let y = topY + Math.max(1, 1.5 * scale)
  const lineH = fontSize * 0.42
  const maxW = sw

  doc.setFontSize(fontSize)

  // Description — single italic line, truncated to card width
  if (step.description) {
    doc.setTextColor(...COLORS.subtext)
    doc.setFont('helvetica', 'italic')
    const cleanDesc = step.description.replace(/\n/g, ' ')
    const lines = doc.splitTextToSize(cleanDesc, maxW) as string[]
    doc.text(lines[0], sx + 1, y + lineH)
    y += lineH + 0.5
  }

  // Systems — comma-separated, single blue text line
  if (step.systems_used.length > 0) {
    doc.setTextColor(29, 78, 216)  // #1D4ED8
    doc.setFont('helvetica', 'normal')
    const text = step.systems_used.join(', ')
    const lines = doc.splitTextToSize(text, maxW - 2) as string[]
    doc.text(lines[0], sx + 1, y + lineH)
    y += lineH + 0.5
  }

  // Documents — comma-separated, single amber text line
  if (step.documents_needed.length > 0) {
    doc.setTextColor(146, 64, 14)  // #92400E
    doc.setFont('helvetica', 'normal')
    const text = step.documents_needed.join(', ')
    const lines = doc.splitTextToSize(text, maxW - 2) as string[]
    doc.text(lines[0], sx + 1, y + lineH)
    y += lineH + 0.5
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function getDecisionOptionsForPDF(step: ProcessStepData): DecisionOption[] {
  if (step.decision_options && step.decision_options.length > 0) {
    return step.decision_options
  }
  const options: DecisionOption[] = []
  if (step.decision_yes_label || step.decision_no_label) {
    options.push({ label: step.decision_yes_label || 'Yes', color: 'green' })
    options.push({ label: step.decision_no_label || 'No', color: 'red' })
  }
  return options
}

