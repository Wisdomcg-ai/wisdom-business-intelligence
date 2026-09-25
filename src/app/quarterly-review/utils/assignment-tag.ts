/**
 * Step 4.2's owner chip, as the step keeps it: an "[Assigned: <name>]" tag in
 * the decision's `notes`. The step loads every initiative's owner into that
 * tag (it never loads the row's own notes), and "Assign to…" rewrites it.
 *
 * So a decision's notes are not the coach's notes. The completion sync wrote
 * them to strategic_initiatives.notes as they were, which put the tag over the
 * row's notes — Just Digital Signage (4 rows, 20 Mar 2026) and Envisage
 * (3 rows) — and rocksFromDecisions carried it into a rock's notes and
 * description. The format lives here so the step that writes the tag and every
 * writer that must never save it agree on what it looks like.
 */

const TAG = /\s*\[Assigned: .+?\]/g
const TAGGED = /\[Assigned: (.+?)\]/

/** The tag the step shows as an owner chip. */
export function assignmentTag(name: string): string {
  return `[Assigned: ${name}]`
}

/** The owner a decision's notes name, or null. */
export function assignedIn(notes: string | null | undefined): string | null {
  const match = TAGGED.exec(String(notes ?? ''))
  return match ? match[1] : null
}

/** The notes with every owner tag taken out — what is left is what a coach wrote. */
export function withoutAssignment(notes: string | null | undefined): string {
  return String(notes ?? '').replace(TAG, '').trim()
}

/** The notes naming `name` as the owner, in place of any owner they named before. */
export function withAssignment(notes: string | null | undefined, name: string): string {
  const rest = withoutAssignment(notes)
  return rest ? `${rest} ${assignmentTag(name)}` : assignmentTag(name)
}
