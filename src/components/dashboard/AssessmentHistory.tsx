'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AssessmentSummary, getHealthStatusColor } from '@/lib/dashboard-service';

interface AssessmentHistoryProps {
  assessments: AssessmentSummary[];
}

export default function AssessmentHistory({ assessments }: AssessmentHistoryProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  const getTrendIcon = (current: number, index: number) => {
    if (index >= assessments.length - 1) return <Minus className="w-4 h-4 text-gray-400" />;
    
    const previous = assessments[index + 1].percentage;
    if (current > previous) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (current < previous) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  if (assessments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Assessment History</h3>
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No assessments completed yet</p>
          <Link
            href="/assessment"
            className="mt-4 inline-block px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            Take Your First Assessment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Assessment History</h3>
        <span className="text-sm text-gray-500">
          {assessments.length} total
        </span>
      </div>
      
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {assessments.map((assessment, index) => (
          <div
            key={assessment.id}
            className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(assessment.created_at)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatTime(assessment.created_at)}
                  </span>
                  {index === 0 && (
                    <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded-full">
                      Latest
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {assessment.percentage}%
                    </span>
                    {getTrendIcon(assessment.percentage, index)}
                  </div>
                  
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getHealthStatusColor(assessment.health_status)}`}>
                    {assessment.health_status}
                  </span>
                </div>
                
                {/* Score breakdown */}
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <span>Foundation: {Math.round((assessment.business_foundation_score / 40) * 100)}%</span>
                  <span>Strategic: {Math.round((assessment.strategic_wheel_score / 60) * 100)}%</span>
                  <span>Profitability: {Math.round((assessment.profitability_health_score / 30) * 100)}%</span>
                  <span>Engines: {Math.round((assessment.business_engines_score / 100) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}