'use client';

import { useState, type ReactNode } from 'react';

interface StepTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Quarterly Review v2 — shared sub-section tabs for merged steps.
 *
 * Renders ONE step's sub-sections as tabs (a view switch), so the step has a
 * single forward control (the shell "Continue") and no competing per-section
 * "Next" buttons. All tabs stay MOUNTED (inactive ones hidden) so each child's
 * state + auto-save survive switching — nothing is lost when the owner flips tabs.
 */
export function StepTabs({ tabs }: { tabs: StepTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === t.id
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={active === t.id ? '' : 'hidden'}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
