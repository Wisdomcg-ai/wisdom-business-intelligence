/**
 * Shared vendor name normalization utilities
 *
 * Extracted from subscription-transactions API for reuse in:
 * - Subscription transaction analysis
 * - Monthly report commentary (vendor grouping)
 * - Subscription detail tab
 */

// ── Types ────────────────────────────────────────────────────────

export type VendorSource = 'contact' | 'description' | 'mapping'

export interface VendorInfo {
  vendor: string          // Clean vendor name (always present)
  context: string | null  // Additional context only when it adds value beyond the vendor name
  source: VendorSource    // Where the vendor name was derived from
}

// ── Known Vendor Mappings ────────────────────────────────────────

export const VENDOR_MAPPINGS: Record<string, string> = {
  'SLACK': 'Slack',
  'XERO': 'Xero',
  'GOOGLE': 'Google Workspace',
  'GSUITE': 'Google Workspace',
  'G SUITE': 'Google Workspace',
  'MSFT': 'Microsoft 365',
  'MICROSOFT': 'Microsoft 365',
  'CANVA': 'Canva',
  'HUBSPOT': 'HubSpot',
  'ASANA': 'Asana',
  'MONDAY': 'Monday.com',
  'NOTION': 'Notion',
  'FIGMA': 'Figma',
  'ADOBE': 'Adobe',
  'DROPBOX': 'Dropbox',
  'ZOOM': 'Zoom',
  'ATLASSIAN': 'Atlassian',
  'GITHUB': 'GitHub',
  'AWS': 'Amazon Web Services',
  'AMAZON WEB': 'Amazon Web Services',
  'AZURE': 'Microsoft Azure',
  'DIGITALOCEAN': 'DigitalOcean',
  'MAILCHIMP': 'Mailchimp',
  'INTERCOM': 'Intercom',
  'ZENDESK': 'Zendesk',
  'STRIPE': 'Stripe',
  'SHOPIFY': 'Shopify',
  'QUICKBOOKS': 'QuickBooks',
  'GUSTO': 'Gusto',
  'DEPUTY': 'Deputy',
  'EMPLOYMENT HERO': 'Employment Hero',
  'DOCUSIGN': 'DocuSign',
  'CALENDLY': 'Calendly',
  'LOOM': 'Loom',
  'MIRO': 'Miro',
  'AIRTABLE': 'Airtable',
  'GRAMMARLY': 'Grammarly',
  'LASTPASS': 'LastPass',
  '1PASSWORD': '1Password',
  'CLOUDFLARE': 'Cloudflare',
  'VERCEL': 'Vercel',
  'NETLIFY': 'Netlify',
  'TWILIO': 'Twilio',
  'SENDGRID': 'SendGrid',
  'MIXPANEL': 'Mixpanel',
  'HOTJAR': 'Hotjar',
  'LINKEDIN': 'LinkedIn',
  'SEEK': 'SEEK',
  'OPENAI': 'OpenAI',
  'CHATGPT': 'ChatGPT',
  'ANTHROPIC': 'Anthropic',
  'CLAUDE': 'Anthropic Claude',
  'ZAPIER': 'Zapier',
  'CALXA': 'Calxa',
  'LUCID': 'Lucid Software',
  'LUCIDCHART': 'Lucid Software',
  'SYNC': 'Sync.com',
  'TELSTRA': 'Telstra',
  'VIMEO': 'Vimeo',
  'PLAUD': 'Plaud.ai',
  'FIREFLIES': 'Fireflies.ai',
  'AUDIBLE': 'Audible',
  'PADDLE': 'Paddle',
  'PADDLENET': 'Paddle',
  'CMM': 'CMM',
  'SITESATSCALE': 'Sites at Scale',
  'APPLE': 'Apple',
  'APPLE.COM': 'Apple',
  // Common Australian retailers / service providers
  'BUNNINGS': 'Bunnings',
  'OFFICEWORKS': 'Officeworks',
  'KMART': 'Kmart',
  'TARGET': 'Target',
  'WOOLWORTHS': 'Woolworths',
  'COLES': 'Coles',
  'ALDI': 'Aldi',
  'JB HI-FI': 'JB Hi-Fi',
  'JB HI FI': 'JB Hi-Fi',
  'JBHIFI': 'JB Hi-Fi',
  'HARVEY NORMAN': 'Harvey Norman',
  'SUPERCHEAP': 'Supercheap Auto',
  'REPCO': 'Repco',
  'AUTOBARN': 'Autobarn',
  'TOTAL TOOLS': 'Total Tools',
  'SYDNEY TOOLS': 'Sydney Tools',
  'MITRE 10': 'Mitre 10',
  'IKEA': 'IKEA',
  'COSTCO': 'Costco',
  'UBER': 'Uber',
  'DIDI': 'DiDi',
  'MENULOG': 'Menulog',
  'DOORDASH': 'DoorDash',
  'BP ': 'BP',
  'AMPOL': 'Ampol',
  'CALTEX': 'Caltex',
  'SHELL': 'Shell',
  'OPTUS': 'Optus',
  'VODAFONE': 'Vodafone',
  'AMAYSIM': 'Amaysim',
  'AUSPOST': 'Australia Post',
  'AUSTRALIA POST': 'Australia Post',
  'SENDLE': 'Sendle',
  'STARTRACK': 'StarTrack',
  'CARSALES': 'Carsales',
}

