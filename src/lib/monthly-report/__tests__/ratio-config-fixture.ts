/**
 * Urban Road's "COGS Tables" page, exactly as the settings panel must be able
 * to store it (businesses.id 28d41193…, business_profiles.id aabd3c49…).
 * Shared by the form, panel and save-path tests so all three pin one config.
 */
export const URBAN_ROAD_TITLE = 'COGS Tables'

export const URBAN_ROAD_CONFIG = {
  months_shown: 3,
  trailing_averages: [6, 3],
  show_amounts: true,
  ratios: [
    {
      label: 'Freight % Income',
      numerator: { accounts: ['55000'], label: 'Freight to Customer' },
      denominator: { total: 'income' },
    },
    {
      label: "Poster's COGS % of Poster's Income",
      numerator: { accounts: ['51150'], label: "Poster's COGS" },
      denominator: { accounts: ['41700'], label: "Poster's Income" },
      // No averages for the Posters ratio — ABSENT would mean the page's [6, 3].
      trailing_averages: [],
    },
  ],
}

/** The ledger accounts the list route returns for the codes above. */
export const URBAN_ROAD_ACCOUNTS = [
  { code: '41700', name: 'Posters (41700)', bucket: 'income' },
  { code: '51150', name: 'Posters', bucket: 'cost_of_sales' },
  { code: '55000', name: 'Freight to Customer', bucket: 'cost_of_sales' },
  { code: '61000', name: 'Rent', bucket: 'operating_expenses' },
  { code: '81000', name: 'Bank Interest Income', bucket: null },
] as const
