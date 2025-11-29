// ============================================================================
// PROCESS DIAGRAM SVG RENDERER
// Week 2: Step 2
// Purpose: Draw the diagram using SVG based on layout coordinates
// ============================================================================

'use client'; // This is a client component (runs in browser)

import React from 'react';
import { DiagramLayout, ActivityLayout, ConnectorLayout, SwimlaneLayout } from '@/lib/services/process-layout.service';
import { ProcessStep, DEPARTMENT_COLORS } from '@/types/process-diagram';

interface ProcessDiagramRendererProps {
  layout: DiagramLayout;
  steps: Map<string, ProcessStep>; // For getting step details
  title?: string;
  interactive?: boolean;
}

export function ProcessDiagramRenderer({
  layout,
  steps,
  title = 'Process Diagram',
  interactive = false,
}: ProcessDiagramRendererProps) {
  
  // State for interactivity (optional)
  const [hoveredActivityId, setHoveredActivityId] = React.useState<string | null>(null);

  return (
    <div className="w-full bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600 mt-1">
          {layout.swimlanes.length} swimlanes • {layout.activities.size} activities
        </p>
      </div>

      {/* SVG Canvas */}
      <div className="overflow-auto bg-gray-50">
        <svg
          width={layout.totalWidth}
          height={layout.totalHeight}
          className="min-w-full min-h-full bg-white"
          style={{ display: 'block' }}
        >
          {/* Background */}
          <rect
            width={layout.totalWidth}
            height={layout.totalHeight}
            fill="#FFFFFF"
          />

          {/* Define arrow marker for connectors */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#6B7280" />
            </marker>
            <marker
              id="arrowhead-green"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#10B981" />
            </marker>
            <marker
              id="arrowhead-red"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#EF4444" />
            </marker>
          </defs>

          {/* Header background (optional - for styling) */}
          <rect
            x="0"
            y="0"
            width={layout.totalWidth}
            height={80}
            fill="#F9FAFB"
            stroke="#E5E7EB"
            strokeWidth="1"
          />

          {/* Swimlane bars and labels */}
          {renderSwimlanes(layout.swimlanes)}

          {/* Activity boxes */}
          {renderActivities(
            layout.activities,
            steps,
            hoveredActivityId,
            interactive,
            setHoveredActivityId
          )}

          {/* Connectors (arrows) */}
          {renderConnectors(layout.connectors)}

          {/* Connector labels (Yes/No/etc) */}
          {renderConnectorLabels(layout.connectors)}
        </svg>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 text-xs text-gray-600">
        <span>{layout.activities.size} activities</span>
        {' • '}
        <span>{layout.connectors.length} flows</span>
        {' • '}
        <span>{layout.swimlanes.length} swimlanes</span>
      </div>
    </div>
  );
}

// ─── RENDER SWIMLANES ──────────────────────────────────────────────────

function renderSwimlanes(swimlanes: SwimlaneLayout[]): React.ReactNode {
  return swimlanes.map((swimlane, index) => (
    <g key={`swimlane-${index}`}>
      {/* Swimlane bar on left */}
      <rect
        x="140"
        y={swimlane.y}
        width="12"
        height={swimlane.height}
        fill={swimlane.color}
      />

      {/* Swimlane label */}
      <text
        x="130"
        y={swimlane.y + swimlane.height / 2}
        textAnchor="end"
        fontSize="13"
        fontWeight="600"
        fill="#1F2937"
        dominantBaseline="middle"
      >
        {swimlane.name}
      </text>

      {/* Swimlane background (light tint) */}
      <rect
        x="152"
        y={swimlane.y}
        width={swimlane.width - 152}
        height={swimlane.height}
        fill="rgba(0, 0, 0, 0.01)"
        pointerEvents="none"
      />
    </g>
  ));
}

// ─── RENDER ACTIVITIES ─────────────────────────────────────────────────

function renderActivities(
  activities: Map<string, ActivityLayout>,
  steps: Map<string, ProcessStep>,
  hoveredActivityId: string | null,
  interactive: boolean,
  setHoveredActivityId: (id: string | null) => void
): React.ReactNode {
  return Array.from(activities.values()).map((activity) => {
    const step = steps.get(activity.id);
    if (!step) return null;

    // Get department color
    const colors = DEPARTMENT_COLORS[activity.department] || DEPARTMENT_COLORS.Marketing;
    const isHovered = interactive && hoveredActivityId === activity.id;

    return (
      <g
        key={`activity-${activity.id}`}
        onMouseEnter={() => interactive && setHoveredActivityId(activity.id)}
        onMouseLeave={() => interactive && setHoveredActivityId(null)}
        style={{ cursor: interactive ? 'pointer' : 'default' }}
      >
        {/* Activity box */}
        <rect
          x={activity.x}
          y={activity.y}
          width={activity.width}
          height={activity.height}
          rx="6"
          fill="#FFFFFF"
          stroke={colors.border}
          strokeWidth="3.5"
          filter={isHovered ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.1))'}
          style={{
            transition: 'all 0.2s ease',
            opacity: isHovered ? 1 : 0.95,
          }}
        />

        {/* Order badge (circle with number) */}
        <circle
          cx={activity.x + 14}
          cy={activity.y + 14}
          r="14"
          fill={colors.primary}
        />
        <text
          x={activity.x + 14}
          y={activity.y + 18}
          textAnchor="middle"
          fontSize="12"
          fontWeight="bold"
          fill="#FFFFFF"
          pointerEvents="none"
        >
          {activity.order}
        </text>

        {/* Activity name (main text) */}
        <text
          x={activity.x + activity.width / 2}
          y={activity.y + 35}
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill="#1F2937"
          pointerEvents="none"
        >
          {step.action_name}
        </text>

        {/* Estimated duration (optional metadata) */}
        {step.estimated_duration && (
          <text
            x={activity.x + activity.width / 2}
            y={activity.y + 55}
            textAnchor="middle"
            fontSize="11"
            fill="#6B7280"
            pointerEvents="none"
          >
            {step.estimated_duration}
          </text>
        )}
      </g>
    );
  });
}

