'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building,
  Calendar,
  CalendarCheck,
  BarChart,
  BarChart3,
  Flame,
  CheckSquare,
  XCircle
} from 'lucide-react';
import ExecutionStatusCard from '@/components/dashboard/ExecutionStatusCard';
import ClientLayout from '@/components/client/ClientLayout';

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [businessName, setBusinessName] = useState('Building & Construction');

  useEffect(() => {
    setMounted(true);

    // Load business name from localStorage
    const savedProfile = localStorage.getItem('businessProfile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile);
      setBusinessName(profile.businessName || 'Building & Construction');
    }
  }, []);

  // Annual Goals
  const annualGoals = [
    { label: 'Revenue Target', value: '$5.0M' },
    { label: 'Profit Margin', value: '20%' },
    { label: 'Team Size', value: '25 people' }
  ];

  // 90-Day Goals
  const quarterlyGoals = [
    { label: 'Q1 Revenue', value: '$1.3M' },
    { label: 'Profit Margin', value: '18%' },
    { label: 'Cash Days', value: '60 days' }
  ];

  // Q1 Rocks (90-day priorities)
  const rocks = [
    { id: 1, title: 'Launch new product line', owner: 'John', status: 'on-track', progress: 40, date: '31/3/2024' },
    { id: 2, title: 'Implement CRM system', owner: 'Sarah', status: 'on-track', progress: 65, date: '31/3/2024' },
    { id: 3, title: 'Hire 3 senior developers', owner: 'Mike', status: 'behind', progress: 20, date: '31/3/2024' },
    { id: 4, title: 'Complete Series A prep', owner: 'CEO', status: 'not-started', progress: 0, date: '31/3/2024' }
  ];

  if (!mounted) return null;

  return (
    <ClientLayout>
      {/* Date Display */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Dashboard Overview</h2>
        <div className="text-sm text-gray-500">
          {new Date().toLocaleDateString('en-AU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </div>
      </div>

      {/* Goals and Rocks Grid - MOVED UP */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Annual Goals */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Annual Goals</h3>
          <div className="space-y-4">
            {annualGoals.map((goal, idx) => (
              <div key={idx}>
                <p className="text-sm text-gray-600">{goal.label}</p>
                <p className="text-2xl font-bold text-gray-900">{goal.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 90-Day Goals */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">90-Day Goals</h3>
          <div className="space-y-4">
            {quarterlyGoals.map((goal, idx) => (
              <div key={idx}>
                <p className="text-sm text-gray-600">{goal.label}</p>
                <p className="text-2xl font-bold text-gray-900">{goal.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Q1 Rocks */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Q1 Rocks</h3>
          <div className="space-y-3">
            {rocks.map((rock) => (
              <div key={rock.id}>
                <div className="flex justify-between items-start mb-1">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{rock.title}</p>
                    <p className="text-xs text-gray-500">Owner: {rock.owner}</p>
                  </div>
                  <span className="text-xs font-bold text-gray-700 ml-2">{rock.progress}%</span>
                </div>
                <div className="text-xs text-gray-500 mb-2">Due: {rock.date}</div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full ${
                      rock.status === 'on-track' ? 'bg-green-500' :
                      rock.status === 'behind' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}
                    style={{ width: `${rock.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Execution Status Card - MOVED DOWN */}
      <ExecutionStatusCard />

      {/* Review Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Link 
          href="/weekly-review"
          className="bg-white rounded-lg shadow p-4 flex items-center hover:shadow-md transition-shadow"
        >
          <Calendar className="h-5 w-5 text-brand-teal-500 mr-3" />
          <div>
            <h4 className="font-semibold text-gray-900">Weekly Review</h4>
            <p className="text-sm text-gray-600">Next: Monday, Dec 30</p>
          </div>
        </Link>

        <Link 
          href="/monthly-review"
          className="bg-white rounded-lg shadow p-4 flex items-center hover:shadow-md transition-shadow"
        >
          <CalendarCheck className="h-5 w-5 text-brand-teal-500 mr-3" />
          <div>
            <h4 className="font-semibold text-gray-900">Monthly Review</h4>
            <p className="text-sm text-gray-600">Next: Jan 3, 2025</p>
          </div>
        </Link>

        <Link 
          href="/quarterly-review"
          className="bg-white rounded-lg shadow p-4 flex items-center hover:shadow-md transition-shadow"
        >
          <BarChart className="h-5 w-5 text-brand-teal-500 mr-3" />
          <div>
            <h4 className="font-semibold text-gray-900">Quarterly Planning</h4>
            <p className="text-sm text-gray-600">Next: Mar 28, 2025</p>
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Quick Actions</h3>
      <div className="grid grid-cols-4 gap-4">
        <Link 
          href="/financials" 
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow text-center group"
        >
          <BarChart3 className="h-8 w-8 text-gray-400 group-hover:text-brand-teal-500 mb-2 mx-auto transition-colors" />
          <span className="text-sm font-medium text-gray-700">Business Dashboard</span>
        </Link>

        <Link 
          href="/daily-disciplines" 
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow text-center group"
        >
          <Flame className="h-8 w-8 text-gray-400 group-hover:text-brand-orange mb-2 mx-auto transition-colors" />
          <span className="text-sm font-medium text-gray-700">Daily Disciplines</span>
        </Link>

        <Link 
          href="/todo" 
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow text-center group"
        >
          <CheckSquare className="h-8 w-8 text-gray-400 group-hover:text-green-500 mb-2 mx-auto transition-colors" />
          <span className="text-sm font-medium text-gray-700">To-Do List</span>
        </Link>

        <Link 
          href="/stop-doing" 
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow text-center group"
        >
          <XCircle className="h-8 w-8 text-gray-400 group-hover:text-red-500 mb-2 mx-auto transition-colors" />
          <span className="text-sm font-medium text-gray-700">Stop Doing List</span>
        </Link>
      </div>
    </ClientLayout>
  );
}