/**
 * Render the quarterly one-page plan to PDFs on disk, headless — the SAME page
 * the workshop's Export PDF produces.
 *
 * The monthly pack shipped a page nobody had ever looked at (see
 * preview-pack.ts); this is the same guard for the plan. It takes no database:
 * the three cases below are the ones the layout has to survive — a first
 * session with almost nothing in it, a full quarter, and a quarter with enough
 * rocks to run past the page.
 *
 *   npx tsx scripts/preview-quarterly-plan-pdf.ts --out /tmp/plan
 */
import * as fs from 'fs'

async function main() {
  // jsPDF needs a DOM-ish global before the renderer module is imported.
  const { JSDOM } = (await import('jsdom' as string)) as any
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const g = globalThis as unknown as Record<string, unknown>
  g.window = dom.window as unknown
  g.document = dom.window.document
  g.navigator = dom.window.navigator
  g.HTMLCanvasElement = dom.window.HTMLCanvasElement
  g.Image = dom.window.Image

  const { buildPlanPage } = await import('../src/app/quarterly-review/utils/quarterly-plan-page')
  const { renderPlanPdf } = await import('../src/app/quarterly-review/services/quarterly-plan-pdf')

  const outArg = process.argv.indexOf('--out')
  const out = outArg > -1 ? process.argv[outArg + 1] : '/tmp/plan'
  // Pinned, so two runs of this script produce the same page.
  const now = new Date(2026, 8, 23)

  const baseReview = {
    quarter: 2 as const,
    year: 2027,
    quarterly_targets: { revenue: 100000, grossProfit: 40000, netProfit: 10000, kpis: [] },
    quarterly_rocks: [],
    personal_commitments: { hoursPerWeekTarget: null, daysOffPlanned: null, daysOffScheduled: [], personalGoal: '' },
    one_thing_answer: null,
    one_thing_for_success: null,
  }

  const annual = { revenue: 400000, grossProfit: 160000, netProfit: 40000, yearEnd: '2027-06-30' }

  const cases: Record<string, Parameters<typeof buildPlanPage>[0]> = {
    // 1 — a first session: numbers and KPIs, no rocks, no commitments.
    'first-session': {
      review: baseReview as never,
      businessName: 'Test ABC',
      yearType: 'FY',
      annual,
      kpis: [
        { name: 'Money Coming In Each Month', target: 0, unit: '$' },
        { name: 'Money You Keep After Direct Costs', target: 35, unit: '%' },
      ],
      now,
    },

    // 2 — an established client's quarter, everything filled.
    full: {
      review: {
        ...baseReview,
        quarterly_rocks: [
          {
            id: '1',
            title: 'Hire and onboard a second installer',
            owner: 'Sam',
            targetDate: '2026-11-30',
            successCriteria: 'Working unsupervised on residential jobs',
            status: 'not_started',
            progressPercentage: 0,
          },
          {
            id: '2',
            title: 'Move quoting onto the new template so every quote carries the 42% margin',
            owner: 'Priya',
            targetDate: '2026-10-31',
            successCriteria: 'All quotes out of the new system',
            status: 'not_started',
            progressPercentage: 0,
          },
          {
            id: '3',
            title: 'Collect the three overdue debtors',
            owner: 'Sam',
            successCriteria: '',
            status: 'not_started',
            progressPercentage: 0,
          },
        ],
        personal_commitments: {
          hoursPerWeekTarget: 45,
          daysOffPlanned: 7,
          daysOffScheduled: [],
          personalGoal: 'Coach my son’s cricket team every Saturday through the season.',
        },
        one_thing_answer: 'Getting the second installer productive, so I stop being the bottleneck on every job.',
      } as never,
      businessName: 'Precision Electrical Group',
      yearType: 'FY',
      annual,
      kpis: [
        { name: 'Money Coming In Each Month', target: 120000, unit: '$' },
        { name: 'Money You Keep After Direct Costs', target: 42, unit: '%' },
        { name: 'Number of Paying Customers', target: 180, unit: null },
      ],
      now,
    },

    // 3 — more than fits: the page must run on, not clip.
    overflow: {
      review: {
        ...baseReview,
        quarterly_rocks: Array.from({ length: 7 }, (_, i) => ({
          id: String(i),
          title: `Rock ${i + 1} — a deliberately long commitment title that will wrap onto a second line on the page`,
          owner: 'Someone With A Long Name',
          targetDate: '2026-12-15',
          successCriteria: 'A success measure long enough to wrap as well, so the block is as tall as it can get',
          status: 'not_started',
          progressPercentage: 0,
        })),
        personal_commitments: {
          hoursPerWeekTarget: 40,
          daysOffPlanned: 10,
          daysOffScheduled: [],
          personalGoal: 'Take a fortnight off in January without opening the laptop.',
        },
        one_thing_answer: 'Finishing the workshop backlog before Christmas.',
      } as never,
      businessName: 'A Business With Quite A Long Trading Name Pty Ltd',
      yearType: 'CY',
      annual,
      kpis: [
        { name: 'Money Coming In Each Month', target: 120000, unit: '$' },
        { name: 'Leads That Become Customers', target: 30, unit: '%' },
      ],
      now,
    },
  }

  for (const [name, input] of Object.entries(cases)) {
    const page = buildPlanPage(input)
    const doc = renderPlanPdf(page)
    const bytes = doc.output('arraybuffer') as ArrayBuffer
    const file = `${out}-${name}.pdf`
    fs.writeFileSync(file, Buffer.from(bytes))
    const pages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages()
    console.log(`${file}  (${pages} page${pages === 1 ? '' : 's'}, ${page.blocks.length} blocks)`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
