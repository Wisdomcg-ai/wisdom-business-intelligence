/** @type {import('next').NextConfig} */
const nextConfig = {
  // Suppress ESLint warnings during builds (they're shown during development)
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
