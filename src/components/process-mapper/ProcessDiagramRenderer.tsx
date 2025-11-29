'use client';

import React from 'react';
import { Activity, Connection, ProcessData, FUNCTION_COLORS, ROLE_COLORS, GRID_CONFIG, getFunctionColor, getRoleColor } from '@/lib/process-mapper/types';

interface Props {
  data: ProcessData;
  title?: string;
}

const SWIMLANE_COLORS = ['#84cc16', '#f97316', '#06b6d4', '#3b82f6'];

export function ProcessDiagramRenderer({ data, title }: Props) {
  // Calculate grid dimensions with professional spacing
  const numRoles = data.roles.length;
  const numFunctions = data.functions.length;
  const swimlaneBarWidth = 12;
  const sidebarWidth = 140;
  const colWidth = 240;
  const rowHeight = 160;
  const headerHeight = 90;
  const paddingX = 16;
  const paddingY = 16;

  const totalWidth = swimlaneBarWidth + sidebarWidth + numFunctions * colWidth + 40;
  const totalHeight = headerHeight + numRoles * rowHeight + 100;

  // Helper to find activity position
  const getActivityPosition = (activity: Activity) => {
    const roleIndex = data.roles.indexOf(activity.role);
    const funcIndex = data.functions.indexOf(activity.function);

    if (roleIndex === -1 || funcIndex === -1) return null;

    const x = swimlaneBarWidth + sidebarWidth + funcIndex * colWidth + paddingX;
    const y = headerHeight + roleIndex * rowHeight + paddingY;

    return { x, y, roleIndex, funcIndex };
  };

  // Sort activities by order
  const sortedActivities = [...data.activities].sort((a, b) => a.order - b.order);

  // Build connectors with curves
  const connectors = data.connections
    .map((conn) => {
      const fromActivity = data.activities.find((a) => a.id === conn.from);
      const toActivity = data.activities.find((a) => a.id === conn.to);

      if (!fromActivity || !toActivity) return null;

      const fromPos = getActivityPosition(fromActivity);
      const toPos = getActivityPosition(toActivity);

      if (!fromPos || !toPos) return null;

      const activityBoxWidth = colWidth - paddingX * 2 - 16;
      const activityBoxHeight = 70;

      const x1 = fromPos.x + activityBoxWidth / 2;
      const y1 = fromPos.y + activityBoxHeight / 2;
      const x2 = toPos.x + activityBoxWidth / 2;
      const y2 = toPos.y + activityBoxHeight / 2;

      return { x1, y1, x2, y2, label: conn.label };
    })
    .filter(Boolean) as Array<{ x1: number; y1: number; x2: number; y2: number; label?: string }>;

  return (
    <div className="w-full bg-white p-8">
      {title && (
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">{title}</h2>
          {data.description && (
            <p className="text-slate-600 text-sm">{data.description}</p>
          )}
        </div>
      )}

      {/* SVG Diagram - Professional Quality */}
      <div 
        className="border-2 border-slate-300 rounded-lg overflow-auto bg-white" 
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
      >
        <svg width={totalWidth} height={totalHeight} className="bg-white" style={{ minWidth: '100%', minHeight: '100%' }}>
          <defs>
            {/* Arrow marker for connectors */}
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#64748b" />
            </marker>

            {/* Grid pattern */}
            <pattern id="grid" width={colWidth} height={rowHeight} patternUnits="userSpaceOnUse">
              <path 
                d={`M ${colWidth} 0 L 0 0 0 ${rowHeight}`} 
                fill="none" 
                stroke="#e2e8f0" 
                strokeWidth="1.5" 
              />
            </pattern>
          </defs>

          {/* Colored swimlane bars on left - visual hierarchy */}
          {data.roles.map((role, idx) => {
            const y = headerHeight + idx * rowHeight;
            const swimlaneColor = SWIMLANE_COLORS[idx % SWIMLANE_COLORS.length];
            return (
              <rect
                key={`swimlane-${idx}`}
                x={0}
                y={y}
                width={swimlaneBarWidth}
                height={rowHeight}
                fill={swimlaneColor}
                opacity="0.85"
              />
            );
          })}

          {/* Header Row Background */}
          <rect x={0} y={0} width={totalWidth} height={headerHeight} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />

          {/* Function column headers with colored top bars */}
          {data.functions.map((func, idx) => {
            const x = swimlaneBarWidth + sidebarWidth + idx * colWidth;
            const color = getFunctionColor(func);
            return (
              <g key={`header-${idx}`}>
                {/* Thick colored bar at top of column */}
                <rect x={x} y={0} width={colWidth} height={8} fill={color.border} />

                {/* Header background */}
                <rect 
                  x={x} 
                  y={8} 
                  width={colWidth} 
                  height={headerHeight - 8} 
                  fill={color.light} 
                  stroke="#cbd5e1" 
                  strokeWidth="1.5" 
                />

                {/* Function name - bold, uppercase */}
                <text
                  x={x + colWidth / 2}
                  y={headerHeight / 2 + 12}
                  textAnchor="middle"
                  className="font-bold text-base"
                  fill={color.text}
                  style={{ 
                    fontFamily: 'system-ui, -apple-system, sans-serif', 
                    letterSpacing: '0.5px',
                    fontWeight: '700'
                  }}
                >
                  {func}
                </text>
              </g>
            );
          })}

          {/* Sidebar with role names */}
          {data.roles.map((role, idx) => {
            const y = headerHeight + idx * rowHeight;
            const roleColor = getRoleColor(role);
            return (
              <g key={`sidebar-${idx}`}>
                <rect
                  x={swimlaneBarWidth}
                  y={y}
                  width={sidebarWidth}
                  height={rowHeight}
                  fill={roleColor.bg}
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                />
                <text
                  x={swimlaneBarWidth + sidebarWidth / 2}
                  y={y + rowHeight / 2 + 6}
                  textAnchor="middle"
                  className="font-semibold text-sm"
                  fill={roleColor.text}
                  style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                  {role}
                </text>
              </g>
            );
          })}

          {/* Grid background */}
          <rect
            x={swimlaneBarWidth + sidebarWidth}
            y={headerHeight}
            width={numFunctions * colWidth}
            height={numRoles * rowHeight}
            fill="url(#grid)"
            stroke="#cbd5e1"
            strokeWidth="2"
          />

          {/* Draw connectors BEFORE activities so they appear behind */}
          {connectors.map((conn, idx) => (
            <g key={`connector-${idx}`}>
              {/* Connection line */}
              <line 
                x1={conn.x1} 
                y1={conn.y1} 
                x2={conn.x2} 
                y2={conn.y2} 
                stroke="#64748b" 
                strokeWidth="2.5" 
                markerEnd="url(#arrowhead)" 
              />
              
              {/* Connection label with background */}
              {conn.label && (
                <g>
                  <rect
                    x={(conn.x1 + conn.x2) / 2 - 22}
                    y={(conn.y1 + conn.y2) / 2 - 12}
                    width="44"
                    height="20"
                    rx="3"
                    fill="white"
                    stroke="#cbd5e1"
                    strokeWidth="1"
                  />
                  <text
                    x={(conn.x1 + conn.x2) / 2}
                    y={(conn.y1 + conn.y2) / 2 + 4}
                    textAnchor="middle"
                    className="text-xs font-bold"
                    fill="#475569"
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                  >
                    {conn.label}
                  </text>
                </g>
              )}
            </g>
          ))}

          {/* Draw activities */}
          {sortedActivities.map((activity) => {
            const pos = getActivityPosition(activity);
            if (!pos) return null;

            const color = getFunctionColor(activity.function);
            const isDecision = activity.type === 'decision';
            const boxWidth = colWidth - paddingX * 2 - 16;
            const boxHeight = 70;

            return (
              <g key={activity.id}>
                {/* Activity box - WHITE with THICK colored border */}
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={boxWidth}
                  height={boxHeight}
                  rx="6"
                  fill="#FFFFFF"
                  stroke={color.border}
                  strokeWidth="3.5"
                  filter="drop-shadow(0 2px 6px rgba(0,0,0,0.12))"
                />

                {/* Activity title - clean typography */}
                <text
                  x={pos.x + boxWidth / 2}
                  y={pos.y + boxHeight / 2 + 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs font-semibold"
                  fill="#1f2937"
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    maxWidth: boxWidth - 20,
                  }}
                >
                  {activity.title}
                </text>

                {/* Order badge - colored circle with number */}
                <circle 
                  cx={pos.x + boxWidth - 10} 
                  cy={pos.y + 10} 
                  r="7" 
                  fill={color.border} 
                  stroke="white" 
                  strokeWidth="1.5" 
                />
                <text
                  x={pos.x + boxWidth - 10}
                  y={pos.y + 12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs font-bold"
                  fill="white"
                  style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                  {activity.order}
                </text>

                {/* Decision indicator - colored question mark */}
                {isDecision && (
                  <text
                    x={pos.x + 10}
                    y={pos.y + 14}
                    className="text-xl font-bold"
                    fill={color.border}
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                  >
                    ?
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Professional Legend - 3 column layout */}
      <div className="mt-8 pt-8 border-t border-slate-200">
        <div className="grid grid-cols-3 gap-12">
          {/* Functions Legend */}
          <div>
            <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider">Functions</h3>
            <div className="space-y-3">
              {data.functions.map((func) => {
                const color = getFunctionColor(func);
                return (
                  <div key={func} className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{
                        backgroundColor: color.bg,
                        border: `2.5px solid ${color.border}`,
                      }}
                    />
                    <span className="text-sm font-medium text-slate-700">{func}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Roles Legend */}
          <div>
            <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider">Roles</h3>
            <div className="space-y-2 text-sm text-slate-600">
              {data.roles.map((role, idx) => (
                <div key={role} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: SWIMLANE_COLORS[idx % SWIMLANE_COLORS.length],
                    }}
                  />
                  <span>{role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Statistics */}
          <div>
            <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wider">Statistics</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Activities:</span>
                <span className="font-semibold text-slate-900">{data.activities.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Connections:</span>
                <span className="font-semibold text-slate-900">{data.connections.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Grid Size:</span>
                <span className="font-semibold text-slate-900">
                  {numFunctions} × {numRoles}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}