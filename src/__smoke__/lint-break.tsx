'use client'

// Phase 44 plan 5 — branch protection smoke test.
// DELIBERATE react-hooks/rules-of-hooks violation. PR is throwaway and
// will be CLOSED WITHOUT MERGING. Used to prove the `lint` required check
// blocks merging. See .planning/phases/44-test-gate-ci-hardening/44-05-PLAN.md.
import { useState } from 'react'

export default function LintBreak({ flag }: { flag: boolean }) {
  if (flag) return null
  const [count, setCount] = useState(0)
  return (
    <div>
      {count} {setCount.name}
    </div>
  )
}
