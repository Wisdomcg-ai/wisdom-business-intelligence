const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Suppress ESLint warnings during builds (they're shown during development)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24, // 24 hours
  },

  // Compression
  compress: true,

  // PoweredBy header removal (security)
  poweredByHeader: false,

  // Strict mode for React
  reactStrictMode: true,

  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js'],
  },

  // Security and caching headers
  async headers() {
    // Security headers that apply to all routes
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ]

    // Add HSTS in production
    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload',
      })
    }

    return [
      // Security headers for API routes
      {
        source: '/api/:path*',
        headers: securityHeaders,
      },
      // Caching headers for images
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          ...securityHeaders,
        ],
      },
      // Caching headers for static assets
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

// Only use Sentry config if org/project are set, otherwise use plain nextConfig
const sentryOptions = {
  // Upload source maps to Sentry but don't expose them publicly
  hideSourceMaps: true,

  // Suppress build logs from Sentry plugin
  silent: true,

  // Org and project from env vars
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
}

// Skip Sentry webpack plugin if org/project not configured (still captures errors via DSN)
module.exports = process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig
