import { OrgChartPerson, NodePosition, TreeLayoutResult, ViewMode } from '../types'
import { getRootNodes, getStandardChildren, getAssistants } from './tree-helpers'

const NODE_WIDTH = 220
const NODE_HEIGHT_DETAILED = 112
const NODE_HEIGHT_COMPACT = 56
const NODE_HEIGHT_PHOTO = 120
const H_GAP = 32
const V_GAP = 56

export function getNodeHeight(viewMode: ViewMode): number {
  switch (viewMode) {
    case 'compact':
      return NODE_HEIGHT_COMPACT
    case 'photo':
      return NODE_HEIGHT_PHOTO
    default:
      return NODE_HEIGHT_DETAILED
  }
}

export function getNodeWidth(): number {
  return NODE_WIDTH
}

interface SubtreeResult {
  width: number
  // Positions are in LOCAL coordinates (relative to subtree's left edge at x=0)
  positions: Map<string, NodePosition>
}

const ASSISTANT_Y_OFFSET = 8

/**
 * Recursively layout a subtree. All positions returned are RELATIVE
 * to this subtree's left edge (x=0). The caller is responsible for
 * offsetting them to the correct absolute position.
 */
function layoutSubtree(
  people: OrgChartPerson[],
  nodeId: string,
  y: number,
  viewMode: ViewMode,
  collapsedIds: Set<string>
): SubtreeResult {
  const positions = new Map<string, NodePosition>()
  const nodeHeight = getNodeHeight(viewMode)

  if (collapsedIds.has(nodeId)) {
    positions.set(nodeId, { x: 0, y })
    return { width: NODE_WIDTH, positions }
  }

  const children = getStandardChildren(people, nodeId)
  const assistants = getAssistants(people, nodeId)

  // Layout assistant subtrees (they go to the right of the parent)
  const assistantResults: SubtreeResult[] = []
  let assistantColumnWidth = 0
  if (assistants.length > 0) {
    let assistantY = y + ASSISTANT_Y_OFFSET
    for (const assistant of assistants) {
      const result = layoutSubtree(
        people,
        assistant.id,
        assistantY,
        viewMode,
        collapsedIds
      )
      assistantResults.push(result)
      assistantColumnWidth = Math.max(assistantColumnWidth, result.width)
      // Stack multiple assistants vertically — find the max Y used in this subtree
      let maxAssistantY = assistantY
      for (const pos of result.positions.values()) {
        maxAssistantY = Math.max(maxAssistantY, pos.y + nodeHeight)
      }
      assistantY = maxAssistantY + V_GAP
    }
  }

  // Total space needed for assistant column (width + gap from parent)
  const assistantSpace = assistantColumnWidth > 0 ? H_GAP + assistantColumnWidth : 0

  if (children.length === 0 && assistants.length === 0) {
    positions.set(nodeId, { x: 0, y })
    return { width: NODE_WIDTH, positions }
  }

  if (children.length === 0) {
    // Only assistants, no standard children
    const subtreeWidth = NODE_WIDTH + assistantSpace
    const parentX = 0
    positions.set(nodeId, { x: parentX, y })

    // Place assistant subtrees to the right
    const assistantX = NODE_WIDTH + H_GAP
    for (const result of assistantResults) {
      for (const [id, pos] of result.positions) {
        positions.set(id, { x: pos.x + assistantX, y: pos.y })
      }
    }

    return { width: subtreeWidth, positions }
  }

  // Layout each standard child subtree
  const childResults: SubtreeResult[] = []
  for (const child of children) {
    const result = layoutSubtree(
      people,
      child.id,
      y + nodeHeight + V_GAP,
      viewMode,
      collapsedIds
    )
    childResults.push(result)
  }

  // Total width of all standard children placed side by side with gaps
  const totalChildrenWidth = childResults.reduce((sum, r) => sum + r.width, 0)
    + (childResults.length - 1) * H_GAP

  // The main subtree width (without assistants) is at least the node width
  const mainWidth = Math.max(NODE_WIDTH, totalChildrenWidth)
  const subtreeWidth = mainWidth + assistantSpace

  // Center children within the main area (not including assistant column)
  const childrenOffset = (mainWidth - totalChildrenWidth) / 2

  // Center parent above standard children
  const parentX = mainWidth / 2 - NODE_WIDTH / 2
  positions.set(nodeId, { x: parentX, y })

  // Place each standard child subtree at the correct offset
  let cumulativeX = childrenOffset
  for (const result of childResults) {
    for (const [id, pos] of result.positions) {
      positions.set(id, { x: pos.x + cumulativeX, y: pos.y })
    }
    cumulativeX += result.width + H_GAP
  }

  // Place assistant subtrees to the right of the main area
  if (assistantResults.length > 0) {
    const assistantX = parentX + NODE_WIDTH + H_GAP
    for (const result of assistantResults) {
      for (const [id, pos] of result.positions) {
        positions.set(id, { x: pos.x + assistantX, y: pos.y })
      }
    }
  }

  return { width: subtreeWidth, positions }
}

export function calculateTreeLayout(
  people: OrgChartPerson[],
  viewMode: ViewMode,
  collapsedIds: Set<string>
): TreeLayoutResult {
  const roots = getRootNodes(people)
  const allPositions = new Map<string, NodePosition>()

  if (roots.length === 0) {
    return { positions: allPositions, totalWidth: 0, totalHeight: 0 }
  }

  // Layout each root subtree, then place them side by side
  const rootResults: SubtreeResult[] = []
  for (const root of roots) {
    const result = layoutSubtree(people, root.id, 0, viewMode, collapsedIds)
    rootResults.push(result)
  }

  // Place root subtrees side by side with double gap between them
  let currentX = 0
  for (const result of rootResults) {
    for (const [id, pos] of result.positions) {
      allPositions.set(id, { x: pos.x + currentX, y: pos.y })
    }
    currentX += result.width + H_GAP * 2
  }

  // Calculate total dimensions
  let maxX = 0
  let maxY = 0
  const nodeHeight = getNodeHeight(viewMode)

  for (const pos of allPositions.values()) {
    maxX = Math.max(maxX, pos.x + NODE_WIDTH)
    maxY = Math.max(maxY, pos.y + nodeHeight)
  }

  return {
    positions: allPositions,
    totalWidth: maxX,
    totalHeight: maxY,
  }
}
