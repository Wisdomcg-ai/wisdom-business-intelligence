/**
 * Shared vendor name normalization utilities
 *
 * Extracted from subscription-transactions API for reuse in:
 * - Subscription transaction analysis
 * - Monthly report commentary (vendor grouping)
 * - Subscription detail tab
 */

// Common vendor name mappings for normalization
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
}

export function extractVendorName(contactName: string, description: string): string {
  const text = (contactName || description || '').toUpperCase().trim()

  // Remove common transaction prefixes
  let cleaned = text.replace(/^(DIRECT DEBIT|DD|PAYPAL \*|PAY\*|SQ \*|STRIPE|RECURRING|SUBSCRIPTION|PAYMENT TO|PAID TO|TRANSFER TO)\s*/i, '')

  // Try to match known vendors first
  for (const [pattern, vendorName] of Object.entries(VENDOR_MAPPINGS)) {
    if (cleaned.includes(pattern.toUpperCase())) {
      return vendorName
    }
  }

  // Also check description if contact didn't match
  if (contactName && description && contactName !== description) {
    const descCleaned = description.toUpperCase().trim()
    for (const [pattern, vendorName] of Object.entries(VENDOR_MAPPINGS)) {
      if (descCleaned.includes(pattern.toUpperCase())) {
        return vendorName
      }
    }
  }

  // Clean up and return the original contact/description
  if (contactName && contactName.trim()) {
    return contactName.trim().split(/\s+/).map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ')
  }

  // Fall back to description
  const words = cleaned.split(/[\s\-\_\*]+/).filter(w => w.length > 2)
  if (words.length > 0) {
    return words.slice(0, 3).map(w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(' ')
  }

  return description.slice(0, 50) || 'Unknown Vendor'
}

export function createVendorKey(vendorName: string): string {
  return vendorName.toLowerCase().replace(/[^a-z0-9]/g, '')
}
