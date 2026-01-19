'use client';

import { useState } from 'react';
import { Rocket, Plus, Trash2, Building, Laptop, Megaphone, GraduationCap } from 'lucide-react';
import type { UseForecastBuilderReturn, Investment } from '../hooks/useForecastBuilder';

interface InvestmentsStepProps {
  builder: UseForecastBuilderReturn;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

const INVESTMENT_PRESETS = [
  { name: 'Marketing Campaign', amount: 25000, type: 'opex' as const, icon: Megaphone },
  { name: 'New Equipment', amount: 50000, type: 'capex' as const, icon: Building },
  { name: 'Software/Technology', amount: 15000, type: 'opex' as const, icon: Laptop },
  { name: 'Training & Development', amount: 10000, type: 'opex' as const, icon: GraduationCap },
];

export function InvestmentsStep({ builder }: InvestmentsStepProps) {
  const { state, actions, calculations } = builder;
  const { investments } = state;

  const [showAddForm, setShowAddForm] = useState(false);
  const [newInvestment, setNewInvestment] = useState<Omit<Investment, 'id'>>({
    name: '',
    amount: 10000,
    type: 'opex',
  });

  const handleAddInvestment = () => {
    if (newInvestment.name && newInvestment.amount > 0) {
      actions.addInvestment(newInvestment);
      setNewInvestment({ name: '', amount: 10000, type: 'opex' });
      setShowAddForm(false);
    }
  };

  const handleQuickAdd = (preset: typeof INVESTMENT_PRESETS[0]) => {
    actions.addInvestment({
      name: preset.name,
      amount: preset.amount,
      type: preset.type,
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Rocket className="w-5 h-5 text-gray-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Step 4: Strategic Investments</h2>
        </div>
        <p className="text-gray-600 text-sm">
          Any major one-off investments planned? Equipment, marketing campaigns, or initiative costs.
        </p>
      </div>

      {/* Current Investments */}
      {investments.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Planned Investments
          </div>
          {investments.map(inv => (
            <div
              key={inv.id}
              className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  inv.type === 'capex' ? 'bg-purple-50' : 'bg-blue-50'
                }`}>
                  <Rocket className={`w-4 h-4 ${
                    inv.type === 'capex' ? 'text-purple-600' : 'text-blue-600'
                  }`} />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{inv.name}</div>
                  <div className="text-xs text-gray-500">
                    {inv.type === 'capex' ? 'Capital Expenditure' : 'Operating Expense'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900">{formatCurrency(inv.amount)}</span>
                <button
                  onClick={() => actions.removeInvestment(inv.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Total */}
          <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Total Investments</span>
            <span className="font-bold text-gray-900">{formatCurrency(calculations.totalInvestments)}</span>
          </div>
        </div>
      )}

      {/* Quick Add Options */}
      <div className="mb-6">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Quick Add
        </div>
        <div className="grid grid-cols-2 gap-2">
          {INVESTMENT_PRESETS.map(preset => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.name}
                onClick={() => handleQuickAdd(preset)}
                className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <Icon className="w-4 h-4 text-gray-500" />
                <div>
                  <div className="text-sm font-medium text-gray-900">{preset.name}</div>
                  <div className="text-xs text-gray-500">{formatCurrency(preset.amount)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Investment Form */}
      {showAddForm ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Investment Name</label>
            <input
              type="text"
              value={newInvestment.name}
              onChange={(e) => setNewInvestment(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Website Redesign, New Vehicle"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={newInvestment.amount}
                onChange={(e) => setNewInvestment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setNewInvestment(prev => ({ ...prev, type: 'opex' }))}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  newInvestment.type === 'opex'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                OpEx (Expense)
              </button>
              <button
                onClick={() => setNewInvestment(prev => ({ ...prev, type: 'capex' }))}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  newInvestment.type === 'capex'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                CapEx (Asset)
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {newInvestment.type === 'opex'
                ? 'Expensed immediately (affects profit this year)'
                : 'Capitalised and depreciated (asset on balance sheet)'}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddInvestment}
              disabled={!newInvestment.name}
              className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Investment
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-gray-300 text-gray-600 rounded-xl hover:border-gray-400 hover:text-gray-900 transition-colors mb-6"
        >
          <Plus className="w-4 h-4" />
          Add Custom Investment
        </button>
      )}

      {/* No investments state */}
      {investments.length === 0 && !showAddForm && (
        <div className="text-center py-6 bg-gray-50 rounded-xl mb-6">
          <Rocket className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No major investments planned</p>
          <p className="text-xs text-gray-400 mt-1">That's okay! You can always add them later.</p>
        </div>
      )}

      {/* Helpful context */}
      <div className="p-4 bg-blue-50 rounded-xl">
        <div className="text-sm text-blue-800">
          <strong>Tip:</strong> Only include significant one-off investments here.
          Regular recurring expenses are already covered in your baseline.
        </div>
      </div>
    </div>
  );
}
