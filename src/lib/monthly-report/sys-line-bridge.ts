/**
 * Joining Xero's accounts to the forecast engine's synthetic lines.
 *
 * The forecast wizard does not plan wages account by account. It plans a TEAM —
 * headcount, pay rates, a super percentage — and emits the result as three
 * lines with structural codes rather than Xero ones:
 *
 *   SYS-TEAM-WAGES     "Wages & Salaries"
 *   SYS-TEAM-SUPER     "Superannuation"
 *   SYS-SUBSCRIPTIONS  "Subscriptions (budgeted)"
 *
 * Xero, meanwhile, calls them whatever the bookkeeper called them: Urban Road's
 * are "Employ - Wages & Salaries" (62170), "Employ - Superannuation" (62160)
 * and "IT Costs Software" (63700). Neither the code nor the name can bridge
 * that — SYS-TEAM-WAGES is not 62170, and a fuzzy name match that accepted
 * "Wages & Salaries" for "Employ - Wages & Salaries" would also accept it for
 * "Manufacturing Wages", which is a different account with its own budget.
 *
 * So the Full Year page printed each of them TWICE: once from Xero with the
 * approved budget and no forecast, once from the forecast with no approved
 * budget. Urban Road's FY2027 showed "Employ - Wages & Salaries" at $564,222
 * approved against a $0 forecast, and "Wages & Salaries" at $916,586 forecast
 * against a $0 approved budget — a $352k gap that is an artefact of the join,
 * on a page a client reads as a plan.
 *
 * The bridge is not a guess: `monthly_report_settings` already records which
 * accounts are this client's wages accounts and which are its subscription
 * accounts, because the Wages and Subscription pages need exactly that. This
 * module reads that same configuration rather than inventing a second one.
 */

export interface SysBridgeConfig {
  /** `monthly_report_settings.wages_account_names` — the wages page's own list. */
  wagesAccountNames?: readonly string[] | null
  /** `monthly_report_settings.subscription_account_codes`. */
  subscriptionAccountCodes?: readonly string[] | null
}

export const SYS_TEAM_WAGES = 'SYS-TEAM-WAGES'
export const SYS_TEAM_SUPER = 'SYS-TEAM-SUPER'
export const SYS_SUBSCRIPTIONS = 'SYS-SUBSCRIPTIONS'

const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase()

/**
 * The SYS forecast code a Xero account belongs to, or null when it belongs to
 * none — which is the answer for almost every account, and the reason this
 * runs AFTER the code and pin tiers rather than instead of them.
 */
export function sysCodeForXeroAccount(
  account: { account_code?: string | null; account_name?: string | null },
  config: SysBridgeConfig,
): string | null {
  const name = norm(account.account_name)
  const code = norm(account.account_code)

  const wages = (config.wagesAccountNames ?? []).map(norm).filter(Boolean)
  if (name && wages.includes(name)) {
    // The wages list holds BOTH halves of the employment cost — the coach
    // configures it once for the Wages page, which prints wages and super as
    // two rows. Splitting on the word is how each half finds its own forecast
    // line instead of both claiming the wages one.
    return name.includes('super') ? SYS_TEAM_SUPER : SYS_TEAM_WAGES
  }

  const subs = (config.subscriptionAccountCodes ?? []).map(norm).filter(Boolean)
  if (code && subs.includes(code)) return SYS_SUBSCRIPTIONS

  return null
}
