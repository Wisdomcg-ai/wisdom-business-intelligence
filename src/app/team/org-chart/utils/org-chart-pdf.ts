import jsPDF from 'jspdf'
import {
  OrgChartData,
  OrgChartPerson,
  OrgChartVersion,
  ViewMode,
} from '../types'
import { calculateTreeLayout, getNodeWidth, getNodeHeight } from './tree-layout'
import { getStandardChildren, getAssistants, getRootNodes } from './tree-helpers'
import { getAnalytics, formatCurrency } from './org-chart-analytics'
import { getInitials } from '@/app/goals/utils/team'

const COLORS = {
  navy: [62, 63, 87] as [number, number, number],
  orange: [232, 119, 34] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  gray: [148, 163, 184] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  text: [30, 41, 59] as [number, number, number],
  subtext: [100, 116, 139] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  teal: [20, 184, 166] as [number, number, number],
}

const PDF_NODE_W = 48
const PDF_NODE_H = 24
const PDF_H_GAP = 8
const PDF_V_GAP = 14

interface PDFNodePos {
  x: number
  y: number
}

export interface PDFExportOptions {
  showHeadcount: boolean
  showSalaries: boolean
  showDepartment: boolean
  showEmploymentType: boolean
  showVacant: boolean
  showAssistant: boolean
}

const PDF_ASSISTANT_Y_OFFSET = 2

/**
 * Layout a subtree in LOCAL coordinates (x starts at 0).
 * The caller offsets returned positions to their final location.
 * This mirrors the fix in tree-layout.ts.
 */
function layoutPDFSubtree(
  people: OrgChartPerson[],
  nodeId: string,
  y: number
): { width: number; positions: Map<string, PDFNodePos> } {
  const positions = new Map<string, PDFNodePos>()
  const children = getStandardChildren(people, nodeId)
  const assistants = getAssistants(people, nodeId)

  // Layout assistant subtrees
  const assistantResults: { width: number; positions: Map<string, PDFNodePos> }[] = []
  let assistantColumnWidth = 0
  if (assistants.length > 0) {
    let assistantY = y + PDF_ASSISTANT_Y_OFFSET
    for (const assistant of assistants) {
      const result = layoutPDFSubtree(people, assistant.id, assistantY)
      assistantResults.push(result)
      assistantColumnWidth = Math.max(assistantColumnWidth, result.width)
      let maxY = assistantY
      for (const pos of result.positions.values()) {
        maxY = Math.max(maxY, pos.y + PDF_NODE_H)
      }
      assistantY = maxY + PDF_V_GAP
    }
  }
  const assistantSpace = assistantColumnWidth > 0 ? PDF_H_GAP + assistantColumnWidth : 0

  if (children.length === 0 && assistants.length === 0) {
    positions.set(nodeId, { x: 0, y })
    return { width: PDF_NODE_W, positions }
  }

  if (children.length === 0) {
    const subtreeWidth = PDF_NODE_W + assistantSpace
    positions.set(nodeId, { x: 0, y })
    const assistantX = PDF_NODE_W + PDF_H_GAP
    for (const result of assistantResults) {
      for (const [id, pos] of result.positions) {
        positions.set(id, { x: pos.x + assistantX, y: pos.y })
      }
    }
    return { width: subtreeWidth, positions }
  }

  const childResults: { width: number; positions: Map<string, PDFNodePos> }[] = []
  for (const child of children) {
    const result = layoutPDFSubtree(people, child.id, y + PDF_NODE_H + PDF_V_GAP)
    childResults.push(result)
  }

  const totalChildrenWidth = childResults.reduce((sum, r) => sum + r.width, 0)
    + (childResults.length - 1) * PDF_H_GAP
  const mainWidth = Math.max(PDF_NODE_W, totalChildrenWidth)
  const subtreeWidth = mainWidth + assistantSpace
  const childrenOffset = (mainWidth - totalChildrenWidth) / 2
  const parentX = mainWidth / 2 - PDF_NODE_W / 2

  positions.set(nodeId, { x: parentX, y })

  let cumulativeX = childrenOffset
  for (const result of childResults) {
    for (const [id, pos] of result.positions) {
      positions.set(id, { x: pos.x + cumulativeX, y: pos.y })
    }
    cumulativeX += result.width + PDF_H_GAP
  }

  if (assistantResults.length > 0) {
    const assistantX = parentX + PDF_NODE_W + PDF_H_GAP
    for (const result of assistantResults) {
      for (const [id, pos] of result.positions) {
        positions.set(id, { x: pos.x + assistantX, y: pos.y })
      }
    }
  }

  return { width: subtreeWidth, positions }
}

