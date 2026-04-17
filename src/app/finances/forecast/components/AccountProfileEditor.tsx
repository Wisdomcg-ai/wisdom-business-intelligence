'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { XeroAccount } from '../hooks/useXeroAccounts'

interface AccountProfile {
  id?: string
  forecast_id: string
  xero_account_id: string
  account_code: string | null
  account_name: string | null
  cashflow_type: 1 | 2 | 3 | 4 | 5 | null
  days: number | null
  distribution: number[] | null
  schedule_base_periods: number[] | null
}

const TYPE_LABELS: Record<number, string> = {
  1: 'Immediate (100% same month)',
  2: 'Days Count Profile (computed)',
  3: 'Creditor Days (override)',
  4: 'Debtor Days (override)',
  5: 'Named Schedule',
}

const TYPE_HELP: Record<number, string> = {
  1: 'Paid in the month accrued — no delay',
  2: 'Calxa-style distribution computed from historical data (Phase 28.3+)',
  3: 'Enter DPO days — payment delayed by this many days',
  4: 'Enter DSO days — collection delayed by this many days',
  5: 'Pick a schedule (quarterly_bas_au, monthly, etc.) — payment on schedule',
}

const SCHEDULE_OPTIONS = [
  'monthly',
  'quarterly_bas_au',
  'quarterly_super_au',
  'quarterly_payg_instalment',
  'quarterly_feb_may_aug_nov',
  'annual_aug',
]

interface AccountProfileEditorProps {
  forecastId: string
  accounts: XeroAccount[]
}

