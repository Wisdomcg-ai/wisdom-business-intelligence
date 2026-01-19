'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Check,
  Edit2,
  ArrowRight,
  Sparkles,
  Megaphone,
  Laptop,
  GraduationCap,
  Wrench,
  Plus,
  Lightbulb,
} from 'lucide-react';
import { TeamTable } from './TeamTable';
import type { UseForecastCFOReturn, CFOStep } from './hooks/useForecastCFO';

interface CFOConversationProps {
  cfo: UseForecastCFOReturn;
  fiscalYear: number;
  businessName?: string;
  onComplete: () => void;
  onClose: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

// CFO Message bubble
function CFOMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="flex-shrink-0 w-8 h-8 bg-brand-navy rounded-full flex items-center justify-center">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 bg-gray-100 rounded-2xl rounded-tl-md p-4">
        {children}
      </div>
    </div>
  );
}

// AI Suggestion box
function AISuggestion({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
      <Lightbulb className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-blue-800">{children}</div>
    </div>
  );
}

// Goals Step
function GoalsStep({ cfo, fiscalYear }: { cfo: UseForecastCFOReturn; fiscalYear: number }) {
  const { state, actions } = cfo;
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    revenue: state.targets.revenue,
    netProfit: state.targets.netProfit,
  });

  const expenseBudget = state.targets.revenue - state.targets.netProfit;
  const profitPercent = state.targets.revenue > 0
    ? ((state.targets.netProfit / state.targets.revenue) * 100).toFixed(1)
    : '0';

  const handleSave = () => {
    actions.setTargets({
      revenue: editValues.revenue,
      netProfit: editValues.netProfit,
      netProfitPercent: editValues.revenue > 0 ? (editValues.netProfit / editValues.revenue) * 100 : 12,
    });
    setIsEditing(false);
  };

  return (
    <div>
      <CFOMessage>
        <p className="text-gray-800 mb-3">
          Let's confirm your targets for <strong>FY{fiscalYear}</strong>. Based on your goals:
        </p>

        {isEditing ? (
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Revenue Target</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  value={editValues.revenue}
                  onChange={(e) => setEditValues(prev => ({ ...prev, revenue: Number(e.target.value) }))}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-navy focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Net Profit Target</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  value={editValues.netProfit}
                  onChange={(e) => setEditValues(prev => ({ ...prev, netProfit: Number(e.target.value) }))}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-navy focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-600"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(state.targets.revenue)}</div>
                <div className="text-xs text-gray-500">Revenue</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-brand-navy">{formatCurrency(state.targets.netProfit)}</div>
                <div className="text-xs text-gray-500">Profit ({profitPercent}%)</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-700">{formatCurrency(expenseBudget)}</div>
                <div className="text-xs text-gray-500">Expense Budget</div>
              </div>
            </div>
          </div>
        )}

        <p className="text-gray-600 text-sm mb-4">
          This means you have <strong>{formatCurrency(expenseBudget)}</strong> to cover all your costs
          (team, operations, investments) while hitting your profit target.
        </p>

        {!isEditing && (
          <div className="flex gap-2">
            <button
              onClick={() => actions.nextStep()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-600"
            >
              <Check className="w-4 h-4" />
              Looks Good
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <Edit2 className="w-4 h-4" />
              Adjust
            </button>
          </div>
        )}
      </CFOMessage>
    </div>
  );
}

