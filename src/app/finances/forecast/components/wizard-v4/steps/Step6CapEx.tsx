'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Building2, Target, Lightbulb, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency } from '../types';
import { BudgetTracker } from '../components/BudgetTracker';

interface Step6CapExProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
  businessId?: string;
}

interface StrategicInitiative {
  id: string;
  title: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  step_type?: string;
  estimated_cost?: number;
  is_monthly_cost?: boolean;
}

export function Step6CapEx({ state, actions, fiscalYear, businessId }: Step6CapExProps) {
  const { capexItems, investments } = state;
  const [showAddCapEx, setShowAddCapEx] = useState(false);
  const [showAddInvestment, setShowAddInvestment] = useState(false);
  const [initiatives, setInitiatives] = useState<StrategicInitiative[]>([]);
  const [loadingInitiatives, setLoadingInitiatives] = useState(false);
  const [addedInitiatives, setAddedInitiatives] = useState<Set<string>>(new Set());

  const [newCapEx, setNewCapEx] = useState({
    description: '',
    cost: 0,
    month: 7,
    usefulLifeYears: 5,
  });

  const [newInvestment, setNewInvestment] = useState({
    description: '',
    totalBudget: 0,
    monthlyDistribution: Array(12).fill(0),
  });

  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

  // Load strategic initiatives
  useEffect(() => {
    if (!businessId) return;

    const loadInitiatives = async () => {
      setLoadingInitiatives(true);
      try {
        const response = await fetch(`/api/strategic-initiatives?business_id=${businessId}&annual_plan_only=true`);
        if (response.ok) {
          const data = await response.json();
          setInitiatives(data.initiatives || []);
        }
      } catch (error) {
        console.error('Failed to load initiatives:', error);
      } finally {
        setLoadingInitiatives(false);
      }
    };

    loadInitiatives();
  }, [businessId]);

  // Track which initiatives have already been added as investments
  useEffect(() => {
    const existingDescriptions = new Set(investments.map(inv => inv.description.toLowerCase()));
    const added = new Set<string>();
    initiatives.forEach(init => {
      if (existingDescriptions.has(init.title.toLowerCase())) {
        added.add(init.id);
      }
    });
    setAddedInitiatives(added);
  }, [investments, initiatives]);

  const handleAddCapEx = () => {
    if (!newCapEx.description.trim() || newCapEx.cost <= 0) return;
    actions.addCapExItem({
      description: newCapEx.description.trim(),
      cost: newCapEx.cost,
      month: newCapEx.month,
      usefulLifeYears: newCapEx.usefulLifeYears,
    });
    setNewCapEx({ description: '', cost: 0, month: 7, usefulLifeYears: 5 });
    setShowAddCapEx(false);
  };

  const handleAddInvestment = () => {
    if (!newInvestment.description.trim() || newInvestment.totalBudget <= 0) return;
    const monthlyAmount = Math.round(newInvestment.totalBudget / 12);
    const distribution = Array(12).fill(monthlyAmount);
    distribution[11] = newInvestment.totalBudget - monthlyAmount * 11;

    actions.addInvestment({
      description: newInvestment.description.trim(),
      totalBudget: newInvestment.totalBudget,
      monthlyDistribution: distribution,
    });
    setNewInvestment({ description: '', totalBudget: 0, monthlyDistribution: Array(12).fill(0) });
    setShowAddInvestment(false);
  };

  const handleAddInitiativeAsInvestment = (initiative: StrategicInitiative, cost: number, isMonthly: boolean) => {
    const totalBudget = isMonthly ? cost * 12 : cost;
    const monthlyAmount = Math.round(totalBudget / 12);
    const distribution = Array(12).fill(monthlyAmount);
    distribution[11] = totalBudget - monthlyAmount * 11;

    actions.addInvestment({
      description: initiative.title,
      totalBudget,
      monthlyDistribution: distribution,
    });
    setAddedInitiatives(prev => new Set([...prev, initiative.id]));
  };

  const totalCapExCash = capexItems.reduce((sum, item) => sum + item.cost, 0);
  const totalDepreciation = capexItems.reduce((sum, item) => sum + item.annualDepreciation, 0);
  const totalInvestments = investments.reduce((sum, inv) => sum + inv.totalBudget, 0);

  // Filter initiatives that haven't been added yet
  const pendingInitiatives = initiatives.filter(init => !addedInitiatives.has(init.id));

  return (
    <div className="space-y-6">
      {/* Unified Budget Tracker */}
      {state.goals.year1?.revenue > 0 && (
        <BudgetTracker
          state={state}
          currentStep="capex"
        />
      )}

      {/* Strategic Initiatives from Plan - Premium Design */}
      {(loadingInitiatives || pendingInitiatives.length > 0) && (
        <div className="bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900 rounded-2xl shadow-xl overflow-hidden">
          <div className="relative px-5 py-4 border-b border-white/10">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                  <Lightbulb className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Strategic Initiatives</h3>
                  <p className="text-xs text-purple-300">From your annual plan</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full">
                <span className="text-sm font-bold text-white">{pendingInitiatives.length}</span>
                <span className="text-xs text-purple-300">to budget</span>
              </div>
            </div>
          </div>

          {loadingInitiatives ? (
            <div className="p-6 flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 border-3 border-purple-500/30 rounded-full" />
                <div className="absolute inset-0 w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-sm text-purple-300">Loading your strategic initiatives...</span>
            </div>
          ) : (
            <div className="p-5 space-y-3">
              <p className="text-sm text-purple-200 mb-4">
                Add costs to include these initiatives in your financial forecast.
              </p>
              {pendingInitiatives.map((initiative) => (
                <InitiativeCostEntry
                  key={initiative.id}
                  initiative={initiative}
                  onAdd={(cost, isMonthly) => handleAddInitiativeAsInvestment(initiative, cost, isMonthly)}
                />
              ))}
              {pendingInitiatives.length === 0 && initiatives.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-4 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-medium">All initiatives added to forecast!</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Capital Expenditure */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">Capital Expenditure</h3>
          </div>
          <button
            onClick={() => setShowAddCapEx(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-brand-navy/5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add CapEx Item
          </button>
        </div>

        {showAddCapEx && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
            <div className="grid grid-cols-5 gap-3">
              <input
                type="text"
                value={newCapEx.description}
                onChange={(e) => setNewCapEx({ ...newCapEx, description: e.target.value })}
                placeholder="Item description"
                className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                autoFocus
              />
              <input
                type="number"
                value={newCapEx.cost || ''}
                onChange={(e) => setNewCapEx({ ...newCapEx, cost: parseFloat(e.target.value) || 0 })}
                placeholder="Cost"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <select
                value={newCapEx.month}
                onChange={(e) => setNewCapEx({ ...newCapEx, month: parseInt(e.target.value) })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {months.map((m, idx) => (
                  <option key={idx} value={idx < 6 ? idx + 7 : idx - 5}>
                    {m}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <select
                  value={newCapEx.usefulLifeYears}
                  onChange={(e) => setNewCapEx({ ...newCapEx, usefulLifeYears: parseInt(e.target.value) })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {[1, 2, 3, 4, 5, 7, 10, 15, 20].map((y) => (
                    <option key={y} value={y}>
                      {y} yr{y > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setShowAddCapEx(false);
                  setNewCapEx({ description: '', cost: 0, month: 7, usefulLifeYears: 5 });
                }}
                className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCapEx}
                className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800"
              >
                Add Item
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Month</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Useful Life</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Annual Depreciation
                </th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {capexItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.description}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(item.cost)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-center">
                    {months[(item.month - 1 + 6) % 12]}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-center">{item.usefulLifeYears} years</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                    {formatCurrency(item.annualDepreciation)}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => actions.removeCapExItem(item.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {capexItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No capital expenditure planned. Click "Add CapEx Item" to add one.
                  </td>
                </tr>
              )}
            </tbody>
            {capexItems.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL CAPEX</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalCapExCash)}</td>
                  <td colSpan={2}></td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {formatCurrency(totalDepreciation)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Strategic Investments */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">Strategic Investments</h3>
          </div>
          <button
            onClick={() => setShowAddInvestment(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-brand-navy/5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Investment
          </button>
        </div>

        {showAddInvestment && (
          <div className="px-6 py-4 bg-green-50 border-b border-green-100">
            <div className="grid grid-cols-3 gap-3">
              <input
                type="text"
                value={newInvestment.description}
                onChange={(e) => setNewInvestment({ ...newInvestment, description: e.target.value })}
                placeholder="Investment description (e.g., Website Redesign)"
                className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                autoFocus
              />
              <input
                type="number"
                value={newInvestment.totalBudget || ''}
                onChange={(e) =>
                  setNewInvestment({ ...newInvestment, totalBudget: parseFloat(e.target.value) || 0 })
                }
                placeholder="Total Budget"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setShowAddInvestment(false);
                  setNewInvestment({ description: '', totalBudget: 0, monthlyDistribution: Array(12).fill(0) });
                }}
                className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddInvestment}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
              >
                Add Investment
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Investment</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Budget</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly Avg</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {investments.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.description}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(inv.totalBudget)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">
                    {formatCurrency(Math.round(inv.totalBudget / 12))}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => actions.removeInvestment(inv.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {investments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No strategic investments planned. Click "Add Investment" to add one.
                  </td>
                </tr>
              )}
            </tbody>
            {investments.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL INVESTMENTS</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalInvestments)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">
                    {formatCurrency(Math.round(totalInvestments / 12))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Total Cash Outflow</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(totalCapExCash + totalInvestments)}
          </p>
          <p className="text-xs text-gray-500 mt-1">CapEx + Investments</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">P&L Impact (Depreciation)</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalDepreciation)}</p>
          <p className="text-xs text-gray-500 mt-1">Annual depreciation expense</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-700 mb-1">Note</p>
          <p className="text-sm text-amber-800">
            CapEx cash outflow appears in cash flow forecast. Only depreciation impacts the P&L.
          </p>
        </div>
      </div>
    </div>
  );
}

// Component for adding cost to a strategic initiative
function InitiativeCostEntry({
  initiative,
  onAdd,
}: {
  initiative: StrategicInitiative;
  onAdd: (cost: number, isMonthly: boolean) => void;
}) {
  const [cost, setCost] = useState(initiative.estimated_cost || 0);
  const [isMonthly, setIsMonthly] = useState(initiative.is_monthly_cost || false);

  return (
    <div className="flex items-center gap-4 p-4 bg-white/10 rounded-xl border border-white/10 hover:bg-white/15 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{initiative.title}</p>
        {initiative.description && (
          <p className="text-xs text-purple-300 truncate mt-0.5">{initiative.description}</p>
        )}
        {initiative.priority && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mt-2 ${
            initiative.priority === 'high' ? 'bg-red-500/30 text-red-300' :
            initiative.priority === 'medium' ? 'bg-amber-500/30 text-amber-300' :
            'bg-white/20 text-slate-300'
          }`}>
            {initiative.priority} priority
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
          <input
            type="number"
            value={cost || ''}
            onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="w-28 pl-7 pr-3 py-2 text-sm text-right text-white bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-purple-400 placeholder-slate-500"
          />
        </div>
        <select
          value={isMonthly ? 'monthly' : 'onetime'}
          onChange={(e) => setIsMonthly(e.target.value === 'monthly')}
          className="text-xs font-medium border border-white/20 rounded-lg px-3 py-2 bg-white/10 text-white"
        >
          <option value="onetime" className="bg-slate-800">One-time</option>
          <option value="monthly" className="bg-slate-800">/month</option>
        </select>
        <button
          onClick={() => cost > 0 && onAdd(cost, isMonthly)}
          disabled={cost <= 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-bold rounded-lg hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/30"
        >
          Add
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