export function generateOrgChartPDF(
  data: OrgChartData,
  versionId?: string,
  options?: PDFExportOptions
): jsPDF {
  const version = data.versions.find((v) => v.id === (versionId || data.activeVersionId))
    || data.versions[0]
  const people = version.people
  const analytics = getAnalytics(people)
  const settings = data.settings
  const showHeadcount = options?.showHeadcount ?? true
  const showSalaries = options?.showSalaries ?? settings.showSalaries
  const showDepartment = options?.showDepartment ?? false
  const showEmploymentType = options?.showEmploymentType ?? false
  const showVacant = options?.showVacant ?? false
  const showAssistant = options?.showAssistant ?? false

  // Calculate layout — each subtree returns local coords, offset once here
  const roots = getRootNodes(people)
  const allPositions = new Map<string, PDFNodePos>()
  let currentX = 0
  for (const root of roots) {
    const result = layoutPDFSubtree(people, root.id, 0)
    for (const [id, pos] of result.positions) {
      allPositions.set(id, { x: pos.x + currentX, y: pos.y })
    }
    currentX += result.width + PDF_H_GAP * 2
  }

  // Determine canvas size
  let maxX = 0
  let maxY = 0
  for (const pos of allPositions.values()) {
    maxX = Math.max(maxX, pos.x + PDF_NODE_W)
    maxY = Math.max(maxY, pos.y + PDF_NODE_H)
  }

  const isWide = maxX > maxY * 1.5
  const orientation = isWide ? 'landscape' : 'landscape'
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // Header
  doc.setFillColor(...COLORS.navy)
  doc.rect(0, 0, pageW, 18, 'F')
  doc.setFillColor(...COLORS.orange)
  doc.rect(0, 18, pageW, 1.5, 'F')

  doc.setTextColor(...COLORS.white)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(settings.companyName || 'Org Chart', 10, 8)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(version.label, 10, 13)

  // Header stats — conditional on options
  const headerParts: string[] = []
  if (showHeadcount) {
    headerParts.push(`${analytics.totalHeadcount + analytics.plannedHeadcount} people`)
  }
  if (showSalaries) {
    headerParts.push(`${formatCurrency(analytics.totalCost + analytics.plannedCost)} total cost`)
  }
  if (headerParts.length > 0) {
    doc.text(headerParts.join(' | '), pageW - 10, 8, { align: 'right' })
  }
  doc.text(new Date().toLocaleDateString(), pageW - 10, 13, { align: 'right' })

  // Calculate scale to fit tree in available area
  const hasAnalytics = showHeadcount || showSalaries
  const footerH = hasAnalytics ? 18 : 8
  const treeAreaTop = 24
  const treeAreaBottom = pageH - footerH - 4
  const treeAreaH = treeAreaBottom - treeAreaTop
  const treeAreaW = pageW - 20
  const margin = 10

  if (maxX === 0 || maxY === 0) {
    doc.setTextColor(...COLORS.subtext)
    doc.setFontSize(12)
    doc.text('No team members to display', pageW / 2, pageH / 2, { align: 'center' })
  } else {
    const scaleX = treeAreaW / maxX
    const scaleY = treeAreaH / maxY
    const scale = Math.min(scaleX, scaleY, 1)

    const scaledW = maxX * scale
    const scaledH = maxY * scale
    const offsetX = margin + (treeAreaW - scaledW) / 2
    const offsetY = treeAreaTop + (treeAreaH - scaledH) / 2

    // Draw connectors
    doc.setDrawColor(...COLORS.gray)
    doc.setLineWidth(0.3)
    for (const person of people) {
      if (!person.parentId) continue
      const parentPos = allPositions.get(person.parentId)
      const childPos = allPositions.get(person.id)
      if (!parentPos || !childPos) continue

      if (person.isAssistant) {
        // Horizontal dashed line from parent's right edge to assistant's left edge
        const x1 = offsetX + (parentPos.x + PDF_NODE_W) * scale
        const y1 = offsetY + (parentPos.y + PDF_NODE_H / 2) * scale
        const x2 = offsetX + childPos.x * scale
        const y2 = offsetY + (childPos.y + PDF_NODE_H / 2) * scale
        doc.setLineDashPattern([1.5, 1], 0)
        doc.line(x1, y1, x2, y2)
        doc.setLineDashPattern([], 0)
      } else {
        const x1 = offsetX + (parentPos.x + PDF_NODE_W / 2) * scale
        const y1 = offsetY + (parentPos.y + PDF_NODE_H) * scale
        const x2 = offsetX + (childPos.x + PDF_NODE_W / 2) * scale
        const y2 = offsetY + childPos.y * scale
        const midY = (y1 + y2) / 2

        doc.line(x1, y1, x1, midY)
        doc.line(x1, midY, x2, midY)
        doc.line(x2, midY, x2, y2)
      }
    }

    // Draw nodes
    for (const person of people) {
      const pos = allPositions.get(person.id)
      if (!pos) continue

      const nx = offsetX + pos.x * scale
      const ny = offsetY + pos.y * scale
      const nw = PDF_NODE_W * scale
      const nh = PDF_NODE_H * scale

      // Node background
      doc.setFillColor(...COLORS.white)
      if (person.isVacant) {
        doc.setDrawColor(...COLORS.gray)
        doc.setLineDashPattern([1, 1], 0)
        doc.roundedRect(nx, ny, nw, nh, 1.5, 1.5, 'FD')
        doc.setLineDashPattern([], 0)
      } else {
        doc.setDrawColor(220, 220, 230)
        doc.roundedRect(nx, ny, nw, nh, 1.5, 1.5, 'FD')
      }

      // Avatar circle
      const avatarR = Math.min(3 * scale, 3)
      const avatarX = nx + 4 * scale
      const avatarY = ny + nh / 2
      doc.setFillColor(...COLORS.navy)
      doc.circle(avatarX, avatarY, avatarR, 'F')
      doc.setTextColor(...COLORS.white)
      doc.setFontSize(Math.max(5, 6 * scale))
      doc.setFont('helvetica', 'bold')
      const initials = getInitials(person.name)
      doc.text(initials, avatarX, avatarY + avatarR * 0.35, { align: 'center' })

      // Name and title
      const textX = nx + 9 * scale
      const maxTextW = nw - 11 * scale

      doc.setTextColor(...COLORS.text)
      doc.setFontSize(Math.max(5.5, 7 * scale))
      doc.setFont('helvetica', 'bold')
      const name = person.name.length > 18 ? person.name.slice(0, 16) + '...' : person.name
      doc.text(name, textX, ny + 5 * scale)

      doc.setTextColor(...COLORS.subtext)
      doc.setFontSize(Math.max(4.5, 5.5 * scale))
      doc.setFont('helvetica', 'normal')
      const title = person.title.length > 22 ? person.title.slice(0, 20) + '...' : person.title
      doc.text(title, textX, ny + 9 * scale)

      if (showSalaries && person.salary && nh > 16) {
        doc.setFontSize(Math.max(4, 5 * scale))
        doc.text(formatCurrency(person.salary), textX, ny + 13 * scale)
      }

      // Draw tags
      const tags: { label: string; color: [number, number, number]; bg: [number, number, number] }[] = []
      if (showDepartment && person.department) {
        tags.push({ label: person.department, color: [30, 64, 175], bg: [219, 234, 254] })
      }
      if (showEmploymentType) {
        const etLabels: Record<string, string> = { 'full-time': 'FT', 'part-time': 'PT', contractor: 'Con', casual: 'Cas' }
        tags.push({ label: etLabels[person.employmentType] || person.employmentType, color: [75, 85, 99], bg: [243, 244, 246] })
      }
      if (showVacant && person.isVacant) {
        tags.push({ label: 'Planned', color: [180, 83, 9], bg: [254, 243, 199] })
      }
      if (showAssistant && person.isAssistant) {
        tags.push({ label: 'Asst', color: [3, 105, 161], bg: [224, 242, 254] })
      }
      if (tags.length > 0) {
        const tagFontSize = Math.max(3.5, 4 * scale)
        const tagY = ny + (showSalaries && person.salary ? 17 : 13) * scale
        let tagX = textX
        doc.setFontSize(tagFontSize)
        for (const tag of tags) {
          const tw = doc.getTextWidth(tag.label) + 1.5 * scale
          const th = 2.8 * scale
          if (tagX + tw > nx + nw - 1) break // don't overflow the node
          doc.setFillColor(...tag.bg)
          doc.roundedRect(tagX, tagY - th + 0.5 * scale, tw, th, 0.5, 0.5, 'F')
          doc.setTextColor(...tag.color)
          doc.setFont('helvetica', 'bold')
          doc.text(tag.label, tagX + 0.75 * scale, tagY)
          tagX += tw + 1 * scale
        }
      }
    }
  }

  // Footer
  const footerY = pageH - footerH
  doc.setFillColor(...COLORS.lightGray)
  doc.rect(0, footerY, pageW, footerH, 'F')
  doc.setDrawColor(...COLORS.gray)
  doc.line(0, footerY, pageW, footerY)

  if (hasAnalytics) {
    doc.setTextColor(...COLORS.text)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text('Analytics', 10, footerY + 5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    const analyticsItems: string[] = []
    if (showHeadcount) {
      analyticsItems.push(
        `Headcount: ${analytics.totalHeadcount}${analytics.plannedHeadcount ? ` (+${analytics.plannedHeadcount} planned)` : ''}`
      )
    }
    if (showSalaries) {
      analyticsItems.push(`Total Cost: ${formatCurrency(analytics.totalCost)}`)
    }
    analyticsItems.push(
      `Span of Control: ${analytics.spanOfControl.avg} avg`,
      `Org Depth: ${analytics.orgDepth} levels`
    )
    doc.text(analyticsItems.join('   |   '), 10, footerY + 10)

    // Department breakdown
    const depts = Object.entries(analytics.byDepartment).sort((a, b) => b[1].count - a[1].count)
    if (depts.length > 0) {
      const deptLine = depts
        .map(([dept, data]) => {
          const parts = [dept, `${data.count}`]
          if (showSalaries) parts.push(`(${formatCurrency(data.cost)})`)
          return parts.join(': ')
        })
        .join('   ')
      doc.text(deptLine, 10, footerY + 14)
    }
  }

  // Footer timestamp
  doc.setTextColor(...COLORS.subtext)
  doc.setFontSize(5.5)
  doc.text(
    `Generated ${new Date().toLocaleDateString()} | ${version.label}`,
    pageW - 10,
    footerY + footerH - 3,
    { align: 'right' }
  )

  return doc
}
