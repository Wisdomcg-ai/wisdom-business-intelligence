'use client';

import { useState } from 'react';
import { Edit2, Trash2, Check, X, Plus, UserPlus } from 'lucide-react';
import type { UseForecastCFOReturn, TeamMember, PlannedHire } from './hooks/useForecastCFO';

interface TeamTableProps {
  cfo: UseForecastCFOReturn;
  fiscalYear: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface EditRowProps {
  name: string;
  position: string;
  salary: number;
  type: 'opex' | 'cogs';
  startMonth?: string;
  onSave: (data: { name: string; position: string; salary: number; type: 'opex' | 'cogs'; startMonth?: string }) => void;
  onCancel: () => void;
  fiscalYear: number;
  isNewHire?: boolean;
}

function EditRow({ name, position, salary, type, startMonth, onSave, onCancel, fiscalYear, isNewHire }: EditRowProps) {
  const [data, setData] = useState({ name, position, salary, type, startMonth: startMonth || '' });

  // Generate month options for fiscal year
  const monthOptions = [];
  const startYear = fiscalYear - 1;
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  for (let i = 0; i < 12; i++) {
    const year = i < 6 ? startYear : fiscalYear;
    const monthNum = i < 6 ? i + 7 : i - 5;
    monthOptions.push({
      value: `${year}-${String(monthNum).padStart(2, '0')}`,
      label: `${months[i]} ${year}`,
    });
  }

  return (
    <tr className="bg-brand-orange-50">
      <td className="px-3 py-2">
        <input
          type="text"
          value={data.name}
          onChange={(e) => setData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Name"
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-navy focus:border-transparent"
          autoFocus
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={data.position}
          onChange={(e) => setData(prev => ({ ...prev, position: e.target.value }))}
          placeholder="Position"
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-navy focus:border-transparent"
        />
      </td>
      <td className="px-3 py-2">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="number"
            value={data.salary || ''}
            onChange={(e) => setData(prev => ({ ...prev, salary: Number(e.target.value) }))}
            placeholder="0"
            className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-navy focus:border-transparent text-right"
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <select
          value={data.type}
          onChange={(e) => setData(prev => ({ ...prev, type: e.target.value as 'opex' | 'cogs' }))}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-navy focus:border-transparent"
        >
          <option value="opex">OpEx</option>
          <option value="cogs">COGS</option>
        </select>
      </td>
      {isNewHire && (
        <td className="px-3 py-2">
          <select
            value={data.startMonth}
            onChange={(e) => setData(prev => ({ ...prev, startMonth: e.target.value }))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-navy focus:border-transparent"
          >
            <option value="">Select...</option>
            {monthOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </td>
      )}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSave(data)}
            disabled={!data.name || !data.position || !data.salary}
            className="p-1.5 text-brand-navy hover:bg-brand-navy-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function TeamTable({ cfo, fiscalYear }: TeamTableProps) {
  const { state, actions, calculations } = cfo;
  const { team } = state;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isAddingHire, setIsAddingHire] = useState(false);

  const handleSaveMember = (id: string, data: { name: string; position: string; salary: number; type: 'opex' | 'cogs' }) => {
    actions.updateTeamMember(id, data);
    setEditingId(null);
  };

  const handleAddMember = (data: { name: string; position: string; salary: number; type: 'opex' | 'cogs' }) => {
    actions.addTeamMember({
      name: data.name,
      position: data.position,
      salary: data.salary,
      type: data.type,
    });
    setIsAddingMember(false);
  };

  const handleSaveHire = (id: string, data: { name: string; position: string; salary: number; type: 'opex' | 'cogs'; startMonth?: string }) => {
    actions.updateNewHire(id, {
      name: data.name,
      position: data.position,
      salary: data.salary,
      type: data.type,
      startMonth: data.startMonth || `${fiscalYear - 1}-07`,
    });
    setEditingId(null);
  };

  const handleAddHire = (data: { name: string; position: string; salary: number; type: 'opex' | 'cogs'; startMonth?: string }) => {
    actions.addNewHire({
      name: data.name,
      position: data.position,
      salary: data.salary,
      type: data.type,
      startMonth: data.startMonth || `${fiscalYear - 1}-07`,
    });
    setIsAddingHire(false);
  };

  const totalWithSuper = calculations.totalTeamCost;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Current Team */}
      <div className="border-b border-gray-200">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Current Team ({team.members.length})
          </h3>
          <button
            onClick={() => setIsAddingMember(true)}
            disabled={isAddingMember || isAddingHire}
            className="text-xs flex items-center gap-1 px-2 py-1 text-brand-navy hover:bg-brand-navy-100 rounded-md disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Position</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Salary</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {team.members.map(member => (
                editingId === member.id ? (
                  <EditRow
                    key={member.id}
                    name={member.name}
                    position={member.position}
                    salary={member.salary}
                    type={member.type}
                    onSave={(data) => handleSaveMember(member.id, data)}
                    onCancel={() => setEditingId(null)}
                    fiscalYear={fiscalYear}
                  />
                ) : (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{member.name}</span>
                        {member.isFromXero && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Xero</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">{member.position}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(member.salary)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        member.type === 'cogs'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {member.type === 'cogs' ? 'COGS' : 'OpEx'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingId(member.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => actions.removeTeamMember(member.id)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {isAddingMember && (
                <EditRow
                  name=""
                  position=""
                  salary={0}
                  type="opex"
                  onSave={handleAddMember}
                  onCancel={() => setIsAddingMember(false)}
                  fiscalYear={fiscalYear}
                />
              )}
              {team.members.length === 0 && !isAddingMember && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500 text-sm">
                    No team members yet. Click "Add" to add your first team member.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Planned Hires */}
      <div>
        <div className="px-4 py-3 bg-brand-orange-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-brand-orange" />
            Planned Hires ({team.newHires.length})
          </h3>
          <button
            onClick={() => setIsAddingHire(true)}
            disabled={isAddingMember || isAddingHire}
            className="text-xs flex items-center gap-1 px-2 py-1 text-brand-orange hover:bg-brand-orange-100 rounded-md disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            Add Hire
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Position</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Salary</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Start</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {team.newHires.map(hire => (
                editingId === hire.id ? (
                  <EditRow
                    key={hire.id}
                    name={hire.name}
                    position={hire.position}
                    salary={hire.salary}
                    type={hire.type}
                    startMonth={hire.startMonth}
                    onSave={(data) => handleSaveHire(hire.id, data)}
                    onCancel={() => setEditingId(null)}
                    fiscalYear={fiscalYear}
                    isNewHire
                  />
                ) : (
                  <tr key={hire.id} className="hover:bg-gray-50 bg-brand-orange-50/30">
                    <td className="px-3 py-2">
                      <span className="text-sm font-medium text-gray-900">{hire.name || 'TBD'}</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">{hire.position}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(hire.salary)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        hire.type === 'cogs'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {hire.type === 'cogs' ? 'COGS' : 'OpEx'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {hire.startMonth ? new Date(hire.startMonth + '-01').toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingId(hire.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => actions.removeNewHire(hire.id)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {isAddingHire && (
                <EditRow
                  name=""
                  position=""
                  salary={0}
                  type="opex"
                  startMonth={`${fiscalYear - 1}-07`}
                  onSave={handleAddHire}
                  onCancel={() => setIsAddingHire(false)}
                  fiscalYear={fiscalYear}
                  isNewHire
                />
              )}
              {team.newHires.length === 0 && !isAddingHire && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-gray-500 text-sm">
                    No planned hires. Click "Add Hire" to plan new team members.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total */}
      <div className="px-4 py-3 bg-gray-100 border-t border-gray-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          Total Team Cost (inc. {12}% super)
        </span>
        <span className="text-lg font-bold text-gray-900">
          {formatCurrency(totalWithSuper)}
        </span>
      </div>
    </div>
  );
}
