'use client';

import { useState } from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency, ExpenseFrequency } from '../types';

interface Step7OtherProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
}

export function Step7Other({ state, actions, fiscalYear }: Step7OtherProps) {
  const { otherExpenses } = state;
  const [showAddExpense, setShowAddExpense] = useState(false);

  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: 0,
    frequency: 'monthly' as ExpenseFrequency,
    startMonth: 7,
    notes: '',
  });

  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const frequencies: { value: ExpenseFrequency; label: string }[] = [
    { value: 'once', label: 'One-time' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' },
  ];

  const handleAddExpense = () => {
    if (!newExpense.description.trim() || newExpense.amount <= 0) return;
    actions.addOtherExpense({
      description: newExpense.description.trim(),
      amount: newExpense.amount,
      frequency: newExpense.frequency,
      startMonth: newExpense.startMonth,
      notes: newExpense.notes || undefined,
    });
    setNewExpense({
      description: '',
      amount: 0,
      frequency: 'monthly',
      startMonth: 7,
      notes: '',
    });
    setShowAddExpense(false);
  };

  const calculateAnnualAmount = (expense: typeof otherExpenses[0]) => {
    switch (expense.frequency) {
      case 'once':
        return expense.amount;
      case 'monthly':
        return expense.amount * 12;
      case 'quarterly':
        return expense.amount * 4;
      case 'annual':
        return expense.amount;
      default:
        return expense.amount;
    }
  };

  const totalAnnual = otherExpenses.reduce((sum, exp) => sum + calculateAnnualAmount(exp), 0);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">Other Committed Expenses</h3>
          </div>
          <button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-brand-navy/5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>

        {showAddExpense && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
            <div className="grid grid-cols-5 gap-3">
              <input
                type="text"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                placeholder="Description"
                className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                autoFocus
              />
              <input
                type="number"
                value={newExpense.amount || ''}
                onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                placeholder="Amount"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <select
                value={newExpense.frequency}
                onChange={(e) => setNewExpense({ ...newExpense, frequency: e.target.value as ExpenseFrequency })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {frequencies.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={newExpense.startMonth}
                onChange={(e) => setNewExpense({ ...newExpense, startMonth: parseInt(e.target.value) })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {months.map((m, idx) => (
                  <option key={idx} value={idx < 6 ? idx + 7 : idx - 5}>
                    {newExpense.frequency === 'once' ? m : `Start: ${m}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <input
                type="text"
                value={newExpense.notes}
                onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })}
                placeholder="Notes (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setShowAddExpense(false);
                  setNewExpense({
                    description: '',
                    amount: 0,
                    frequency: 'monthly',
                    startMonth: 7,
                    notes: '',
                  });
                }}
                className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddExpense}
                className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800"
              >
                Add Expense
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Frequency</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Start/Month
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Annual Total
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {otherExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{expense.description}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(expense.amount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-center">
                    {frequencies.find((f) => f.value === expense.frequency)?.label}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-center">
                    {months[(expense.startMonth - 1 + 6) % 12]}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                    {formatCurrency(calculateAnnualAmount(expense))}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{expense.notes || '-'}</td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => actions.removeOtherExpense(expense.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {otherExpenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No other expenses added. Click "Add Expense" if you have any committed expenses not covered
                    elsewhere.
                  </td>
                </tr>
              )}
            </tbody>
            {otherExpenses.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL OTHER EXPENSES</td>
                  <td colSpan={3}></td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(totalAnnual)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Common Expenses Hint */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Common expenses you may have missed:</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            'Equipment leases',
            'Industry conferences',
            'Legal retainers',
            'Consulting fees',
            'Licensing fees',
            'Membership dues',
            'Vehicle expenses',
            'Security services',
          ].map((item) => (
            <button
              key={item}
              onClick={() => {
                setNewExpense({
                  description: item,
                  amount: 0,
                  frequency: 'monthly',
                  startMonth: 7,
                  notes: '',
                });
                setShowAddExpense(true);
              }}
              className="text-left px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-brand-navy rounded-lg transition-colors"
            >
              + {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
