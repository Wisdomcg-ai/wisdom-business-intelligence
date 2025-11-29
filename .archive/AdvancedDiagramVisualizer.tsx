'use client';

import React from 'react';
import { StepUI } from '@/lib/types/processWizard';

interface AdvancedDiagramVisualizerProps {
  steps: StepUI[];
  title?: string;
}

export function AdvancedDiagramVisualizer({
  steps,
  title = 'Process Diagram',
}: AdvancedDiagramVisualizerProps) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200">
        <div className="text-center">
          <p className="text-slate-500 text-sm font-medium">Add steps to see diagram</p>
        </div>
      </div>
    );
  }

  // Calculate diagram dimensions
  const STEP_WIDTH = 140;
  const STEP_HEIGHT = 70;
  const VERTICAL_SPACING = 120;
  const HORIZONTAL_PADDING = 40;
  const TOP_MARGIN = 40;

  // Group steps by role
  const swimlanes: { [role: string]: StepUI[] } = {};
  steps.forEach((step) => {
    const role = step.role || 'Unknown';
    if (!swimlanes[role]) {
      swimlanes[role] = [];
    }
    swimlanes[role].push(step);
  });

  const swimlaneArray = Object.entries(swimlanes);
  const SWIMLANE_WIDTH = 200;
  
  const diagramHeight = steps.length * VERTICAL_SPACING + 120;
  const diagramWidth = swimlaneArray.length * SWIMLANE_WIDTH + 2 * HORIZONTAL_PADDING;

  // Color palette for roles
  const roleColors: { [key: string]: { bg: string; border: string; text: string } } = {
    Sales: { bg: '#3b82f6', border: '#1e40af', text: '#ffffff' },
    Marketing: { bg: '#8b5cf6', border: '#6d28d9', text: '#ffffff' },
    Operations: { bg: '#10b981', border: '#059669', text: '#ffffff' },
    Finance: { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
    Support: { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
  };

  const getColorForRole = (role: string) => {
    return roleColors[role] || {
      bg: '#6366f1',
      border: '#4f46e5',
      text: '#ffffff',
    };
  };

  // Render diagram
  return (
    <div className="w-full h-full bg-white rounded-lg border border-slate-200 overflow-auto flex flex-col">
      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-1">
          {steps.length} step{steps.length !== 1 ? 's' : ''} • {swimlaneArray.length} role
          {swimlaneArray.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <svg
          width={Math.max(diagramWidth, 800)}
          height={Math.max(diagramHeight, 400)}
          className="bg-white border border-slate-100 rounded"
          style={{ minWidth: '100%', minHeight: '100%' }}
        >
          {/* Swimlane backgrounds and headers */}
          {swimlaneArray.map(([role], roleIdx) => {
            const x = HORIZONTAL_PADDING + roleIdx * SWIMLANE_WIDTH;
            const colors = getColorForRole(role);

            return (
              <g key={`swimlane-${roleIdx}`}>
                {/* Swimlane background */}
                <rect
                  x={x}
                  y={0}
                  width={SWIMLANE_WIDTH}
                  height={diagramHeight}
                  fill={colors.bg}
                  opacity="0.05"
                  stroke={colors.border}
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />

                {/* Header */}
                <rect
                  x={x}
                  y={0}
                  width={SWIMLANE_WIDTH}
                  height={40}
                  fill={colors.bg}
                  stroke={colors.border}
                  strokeWidth="2"
                />

                {/* Role label */}
                <text
                  x={x + SWIMLANE_WIDTH / 2}
                  y={27}
                  textAnchor="middle"
                  className="text-xs font-bold"
                  fill={colors.text}
                  fontWeight="bold"
                >
                  {role}
                </text>

                {/* Vertical divider */}
                {roleIdx < swimlaneArray.length - 1 && (
                  <line
                    x1={x + SWIMLANE_WIDTH}
                    y1={0}
                    x2={x + SWIMLANE_WIDTH}
                    y2={diagramHeight}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                )}
              </g>
            );
          })}

          {/* Steps */}
          {steps.map((step, stepIdx) => {
            const roleIdx = swimlaneArray.findIndex(([role]) => role === step.role);
            const x = HORIZONTAL_PADDING + roleIdx * SWIMLANE_WIDTH + SWIMLANE_WIDTH / 2;
            const y = TOP_MARGIN + 60 + stepIdx * VERTICAL_SPACING;
            const colors = getColorForRole(step.role || 'Unknown');

            return (
              <g key={`step-${step.id}`}>
                {/* Connector from previous step */}
                {stepIdx > 0 && (
                  <line
                    x1={x}
                    y1={y - 50}
                    x2={x}
                    y2={y - 10}
                    stroke="#cbd5e1"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                  />
                )}

                {/* Step box */}
                <rect
                  x={x - STEP_WIDTH / 2}
                  y={y}
                  width={STEP_WIDTH}
                  height={STEP_HEIGHT}
                  rx="6"
                  fill={colors.bg}
                  stroke={step.isKeyStep ? '#f97316' : colors.border}
                  strokeWidth={step.isKeyStep ? '3' : '2'}
                  opacity="0.9"
                />

                {/* Step order badge */}
                <circle
                  cx={x - STEP_WIDTH / 2 + 12}
                  cy={y + 12}
                  r="8"
                  fill="#ffffff"
                  opacity="0.3"
                />
                <text
                  x={x - STEP_WIDTH / 2 + 12}
                  y={y + 16}
                  textAnchor="middle"
                  className="text-xs font-bold"
                  fill="#ffffff"
                  fontWeight="bold"
                >
                  {step.order}
                </text>

                {/* Step title */}
                <text
                  x={x}
                  y={y + STEP_HEIGHT / 2 + 4}
                  textAnchor="middle"
                  className="text-xs font-semibold"
                  fill="#ffffff"
                  fontWeight="600"
                >
                  {step.title.substring(0, 16)}
                </text>

                {/* Type indicator */}
                <text
                  x={x}
                  y={y + STEP_HEIGHT - 8}
                  textAnchor="middle"
                  className="text-[10px]"
                  fill="rgba(255,255,255,0.8)"
                >
                  {step.type === 'action' ? '▶' : '◆'}
                </text>

                {/* Icon indicators row */}
                <g>
                  {step.successCriteria && (
                    <circle cx={x - 18} cy={y + STEP_HEIGHT + 14} r="4" fill="#16a34a" />
                  )}
                  {step.automation && (
                    <circle cx={x - 6} cy={y + STEP_HEIGHT + 14} r="4" fill="#9333ea" />
                  )}
                  {step.dependencies && (
                    <circle cx={x + 6} cy={y + STEP_HEIGHT + 14} r="4" fill="#2563eb" />
                  )}
                  {step.isKeyStep && (
                    <circle cx={x + 18} cy={y + STEP_HEIGHT + 14} r="4" fill="#f97316" />
                  )}
                </g>
              </g>
            );
          })}

          {/* Arrow marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <polygon points="0 0, 10 5, 0 10" fill="#cbd5e1" />
            </marker>
          </defs>
        </svg>
      </div>

      {/* Legend */}
      <div className="p-4 bg-slate-50 border-t border-slate-200">
        <div className="grid grid-cols-4 gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-600" />
            <span className="text-slate-600">Success Criteria</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-600" />
            <span className="text-slate-600">Automation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600" />
            <span className="text-slate-600">Dependencies</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-600" />
            <span className="text-slate-600">Key Step</span>
          </div>
        </div>
      </div>
    </div>
  );
}