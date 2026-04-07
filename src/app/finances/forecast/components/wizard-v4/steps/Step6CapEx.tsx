'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';
import {
  ForecastWizardState,
  WizardActions,
  PlannedSpend,
  SpendType,
  PaymentMethod,
  formatCurrency,
  getPlannedSpendPLImpact,
} from '../types';
import { getFiscalMonthLabels, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils';

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
  const { plannedSpends = [] } = state;
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [initiatives, setInitiatives] = useState<StrategicInitiative[]>([]);
  const [loadingInitiatives, setLoadingInitiatives] = useState(false);

  // New item form state
  const [newItem, setNewItem] = useState({
    description: '',
    amount: 0,
    month: 7,
    spendType: 'asset' as SpendType,
    usefulLifeYears: 5,
    paymentMethod: 'outright' as PaymentMethod,
  });

  // Load strategic initiatives from annual plan
  useEffect(() => {
    if (!businessId) return;

    const loadInitiatives = async () => {
      setLoadingInitiatives(true);
      try {
        const response = await fetch(`/api/strategic-initiatives?business_id=${businessId}&annual_plan_only=true`);
        const data = await response.json();
        if (response.ok) {
          setInitiatives(data.initiatives || []);
        }
      } catch (error) {
        console.error('[Step6CapEx] Failed to load initiatives:', error);
      } finally {
        setLoadingInitiatives(false);
      }
    };

    loadInitiatives();
  }, [businessId]);

  const months = getFiscalMonthLabels(DEFAULT_YEAR_START_MONTH);

  // Calculate totals
  const totalCash = plannedSpends.reduce((s, item) => s + item.amount, 0);
  const totalPLImpact = plannedSpends.reduce((s, item) => s + getPlannedSpendPLImpact(item, 1), 0);
  const totalMonthly = plannedSpends.reduce((s, item) => {
    if (item.paymentMethod === 'finance') return s + (item.financeMonthlyPayment || 0);
    if (item.paymentMethod === 'lease') return s + (item.leaseMonthlyPayment || 0);
    return s;
  }, 0);

  const handleAdd = () => {
    if (!newItem.description.trim() || newItem.amount <= 0) return;
    const spend: Omit<PlannedSpend, 'id'> = {
      ...newItem,
      description: newItem.description.trim(),
    };
    if (spend.spendType === 'asset') {
      spend.annualDepreciation = Math.round(spend.amount / (spend.usefulLifeYears || 5));
    }
    actions.addPlannedSpend(spend);
    setNewItem({ description: '', amount: 0, month: 7, spendType: 'asset', usefulLifeYears: 5, paymentMethod: 'outright' });
    setShowAddForm(false);
  };

  // Filter initiatives not yet added as planned spends
  const pendingInitiatives = initiatives.filter(i => !plannedSpends.some(s => s.initiativeId === i.id));

  return (
    <div className="space-y-4">
      {/* Compact budget bar */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between text-sm">
        <span className="text-gray-600">Planned spending</span>
        <div className="flex items-center gap-4 text-gray-500">
          <span>Cash: <strong className="text-gray-900">{formatCurrency(totalCash)}</strong></span>
          <span>P&L: <strong className="text-gray-900">{formatCurrency(totalPLImpact)}/yr</strong></span>
          {totalMonthly > 0 && <span>Monthly: <strong className="text-gray-900">{formatCurrency(totalMonthly)}/mo</strong></span>}
        </div>
      </div>

      {/* Initiative suggestions */}
      {pendingInitiatives.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-5 py-3 flex items-center gap-3 text-sm">
          <Lightbulb className="w-4 h-4 text-purple-600 flex-shrink-0" />
          <span className="text-purple-700">From your plan:</span>
          <div className="flex gap-2 flex-wrap">
            {pendingInitiatives.map(init => (
              <button key={init.id} onClick={() => {
                actions.addPlannedSpend({
                  description: init.title,
                  amount: init.estimated_cost || 0,
                  month: 7,
                  spendType: 'one-off',
                  paymentMethod: 'outright',
                  initiativeId: init.id,
                });
              }} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200">
                + {init.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Planned Spending</h3>
          <button onClick={() => setShowAddForm(true)} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-brand-navy/5 rounded-lg">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-6 gap-3">
              <input type="text" value={newItem.description} onChange={e => setNewItem(p => ({...p, description: e.target.value}))} placeholder="Description" className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm" autoFocus />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" value={newItem.amount || ''} onChange={e => setNewItem(p => ({...p, amount: parseFloat(e.target.value) || 0}))} placeholder="Amount" className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <select value={newItem.month} onChange={e => setNewItem(p => ({...p, month: parseInt(e.target.value)}))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {months.map((m, i) => <option key={m} value={i < 6 ? i + 7 : i - 5}>{m}</option>)}
              </select>
              <select value={newItem.spendType} onChange={e => setNewItem(p => ({...p, spendType: e.target.value as SpendType}))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="asset">Asset</option>
                <option value="one-off">One-off</option>
                <option value="monthly">Monthly</option>
              </select>
              <select value={newItem.paymentMethod} onChange={e => setNewItem(p => ({...p, paymentMethod: e.target.value as PaymentMethod}))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="outright">Outright</option>
                <option value="finance">Finance</option>
                <option value="lease">Lease</option>
              </select>
            </div>
            {newItem.spendType === 'asset' && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">Useful life:</span>
                <select value={newItem.usefulLifeYears} onChange={e => setNewItem(p => ({...p, usefulLifeYears: parseInt(e.target.value)}))} className="px-2 py-1 border border-gray-300 rounded text-xs">
                  {[1,2,3,4,5,7,10,15,20].map(y => <option key={y} value={y}>{y} years</option>)}
                </select>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={handleAdd} className="px-4 py-2 bg-brand-navy text-white text-sm rounded-lg">Add</button>
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase" style={{width:'25%'}}>Item</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase" style={{width:'13%'}}>Amount</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase" style={{width:'10%'}}>When</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase" style={{width:'12%'}}>Type</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase" style={{width:'12%'}}>Payment</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase" style={{width:'13%'}}>P&L Impact</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase" style={{width:'11%'}}>Monthly</th>
                <th className="px-2 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {plannedSpends.map(item => {
                const plImpact = getPlannedSpendPLImpact(item, 1);
                const isExpanded = expandedItems.has(item.id);
                const monthlyPayment = item.paymentMethod === 'finance' ? item.financeMonthlyPayment
                  : item.paymentMethod === 'lease' ? item.leaseMonthlyPayment : null;

                return (
                  <React.Fragment key={item.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(item.paymentMethod === 'finance' || item.paymentMethod === 'lease') && (
                            <button onClick={() => { const next = new Set(expandedItems); isExpanded ? next.delete(item.id) : next.add(item.id); setExpandedItems(next); }} className="text-gray-400 hover:text-gray-600">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                          <span className="text-sm font-medium text-gray-900">{item.description}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">{months[(item.month - 7 + 12) % 12]}</td>
                      <td className="px-4 py-3 text-center">
                        <select value={`${item.spendType}${item.spendType === 'asset' ? `-${item.usefulLifeYears || 5}` : ''}`}
                          onChange={e => {
                            const val = e.target.value;
                            if (val.startsWith('asset-')) {
                              actions.updatePlannedSpend(item.id, { spendType: 'asset', usefulLifeYears: parseInt(val.split('-')[1]) });
                            } else {
                              actions.updatePlannedSpend(item.id, { spendType: val as SpendType, usefulLifeYears: undefined });
                            }
                          }}
                          className="px-2 py-1 text-xs border border-gray-200 rounded">
                          {[1,2,3,4,5,7,10,15,20].map(y => <option key={y} value={`asset-${y}`}>Asset ({y}yr)</option>)}
                          <option value="one-off">One-off</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select value={item.paymentMethod} onChange={e => actions.updatePlannedSpend(item.id, { paymentMethod: e.target.value as PaymentMethod })} className="px-2 py-1 text-xs border border-gray-200 rounded">
                          <option value="outright">Outright</option>
                          <option value="finance">Finance</option>
                          <option value="lease">Lease</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(plImpact)}/yr</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{monthlyPayment ? `${formatCurrency(monthlyPayment)}/mo` : '\u2014'}</td>
                      <td className="px-2 py-3">
                        <button onClick={() => actions.removePlannedSpend(item.id)} className="p-1 text-gray-300 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>

                    {/* Expanded finance calculator */}
                    {isExpanded && item.paymentMethod === 'finance' && (
                      <tr className="bg-blue-50 border-b border-blue-100">
                        <td colSpan={8} className="px-8 py-4">
                          <div className="flex items-center gap-6 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600">Term:</span>
                              <select value={item.financeTerm || ''} onChange={e => actions.updatePlannedSpend(item.id, { financeTerm: parseInt(e.target.value) })} className="px-2 py-1 border border-blue-200 rounded text-sm bg-white">
                                <option value="">Select</option>
                                {[12,24,36,48,60].map(t => <option key={t} value={t}>{t} months</option>)}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600">Rate:</span>
                              <div className="relative">
                                <input type="number" value={item.financeRate || ''} onChange={e => actions.updatePlannedSpend(item.id, { financeRate: parseFloat(e.target.value) || 0 })} placeholder="0" step="0.1" className="w-16 px-2 py-1 pr-6 border border-blue-200 rounded text-sm text-right bg-white" />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                              </div>
                            </div>
                            {item.financeMonthlyPayment && item.financeMonthlyPayment > 0 && (
                              <div className="border-l border-blue-200 pl-6 flex items-center gap-4">
                                <div>
                                  <div className="text-xs text-blue-600">Monthly</div>
                                  <div className="font-semibold text-blue-900">{formatCurrency(item.financeMonthlyPayment)}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-blue-600">Total Interest</div>
                                  <div className="font-semibold text-blue-900">{formatCurrency(item.financeTotalInterest || 0)}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-blue-600">Total Cost</div>
                                  <div className="font-semibold text-blue-900">{formatCurrency(item.amount + (item.financeTotalInterest || 0))}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Expanded lease calculator */}
                    {isExpanded && item.paymentMethod === 'lease' && (
                      <tr className="bg-green-50 border-b border-green-100">
                        <td colSpan={8} className="px-8 py-4">
                          <div className="flex items-center gap-6 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600">Term:</span>
                              <select value={item.leaseTerm || ''} onChange={e => actions.updatePlannedSpend(item.id, { leaseTerm: parseInt(e.target.value) })} className="px-2 py-1 border border-green-200 rounded text-sm bg-white">
                                <option value="">Select</option>
                                {[12,24,36,48,60].map(t => <option key={t} value={t}>{t} months</option>)}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600">Monthly:</span>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                <input type="number" value={item.leaseMonthlyPayment || ''} onChange={e => actions.updatePlannedSpend(item.id, { leaseMonthlyPayment: parseFloat(e.target.value) || 0 })} placeholder="0" className="w-24 pl-6 pr-3 py-1 border border-green-200 rounded text-sm text-right bg-white" />
                              </div>
                            </div>
                            {item.leaseMonthlyPayment && item.leaseTerm && (
                              <div className="border-l border-green-200 pl-6 flex items-center gap-4">
                                <div>
                                  <div className="text-xs text-green-600">Total Cost</div>
                                  <div className="font-semibold text-green-900">{formatCurrency(item.leaseMonthlyPayment * item.leaseTerm)}</div>
                                </div>
                                <div className="text-xs text-green-600">100% tax deductible - No depreciation</div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {plannedSpends.length === 0 && !showAddForm && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                    No spending planned. Click &quot;Add Item&quot; to get started.
                  </td>
                </tr>
              )}
            </tbody>

            {plannedSpends.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">{formatCurrency(totalCash)}</td>
                  <td></td><td></td><td></td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">{formatCurrency(totalPLImpact)}/yr</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">{totalMonthly > 0 ? `${formatCurrency(totalMonthly)}/mo` : '\u2014'}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
