import jsPDF from 'jspdf'
import type { ProcessSnapshot, ProcessStepData, DecisionOption } from '@/types/process-builder'
import { calculateSVGLayout, SVG, type LayoutOverrides } from './svg-layout'
import { calculateConnectorPath } from './connector-math'
import type { Rect } from './connector-math'

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
  const defaultLayout = calculateSVGLayout(sorted, snapshot.steps, snapshot.flows)
  const columnCount = defaultLayout.columnCount

  // Progressive compaction for wide diagrams so they fit on the page
  const pdfOverrides: LayoutOverrides | undefined = columnCount > 14
    ? { cardW: 100, gapX: 20, laneH: 140, sidebarW: 44, pad: 14, branchOffsetY: 55 }
    : columnCount > 10
    ? { cardW: 120, gapX: 25, laneH: 150, sidebarW: 48, pad: 16, branchOffsetY: 60 }
    : columnCount > 8
    ? { cardW: 140, gapX: 35, sidebarW: 56, pad: 20 }
    : undefined

  // Don't pass processName — PDF has its own header, no need for in-diagram title offset
  const layout = pdfOverrides
    ? calculateSVGLayout(sorted, snapshot.steps, snapshot.flows, undefined, pdfOverrides)
    : defaultLayout

  // ─── Page sizing: fit diagram on page, allow moderate width extension ─
  const pageH = options.paperSize === 'a3' ? 297 : 210
  const standardW = options.paperSize === 'a3' ? 420 : 297
  const maxW = standardW * 2          // allow up to 2× standard width for wide diagrams
  const headerH = 12                  // simple title line
  const footerH = options.showLegend ? 14 : 6
  const margin = 8

  const availableH = pageH - headerH - footerH - margin * 2

  // Scale to fill height first, then check if width fits within max bounds
  const scaleByH = Math.min(availableH / layout.totalH, 1)
  const widthAtHScale = layout.totalW * scaleByH + margin * 2

  // If width-based scale fits within max width, use height scale; otherwise shrink to fit
  const scaleByMaxW = (maxW - margin * 2) / layout.totalW
  const scale = widthAtHScale <= maxW ? scaleByH : Math.min(scaleByH, scaleByMaxW, 1)

  // Page width: exactly what the content needs (clamped between standard and max)
  const contentW = layout.totalW * scale + margin * 2
  const pageW = Math.max(standardW, Math.min(maxW, contentW))

  // Center the diagram in the available space
  const diagramW = layout.totalW * scale
  const diagramH = layout.totalH * scale
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
  const fontCard = Math.max(5, Math.min(10, cardW_mm * 0.22))
  const fontAnnotation = Math.max(4, Math.min(7, cardW_mm * 0.16))
  const fontBadge = Math.max(3.5, Math.min(6, cardW_mm * 0.14))
  const fontPhase = Math.max(5.5, Math.min(11, cardW_mm * 0.24))
  const fontLane = Math.max(5, Math.min(9, cardW_mm * 0.22))
  const fontFlowLabel = Math.max(4.5, Math.min(7, cardW_mm * 0.18))

  // ─── Header: simple centered title on white ─────────────────
  doc.setTextColor(...COLORS.text)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(processName, pageW / 2, 8, { align: 'center' })

  // ─── Phase header: dark charcoal bar spanning full width ─────
  if (layout.phaseHeaders.length > 0) {
    const phY = py(SVG.PAD)
    const phH = ps(SVG.PHASE_HEADER_H - 4)
    const sidebarW = pdfOverrides?.sidebarW ?? SVG.SIDEBAR_W
    const barX = px(sidebarW)
    const barW = ps(layout.totalW - sidebarW)

    // Full-width dark bar
    doc.setFillColor(31, 41, 55)  // #1F2937
    doc.rect(barX, phY, barW, phH, 'F')

    // Phase labels + dividers
    layout.phaseHeaders.forEach((phase, idx) => {
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(fontPhase)
      doc.setFont('helvetica', 'bold')
      doc.text(phase.name, px(phase.x + phase.w / 2), phY + phH / 2 + fontPhase * 0.15, { align: 'center' })

      // Vertical divider between phases
      if (idx < layout.phaseHeaders.length - 1) {
        const divX = px(phase.x + phase.w + SVG.GAP_X / 2)
        doc.setDrawColor(255, 255, 255)
        doc.setLineWidth(0.3)
        doc.line(divX, phY + 2, divX, phY + phH - 2)
      }
    })
  }

  // ─── Swimlane rows ────────────────────────────────────────────
  layout.lanePositions.forEach((lane) => {
    const barColor = hexToRGB(lane.color.border)
    const tintColor = hexToRGB(lane.color.tint)

    // Lane background tint
    doc.setFillColor(...tintColor)
    doc.rect(px(0), py(lane.y), ps(layout.totalW), ps(lane.h), 'F')

    // Colored sidebar bar
    const lnSidebarW = pdfOverrides?.sidebarW ?? SVG.SIDEBAR_W
    doc.setFillColor(...barColor)
    doc.rect(px(0), py(lane.y), ps(lnSidebarW), ps(lane.h), 'F')

    // Rotated lane label
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(fontLane)
    doc.setFont('helvetica', 'bold')
    const labelX = px(lnSidebarW / 2)
    const labelY = py(lane.y + lane.h / 2)
    const maxChars = Math.floor(ps(lane.h) / (fontLane * 0.32))
    const displayName = lane.name.length > maxChars ? lane.name.slice(0, maxChars - 1) + '…' : lane.name
    doc.text(displayName, labelX, labelY + 1, { align: 'center', angle: 90 })
  })

  // ─── Connectors (drawn behind cards) ──────────────────────────
  snapshot.flows.forEach((flow) => {
    const fromPos = layout.stepPositions.get(flow.from_step_id)
    const toPos = layout.stepPositions.get(flow.to_step_id)
    if (!fromPos || !toPos) return

    const fromStep = snapshot.steps.find((s) => s.id === flow.from_step_id)
    const isDecisionNo = fromStep?.step_type === 'decision' &&
      !!flow.condition_color && flow.condition_color !== 'green'

    const fromRect: Rect = { x: fromPos.x, y: fromPos.y, w: fromPos.w, h: fromPos.h }
    const toRect: Rect = { x: toPos.x, y: toPos.y, w: toPos.w, h: toPos.h }

    const connector = calculateConnectorPath(fromRect, toRect, flow.condition_label, flow.condition_color, isDecisionNo)
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

    // Condition label pill
    if (connector.label && connector.labelPosition) {
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
    const types = [
      { label: 'Action', shape: '■' },
      { label: 'Decision', shape: '◆' },
      { label: 'Wait', shape: '⏳' },
      { label: 'Automation', shape: '⚙' },
    ]
    types.forEach((t) => {
      doc.text(`${t.shape} ${t.label}`, legendX, legendY + 6)
      legendX += doc.getTextWidth(`${t.shape} ${t.label}`) + 10
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

  // Green documented indicator (top-left)
  const hasDetail = !!(step.description || step.systems_used.length > 0 || step.documents_needed.length > 0)
  if (hasDetail) {
    const indR = Math.max(1.8, 3 * scale)
    const indX = sx + indR + Math.max(1, 1.5 * scale)
    const indY = sy + indR + Math.max(1, 1.5 * scale)
    doc.setFillColor(...COLORS.green)
    doc.circle(indX, indY, indR, 'F')
    doc.setTextColor(...COLORS.white)
    doc.setFontSize(Math.max(4.5, fontBadge * 0.7))
    doc.setFont('helvetica', 'bold')
    doc.text('✓', indX, indY + 0.5, { align: 'center' })
  }

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

  // Decision option labels around diamond edges
  const decOptions = getDecisionOptionsForPDF(step)
  const labelSize = Math.max(6, fontAnnotation)
  const gap = Math.max(2, 3 * scale)

  if (decOptions.length >= 1) {
    const optColor = FLOW_COLOR_MAP[decOptions[0].color] || COLORS.green
    doc.setTextColor(...optColor)
    doc.setFontSize(labelSize)
    doc.setFont('helvetica', 'bold')
    doc.text(decOptions[0].label, cx + hw + gap, cy, { align: 'left' })
  }
  if (decOptions.length >= 2) {
    const optColor = FLOW_COLOR_MAP[decOptions[1].color] || COLORS.red
    doc.setTextColor(...optColor)
    doc.setFontSize(labelSize)
    doc.setFont('helvetica', 'bold')
    doc.text(decOptions[1].label, cx, cy + hh + gap + labelSize * 0.3, { align: 'center' })
  }
  if (decOptions.length >= 3) {
    const optColor = FLOW_COLOR_MAP[decOptions[2].color] || COLORS.blue
    doc.setTextColor(...optColor)
    doc.setFontSize(labelSize)
    doc.setFont('helvetica', 'bold')
    doc.text(decOptions[2].label, cx - hw - gap, cy, { align: 'right' })
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
  const text = `⏱ ${duration}`
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

// ─── Annotations renderer (below card) ──────────────────────────────

function renderAnnotations(
  doc: jsPDF,
  step: ProcessStepData,
  sx: number,
  topY: number,
  sw: number,
  scale: number,
  fontSize: number
) {
  // Duration is handled above the card now — skip it here
  const hasAnnotations = step.description ||
    step.systems_used.length > 0 || step.documents_needed.length > 0
  if (!hasAnnotations) return

  let y = topY + Math.max(1.5, 2.5 * scale)
  const lineH = fontSize * 0.45
  const maxW = sw + Math.max(4, 8 * scale)

  doc.setFontSize(fontSize)

  // Description (italic text, up to 3 lines)
  if (step.description) {
    doc.setTextColor(...COLORS.subtext)
    doc.setFont('helvetica', 'italic')
    const cleanDesc = step.description.replace(/\n/g, ' | ')
    const descLines = doc.splitTextToSize(cleanDesc, maxW) as string[]
    for (let i = 0; i < Math.min(descLines.length, 3); i++) {
      doc.text(descLines[i], sx + 1, y + lineH)
      y += lineH + 0.6
    }
    y += 0.5
  }

  // Systems (blue badge pills)
  if (step.systems_used.length > 0) {
    step.systems_used.slice(0, 3).forEach((sys) => {
      const text = sys.length > 20 ? sys.slice(0, 18) + '…' : sys
      const pillH = Math.max(3.5, 5 * scale)
      const textW = doc.setFontSize(fontSize).getTextWidth(text)
      const dotR = Math.max(0.8, 1.2 * scale)
      const pillW = dotR * 2 + 2 + textW + Math.max(3, 5 * scale)

      // Blue-tinted pill
      doc.setFillColor(239, 246, 255)  // #EFF6FF
      doc.setDrawColor(191, 219, 254)  // #BFDBFE
      doc.setLineWidth(0.2)
      doc.roundedRect(sx, y, pillW, pillH, pillH / 2, pillH / 2, 'FD')

      // Blue dot
      doc.setFillColor(59, 130, 246)  // #3B82F6
      doc.circle(sx + dotR + Math.max(1.5, 2.5 * scale), y + pillH / 2, dotR, 'F')

      // Text
      doc.setTextColor(29, 78, 216)  // #1D4ED8
      doc.setFont('helvetica', 'normal')
      doc.text(text, sx + dotR * 2 + Math.max(3, 5 * scale), y + pillH / 2 + fontSize * 0.13)
      y += pillH + Math.max(0.8, 1.2 * scale)
    })
  }

  // Documents (amber badge pills)
  if (step.documents_needed.length > 0) {
    step.documents_needed.slice(0, 3).forEach((docName) => {
      const text = docName.length > 20 ? docName.slice(0, 18) + '…' : docName
      const pillH = Math.max(3.5, 5 * scale)
      const textW = doc.setFontSize(fontSize).getTextWidth(text)
      const dotR = Math.max(0.8, 1.2 * scale)
      const pillW = dotR * 2 + 2 + textW + Math.max(3, 5 * scale)

      // Amber-tinted pill
      doc.setFillColor(255, 251, 235)  // #FFFBEB
      doc.setDrawColor(253, 230, 138)  // #FDE68A
      doc.setLineWidth(0.2)
      doc.roundedRect(sx, y, pillW, pillH, pillH / 2, pillH / 2, 'FD')

      // Amber dot
      doc.setFillColor(217, 119, 6)  // #D97706
      doc.circle(sx + dotR + Math.max(1.5, 2.5 * scale), y + pillH / 2, dotR, 'F')

      // Text
      doc.setTextColor(146, 64, 14)  // #92400E
      doc.setFont('helvetica', 'normal')
      doc.text(text, sx + dotR * 2 + Math.max(3, 5 * scale), y + pillH / 2 + fontSize * 0.13)
      y += pillH + Math.max(0.8, 1.2 * scale)
    })
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
