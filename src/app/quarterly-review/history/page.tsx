'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { quarterlyReviewService } from '../services/quarterly-review-service';
import { getQuarterLabel } from '../types';
import type { QuarterlyReview, Rock } from '../types';
import {
  Calendar,
  History,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Mountain,
  DollarSign,
  Users,
  ArrowLeft,
  Eye,
  GitCompare,
  X,
  Loader2,
  BarChart3,
  Zap,
  Award
} from 'lucide-react';
import { useBusinessContext } from '@/hooks/useBusinessContext';
import PageHeader from '@/components/ui/PageHeader';
import Link from 'next/link';

// Helper to format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

// Helper to calculate rocks completion
const getRocksCompletion = (rocks: Rock[] | undefined) => {
  if (!rocks || rocks.length === 0) return { completed: 0, total: 0, percentage: 0 };
  const completed = rocks.filter(r => r.status === 'completed').length;
  return {
    completed,
    total: rocks.length,
    percentage: Math.round((completed / rocks.length) * 100)
  };
};

// Timeline Node Component
function TimelineNode({
  review,
  isFirst,
  isLast,
  isExpanded,
  onToggle,
  onViewSummary,
  onCompare,
  isCompareMode,
  isSelected
}: {
  review: QuarterlyReview;
  isFirst: boolean;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onViewSummary: () => void;
  onCompare: () => void;
  isCompareMode: boolean;
  isSelected: boolean;
}) {
  const isCompleted = review.status === 'completed';
  const rocksData = getRocksCompletion(review.quarterly_rocks);
  const targets = review.quarterly_targets;

  return (
    <div className="relative">
      {/* Timeline Line */}
      {!isLast && (
        <div className="absolute left-6 top-12 w-0.5 h-full bg-gray-200" />
      )}

      <div className="flex gap-4">
        {/* Timeline Dot */}
        <div className="relative z-10 flex-shrink-0">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-colors ${
              isCompleted
                ? 'bg-teal-500 border-teal-200 text-white'
                : review.status === 'in_progress'
                ? 'bg-brand-orange border-brand-orange-200 text-white'
                : 'bg-gray-100 border-gray-200 text-gray-400'
            } ${isSelected ? 'ring-4 ring-brand-orange ring-opacity-50' : ''}`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : review.status === 'in_progress' ? (
              <Clock className="w-6 h-6" />
            ) : (
              <Calendar className="w-6 h-6" />
            )}
          </div>
        </div>

        {/* Card */}
        <div className="flex-1 pb-8">
          <div
            className={`bg-white rounded-xl border transition-all ${
              isExpanded ? 'border-gray-300 shadow-md' : 'border-gray-200 shadow-sm hover:shadow-md'
            } ${isSelected ? 'ring-2 ring-brand-orange' : ''}`}
          >
            {/* Card Header - Always Visible */}
            <button
              onClick={onToggle}
              className="w-full p-4 sm:p-5 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {getQuarterLabel(review.quarter, review.year)}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {isCompleted
                      ? `Completed ${new Date(review.completed_at!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : review.status === 'in_progress'
                      ? 'In Progress'
                      : 'Not Started'
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Quick Stats Badges */}
                {isCompleted && (
                  <div className="hidden sm:flex items-center gap-2">
                    {review.annual_target_confidence && (
                      <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                        {review.annual_target_confidence * 10}% confident
                      </span>
                    )}
                    {rocksData.total > 0 && (
                      <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                        {rocksData.completed}/{rocksData.total} rocks
                      </span>
                    )}
                  </div>
                )}

                {/* Compare Checkbox (in compare mode) */}
                {isCompareMode && isCompleted && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompare();
                    }}
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-brand-orange border-brand-orange text-white'
                        : 'border-gray-300 hover:border-brand-orange'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-4 h-4" />}
                  </button>
                )}

                {/* Expand Icon */}
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="px-4 sm:px-5 pb-5 border-t border-gray-100">
                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {/* Confidence Score */}
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {review.annual_target_confidence ? `${review.annual_target_confidence * 10}%` : '—'}
                    </div>
                    <div className="text-xs text-gray-600">Confidence</div>
                  </div>

                  {/* Rocks Completion */}
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {rocksData.total > 0 ? `${rocksData.percentage}%` : '—'}
                    </div>
                    <div className="text-xs text-gray-600">Rocks Done</div>
                  </div>

                  {/* Quarter Rating */}
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {review.last_quarter_rating || '—'}/10
                    </div>
                    <div className="text-xs text-gray-600">Quarter Rating</div>
                  </div>

                  {/* Energy Level */}
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {review.energy_level || '—'}/10
                    </div>
                    <div className="text-xs text-gray-600">Energy Level</div>
                  </div>
                </div>

                {/* Financial Targets */}
                {targets && (targets.revenue > 0 || targets.grossProfit > 0 || targets.netProfit > 0) && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Targets Set
                    </h4>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-lg font-semibold text-gray-900">{formatCurrency(targets.revenue)}</div>
                        <div className="text-xs text-gray-500">Revenue</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-gray-900">{formatCurrency(targets.grossProfit)}</div>
                        <div className="text-xs text-gray-500">Gross Profit</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-gray-900">{formatCurrency(targets.netProfit)}</div>
                        <div className="text-xs text-gray-500">Net Profit</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rocks Summary */}
                {review.quarterly_rocks && review.quarterly_rocks.length > 0 && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <Mountain className="w-4 h-4" />
                      90-Day Rocks ({rocksData.completed}/{rocksData.total} completed)
                    </h4>
                    <div className="space-y-2">
                      {review.quarterly_rocks.slice(0, 5).map((rock, idx) => (
                        <div key={rock.id} className="flex items-center gap-2 text-sm">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                              rock.status === 'completed'
                                ? 'bg-teal-100 text-teal-700'
                                : rock.status === 'at_risk'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className={rock.status === 'completed' ? 'text-gray-600 line-through' : 'text-gray-800'}>
                            {rock.title}
                          </span>
                        </div>
                      ))}
                      {review.quarterly_rocks.length > 5 && (
                        <p className="text-xs text-gray-500 mt-1">
                          +{review.quarterly_rocks.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Key Reflections */}
                {(review.biggest_win || review.biggest_challenge || review.key_learning) && (
                  <div className="mt-4 grid gap-3">
                    {review.biggest_win && (
                      <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                        <p className="text-xs font-medium text-green-700 mb-1">Biggest Win</p>
                        <p className="text-sm text-green-900">{review.biggest_win}</p>
                      </div>
                    )}
                    {review.biggest_challenge && (
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-xs font-medium text-amber-700 mb-1">Biggest Challenge</p>
                        <p className="text-sm text-amber-900">{review.biggest_challenge}</p>
                      </div>
                    )}
                    {review.key_learning && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs font-medium text-blue-700 mb-1">Key Learning</p>
                        <p className="text-sm text-blue-900">{review.key_learning}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={onViewSummary}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-600 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View Full Report
                  </button>
                  {!isCompleted && review.status === 'in_progress' && (
                    <Link
                      href={`/quarterly-review/workshop?id=${review.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Continue Review
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compare View Component
function CompareView({
  reviews,
  onClose
}: {
  reviews: QuarterlyReview[];
  onClose: () => void;
}) {
  if (reviews.length !== 2) return null;

  const [older, newer] = reviews.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.quarter - b.quarter;
  });

  const olderRocks = getRocksCompletion(older.quarterly_rocks);
  const newerRocks = getRocksCompletion(newer.quarterly_rocks);

  const getTrendIcon = (oldVal: number | null | undefined, newVal: number | null | undefined) => {
    if (!oldVal || !newVal) return <Minus className="w-4 h-4 text-gray-400" />;
    if (newVal > oldVal) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (newVal < oldVal) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getChangeText = (oldVal: number | null | undefined, newVal: number | null | undefined, suffix = '') => {
    if (!oldVal || !newVal) return '—';
    const diff = newVal - oldVal;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff}${suffix}`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-brand-orange" />
          Comparing {getQuarterLabel(older.quarter, older.year)} vs {getQuarterLabel(newer.quarter, newer.year)}
        </h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Metric</th>
              <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">
                {getQuarterLabel(older.quarter, older.year)}
              </th>
              <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">
                {getQuarterLabel(newer.quarter, newer.year)}
              </th>
              <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Confidence */}
            <tr>
              <td className="py-3 px-4 text-sm text-gray-700">Annual Target Confidence</td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {older.annual_target_confidence ? `${older.annual_target_confidence * 10}%` : '—'}
              </td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {newer.annual_target_confidence ? `${newer.annual_target_confidence * 10}%` : '—'}
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  {getTrendIcon(older.annual_target_confidence, newer.annual_target_confidence)}
                  <span className="text-sm">{getChangeText(older.annual_target_confidence ? older.annual_target_confidence * 10 : null, newer.annual_target_confidence ? newer.annual_target_confidence * 10 : null, '%')}</span>
                </div>
              </td>
            </tr>

            {/* Quarter Rating */}
            <tr>
              <td className="py-3 px-4 text-sm text-gray-700">Quarter Rating</td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {older.last_quarter_rating || '—'}/10
              </td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {newer.last_quarter_rating || '—'}/10
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  {getTrendIcon(older.last_quarter_rating, newer.last_quarter_rating)}
                  <span className="text-sm">{getChangeText(older.last_quarter_rating, newer.last_quarter_rating)}</span>
                </div>
              </td>
            </tr>

            {/* Energy Level */}
            <tr>
              <td className="py-3 px-4 text-sm text-gray-700">Energy Level</td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {older.energy_level || '—'}/10
              </td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {newer.energy_level || '—'}/10
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  {getTrendIcon(older.energy_level, newer.energy_level)}
                  <span className="text-sm">{getChangeText(older.energy_level, newer.energy_level)}</span>
                </div>
              </td>
            </tr>

            {/* Rocks Completion */}
            <tr>
              <td className="py-3 px-4 text-sm text-gray-700">Rocks Completion</td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {olderRocks.total > 0 ? `${olderRocks.percentage}%` : '—'}
              </td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {newerRocks.total > 0 ? `${newerRocks.percentage}%` : '—'}
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  {getTrendIcon(olderRocks.percentage, newerRocks.percentage)}
                  <span className="text-sm">{getChangeText(olderRocks.percentage, newerRocks.percentage, '%')}</span>
                </div>
              </td>
            </tr>

            {/* Hours Worked */}
            <tr>
              <td className="py-3 px-4 text-sm text-gray-700">Avg Hours/Week</td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {older.hours_worked_avg || '—'}
              </td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {newer.hours_worked_avg || '—'}
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  {/* For hours, less is often better */}
                  {getTrendIcon(newer.hours_worked_avg, older.hours_worked_avg)}
                  <span className="text-sm">{getChangeText(older.hours_worked_avg, newer.hours_worked_avg, 'h')}</span>
                </div>
              </td>
            </tr>

            {/* Days Off */}
            <tr>
              <td className="py-3 px-4 text-sm text-gray-700">Days Off Taken</td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {older.days_off_taken || '—'}
              </td>
              <td className="py-3 px-4 text-center text-sm font-medium">
                {newer.days_off_taken || '—'}
              </td>
              <td className="py-3 px-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  {getTrendIcon(older.days_off_taken, newer.days_off_taken)}
                  <span className="text-sm">{getChangeText(older.days_off_taken, newer.days_off_taken)}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Trend Insights Component
function TrendInsights({ reviews }: { reviews: QuarterlyReview[] }) {
  const completedReviews = reviews.filter(r => r.status === 'completed');

  if (completedReviews.length < 2) return null;

  // Calculate trends
  const confidenceTrend = completedReviews
    .filter(r => r.annual_target_confidence)
    .map(r => ({ quarter: `Q${r.quarter} ${r.year}`, value: (r.annual_target_confidence || 0) * 10 }))
    .reverse();

  const rocksCompletionTrend = completedReviews
    .filter(r => r.quarterly_rocks && r.quarterly_rocks.length > 0)
    .map(r => {
      const rocks = getRocksCompletion(r.quarterly_rocks);
      return { quarter: `Q${r.quarter} ${r.year}`, value: rocks.percentage };
    })
    .reverse();

  const energyTrend = completedReviews
    .filter(r => r.energy_level)
    .map(r => ({ quarter: `Q${r.quarter} ${r.year}`, value: (r.energy_level || 0) * 10 }))
    .reverse();

  // Get latest values and trends
  const latestConfidence = confidenceTrend.length > 0 ? confidenceTrend[confidenceTrend.length - 1].value : null;
  const previousConfidence = confidenceTrend.length > 1 ? confidenceTrend[confidenceTrend.length - 2].value : null;
  const confidenceChange = latestConfidence && previousConfidence ? latestConfidence - previousConfidence : 0;

  const latestRocks = rocksCompletionTrend.length > 0 ? rocksCompletionTrend[rocksCompletionTrend.length - 1].value : null;
  const avgRocks = rocksCompletionTrend.length > 0
    ? Math.round(rocksCompletionTrend.reduce((sum, r) => sum + r.value, 0) / rocksCompletionTrend.length)
    : 0;

  const latestEnergy = energyTrend.length > 0 ? energyTrend[energyTrend.length - 1].value : null;
  const previousEnergy = energyTrend.length > 1 ? energyTrend[energyTrend.length - 2].value : null;
  const energyChange = latestEnergy && previousEnergy ? latestEnergy - previousEnergy : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      {/* Confidence Trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">Confidence Trend</span>
          <Target className="w-5 h-5 text-gray-400" />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-gray-900">
            {latestConfidence !== null ? `${latestConfidence}%` : '—'}
          </span>
          {confidenceChange !== 0 && (
            <span className={`text-sm font-medium flex items-center gap-1 mb-1 ${confidenceChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {confidenceChange > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {confidenceChange > 0 ? '+' : ''}{confidenceChange}%
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">vs previous quarter</p>
      </div>

      {/* Rocks Completion Average */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">Avg Rocks Completion</span>
          <Mountain className="w-5 h-5 text-gray-400" />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-gray-900">
            {avgRocks > 0 ? `${avgRocks}%` : '—'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">across {rocksCompletionTrend.length} quarters</p>
      </div>

      {/* Energy Trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">Energy Level</span>
          <Zap className="w-5 h-5 text-gray-400" />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-gray-900">
            {latestEnergy !== null ? `${latestEnergy}%` : '—'}
          </span>
          {energyChange !== 0 && (
            <span className={`text-sm font-medium flex items-center gap-1 mb-1 ${energyChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {energyChange > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {energyChange > 0 ? '+' : ''}{energyChange}%
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">vs previous quarter</p>
      </div>
    </div>
  );
}

// Main Page Component
export default function QuarterlyReviewHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const { activeBusiness, isLoading: contextLoading } = useBusinessContext();

  const [reviews, setReviews] = useState<QuarterlyReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (contextLoading) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        let bizId: string | null = null;
        if (activeBusiness?.id) {
          bizId = activeBusiness.id;
        } else {
          const { data: business } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_id', user.id)
            .single();
          bizId = business?.id || null;
        }

        if (bizId) {
          const allReviews = await quarterlyReviewService.getAllReviews(bizId);
          setReviews(allReviews);
        }
      } catch (error) {
        console.error('Error fetching reviews:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [supabase, router, contextLoading, activeBusiness?.id]);

  const completedCount = reviews.filter(r => r.status === 'completed').length;
  const inProgressCount = reviews.filter(r => r.status === 'in_progress').length;

  const handleToggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleViewSummary = (id: string) => {
    router.push(`/quarterly-review/summary/${id}`);
  };

  const handleToggleCompare = (id: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id]; // Replace oldest selection
      }
      return [...prev, id];
    });
  };

  const selectedReviews = useMemo(() => {
    return reviews.filter(r => selectedForCompare.includes(r.id));
  }, [reviews, selectedForCompare]);

  const handleExitCompareMode = () => {
    setIsCompareMode(false);
    setSelectedForCompare([]);
  };

  // Group reviews by year
  const reviewsByYear = useMemo(() => {
    const grouped: Record<number, QuarterlyReview[]> = {};
    reviews.forEach(review => {
      if (!grouped[review.year]) {
        grouped[review.year] = [];
      }
      grouped[review.year].push(review);
    });
    // Sort quarters within each year
    Object.keys(grouped).forEach(year => {
      grouped[parseInt(year)].sort((a, b) => b.quarter - a.quarter);
    });
    return grouped;
  }, [reviews]);

  const years = Object.keys(reviewsByYear)
    .map(Number)
    .sort((a, b) => b - a);

  if (isLoading || contextLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-orange mx-auto" />
          <p className="mt-4 text-gray-600">Loading review history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <PageHeader
        variant="banner"
        title="Quarterly Review Timeline"
        subtitle={`${completedCount} completed review${completedCount !== 1 ? 's' : ''}${inProgressCount > 0 ? ` • ${inProgressCount} in progress` : ''}`}
        icon={History}
        backLink={{ href: '/quarterly-review', label: 'Back to Quarterly Review' }}
        actions={
          reviews.filter(r => r.status === 'completed').length >= 2 && (
            <button
              onClick={() => isCompareMode ? handleExitCompareMode() : setIsCompareMode(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isCompareMode
                  ? 'bg-brand-orange text-white hover:bg-brand-orange-600'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <GitCompare className="w-4 h-4" />
              {isCompareMode ? 'Exit Compare' : 'Compare Quarters'}
            </button>
          )
        }
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Compare Mode Banner */}
        {isCompareMode && (
          <div className="bg-brand-orange-50 border border-brand-orange-200 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitCompare className="w-5 h-5 text-brand-orange" />
                <span className="text-sm font-medium text-brand-orange-800">
                  Select 2 quarters to compare ({selectedForCompare.length}/2 selected)
                </span>
              </div>
              {selectedForCompare.length === 2 && (
                <span className="text-sm text-brand-orange-600">
                  Comparison shown below
                </span>
              )}
            </div>
          </div>
        )}

        {/* Compare View */}
        {selectedReviews.length === 2 && (
          <CompareView
            reviews={selectedReviews}
            onClose={() => setSelectedForCompare([])}
          />
        )}

        {/* Trend Insights */}
        {!isCompareMode && <TrendInsights reviews={reviews} />}

        {/* Empty State */}
        {reviews.length === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No reviews yet</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Start your first quarterly review to begin tracking your business journey over time.
            </p>
            <Link
              href="/quarterly-review"
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-orange text-white rounded-xl font-medium hover:bg-brand-orange-600 transition-colors"
            >
              <Calendar className="w-5 h-5" />
              Start Your First Review
            </Link>
          </div>
        )}

        {/* Timeline */}
        {reviews.length > 0 && (
          <div className="space-y-8">
            {years.map(year => (
              <div key={year}>
                {/* Year Label */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-sm font-semibold text-gray-500 bg-gray-50 px-3 py-1 rounded-full">
                    {year}
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Quarter Nodes */}
                <div className="space-y-0">
                  {reviewsByYear[year].map((review, index) => (
                    <TimelineNode
                      key={review.id}
                      review={review}
                      isFirst={index === 0}
                      isLast={index === reviewsByYear[year].length - 1}
                      isExpanded={expandedId === review.id}
                      onToggle={() => handleToggleExpand(review.id)}
                      onViewSummary={() => handleViewSummary(review.id)}
                      onCompare={() => handleToggleCompare(review.id)}
                      isCompareMode={isCompareMode}
                      isSelected={selectedForCompare.includes(review.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back to Main */}
        {reviews.length > 0 && (
          <div className="text-center pt-8 mt-8 border-t border-gray-200">
            <Link
              href="/quarterly-review"
              className="inline-flex items-center gap-2 text-brand-orange hover:text-brand-orange-700 font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Quarterly Review
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
