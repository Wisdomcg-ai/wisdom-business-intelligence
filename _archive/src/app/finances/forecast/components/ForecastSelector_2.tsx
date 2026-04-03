'use client';

import { useState, useEffect } from 'react';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  MoreHorizontal,
  Copy,
  Trash2,
  Star,
  Loader2,
  TrendingUp,
  Calendar,
  DollarSign,
  X,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface ForecastVersion {
  id: string;
  name: string;
  fiscal_year: number;
  is_active: boolean;
  is_completed: boolean;
  status?: string;
  revenue_goal: number;
  net_profit_goal: number;
  created_at: string;
  updated_at: string;
  version_number?: number;
  forecast_type?: string;
}

interface ForecastSelectorProps {
  businessId: string;
  businessName?: string;
  fiscalYear: number;
  onSelectForecast: (forecastId: string, forecastName: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

export function ForecastSelector({
  businessId,
  businessName,
  fiscalYear,
  onSelectForecast,
  onCreateNew,
  onClose,
}: ForecastSelectorProps) {
  const [forecasts, setForecasts] = useState<ForecastVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadForecasts();
  }, [businessId, fiscalYear]);

  const loadForecasts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('financial_forecasts')
        .select('*')
        .eq('business_id', businessId)
        .eq('fiscal_year', fiscalYear)
        .order('is_active', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setForecasts(data || []);
    } catch (err) {
      console.error('Error loading forecasts:', err);
      toast.error('Failed to load forecasts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicate = async (forecast: ForecastVersion) => {
    setIsDuplicating(forecast.id);
    setShowMenu(null);
    try {
      // Create a copy of the forecast
      const { data: newForecast, error } = await supabase
        .from('financial_forecasts')
        .insert({
          business_id: businessId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          name: `${forecast.name} (Copy)`,
          fiscal_year: fiscalYear,
          year_type: 'FY',
          is_active: false,
          is_completed: false,
          revenue_goal: forecast.revenue_goal,
          net_profit_goal: forecast.net_profit_goal,
          actual_start_month: `${fiscalYear - 1}-07`,
          actual_end_month: `${fiscalYear - 1}-07`,
          forecast_start_month: `${fiscalYear - 1}-07`,
          forecast_end_month: `${fiscalYear}-06`,
        })
        .select()
        .single();

      if (error) throw error;

      // Copy P&L lines
      const { data: plLines } = await supabase
        .from('forecast_pl_lines')
        .select('*')
        .eq('forecast_id', forecast.id);

      if (plLines && plLines.length > 0) {
        const newLines = plLines.map((line) => ({
          ...line,
          id: undefined,
          forecast_id: newForecast.id,
          created_at: undefined,
          updated_at: undefined,
        }));
        await supabase.from('forecast_pl_lines').insert(newLines);
      }

      // Copy employees
      const { data: employees } = await supabase
        .from('forecast_employees')
        .select('*')
        .eq('forecast_id', forecast.id);

      if (employees && employees.length > 0) {
        const newEmployees = employees.map((emp) => ({
          ...emp,
          id: undefined,
          forecast_id: newForecast.id,
          created_at: undefined,
          updated_at: undefined,
        }));
        await supabase.from('forecast_employees').insert(newEmployees);
      }

      toast.success('Forecast duplicated successfully');
      loadForecasts();
    } catch (err) {
      console.error('Error duplicating forecast:', err);
      toast.error('Failed to duplicate forecast');
    } finally {
      setIsDuplicating(null);
    }
  };

  const handleDelete = async (forecast: ForecastVersion) => {
    if (forecast.is_active) {
      toast.error('Cannot delete the active forecast');
      return;
    }

    setIsDeleting(forecast.id);
    setShowMenu(null);
    try {
      // Delete related records first
      await supabase.from('forecast_pl_lines').delete().eq('forecast_id', forecast.id);
      await supabase.from('forecast_employees').delete().eq('forecast_id', forecast.id);

      // Delete the forecast
      const { error } = await supabase
        .from('financial_forecasts')
        .delete()
        .eq('id', forecast.id);

      if (error) throw error;

      toast.success('Forecast deleted');
      loadForecasts();
    } catch (err) {
      console.error('Error deleting forecast:', err);
      toast.error('Failed to delete forecast');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSetActive = async (forecast: ForecastVersion) => {
    setShowMenu(null);
    try {
      // Deactivate all other forecasts
      await supabase
        .from('financial_forecasts')
        .update({ is_active: false })
        .eq('business_id', businessId)
        .eq('fiscal_year', fiscalYear);

      // Activate this one
      const { error } = await supabase
        .from('financial_forecasts')
        .update({ is_active: true })
        .eq('id', forecast.id);

      if (error) throw error;

      toast.success(`"${forecast.name}" is now the active forecast`);
      loadForecasts();
    } catch (err) {
      console.error('Error setting active forecast:', err);
      toast.error('Failed to set active forecast');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const activeForecast = forecasts.find((f) => f.is_active);
  const otherForecasts = forecasts.filter((f) => !f.is_active);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              FY{fiscalYear} Forecasts
            </h2>
            {businessName && (
              <p className="text-sm text-gray-500 mt-0.5">{businessName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : forecasts.length === 0 ? (
            /* Empty State */
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No forecasts yet
              </h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                Create your first FY{fiscalYear} forecast to start planning your business finances.
              </p>
              <button
                onClick={onCreateNew}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
                Create New Forecast
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active Forecast */}
              {activeForecast && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Active Forecast
                  </h3>
                  <ForecastCard
                    forecast={activeForecast}
                    isActive={true}
                    onSelect={() => onSelectForecast(activeForecast.id, activeForecast.name)}
                    onDuplicate={() => handleDuplicate(activeForecast)}
                    onDelete={() => handleDelete(activeForecast)}
                    onSetActive={() => {}}
                    showMenu={showMenu === activeForecast.id}
                    onToggleMenu={() => setShowMenu(showMenu === activeForecast.id ? null : activeForecast.id)}
                    isDeleting={isDeleting === activeForecast.id}
                    isDuplicating={isDuplicating === activeForecast.id}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                  />
                </div>
              )}

              {/* Other Forecasts */}
              {otherForecasts.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    {activeForecast ? 'Other Scenarios' : 'All Forecasts'}
                  </h3>
                  <div className="space-y-3">
                    {otherForecasts.map((forecast) => (
                      <ForecastCard
                        key={forecast.id}
                        forecast={forecast}
                        isActive={false}
                        onSelect={() => onSelectForecast(forecast.id, forecast.name)}
                        onDuplicate={() => handleDuplicate(forecast)}
                        onDelete={() => handleDelete(forecast)}
                        onSetActive={() => handleSetActive(forecast)}
                        showMenu={showMenu === forecast.id}
                        onToggleMenu={() => setShowMenu(showMenu === forecast.id ? null : forecast.id)}
                        isDeleting={isDeleting === forecast.id}
                        isDuplicating={isDuplicating === forecast.id}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create New Forecast
          </button>
        </div>
      </div>
    </div>
  );
}

/* Forecast Card Component */
interface ForecastCardProps {
  forecast: ForecastVersion;
  isActive: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetActive: () => void;
  showMenu: boolean;
  onToggleMenu: () => void;
  isDeleting: boolean;
  isDuplicating: boolean;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
}

function ForecastCard({
  forecast,
  isActive,
  onSelect,
  onDuplicate,
  onDelete,
  onSetActive,
  showMenu,
  onToggleMenu,
  isDeleting,
  isDuplicating,
  formatCurrency,
  formatDate,
}: ForecastCardProps) {
  return (
    <div
      className={`relative bg-white border rounded-xl p-4 transition-all hover:shadow-md ${
        isActive
          ? 'border-blue-200 bg-blue-50/30 ring-1 ring-blue-100'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Status Badges */}
      <div className="flex items-center gap-2 mb-3">
        {isActive && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">
            <Star className="w-3 h-3" />
            Active
          </span>
        )}
        {forecast.is_completed ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Complete
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
            <Clock className="w-3 h-3" />
            Draft
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 truncate">
            {forecast.name || `FY${forecast.fiscal_year} Forecast`}
          </h4>

          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              {formatCurrency(forecast.revenue_goal || 0)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(forecast.updated_at)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onSelect}
            disabled={isDeleting || isDuplicating}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {isActive ? 'Continue Editing' : 'Edit'}
          </button>

          <div className="relative">
            <button
              onClick={onToggleMenu}
              disabled={isDeleting || isDuplicating}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              {isDeleting || isDuplicating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <MoreHorizontal className="w-5 h-5" />
              )}
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={onToggleMenu}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <button
                    onClick={onDuplicate}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Copy className="w-4 h-4" />
                    Duplicate
                  </button>
                  {!isActive && (
                    <button
                      onClick={onSetActive}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Star className="w-4 h-4" />
                      Set as Active
                    </button>
                  )}
                  {!isActive && (
                    <button
                      onClick={onDelete}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForecastSelector;