// ─── RENDER CONNECTORS (LINES WITH ARROWS) ────────────────────────────

function renderConnectors(connectors: ConnectorLayout[]): React.ReactNode {
  return connectors.map((connector) => {
    // Determine arrow color based on condition
    let arrowMarker = 'url(#arrowhead)'; // default gray
    if (connector.label?.text?.toLowerCase() === 'yes' || 
        connector.label?.text?.toLowerCase() === 'approve') {
      arrowMarker = 'url(#arrowhead-green)';
    } else if (connector.label?.text?.toLowerCase() === 'no' || 
               connector.label?.text?.toLowerCase() === 'reject') {
      arrowMarker = 'url(#arrowhead-red)';
    }

    return (
      <path
        key={`connector-${connector.id}`}
        d={connector.path}
        stroke="#6B7280"
        strokeWidth="2.5"
        fill="none"
        markerEnd={arrowMarker}
        style={{
          pointerEvents: 'none',
        }}
      />
    );
  });
}

// ─── RENDER CONNECTOR LABELS (YES/NO/ETC) ────────────────────────────

function renderConnectorLabels(connectors: ConnectorLayout[]): React.ReactNode {
  return connectors.map((connector) => {
    if (!connector.label) return null;

    return (
      <g key={`label-${connector.id}`}>
        {/* Background for label (optional - for readability) */}
        <rect
          x={connector.label.x - 20}
          y={connector.label.y - 10}
          width="40"
          height="20"
          rx="3"
          fill="white"
          stroke={connector.label.color}
          strokeWidth="1"
          opacity="0.9"
        />

        {/* Label text */}
        <text
          x={connector.label.x}
          y={connector.label.y}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill={connector.label.color}
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {connector.label.text}
        </text>
      </g>
    );
  });
}

// ============================================================================
// END OF SVG RENDERER
// Next: Create a page component to use this renderer
// ============================================================================