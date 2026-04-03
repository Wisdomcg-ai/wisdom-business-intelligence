'use client';

import { useState } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Building2,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import type { UseForecastBuilderReturn, TeamMember, PlannedHire } from './hooks/useForecastBuilder';

interface TeamPanelProps {
  builder: UseForecastBuilderReturn;
  fiscalYear: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const [year, month] = dateStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

// Generate month options for the fiscal year
function generateMonthOptions(fiscalYear: number): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // FY runs Jul-Jun, so FY26 is Jul 2025 - Jun 2026
  const startYear = fiscalYear - 1;

  // July to December of start year
  for (let m = 7; m <= 12; m++) {
    const monthStr = m.toString().padStart(2, '0');
    options.push({
      value: `${startYear}-${monthStr}`,
      label: `${monthNames[m - 1]} ${startYear}`,
    });
  }

  // January to June of fiscal year
  for (let m = 1; m <= 6; m++) {
    const monthStr = m.toString().padStart(2, '0');
    options.push({
      value: `${fiscalYear}-${monthStr}`,
      label: `${monthNames[m - 1]} ${fiscalYear}`,
    });
  }

  return options;
}

// Editable row component
function EditableRow({
  member,
  onSave,
  onCancel,
  onDelete,
  isNew,
  fiscalYear,
}: {
  member: Partial<TeamMember | PlannedHire>;
  onSave: (data: Partial<TeamMember | PlannedHire>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isNew?: boolean;
  fiscalYear: number;
}) {
  const [data, setData] = useState({
    name: member.name || '',
    position: member.position || '',
    startDate: member.startDate || '',
    endDate: member.endDate || '',
    annualSalary: member.annualSalary || 0,
    classification: member.classification || 'opex',
  });

  const monthOptions = generateMonthOptions(fiscalYear);

  return (
    <tr className="bg-brand-orange-50">
      <td className="px-3 py-2">
        <input
          type="text"
          value={data.name}
          onChange={(e) => setData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Name"
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-navy focus:border-transparent"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={data.position}
          onChange={(e) => setData(prev => ({ ...prev, position: e.target.value }))}
          placeholder="Position"
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-navy focus:border-transparent"
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={data.startDate}
          onChange={(e) => setData(prev => ({ ...prev, startDate: e.target.value }))}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-navy focus:border-transparent"
        >
          <option value="">Select...</option>
          {monthOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={data.endDate}
          onChange={(e) => setData(prev => ({ ...prev, endDate: e.target.value }))}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-navy focus:border-transparent"
        >
          <option value="">No end date</option>
          {monthOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="number"
            value={data.annualSalary || ''}
            onChange={(e) => setData(prev => ({ ...prev, annualSalary: Number(e.target.value) }))}
            placeholder="0"
            className="w-full pl-6 pr-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-navy focus:border-transparent text-right"
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <select
          value={data.classification}
          onChange={(e) => setData(prev => ({ ...prev, classification: e.target.value as 'cogs' | 'opex' }))}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-navy focus:border-transparent"
        >
          <option value="opex">OpEx</option>
          <option value="cogs">COGS</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSave(data)}
            disabled={!data.name || !data.position}
            className="p-1 text-brand-navy hover:bg-brand-navy-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={onCancel}
            className="p-1 text-gray-500 hover:bg-gray-100 rounded"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
          {onDelete && !isNew && (
            <button
              onClick={onDelete}
              className="p-1 text-red-500 hover:bg-red-50 rounded"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// Read-only row component
function ReadOnlyRow({
  member,
  onEdit,
  onDelete,
  salaryIncreasePercent,
  isPlannedHire,
}: {
  member: TeamMember | PlannedHire;
  onEdit: () => void;
  onDelete: () => void;
  salaryIncreasePercent: number;
  isPlannedHire?: boolean;
}) {
  const adjustedSalary = isPlannedHire
    ? member.annualSalary
    : member.annualSalary * (1 + salaryIncreasePercent / 100);

  return (
    <tr className={`hover:bg-gray-50 ${isPlannedHire ? 'bg-brand-orange-50/50' : ''}`}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{member.name}</span>
          {'isFromXero' in member && member.isFromXero && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Xero</span>
          )}
          {isPlannedHire && (
            <span className="text-xs px-1.5 py-0.5 bg-brand-orange-100 text-brand-orange rounded">New</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-sm text-gray-600">{member.position}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{formatDate(member.startDate)}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{formatDate(member.endDate)}</td>
      <td className="px-3 py-2 text-sm text-right">
        <div>
          <span className="font-medium text-gray-900">{formatCurrency(adjustedSalary)}</span>
          {!isPlannedHire && salaryIncreasePercent > 0 && (
            <div className="text-xs text-gray-500">
              (was {formatCurrency(member.annualSalary)})
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          member.classification === 'cogs'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-gray-100 text-gray-700'
        }`}>
          {member.classification === 'cogs' ? 'COGS' : 'OpEx'}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function TeamPanel({ builder, fiscalYear }: TeamPanelProps) {
  const { state, actions, calculations } = builder;
  const { team } = state;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingExisting, setIsAddingExisting] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Calculate totals
  const existingTeamCost = team.existingMembers.reduce(
    (sum, m) => sum + m.annualSalary * (1 + team.salaryIncreasePercent / 100),
    0
  );
  const newHiresCost = team.plannedHires.reduce((sum, h) => sum + h.annualSalary, 0);
  const totalTeamCost = existingTeamCost + newHiresCost;

  // Handlers for existing team members
  const handleSaveExisting = (id: string, data: Partial<TeamMember>) => {
    actions.updateTeamMember(id, data);
    setEditingId(null);
  };

  const handleAddExisting = (data: Partial<TeamMember>) => {
    actions.addTeamMember({
      name: data.name || '',
      position: data.position || '',
      annualSalary: data.annualSalary || 0,
      startDate: data.startDate,
      endDate: data.endDate,
      classification: data.classification || 'opex',
    });
    setIsAddingExisting(false);
  };

  // Handlers for planned hires
  const handleSaveHire = (id: string, data: Partial<PlannedHire>) => {
    actions.updatePlannedHire(id, data);
    setEditingId(null);
  };

  const handleAddHire = (data: Partial<PlannedHire>) => {
    actions.addPlannedHire({
      name: data.name || '',
      position: data.position || '',
      annualSalary: data.annualSalary || 0,
      startDate: data.startDate || `${fiscalYear - 1}-07`,
      endDate: data.endDate,
      classification: data.classification || 'opex',
    });
    setIsAddingNew(false);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-navy-100 rounded-lg">
              <Users className="w-5 h-5 text-brand-navy" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Team Planning</h2>
              <p className="text-xs text-gray-500">FY{fiscalYear} Headcount & Salaries</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Salary Increase</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="15"
                value={team.salaryIncreasePercent}
                onChange={(e) => actions.setSalaryIncrease(Number(e.target.value))}
                className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-sm font-semibold text-brand-navy w-10">
                {team.salaryIncreasePercent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        {/* Existing Team Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Current Team ({team.existingMembers.length})
            </h3>
            <button
              onClick={() => setIsAddingExisting(true)}
              disabled={isAddingExisting || isAddingNew}
              className="text-xs flex items-center gap-1 px-2 py-1 text-brand-navy hover:bg-brand-navy-100 rounded disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              Add Existing
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Position</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Start</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">End</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Salary</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {team.existingMembers.map(member => (
                  editingId === member.id ? (
                    <EditableRow
                      key={member.id}
                      member={member}
                      onSave={(data) => handleSaveExisting(member.id, data)}
                      onCancel={() => setEditingId(null)}
                      onDelete={() => {
                        actions.removeTeamMember(member.id);
                        setEditingId(null);
                      }}
                      fiscalYear={fiscalYear}
                    />
                  ) : (
                    <ReadOnlyRow
                      key={member.id}
                      member={member}
                      onEdit={() => setEditingId(member.id)}
                      onDelete={() => actions.removeTeamMember(member.id)}
                      salaryIncreasePercent={team.salaryIncreasePercent}
                    />
                  )
                ))}
                {isAddingExisting && (
                  <EditableRow
                    member={{}}
                    onSave={handleAddExisting}
                    onCancel={() => setIsAddingExisting(false)}
                    isNew
                    fiscalYear={fiscalYear}
                  />
                )}
                {team.existingMembers.length === 0 && !isAddingExisting && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-500 text-sm">
                      <AlertCircle className="w-5 h-5 mx-auto mb-2 text-gray-400" />
                      No team members yet. Add your current team or connect Xero to import.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Planned Hires Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              Planned Hires ({team.plannedHires.length})
            </h3>
            <button
              onClick={() => setIsAddingNew(true)}
              disabled={isAddingExisting || isAddingNew}
              className="text-xs flex items-center gap-1 px-2 py-1 text-brand-orange hover:bg-brand-orange-100 rounded disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              Add New Hire
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Position</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Start</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">End</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Salary</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {team.plannedHires.map(hire => (
                  editingId === hire.id ? (
                    <EditableRow
                      key={hire.id}
                      member={hire}
                      onSave={(data) => handleSaveHire(hire.id, data)}
                      onCancel={() => setEditingId(null)}
                      onDelete={() => {
                        actions.removePlannedHire(hire.id);
                        setEditingId(null);
                      }}
                      fiscalYear={fiscalYear}
                    />
                  ) : (
                    <ReadOnlyRow
                      key={hire.id}
                      member={hire}
                      onEdit={() => setEditingId(hire.id)}
                      onDelete={() => actions.removePlannedHire(hire.id)}
                      salaryIncreasePercent={0}
                      isPlannedHire
                    />
                  )
                ))}
                {isAddingNew && (
                  <EditableRow
                    member={{ startDate: `${fiscalYear - 1}-07` }}
                    onSave={handleAddHire}
                    onCancel={() => setIsAddingNew(false)}
                    isNew
                    fiscalYear={fiscalYear}
                  />
                )}
                {team.plannedHires.length === 0 && !isAddingNew && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-500 text-sm">
                      No planned hires yet. Click "Add New Hire" to plan your team growth.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Summary Footer */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Current Team</div>
              <div className="font-semibold text-gray-900">{formatCurrency(existingTeamCost)}</div>
              <div className="text-xs text-gray-500">{team.existingMembers.length} people</div>
            </div>
            <div>
              <div className="text-gray-500">New Hires</div>
              <div className="font-semibold text-brand-orange">{formatCurrency(newHiresCost)}</div>
              <div className="text-xs text-gray-500">{team.plannedHires.length} planned</div>
            </div>
            <div>
              <div className="text-gray-500">Total Team Cost</div>
              <div className="font-bold text-lg text-gray-900">{formatCurrency(totalTeamCost)}</div>
              <div className="text-xs text-gray-500">{team.existingMembers.length + team.plannedHires.length} total</div>
            </div>
          </div>
        </div>

        {/* Budget Impact */}
        <div className={`mt-3 p-2 rounded-lg text-sm ${
          calculations.isOnTrack ? 'bg-brand-navy-100 text-brand-navy' : 'bg-red-100 text-red-700'
        }`}>
          {calculations.isOnTrack ? (
            <span>Team costs are within budget. {formatCurrency(calculations.budgetRemaining)} buffer remaining.</span>
          ) : (
            <span>Team costs exceed budget by {formatCurrency(Math.abs(calculations.budgetRemaining))}. Consider adjustments.</span>
          )}
        </div>
      </div>
    </div>
  );
}