// Baseline Step
function BaselineStep({ cfo }: { cfo: UseForecastCFOReturn }) {
  const { state, actions } = cfo;
  const [isEditing, setIsEditing] = useState(false);

  const forecastOpEx = state.baseline.priorOpEx * (1 + state.baseline.opExInflation / 100);

  return (
    <div>
      <CFOMessage>
        <p className="text-gray-800 mb-3">
          Here's what I found from your prior year data:
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Prior Year Revenue</span>
              <span className="font-semibold text-gray-900">{formatCurrency(state.baseline.priorRevenue)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">COGS %</span>
              <span className="font-semibold text-gray-900">{state.baseline.cogsPercent.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Operating Expenses</span>
              <span className="font-semibold text-gray-900">{formatCurrency(state.baseline.priorOpEx)}</span>
            </div>
          </div>
        </div>

        <p className="text-gray-600 text-sm mb-3">
          For your forecast, I'll assume:
        </p>

        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-700">OpEx Inflation</span>
            <span className="text-sm font-semibold text-brand-navy">{state.baseline.opExInflation}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="15"
            value={state.baseline.opExInflation}
            onChange={(e) => actions.setBaseline({ opExInflation: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0%</span>
            <span>15%</span>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            This means OpEx of <strong>{formatCurrency(forecastOpEx)}</strong> for the year
          </div>
        </div>

        <AISuggestion>
          <strong>Tip:</strong> Most businesses see 3-5% cost inflation annually.
          Consider higher if you're planning expansions or new tools.
        </AISuggestion>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => actions.nextStep()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-600"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </CFOMessage>
    </div>
  );
}

// Team Step
function TeamStep({ cfo, fiscalYear }: { cfo: UseForecastCFOReturn; fiscalYear: number }) {
  const { state, actions, calculations } = cfo;

  return (
    <div>
      <CFOMessage>
        <p className="text-gray-800 mb-3">
          Now let's plan your team. Here's your current team and any planned hires:
        </p>
      </CFOMessage>

      {/* Team Table */}
      <div className="mb-4">
        <TeamTable cfo={cfo} fiscalYear={fiscalYear} />
      </div>

      <CFOMessage>
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-700">Annual Salary Increase</span>
          <span className="text-lg font-bold text-brand-navy">{state.team.salaryIncreasePercent}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="15"
          value={state.team.salaryIncreasePercent}
          onChange={(e) => actions.setSalaryIncrease(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer mb-2"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0%</span>
          <span>15%</span>
        </div>

        <AISuggestion>
          <strong>Industry benchmark:</strong> Most businesses plan 5-8% salary increases
          to retain talent. Your total team cost will be <strong>{formatCurrency(calculations.totalTeamCost)}</strong>
          {' '}(including super).
        </AISuggestion>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => actions.prevStep()}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={() => actions.nextStep()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-600"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </CFOMessage>
    </div>
  );
}

// Investments Step
function InvestmentsStep({ cfo }: { cfo: UseForecastCFOReturn }) {
  const { state, actions } = cfo;
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customInvestment, setCustomInvestment] = useState<{
    name: string;
    amount: number;
    category: 'marketing' | 'equipment' | 'technology' | 'training' | 'other';
    type: 'opex' | 'capex';
    quarter: string;
  }>({
    name: '',
    amount: 25000,
    category: 'other',
    type: 'opex',
    quarter: 'Q2',
  });

  const quickAddOptions = [
    { name: 'Marketing Campaign', amount: 25000, category: 'marketing' as const, icon: Megaphone },
    { name: 'Software/Technology', amount: 15000, category: 'technology' as const, icon: Laptop },
    { name: 'Training & Development', amount: 10000, category: 'training' as const, icon: GraduationCap },
    { name: 'New Equipment', amount: 50000, category: 'equipment' as const, icon: Wrench },
  ];

  const handleQuickAdd = (option: typeof quickAddOptions[0]) => {
    actions.addInvestment({
      name: option.name,
      amount: option.amount,
      category: option.category,
      type: 'opex',
      quarter: 'Q2',
    });
  };

  const handleAddCustom = () => {
    if (customInvestment.name && customInvestment.amount > 0) {
      actions.addInvestment(customInvestment);
      setCustomInvestment({ name: '', amount: 25000, category: 'other', type: 'opex', quarter: 'Q2' });
      setShowCustomForm(false);
    }
  };

  const totalInvestments = state.investments.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div>
      <CFOMessage>
        <p className="text-gray-800 mb-3">
          Any major investments planned for this year? These are one-off costs
          beyond normal operations.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {quickAddOptions.map(option => (
            <button
              key={option.name}
              onClick={() => handleQuickAdd(option)}
              className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-left"
            >
              <option.icon className="w-5 h-5 text-gray-500" />
              <div>
                <div className="text-sm font-medium text-gray-900">{option.name}</div>
                <div className="text-xs text-gray-500">{formatCurrency(option.amount)}</div>
              </div>
            </button>
          ))}
        </div>

        {state.investments.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-4">
            {state.investments.map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium text-gray-900">{inv.name}</div>
                  <div className="text-xs text-gray-500">{inv.type === 'capex' ? 'CapEx' : 'OpEx'} • {inv.quarter}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{formatCurrency(inv.amount)}</span>
                  <button
                    onClick={() => actions.removeInvestment(inv.id)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <div className="flex justify-between p-3 bg-gray-50">
              <span className="font-semibold text-gray-700">Total Investments</span>
              <span className="font-bold text-gray-900">{formatCurrency(totalInvestments)}</span>
            </div>
          </div>
        )}

        {showCustomForm ? (
          <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Investment Name</label>
              <input
                type="text"
                value={customInvestment.name}
                onChange={(e) => setCustomInvestment(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Website Redesign"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-navy focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600 block mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={customInvestment.amount}
                    onChange={(e) => setCustomInvestment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-navy focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Type</label>
                <select
                  value={customInvestment.type}
                  onChange={(e) => setCustomInvestment(prev => ({ ...prev, type: e.target.value as 'opex' | 'capex' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-navy focus:border-transparent"
                >
                  <option value="opex">OpEx (expense)</option>
                  <option value="capex">CapEx (asset)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCustomForm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustom}
                disabled={!customInvestment.name}
                className="flex-1 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-600 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-gray-300 text-gray-600 rounded-xl hover:border-gray-400 hover:text-gray-900 mb-4"
          >
            <Plus className="w-4 h-4" />
            Add Custom Investment
          </button>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => actions.prevStep()}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={() => actions.nextStep()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg hover:bg-brand-navy-600"
          >
            Continue to Review
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </CFOMessage>
    </div>
  );
}

// Review Step
function ReviewStep({ cfo, onComplete }: { cfo: UseForecastCFOReturn; onComplete: () => void }) {
  const { state, calculations, actions } = cfo;
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // TODO: Save to database
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    onComplete();
  };

  return (
    <div>
      <CFOMessage>
        <p className="text-gray-800 mb-3">
          Here's your complete forecast summary:
        </p>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="divide-y divide-gray-100">
            <div className="flex justify-between p-3">
              <span className="text-gray-700">Revenue</span>
              <span className="font-semibold text-gray-900">{formatCurrency(state.targets.revenue)}</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50">
              <span className="text-gray-700">Cost of Goods Sold ({state.baseline.cogsPercent.toFixed(0)}%)</span>
              <span className="text-gray-700">({formatCurrency(calculations.forecastCOGS)})</span>
            </div>
            <div className="flex justify-between p-3 font-semibold">
              <span className="text-gray-900">Gross Profit</span>
              <span className="text-gray-900">{formatCurrency(calculations.grossProfit)}</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50">
              <span className="text-gray-700">Team Costs ({state.team.members.length + state.team.newHires.length} people)</span>
              <span className="text-gray-700">({formatCurrency(calculations.totalTeamCost)})</span>
            </div>
            <div className="flex justify-between p-3">
              <span className="text-gray-700">Operating Expenses</span>
              <span className="text-gray-700">({formatCurrency(calculations.opExCost)})</span>
            </div>
            {calculations.investmentCost > 0 && (
              <div className="flex justify-between p-3 bg-gray-50">
                <span className="text-gray-700">Investments</span>
                <span className="text-gray-700">({formatCurrency(calculations.investmentCost)})</span>
              </div>
            )}
            <div className={`flex justify-between p-4 ${calculations.isOnTrack ? 'bg-brand-navy-100' : 'bg-red-100'}`}>
              <span className="font-bold text-gray-900">Net Profit</span>
              <div className="text-right">
                <span className={`text-xl font-bold ${calculations.isOnTrack ? 'text-brand-navy' : 'text-red-600'}`}>
                  {formatCurrency(calculations.projectedProfit)}
                </span>
                <div className={`text-xs ${calculations.isOnTrack ? 'text-brand-navy' : 'text-red-600'}`}>
                  {calculations.profitVariance >= 0 ? '+' : ''}{formatCurrency(calculations.profitVariance)} vs target
                </div>
              </div>
            </div>
          </div>
        </div>

        {!calculations.isOnTrack && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
            <div className="text-sm text-amber-800">
              <strong>You're {formatCurrency(Math.abs(calculations.profitVariance))} below your profit target.</strong>
              <p className="mt-1">To get on track, consider:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Reduce team costs or defer a hire</li>
                <li>Cut some investments</li>
                <li>Increase your revenue target</li>
              </ul>
            </div>
          </div>
        )}

        {calculations.isOnTrack && (
          <div className="p-4 bg-brand-navy-100 border border-brand-navy-200 rounded-xl mb-4">
            <div className="text-sm text-brand-navy">
              <strong>Your forecast is on track!</strong>
              <p className="mt-1">
                You have {formatCurrency(calculations.budgetRemaining)} buffer in your expense budget.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => actions.prevStep()}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 disabled:opacity-50"
          >
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Forecast
              </>
            )}
          </button>
        </div>
      </CFOMessage>
    </div>
  );
}

export function CFOConversation({ cfo, fiscalYear, businessName, onComplete, onClose }: CFOConversationProps) {
  const { state } = cfo;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-navy rounded-full">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Build Your FY{fiscalYear} Forecast</h2>
            <p className="text-xs text-gray-500">{businessName || 'Your Business'}</p>
          </div>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-auto p-4">
        {state.step === 'goals' && <GoalsStep cfo={cfo} fiscalYear={fiscalYear} />}
        {state.step === 'baseline' && <BaselineStep cfo={cfo} />}
        {state.step === 'team' && <TeamStep cfo={cfo} fiscalYear={fiscalYear} />}
        {state.step === 'investments' && <InvestmentsStep cfo={cfo} />}
        {state.step === 'review' && <ReviewStep cfo={cfo} onComplete={onComplete} />}
      </div>
    </div>
  );
}
