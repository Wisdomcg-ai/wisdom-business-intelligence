// ============================================
// PROFESSIONAL PROCESS DIAGRAM RENDERER
// Enhanced with Phase 3: Advanced Rendering
// ============================================

import React from 'react';
import { StepUI } from '@/lib/types/processWizard';

interface ProfessionalDiagramProps {
  steps: StepUI[];
  title?: string;
}

// Enhanced Icon Library - Phase 3
const Icons = {
  document: (x: number, y: number, size: number = 12) => (
    <g key={`doc_${x}_${y}`}>
      <rect x={x} y={y} width={size} height={size + 2} fill="none" stroke="#DC2626" strokeWidth="1.5" />
      <line x1={x + 2} y1={y + 4} x2={x + size - 2} y2={y + 4} stroke="#DC2626" strokeWidth="0.5" />
      <line x1={x + 2} y1={y + 7} x2={x + size - 2} y2={y + 7} stroke="#DC2626" strokeWidth="0.5" />
    </g>
  ),
  
  automation: (x: number, y: number, size: number = 12) => (
    <g key={`auto_${x}_${y}`}>
      <circle cx={x + size / 2} cy={y + size / 2} r={size / 2} fill="none" stroke="#8B5CF6" strokeWidth="1.5" />
      <path d={`M ${x + 3} ${y + size / 2} L ${x + size - 3} ${y + size / 2}`} stroke="#8B5CF6" strokeWidth="1" />
      <path d={`M ${x + size - 5} ${y + size / 2 - 2} L ${x + size - 2} ${y + size / 2} L ${x + size - 5} ${y + size / 2 + 2}`} fill="#8B5CF6" />
    </g>
  ),

  dependency: (x: number, y: number, size: number = 12) => (
    <g key={`dep_${x}_${y}`}>
      <circle cx={x + size / 3} cy={y + size / 2} r="2" fill="#3B82F6" />
      <circle cx={x + (size * 2) / 3} cy={y + size / 2} r="2" fill="#3B82F6" />
      <line x1={x + size / 3 + 2} y1={y + size / 2} x2={x + (size * 2) / 3 - 2} y2={y + size / 2} stroke="#3B82F6" strokeWidth="1" />
    </g>
  ),

  checkmark: (x: number, y: number, size: number = 12) => (
    <g key={`check_${x}_${y}`}>
      <circle cx={x + size / 2} cy={y + size / 2} r={size / 2} fill="none" stroke="#10B981" strokeWidth="1.5" />
      <path d={`M ${x + 3} ${y + size / 2} L ${x + size / 3 + 2} ${y + size - 3} L ${x + size - 3} ${y + 3}`} fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),

  warning: (x: number, y: number, size: number = 12) => (
    <g key={`warn_${x}_${y}`}>
      <polygon points={`${x + size / 2},${y} ${x + size},${y + size} ${x},${y + size}`} fill="none" stroke="#F59E0B" strokeWidth="1.5" />
      <circle cx={x + size / 2} cy={y + size * 0.65} r="1" fill="#F59E0B" />
    </g>
  ),

  time: (x: number, y: number, size: number = 12) => (
    <g key={`time_${x}_${y}`}>
      <circle cx={x + size / 2} cy={y + size / 2} r={size / 2} fill="none" stroke="#6B7280" strokeWidth="1" />
      <line x1={x + size / 2} y1={y + 2} x2={x + size / 2} y2={y + size / 2} stroke="#6B7280" strokeWidth="1" />
      <line x1={x + size / 2} y1={y + size / 2} x2={x + size - 2} y2={y + size / 2} stroke="#6B7280" strokeWidth="1" />
    </g>
  ),
  
  dollar: (x: number, y: number, size: number = 12) => (
    <g key={`dollar_${x}_${y}`}>
      <text x={x + size / 2} y={y + size} fontSize={size - 2} fontWeight="bold" fill="#6B7280" textAnchor="middle">
        $
      </text>
    </g>
  ),
};

