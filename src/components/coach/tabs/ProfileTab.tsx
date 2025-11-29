'use client'

import { useState, useEffect } from 'react'
import {
  Building2,
  User,
  Briefcase,
  Save,
  Edit2,
  X,
  DollarSign
} from 'lucide-react'

interface ProfileTabProps {
  clientId: string
  businessName: string
  industry?: string
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
  website?: string
  address?: string
  programType?: string
  sessionFrequency?: string
  engagementStartDate?: string
  contractEndDate?: string
  notes?: string
  // Additional business fields
  legalName?: string
  yearsInBusiness?: number
  businessModel?: string
  annualRevenue?: number
  revenueGrowthRate?: number
  grossMargin?: number
  netMargin?: number
  employeeCount?: number
  totalCustomers?: number
  onSave?: (data: any) => Promise<void>
}

export function ProfileTab({
  clientId: _clientId,
  businessName,
  industry,
  ownerName,
  ownerEmail,
  ownerPhone,
  website,
  address,
  programType,
  sessionFrequency,
  engagementStartDate,
  contractEndDate,
  notes,
  legalName,
  yearsInBusiness,
  businessModel,
  annualRevenue,
  revenueGrowthRate,
  grossMargin,
  netMargin,
  employeeCount,
  totalCustomers,
  onSave
}: ProfileTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editData, setEditData] = useState({
    businessName,
    industry,
    ownerPhone,
    website,
    address,
    programType,
    sessionFrequency,
    notes,
    legalName,
    yearsInBusiness,
    businessModel,
    annualRevenue,
    revenueGrowthRate,
    grossMargin,
    netMargin,
    employeeCount,
    totalCustomers,
    engagementStartDate
  })

  // Update editData when props change
  useEffect(() => {
    setEditData({
      businessName,
      industry,
      ownerPhone,
      website,
      address,
      programType,
      sessionFrequency,
      notes,
      legalName,
      yearsInBusiness,
      businessModel,
      annualRevenue,
      revenueGrowthRate,
      grossMargin,
      netMargin,
      employeeCount,
      totalCustomers,
      engagementStartDate
    })
  }, [businessName, industry, ownerPhone, website, address, programType, sessionFrequency, notes, legalName, yearsInBusiness, businessModel, annualRevenue, revenueGrowthRate, grossMargin, netMargin, employeeCount, totalCustomers, engagementStartDate])

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(editData)
      setIsEditing(false)
    } catch (error) {
      console.error('Error saving profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '--'
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return '--'
    return `$${value.toLocaleString()}`
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Client Profile</h2>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit Profile
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business Information */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Business Information</h3>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Business Name */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Business Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.businessName || ''}
                  onChange={(e) => setEditData({ ...editData, businessName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900 font-medium">{businessName}</p>
              )}
            </div>

            {/* Legal Name */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Legal Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.legalName || ''}
                  onChange={(e) => setEditData({ ...editData, legalName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900">{legalName || '--'}</p>
              )}
            </div>

            {/* Industry */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Industry</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.industry || ''}
                  onChange={(e) => setEditData({ ...editData, industry: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900">{industry || '--'}</p>
              )}
            </div>

            {/* Years in Business */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Years in Business</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.yearsInBusiness || ''}
                  onChange={(e) => setEditData({ ...editData, yearsInBusiness: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900">{yearsInBusiness ? `${yearsInBusiness} years` : '--'}</p>
              )}
            </div>

            {/* Business Model */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Business Model</label>
              {isEditing ? (
                <select
                  value={editData.businessModel || ''}
                  onChange={(e) => setEditData({ ...editData, businessModel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select model</option>
                  <option value="B2B (Business to Business)">B2B (Business to Business)</option>
                  <option value="B2C (Business to Consumer)">B2C (Business to Consumer)</option>
                  <option value="B2B & B2C">B2B & B2C</option>
                  <option value="Marketplace">Marketplace</option>
                  <option value="SaaS">SaaS</option>
                  <option value="Other">Other</option>
                </select>
              ) : (
                <p className="text-gray-900">{businessModel || '--'}</p>
              )}
            </div>

            {/* Website */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Website</label>
              {isEditing ? (
                <input
                  type="url"
                  value={editData.website || ''}
                  onChange={(e) => setEditData({ ...editData, website: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="https://"
                />
              ) : (
                <p className="text-gray-900">
                  {website ? (
                    <a href={website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                      {website}
                    </a>
                  ) : '--'}
                </p>
              )}
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Address</label>
              {isEditing ? (
                <textarea
                  value={editData.address || ''}
                  onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900">{address || '--'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Financial Information */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Financial Information</h3>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Annual Revenue */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Annual Revenue</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.annualRevenue || ''}
                  onChange={(e) => setEditData({ ...editData, annualRevenue: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="750000"
                />
              ) : (
                <p className="text-gray-900 font-medium">{formatCurrency(annualRevenue)}</p>
              )}
            </div>

            {/* Revenue Growth Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Revenue Growth Rate (%)</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.revenueGrowthRate || ''}
                  onChange={(e) => setEditData({ ...editData, revenueGrowthRate: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="20"
                />
              ) : (
                <p className="text-gray-900">{revenueGrowthRate !== undefined ? `${revenueGrowthRate}%` : '--'}</p>
              )}
            </div>

            {/* Gross Margin */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Gross Margin (%)</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.grossMargin || ''}
                  onChange={(e) => setEditData({ ...editData, grossMargin: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="30"
                />
              ) : (
                <p className="text-gray-900">{grossMargin !== undefined ? `${grossMargin}%` : '--'}</p>
              )}
            </div>

            {/* Net Margin */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Net Margin (%)</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.netMargin || ''}
                  onChange={(e) => setEditData({ ...editData, netMargin: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="15"
                />
              ) : (
                <p className="text-gray-900">{netMargin !== undefined ? `${netMargin}%` : '--'}</p>
              )}
            </div>

            {/* Employee Count */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Team Size (Employees)</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.employeeCount || ''}
                  onChange={(e) => setEditData({ ...editData, employeeCount: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900">{employeeCount !== undefined ? `${employeeCount} people` : '--'}</p>
              )}
            </div>

            {/* Total Customers */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Total Customers</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.totalCustomers || ''}
                  onChange={(e) => setEditData({ ...editData, totalCustomers: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900">{totalCustomers !== undefined ? totalCustomers : '--'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Contact Information</h3>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Owner Name */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Owner / Primary Contact</label>
              <p className="text-gray-900 font-medium">{ownerName || '--'}</p>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
              <p className="text-gray-900">
                {ownerEmail ? (
                  <a href={`mailto:${ownerEmail}`} className="text-indigo-600 hover:underline">
                    {ownerEmail}
                  </a>
                ) : '--'}
              </p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
              {isEditing ? (
                <input
                  type="tel"
                  value={editData.ownerPhone || ''}
                  onChange={(e) => setEditData({ ...editData, ownerPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900">
                  {ownerPhone ? (
                    <a href={`tel:${ownerPhone}`} className="text-indigo-600 hover:underline">
                      {ownerPhone}
                    </a>
                  ) : '--'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Program Details */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Program Details</h3>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Program Type */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Program Type</label>
              {isEditing ? (
                <select
                  value={editData.programType || ''}
                  onChange={(e) => setEditData({ ...editData, programType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select program</option>
                  <option value="1:1 Coaching">1:1 Coaching</option>
                  <option value="Think Bigger">Think Bigger</option>
                  <option value="Coaching + CFO Services">Coaching + CFO Services</option>
                </select>
              ) : (
                <p className="text-gray-900">{programType || '--'}</p>
              )}
            </div>

            {/* Session Frequency - Only show for 1:1 Coaching */}
            {(programType === '1:1 Coaching' || editData.programType === '1:1 Coaching') && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Session Frequency</label>
                {isEditing ? (
                  <select
                    value={editData.sessionFrequency || ''}
                    onChange={(e) => setEditData({ ...editData, sessionFrequency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select frequency</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Fortnightly">Fortnightly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                ) : (
                  <p className="text-gray-900">{sessionFrequency || '--'}</p>
                )}
              </div>
            )}

            {/* Engagement Start */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Engagement Started</label>
              {isEditing ? (
                <input
                  type="date"
                  value={editData.engagementStartDate || ''}
                  onChange={(e) => setEditData({ ...editData, engagementStartDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <p className="text-gray-900">{formatDate(engagementStartDate)}</p>
              )}
            </div>

            {/* Contract End */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Contract End Date</label>
              <p className="text-gray-900">{formatDate(contractEndDate)}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden lg:col-span-2">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Coach Notes</h3>
          </div>
          <div className="p-5">
            {isEditing ? (
              <textarea
                value={editData.notes || ''}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                rows={6}
                placeholder="Add private notes about this client..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">
                {notes || 'No notes added yet.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileTab
