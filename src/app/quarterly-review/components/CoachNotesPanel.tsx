'use client';

import { useState } from 'react';
import { StickyNote, ChevronDown, ChevronUp } from 'lucide-react';
import type { CoachNotes } from '../types';

interface CoachNotesPanelProps {
  /** The current workshop step id — notes are kept per step. */
  currentStep: string;
  notes: CoachNotes | null | undefined;
  /** Persists via the hook's updateCoachNotes (debounced autosave). */
  onUpdate: (notes: CoachNotes) => void;
}

/**
 * Shared session-notes panel shown on every workshop step. Editable by coach AND
 * client (a shared facilitation record) and saved automatically through the review's
 * existing autosave. Notes are keyed by step, so the complete + summary screens (which
 * already render coach_notes entries) show them grouped per step.
 */
export function CoachNotesPanel({ currentStep, notes, onUpdate }: CoachNotesPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const value = notes?.[currentStep] || '';

  return (
    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2 font-semibold text-amber-900">
          <StickyNote className="w-4 h-4" />
          Session Notes
          {value.trim() && collapsed && (
            <span className="ml-1 w-2 h-2 rounded-full bg-amber-500" aria-hidden />
          )}
        </span>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-amber-700" />
        ) : (
          <ChevronUp className="w-4 h-4 text-amber-700" />
        )}
      </button>
      {!collapsed && (
        <div className="px-4 pb-4">
          <textarea
            value={value}
            onChange={(e) => onUpdate({ ...(notes || {}), [currentStep]: e.target.value })}
            placeholder="Notes for this step — visible to both coach and client, saved automatically."
            rows={3}
            className="w-full rounded-lg border border-amber-200 bg-white p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
      )}
    </div>
  );
}
