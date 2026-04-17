'use client'

import { useMemo, useState } from 'react'
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { ClassificationRow } from '../hooks/useCashflowStatement'

interface Props {
  classifications: ClassificationRow[]
  isLoading: boolean
  isAutoClassifying: boolean
  onUpsert: (row: ClassificationRow) => Promise<void>
  onAutoClassify: () => Promise<number>
}

const LIST_TYPES: Array<'Operating' | 'Investing' | 'Financing' | 'NonCash' | 'Unassigned'> =
  ['Operating', 'Investing', 'Financing', 'NonCash', 'Unassigned']

const LIST_COLORS: Record<string, string> = {
  Operating: 'bg-blue-100 text-blue-700',
  Investing: 'bg-purple-100 text-purple-700',
  Financing: 'bg-green-100 text-green-700',
  NonCash: 'bg-gray-200 text-gray-700',
  Unassigned: 'bg-amber-100 text-amber-800',
}

export default function StatementClassificationEditor({
  classifications,
  isLoading,
  isAutoClassifying,
  onUpsert,
  onAutoClassify,
}: Props) {
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    if (!filter) return classifications
    const q = filter.toLowerCase()
    return classifications.filter(c =>
      (c.account_code ?? '').toLowerCase().includes(q) ||
      (c.account_name ?? '').toLowerCase().includes(q) ||
      c.list_type.toLowerCase().includes(q)
    )
  }, [classifications, filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { Operating: 0, Investing: 0, Financing: 0, NonCash: 0, Unassigned: 0 }
    for (const row of classifications) c[row.list_type] = (c[row.list_type] ?? 0) + 1
    return c
  }, [classifications])

  const handleAutoClassify = async () => {
    const inserted = await onAutoClassify()
    if (inserted === 0) {
      toast.info('All accounts already classified. Use the dropdowns to override.')
    } else {
      toast.success(`Auto-classified ${inserted} account${inserted === 1 ? '' : 's'} — adjust as needed.`)
    }
  }

  if (isLoading) {
    return (
      <div className="py-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading classifications…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary + auto-classify */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {LIST_TYPES.map(t => (
            <span key={t} className={`px-2 py-0.5 rounded text-xs font-medium ${LIST_COLORS[t]}`}>
              {t}: {counts[t]}
            </span>
          ))}
        </div>
        <button
          onClick={handleAutoClassify}
          disabled={isAutoClassifying}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-brand-orange hover:text-brand-orange-600 disabled:opacity-50"
        >
          {isAutoClassifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Auto-classify from Xero types
        </button>
      </div>

      {counts.Unassigned > 0 && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {counts.Unassigned} account{counts.Unassigned === 1 ? '' : 's'} still Unassigned.
            These won&apos;t appear in the statement until classified.
          </span>
        </div>
      )}

      {classifications.length === 0 ? (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
          No classifications yet. Click &quot;Auto-classify from Xero types&quot; above to seed based on
          Xero&apos;s account types.
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Filter by code, name, or category…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full text-sm rounded-lg border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
          />

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filtered.map(row => (
              <Row key={row.xero_account_id} row={row} onUpsert={onUpsert} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Row({
  row,
  onUpsert,
}: {
  row: ClassificationRow
  onUpsert: (row: ClassificationRow) => Promise<void>
}) {
  const label = row.account_code ? `${row.account_code} ${row.account_name ?? ''}` : (row.account_name ?? '')

  const handleChange = (newListType: string) => {
    onUpsert({
      ...row,
      list_type: newListType as any,
    })
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded">
      <div className="flex-1 text-sm truncate" title={label}>
        {label}
        {row.account_type && (
          <span className="ml-1.5 text-xs text-gray-400">({row.account_type})</span>
        )}
      </div>
      <select
        value={row.list_type}
        onChange={e => handleChange(e.target.value)}
        className={`text-xs rounded border border-gray-300 px-1.5 py-0.5 ${LIST_COLORS[row.list_type]}`}
      >
        {LIST_TYPES.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  )
}
