export const config = {
  apiUrl: import.meta.env.PUBLIC_API_URL || 'http://localhost:3000',
  supportEmail: import.meta.env.PUBLIC_SUPPORT_EMAIL || '',
  supportGoogleFormUrl: import.meta.env.PUBLIC_SUPPORT_GOOGLE_FORM_URL || '',
  storefrontUrl: import.meta.env.PUBLIC_STOREFRONT_URL || '',
} as const;

export type Config = typeof config;