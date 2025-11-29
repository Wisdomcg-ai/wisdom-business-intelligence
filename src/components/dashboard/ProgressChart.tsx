'use client';

import React from 'react';
import { AssessmentSummary } from '@/lib/dashboard-service';

interface ProgressChartProps {
  assessments: AssessmentSummary[];
}

export default function ProgressChart({ assessments }: ProgressChartProps) {
  // Reverse to show oldest first
  const chartData = [...assessments].reverse();
  
  // Calculate max score for scaling
  const maxScore = Math.max(...chartData.map(a => a.percentage), 100);
  const chartHeight = 200;
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (assessments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress Over Time</h3>
        <div className="h-48 flex items-center justify-center text-gray-500">
          No assessment data yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress Over Time</h3>
      
      {/* Simple SVG Chart */}
      <div className="relative">
        <svg className="w-full" height={chartHeight + 40}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(value => {
            const y = chartHeight - (value / 100) * chartHeight + 10;
            return (
              <g key={value}>
                <line
                  x1="40"
                  y1={y}
                  x2="100%"
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray="2 2"
                />
                <text x="5" y={y + 5} className="text-xs fill-gray-500">
                  {value}%
                </text>
              </g>
            );
          })}
          
          {/* Line chart */}
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={chartData.map((assessment, index) => {
              const x = 50 + (index * ((100 - 10) / (chartData.length - 1 || 1)));
              const y = chartHeight - (assessment.percentage / 100) * chartHeight + 10;
              return `${x},${y}`;
            }).join(' ')}
          />
          
          {/* Data points */}
          {chartData.map((assessment, index) => {
            const x = 50 + (index * ((100 - 10) / (chartData.length - 1 || 1)));
            const y = chartHeight - (assessment.percentage / 100) * chartHeight + 10;
            
            return (
              <g key={assessment.id}>
                <circle
                  cx={`${x}%`}
                  cy={y}
                  r="4"
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth="2"
                />
                <text
                  x={`${x}%`}
                  y={chartHeight + 30}
                  textAnchor="middle"
                  className="text-xs fill-gray-500"
                >
                  {formatDate(assessment.created_at)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      
      {/* Legend */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} completed
        </span>
        <span className="text-gray-900 font-medium">
          Current: {chartData[chartData.length - 1]?.percentage || 0}%
        </span>
      </div>
    </div>
  );
}