export function ProfessionalDiagramVisualizer({ steps, title }: ProfessionalDiagramProps) {
  if (steps.length === 0) {
    return (
      <div className="w-full h-96 bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 font-semibold mb-1">Process diagram will appear here</p>
          <p className="text-slate-500 text-sm">Add steps to visualize your flow</p>
        </div>
      </div>
    );
  }

  // Configuration
  const config = {
    stepWidth: 160,
    stepHeight: 80,
    diamondSize: 100,
    horizontalSpacing: 100,
    verticalSpacing: 160,
    leftMargin: 60,
    topMargin: 50,
    annotationHeight: 60,
  };

  // Get unique roles
  const roles = Array.from(new Set(steps.map(s => s.role).filter(r => r)));
  
  // Enhanced color palette - Phase 3
  const roleColors: Record<string, { fill: string; stroke: string; text: string }> = {
    'Sales': { fill: '#FEF08A', stroke: '#FBBF24', text: '#92400E' },
    'Sales Admin': { fill: '#FEF08A', stroke: '#FBBF24', text: '#92400E' },
    'Sales Manager': { fill: '#BFDBFE', stroke: '#60A5FA', text: '#1E40AF' },
    'Admin': { fill: '#FCA5A5', stroke: '#F87171', text: '#7F1D1D' },
    'Operations': { fill: '#A7F3D0', stroke: '#6EE7B7', text: '#065F46' },
    'Finance': { fill: '#DDD6FE', stroke: '#C4B5FD', text: '#4C1D95' },
    'Marketing': { fill: '#F9A8D4', stroke: '#F472B6', text: '#831843' },
    'Support': { fill: '#FECACA', stroke: '#FCA5A5', text: '#7F1D1D' },
    'Director': { fill: '#E879F9', stroke: '#D946EF', text: '#581C87' },
    'Project Management': { fill: '#93C5FD', stroke: '#60A5FA', text: '#1E40AF' },
  };

  roles.forEach((role, i) => {
    if (!roleColors[role]) {
      const colors = [
        { fill: '#FEF08A', stroke: '#FBBF24', text: '#92400E' },
        { fill: '#BFDBFE', stroke: '#60A5FA', text: '#1E40AF' },
        { fill: '#DDD6FE', stroke: '#A78BFA', text: '#4C1D95' },
        { fill: '#A7F3D0', stroke: '#6EE7B7', text: '#065F46' },
        { fill: '#F9A8D4', stroke: '#F472B6', text: '#831843' },
        { fill: '#FECACA', stroke: '#FCA5A5', text: '#7F1D1D' },
      ];
      roleColors[role] = colors[i % colors.length];
    }
  });

  const svgWidth = Math.max(steps.length * (config.stepWidth + config.horizontalSpacing) + config.leftMargin + 200, 1400);
  const svgHeight = Math.max(
    roles.length * config.verticalSpacing + config.topMargin + config.annotationHeight + 100,
    600
  );

  // Helper: Draw smart Bezier curve connector - Phase 3
  const drawConnector = (x1: number, y1: number, x2: number, y2: number, label?: string, color: string = '#64748B') => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const controlPointDistance = Math.max(distance * 0.3, 60);

    // Smooth Bezier curve
    const path = `M ${x1} ${y1} 
                  C ${x1 + controlPointDistance} ${y1}, 
                    ${x2 - controlPointDistance} ${y2}, 
                    ${x2} ${y2}`;

    return {
      path,
      label,
      color,
    };
  };

  return (
    <div className="w-full border border-slate-300 rounded-lg bg-gradient-to-b from-white to-slate-50 overflow-hidden">
      {title && (
        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-300">
          <p className="font-bold text-lg text-white">{title}</p>
        </div>
      )}
      
      <div className="overflow-x-auto p-6">
        <svg width={svgWidth} height={svgHeight} className="min-w-full">
          <defs>
            {/* Gradients */}
            <linearGradient id="actionGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#3B82F6', stopOpacity: 0.15 }} />
              <stop offset="100%" style={{ stopColor: '#1E40AF', stopOpacity: 0.05 }} />
            </linearGradient>

            {/* Arrow markers */}
            <marker id="arrowMain" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#64748B" />
            </marker>
            <marker id="arrowYes" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#10B981" />
            </marker>
            <marker id="arrowNo" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#EF4444" />
            </marker>

            {/* Filters - Phase 3 */}
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="2" dy="3" stdDeviation="3" floodOpacity="0.15" floodColor="#000000" />
            </filter>
            <filter id="highlight">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1" />
            </filter>
          </defs>

          {/* SWIMLANES - Enhanced with gradients */}
          {roles.map((role, roleIndex) => (
            <g key={`swimlane_${role}`}>
              {/* Background gradient */}
              <rect
                x="0"
                y={config.topMargin + roleIndex * config.verticalSpacing}
                width={svgWidth}
                height={config.verticalSpacing}
                fill={roleColors[role].fill}
                opacity="0.1"
                stroke={roleColors[role].stroke}
                strokeWidth="2"
              />

              {/* Label box - enhanced styling */}
              <rect
                x="8"
                y={config.topMargin + roleIndex * config.verticalSpacing + 12}
                width="160"
                height="55"
                fill={roleColors[role].fill}
                stroke={roleColors[role].stroke}
                strokeWidth="2.5"
                rx="8"
                filter="url(#shadow)"
              />

              <text
                x="88"
                y={config.topMargin + roleIndex * config.verticalSpacing + 48}
                fontSize="14"
                fontWeight="bold"
                fill={roleColors[role].text}
                textAnchor="middle"
              >
                {role}
              </text>
            </g>
          ))}

          {/* STEPS AND CONNECTORS */}
          {steps.map((step, idx) => {
            const roleIndex = roles.indexOf(step.role);
            const x = config.leftMargin + idx * (config.stepWidth + config.horizontalSpacing);
            const y = config.topMargin + 90 + roleIndex * config.verticalSpacing;
            const isDecision = step.type === 'decision';
            const isKeyStep = step.isKeyStep;

            return (
              <g key={`step_group_${step.id}`}>
                {/* SMART CONNECTOR FROM PREVIOUS STEP - Phase 3 Bezier curves */}
                {idx > 0 && (
                  <g key={`connector_${idx}`}>
                    {(() => {
                      const prevStep = steps[idx - 1];
                      const prevRoleIndex = roles.indexOf(prevStep.role);
                      const prevX = config.leftMargin + (idx - 1) * (config.stepWidth + config.horizontalSpacing);
                      const prevY = config.topMargin + 90 + prevRoleIndex * config.verticalSpacing;
                      const prevIsDecision = prevStep.type === 'decision';

                      const x1 = prevX + (prevIsDecision ? config.diamondSize / 2 : config.stepWidth / 2);
                      const y1 = prevY + (prevIsDecision ? config.diamondSize / 2 : config.stepHeight / 2);
                      const x2 = x + (isDecision ? config.diamondSize / 2 : config.stepWidth / 2);
                      const y2 = y + (isDecision ? config.diamondSize / 2 : config.stepHeight / 2);

                      let strokeColor = '#64748B';
                      let markerUrl = 'url(#arrowMain)';
                      let connectorLabel = '';

                      const connector = drawConnector(x1, y1, x2, y2, connectorLabel, strokeColor);

                      return (
                        <>
                          <path
                            d={connector.path}
                            stroke={connector.color}
                            strokeWidth="2.5"
                            fill="none"
                            markerEnd={markerUrl}
                          />
                        </>
                      );
                    })()}
                  </g>
                )}

                {/* DECISION DIAMOND - Enhanced styling */}
                {isDecision ? (
                  <g key={`decision_${step.id}`} filter={isKeyStep ? 'url(#highlight)' : 'url(#shadow)'}>
                    {/* Key step indicator */}
                    {isKeyStep && (
                      <circle 
                        cx={x + config.diamondSize / 2} 
                        cy={y + config.diamondSize / 2} 
                        r={config.diamondSize / 2 + 8} 
                        fill="none" 
                        stroke="#F59E0B" 
                        strokeWidth="1" 
                        strokeDasharray="4,4" 
                        opacity="0.5" 
                      />
                    )}

                    {/* Diamond shape */}
                    <polygon
                      points={`${x + config.diamondSize / 2},${y} ${x + config.diamondSize},${y + config.diamondSize / 2} ${x + config.diamondSize / 2},${y + config.diamondSize} ${x},${y + config.diamondSize / 2}`}
                      fill={roleColors[step.role].fill}
                      stroke={roleColors[step.role].stroke}
                      strokeWidth="2.5"
                      opacity="0.95"
                    />

                    {/* Order badge */}
                    <circle cx={x + 20} cy={y + 20} r="11" fill={roleColors[step.role].text} />
                    <text x={x + 20} y={y + 25} fontSize="10" fontWeight="bold" fill="white" textAnchor="middle">
                      {step.order}
                    </text>

                    {/* Decision question text */}
                    <text
                      x={x + config.diamondSize / 2}
                      y={y + config.diamondSize / 2 - 8}
                      fontSize="11"
                      fontWeight="600"
                      fill={roleColors[step.role].text}
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {step.title.substring(0, 12)}
                    </text>
                    <text
                      x={x + config.diamondSize / 2}
                      y={y + config.diamondSize / 2 + 8}
                      fontSize="18"
                      fontWeight="bold"
                      fill={roleColors[step.role].text}
                      textAnchor="middle"
                    >
                      ?
                    </text>

                    {/* YES/NO outcome labels */}
                    <text x={x + config.diamondSize + 20} y={y + config.diamondSize / 2 - 5} fontSize="11" fontWeight="bold" fill="#10B981">
                      YES
                    </text>
                    <text x={x - 35} y={y + config.diamondSize / 2 - 5} fontSize="11" fontWeight="bold" fill="#EF4444">
                      NO
                    </text>
                  </g>
                ) : (
                  /* ACTION RECTANGLE - Enhanced styling */
                  <g key={`action_${step.id}`} filter={isKeyStep ? 'url(#highlight)' : 'url(#shadow)'}>
                    {/* Key step indicator */}
                    {isKeyStep && (
                      <rect 
                        x={x - 6} 
                        y={y - 6} 
                        width={config.stepWidth + 12} 
                        height={config.stepHeight + 12} 
                        fill="none" 
                        stroke="#F59E0B" 
                        strokeWidth="2" 
                        strokeDasharray="4,4" 
                        rx="10" 
                        opacity="0.4" 
                      />
                    )}

                    {/* Main box */}
                    <rect
                      x={x}
                      y={y}
                      width={config.stepWidth}
                      height={config.stepHeight}
                      fill={roleColors[step.role].fill}
                      stroke={roleColors[step.role].stroke}
                      strokeWidth="2.5"
                      rx="10"
                      opacity="0.96"
                    />

                    {/* Order badge */}
                    <circle cx={x + 20} cy={y + 20} r="11" fill={roleColors[step.role].text} />
                    <text x={x + 20} y={y + 25} fontSize="10" fontWeight="bold" fill="white" textAnchor="middle">
                      {step.order}
                    </text>

                    {/* Title text */}
                    <text
                      x={x + config.stepWidth / 2}
                      y={y + config.stepHeight / 2 - 5}
                      fontSize="13"
                      fontWeight="600"
                      fill={roleColors[step.role].text}
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {step.title.substring(0, 20)}
                    </text>

                    {/* Phase 3: Rich icons - bottom of box */}
                    <g>
                      {step.documents && step.documents !== 'N/A' && Icons.document(x + 8, y + config.stepHeight - 20, 12)}
                      {step.automation && Icons.automation(x + 28, y + config.stepHeight - 20, 12)}
                      {step.dependencies && Icons.dependency(x + 48, y + config.stepHeight - 20, 12)}
                      {step.successCriteria && Icons.checkmark(x + 68, y + config.stepHeight - 20, 12)}
                      {isKeyStep && Icons.warning(x + 88, y + config.stepHeight - 20, 12)}
                    </g>
                  </g>
                )}

                {/* RICH ANNOTATIONS BELOW - Phase 3 */}
                <g key={`annotations_${step.id}`}>
                  {step.timing && step.timing !== 'N/A' && (
                    <g>
                      <rect x={x - 5} y={y + config.stepHeight + 8} width={config.stepWidth + 10} height="24" fill="#F0F9FF" stroke="#0284C7" strokeWidth="1" rx="4" opacity="0.8" />
                      <text x={x + config.stepWidth / 2} y={y + config.stepHeight + 26} fontSize="11" fontWeight="600" fill="#0C4A6E" textAnchor="middle">
                        ⏱ {step.timing}
                      </text>
                    </g>
                  )}

                  {step.successCriteria && step.successCriteria !== 'N/A' && (
                    <g>
                      <text x={x + config.stepWidth / 2} y={y + config.stepHeight + 55} fontSize="9" fontWeight="500" fill="#059669" textAnchor="middle">
                        ✓ {step.successCriteria.substring(0, 25)}
                      </text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}

          {/* ENHANCED LEGEND - Phase 3 */}
          <g>
            <rect x={20} y={svgHeight - 60} width="520" height="55" fill="white" stroke="#D1D5DB" strokeWidth="1.5" rx="8" filter="url(#shadow)" />

            {/* Legend items */}
            <g>
              <rect x={35} y={svgHeight - 48} width="18" height="14" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" rx="2" />
              <text x={60} y={svgHeight - 37} fontSize="11" fontWeight="600" fill="#1E293B">Action</text>
            </g>

            <g>
              <polygon points={`${108},${svgHeight - 48} ${121},${svgHeight - 41} ${108},${svgHeight - 34} ${95},${svgHeight - 41}`} fill="#FCD34D" stroke="#92400E" strokeWidth="1.5" />
              <text x={135} y={svgHeight - 37} fontSize="11" fontWeight="600" fill="#1E293B">Decision</text>
            </g>

            <g>
              <circle cx={230} cy={svgHeight - 41} r="7" fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3,3" />
              <text x={250} y={svgHeight - 37} fontSize="11" fontWeight="600" fill="#1E293B">Key Step</text>
            </g>

            {/* Icon legend */}
            <g>
              {Icons.document(360, svgHeight - 47, 11)}
              <text x={380} y={svgHeight - 37} fontSize="10" fill="#6B7280">Docs</text>
            </g>

            <g>
              {Icons.automation(420, svgHeight - 47, 11)}
              <text x={440} y={svgHeight - 37} fontSize="10" fill="#6B7280">Auto</text>
            </g>

            <g>
              {Icons.checkmark(475, svgHeight - 47, 11)}
              <text x={495} y={svgHeight - 37} fontSize="10" fill="#6B7280">Success</text>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}