// src/components/layout/DashboardWrapper.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  Home,
  FileText,
  Target,
  BarChart3,
  DollarSign,
  TrendingUp,
  Users,
  Building,
  Link2,
  Grid3x3,
  ClipboardList,
  CreditCard,
  CalendarDays,
  UserCheck,
  ListTodo,
  Ban,
  Eye,
  CalendarCheck,
  BarChart,
  Lightbulb,
  Megaphone,
  Settings,
  Route,
  MessageSquare,
  GraduationCap,
  Mail,
  Flame,
  Compass,
  Layers,
  AlertCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface BusinessData {
  name: string;
  assessmentScore: string;
  stage: string;
  revenueTarget: number;
  profitTarget: number;
}

export default function DashboardWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'DASHBOARD',
    'STRATEGY', 
    'FINANCES',
    'EXECUTE & GROW'
  ]);
  const [businessData, setBusinessData] = useState<BusinessData>({
    name: 'My Business',
    assessmentScore: '--',
    stage: 'BUILDING',
    revenueTarget: 0,
    profitTarget: 0
  });

  // Don't show dashboard layout on auth pages
  const isAuthPage = pathname?.startsWith('/auth') || pathname === '/login' || pathname === '/signup';

  useEffect(() => {
    setMounted(true);
    if (!isAuthPage) {
      loadBusinessData();
    }
  }, [isAuthPage]);

  async function loadBusinessData() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: assessments } = await supabase
        .from('assessments')
        .select('percentage, health_status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (assessments && assessments.length > 0) {
        setBusinessData(prev => ({
          ...prev,
          assessmentScore: assessments[0].percentage.toString()
        }));
      }

      const { data: profile } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        setBusinessData(prev => ({
          ...prev,
          name: profile.business_name || prev.name,
          stage: profile.stage || prev.stage,
          revenueTarget: profile.revenue_target || prev.revenueTarget,
          profitTarget: profile.profit_target || prev.profitTarget
        }));
      }
    } catch (error) {
      console.error('Error loading business data:', error);
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const navigation = {
    DASHBOARD: {
      label: 'Dashboard',
      items: [
        { name: 'Command Centre', href: '/dashboard', icon: Home }
      ]
    },
    STRATEGY: {
      label: 'Strategy',
      items: [
        { name: 'Business Assessment', href: '/assessment', icon: ClipboardList },
        { name: 'Vision, Mission & Values', href: '/vision-mission', icon: Lightbulb },
        { name: 'Business Roadmap', href: '/business-roadmap', icon: Compass },
        { name: 'SWOT Analysis', href: '/swot-launch', icon: Grid3x3 },
        { name: 'Goals & Targets', href: '/goals', icon: Target },
        { name: '90-Day Planning', href: '/90-day-planning', icon: CalendarDays },
        { name: 'One-Page Plan', href: '/one-page-plan', icon: FileText }
      ]
    },
    FINANCES: {
      label: 'Finances',
      items: [
        { name: 'Financial Forecast', href: '/forecast', icon: TrendingUp },
        { name: 'Budget vs Actual', href: '/budget', icon: CreditCard },
        { name: '13-Week Rolling Cashflow', href: '#', icon: DollarSign, disabled: true }
      ]
    },
    'EXECUTE & GROW': {
      label: 'Execute & Grow',
      items: [
        { name: 'Business Dashboard', href: '/financials', icon: BarChart3 },
        { name: 'Daily Disciplines', href: '/daily-disciplines', icon: Flame },
        { name: 'Open Loops', href: '/open-loops', icon: Layers },
        { name: 'Issues List', href: '/issues-list', icon: AlertCircle },
        { name: 'To-Do List', href: '/todo', icon: ListTodo },
        { name: 'Stop Doing List', href: '/stop-doing', icon: Ban },
        { name: 'Accountability Chart', href: '/accountability', icon: UserCheck }
      ]
    },
    INSIGHTS: {
      label: 'Insights',
      items: [
        { name: 'Weekly Review', href: '/weekly-review', icon: Eye },
        { name: 'Monthly Review', href: '/monthly-review', icon: CalendarCheck },
        { name: 'Quarterly Review', href: '/quarterly-review', icon: BarChart }
      ]
    },
    MARKETING: {
      label: 'Marketing',
      items: [
        { name: 'Value Proposition & USP', href: '/marketing/value-prop', icon: Lightbulb },
        { name: 'Marketing Channels & Tactics', href: '/marketing/channels', icon: Megaphone },
        { name: 'Content Planner', href: '/marketing/content', icon: FileText }
      ]
    },
    SALES: {
      label: 'Sales',
      items: [
        { name: 'Sales Process Designer', href: '#', icon: Route, disabled: true }
      ]
    },
    TEAM: {
      label: 'Team',
      items: [
        { name: 'Accountability Chart', href: '/accountability', icon: UserCheck },
        { name: 'Org Chart Builder', href: '/team/org-chart', icon: Users },
        { name: 'Hiring Roadmap', href: '/team/hiring-roadmap', icon: UserCheck },
        { name: 'Team Scorecard', href: '#', icon: BarChart3, disabled: true }
      ]
    },
    COACHING: {
      label: 'Coaching & Community',
      items: [
        { name: 'My Coach', href: '/coaching/sessions', icon: GraduationCap },
        { name: 'Community', href: '/community/forums', icon: MessageSquare },
        { name: 'Messages', href: '/community/messages', icon: Mail }
      ]
    },
    SETTINGS: {
      label: 'Settings',
      items: [
        { name: 'Account Settings', href: '/settings/account', icon: Settings },
        { name: 'Integrations', href: '/integrations', icon: Link2 }
      ]
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  // If auth page or not mounted, show children without dashboard wrapper
  if (!mounted || isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg flex flex-col h-screen fixed left-0 top-0">
        <div className="p-4 border-b bg-brand-navy">
          <Link href="/dashboard" className="block">
            <Image
              src="/images/logo-tight.png"
              alt="WisdomBi"
              width={550}
              height={300}
              className="h-16 w-auto"
              priority
            />
          </Link>
        </div>
        
        <nav className="flex-1 overflow-y-auto">
          {Object.entries(navigation).map(([section, { label, items }]) => (
            <div key={section} className="border-b border-gray-100">
              <button
                onClick={() => toggleSection(section)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {label}
                </span>
                {expandedSections.includes(section) ? (
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-gray-400" />
                )}
              </button>
              
              {expandedSections.includes(section) && (
                <div className="pb-2">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href && !('disabled' in item && item.disabled);

                    if ('disabled' in item && item.disabled) {
                      return (
                        <div
                          key={item.name}
                          className="relative flex items-center px-4 py-2 text-sm text-gray-400 cursor-not-allowed"
                          title="Coming Soon"
                        >
                          <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                          <span>{item.name}</span>
                        </div>
                      );
                    }
                    
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`flex items-center px-4 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-brand-orange-50 text-brand-orange border-l-2 border-brand-orange'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-brand-navy'
                        }`}
                      >
                        <Icon className={`h-4 w-4 mr-3 flex-shrink-0 ${isActive ? 'text-brand-orange' : ''}`} />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex justify-center gap-3 mb-2">
            <Link href="/privacy" className="text-xs text-gray-500 hover:text-brand-orange">
              Privacy
            </Link>
            <span className="text-gray-300">•</span>
            <Link href="/terms" className="text-xs text-gray-500 hover:text-brand-orange">
              Terms
            </Link>
            <span className="text-gray-300">•</span>
            <Link href="/help" className="text-xs text-gray-500 hover:text-brand-orange">
              Help
            </Link>
          </div>
          <p className="text-xs text-gray-400 text-center">
            © 2025 WisdomBi
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col ml-64">
        {/* Brand Metrics Bar */}
        <div className="bg-gradient-to-r from-brand-navy to-brand-navy-800 text-white px-6 py-4">
          <div className="grid grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-xs uppercase text-brand-orange-300 mb-1">Assessment</p>
              <p className="text-2xl font-bold">{businessData.assessmentScore}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase text-brand-orange-300 mb-1">Stage</p>
              <p className="text-2xl font-bold">{businessData.stage}</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase text-brand-orange-300 mb-1">Rev Target</p>
              <p className="text-2xl font-bold">{formatCurrency(businessData.revenueTarget)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase text-brand-orange-300 mb-1">Net Profit Target</p>
              <p className="text-2xl font-bold">{formatCurrency(businessData.profitTarget)}</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 bg-gray-50 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}