// ── Payment Intermediaries ───────────────────────────────────────

const PAYMENT_INTERMEDIARIES = [
  'PAYPAL',
  'SQUARE',
  'SQ ',
  'AFTERPAY',
  'ZIPPAY',
  'ZIP PAY',
]

function isPaymentIntermediary(contactName: string): boolean {
  const upper = contactName.toUpperCase().trim()
  return PAYMENT_INTERMEDIARIES.some(prefix => upper.startsWith(prefix))
}

// ── Generic / Noise Detection ────────────────────────────────────

const GENERIC_DESCRIPTIONS = new Set([
  'PAYMENT', 'TRANSFER', 'DIRECT DEBIT', 'DD', 'DEPOSIT', 'WITHDRAWAL',
  'DEBIT', 'CREDIT', 'REFUND', 'INVOICE', 'BILL', 'PURCHASE',
  'TRANSACTION', 'BANK TRANSFER', 'BANK FEE', 'FEE', 'CHARGE',
  'SUBSCRIPTION', 'RECURRING', 'MONTHLY', 'ANNUAL',
])

function isGenericDescription(text: string): boolean {
  const upper = text.toUpperCase().trim()
  return GENERIC_DESCRIPTIONS.has(upper) || upper.length < 3
}

// ── Text Cleaning Helpers ────────────────────────────────────────

