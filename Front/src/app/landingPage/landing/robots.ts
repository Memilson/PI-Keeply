import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com'
  const marketingBase = `${baseUrl}/landingPage`
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/personal/',
          '/api/',
        ],
      },
    ],
    sitemap: `${marketingBase}/landing/sitemap.xml`,
    host: baseUrl,
  }
}