export default function AccountProfileEditor({ forecastId, accounts }: AccountProfileEditorProps) {
  const [profiles, setProfiles] = useState<AccountProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  // Sort accounts for the picker: all except archived, by code then name
  const pickableAccounts = useMemo(
    () => accounts
      .filter(a => a.xero_status !== 'ARCHIVED')
      .filter(a => {
        if (!filter) return true
        const q = filter.toLowerCase()
        return (
          (a.account_code ?? '').toLowerCase().includes(q) ||
          a.account_name.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (a.account_code ?? '').localeCompare(b.account_code ?? '')),
    [accounts, filter]
  )

  // Index existing profiles by account_id for quick lookup
  const profileByAccount = useMemo(() => {
    const map = new Map<string, AccountProfile>()
    for (const p of profiles) map.set(p.xero_account_id, p)
    return map
  }, [profiles])

  const load = useCallback(async () => {
    if (!forecastId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/forecast/cashflow/profiles?forecast_id=${forecastId}`)
      if (!res.ok) {
        console.error('[AccountProfileEditor] Load failed', res.status)
        return
      }
      const { data } = await res.json()
      setProfiles(data ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [forecastId])

  useEffect(() => { load() }, [load])

  const saveProfile = useCallback(async (
    account: XeroAccount,
    type: 1 | 2 | 3 | 4 | 5,
    days: number | null,
    schedule: string | null
  ) => {
    setSavingId(account.xero_account_id)
    try {
      const body: any = {
        forecast_id: forecastId,
        xero_account_id: account.xero_account_id,
        account_code: account.account_code,
        account_name: account.account_name,
        cashflow_type: type,
      }
      if (type === 3 || type === 4) body.days = days
      if (type === 5 && schedule) body.schedule_base_periods = scheduleToBasePeriods(schedule)

      const res = await fetch('/api/forecast/cashflow/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to save profile')
        return
      }
      const { data } = await res.json()
      setProfiles(prev => {
        const next = prev.filter(p => p.xero_account_id !== account.xero_account_id)
        next.push(data)
        return next
      })
      toast.success(`Saved profile for ${account.account_code} ${account.account_name}`)
    } finally {
      setSavingId(null)
    }
  }, [forecastId])

  const deleteProfile = useCallback(async (accountId: string) => {
    setSavingId(accountId)
    try {
      const res = await fetch('/api/forecast/cashflow/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecast_id: forecastId,
          xero_account_id: accountId,
          delete: true,
        }),
      })
      if (!res.ok) {
        toast.error('Failed to delete profile')
        return
      }
      setProfiles(prev => prev.filter(p => p.xero_account_id !== accountId))
      toast.success('Profile cleared — reverts to default timing')
    } finally {
      setSavingId(null)
    }
  }, [forecastId])

  if (isLoading) {
    return (
      <div className="py-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading profiles…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Override payment timing for specific accounts. Default behaviour applies to
        accounts without a profile. Most clients don&apos;t need to configure any of
        these — use only when a specific account has unusual payment timing.
      </p>

      <input
        type="text"
        placeholder="Filter by code or name…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full text-sm rounded-lg border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
      />

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {pickableAccounts.length === 0 && (
          <p className="text-xs text-gray-400 italic">No accounts match the filter.</p>
        )}
        {pickableAccounts.map(account => {
          const existing = profileByAccount.get(account.xero_account_id)
          return (
            <ProfileRow
              key={account.xero_account_id}
              account={account}
              existing={existing}
              isSaving={savingId === account.xero_account_id}
              onSave={saveProfile}
              onDelete={deleteProfile}
            />
          )
        })}
      </div>
    </div>
  )
}

function ProfileRow({
  account,
  existing,
  isSaving,
  onSave,
  onDelete,
}: {
  account: XeroAccount
  existing: AccountProfile | undefined
  isSaving: boolean
  onSave: (account: XeroAccount, type: 1 | 2 | 3 | 4 | 5, days: number | null, schedule: string | null) => Promise<void>
  onDelete: (accountId: string) => Promise<void>
}) {
  const [type, setType] = useState<1 | 2 | 3 | 4 | 5 | ''>(existing?.cashflow_type ?? '')
  const [days, setDays] = useState<number>(existing?.days ?? 30)
  const [schedule, setSchedule] = useState<string>('quarterly_bas_au')

  const label = account.account_code
    ? `${account.account_code} ${account.account_name}`
    : account.account_name

  return (
    <div className={`border rounded-lg p-2 ${existing ? 'border-brand-orange/40 bg-brand-orange/5' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-sm font-medium truncate" title={label}>{label}</div>
        <div className="text-xs text-gray-400 shrink-0">{account.xero_type ?? ''}</div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={type}
          onChange={e => setType(e.target.value ? Number(e.target.value) as 1 | 2 | 3 | 4 | 5 : '')}
          className="text-xs rounded border border-gray-300 px-1.5 py-1 flex-1"
        >
          <option value="">Default (no override)</option>
          {[1, 2, 3, 4, 5].map(t => (
            <option key={t} value={t}>Type {t} — {TYPE_LABELS[t]}</option>
          ))}
        </select>

        {(type === 3 || type === 4) && (
          <input
            type="number"
            value={days}
            onChange={e => setDays(parseFloat(e.target.value) || 0)}
            min={0} max={180}
            className="text-xs rounded border border-gray-300 px-1.5 py-1 w-20"
            title="Days"
          />
        )}

        {type === 5 && (
          <select
            value={schedule}
            onChange={e => setSchedule(e.target.value)}
            className="text-xs rounded border border-gray-300 px-1.5 py-1"
          >
            {SCHEDULE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {type !== '' && (
          <button
            onClick={() => onSave(account, type as 1 | 2 | 3 | 4 | 5, days, schedule)}
            disabled={isSaving}
            className="text-xs px-2 py-1 rounded bg-brand-orange text-white hover:bg-brand-orange-600 disabled:opacity-50 flex items-center gap-1"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        )}

        {existing && (
          <button
            onClick={() => onDelete(account.xero_account_id)}
            disabled={isSaving}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
            title="Remove profile"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {type !== '' && TYPE_HELP[type] && (
        <p className="text-xs text-gray-500 mt-1">{TYPE_HELP[type]}</p>
      )}
    </div>
  )
}

/**
 * Convert a schedule name to its BasePeriods[12] array for storage.
 * Mirrors SYSTEM_SCHEDULES in src/lib/cashflow/schedules.ts.
 */
function scheduleToBasePeriods(name: string): number[] {
  const schedules: Record<string, number[]> = {
    monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    quarterly_bas_au: [4, 4, 4, 7, 7, 7, 10, 10, 10, 2, 2, 2],
    quarterly_super_au: [4, 4, 4, 7, 7, 7, 10, 10, 10, 1, 1, 1],
    quarterly_payg_instalment: [4, 4, 4, 7, 7, 7, 10, 10, 10, 2, 2, 2],
    quarterly_feb_may_aug_nov: [5, 5, 5, 8, 8, 8, 11, 11, 11, 2, 2, 2],
    annual_aug: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
  }
  return schedules[name] ?? []
}