function stripReferenceNumbers(text: string): string {
  return text
    .replace(/\b\d{8,}\b/g, '')
    .replace(/\b[A-Z]{0,3}\d{6,}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanBankNarrative(text: string): string {
  return text
    .replace(/\s*\(\d{3,}\)\s*/g, '')
    .replace(/\b\d{3,6}\b/g, '')
    .replace(/\s+(PTY|LTD|P\/L|ABN|ACN)\b.*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function stripRegionSuffix(text: string): string {
  return text
    .replace(/\b(AUSTRALIA|AU|US|UK|NZ|EU)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function titleCase(text: string): string {
  return text.split(/\s+/).map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ')
}

function matchKnownVendor(text: string): string | null {
  const upper = text.toUpperCase().trim()
  const cleaned = upper.replace(
    /^(DIRECT DEBIT|DD|PAYPAL \*|PAYPAL|PAY\*|SQ \*|STRIPE|RECURRING|SUBSCRIPTION|PAYMENT TO|PAID TO|TRANSFER TO)\s*/,
    ''
  )
  for (const [pattern, vendorName] of Object.entries(VENDOR_MAPPINGS)) {
    if (cleaned.includes(pattern.toUpperCase())) {
      return vendorName
    }
  }
  for (const [pattern, vendorName] of Object.entries(VENDOR_MAPPINGS)) {
    if (upper.includes(pattern.toUpperCase())) {
      return vendorName
    }
  }
  return null
}

/**
 * Check if description adds meaningful context beyond the vendor name.
 * Returns the cleaned description if useful, null otherwise.
 */
function extractUsefulContext(
  description: string,
  vendorName: string,
  source: VendorSource
): string | null {
  if (!description || !description.trim()) return null

  const desc = description.trim()

  // If vendor was derived FROM the description, description is redundant
  if (source === 'description') return null

  // Skip generic descriptions
  if (isGenericDescription(desc)) return null

  // If the description is basically the same as the vendor name, skip
  const descUpper = desc.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim()
  const vendorUpper = vendorName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim()
  if (descUpper === vendorUpper) return null
  if (descUpper.startsWith(vendorUpper) && descUpper.length - vendorUpper.length < 10) return null

  // If the description looks like a bank narrative (all caps, store numbers, location codes)
  // and already contains the vendor name, it's just noise
  const isBankNarrative = desc === desc.toUpperCase() && /\d{3,}/.test(desc)
  if (isBankNarrative && descUpper.includes(vendorUpper)) return null

  // Description adds value — clean it up
  const cleaned = stripReferenceNumbers(desc)
    .replace(/\s*\(\d{3,}\)\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (!cleaned || isGenericDescription(cleaned)) return null

  return cleaned
}

// ── Main Extraction ──────────────────────────────────────────────

/**
 * Extract structured vendor info from Xero contact name and line item description.
 * Returns vendor name, optional context (only when it adds value), and source.
 */
export function extractVendorInfo(contactName: string, description: string): VendorInfo {
  // ── Payment intermediary path (PayPal, Square, etc.) ──
  if (contactName && isPaymentIntermediary(contactName)) {
    // Try known vendor in description
    if (description) {
      const descMatch = matchKnownVendor(description)
      if (descMatch) {
        return { vendor: descMatch, context: null, source: 'mapping' }
      }
    }

    // Use description as vendor if meaningful
    if (description && description.trim() && !isGenericDescription(description)) {
      const cleaned = cleanBankNarrative(stripReferenceNumbers(description.trim()))
      if (cleaned && !isGenericDescription(cleaned)) {
        return { vendor: titleCase(cleaned), context: null, source: 'description' }
      }
    }

    // Fall back to cleaned intermediary name
    const cleanedContact = stripRegionSuffix(stripReferenceNumbers(contactName))
    if (cleanedContact && !isGenericDescription(cleanedContact)) {
      return { vendor: titleCase(cleanedContact), context: null, source: 'contact' }
    }
    return { vendor: 'PayPal', context: null, source: 'contact' }
  }

  // ── Standard path ──

  // Try known vendor match on contact name
  if (contactName) {
    const contactMatch = matchKnownVendor(contactName)
    if (contactMatch) {
      const context = extractUsefulContext(description, contactMatch, 'mapping')
      return { vendor: contactMatch, context, source: 'mapping' }
    }
  }

  // Try known vendor match on description
  if (description) {
    const descMatch = matchKnownVendor(description)
    if (descMatch) {
      return { vendor: descMatch, context: null, source: 'mapping' }
    }
  }

  // Use contact name as vendor (with description as potential context)
  if (contactName && contactName.trim()) {
    const cleaned = stripReferenceNumbers(contactName.trim())
    if (cleaned) {
      const vendor = titleCase(cleaned)
      const context = extractUsefulContext(description, vendor, 'contact')
      return { vendor, context, source: 'contact' }
    }
  }

  // Fall back to description as vendor (bank feed — no contact)
  if (description && description.trim()) {
    const cleaned = cleanBankNarrative(stripReferenceNumbers(description.trim()))
    if (cleaned && !isGenericDescription(cleaned)) {
      return { vendor: titleCase(cleaned), context: null, source: 'description' }
    }
  }

  return { vendor: description?.slice(0, 50) || 'Unknown Vendor', context: null, source: 'description' }
}

/**
 * Backward-compatible wrapper — returns just the vendor name string.
 * Used by subscription-detail and subscription-transactions routes.
 */
export function extractVendorName(contactName: string, description: string): string {
  return extractVendorInfo(contactName, description).vendor
}

export function createVendorKey(vendorName: string): string {
  return vendorName.toLowerCase().replace(/[^a-z0-9]/g, '')
}
