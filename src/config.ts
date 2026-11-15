export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000').replace(/\/+$/, '');

// Same brand constants as frontend/src/config/branding.ts
const REMOTE = 'https://dyci.edu.ph';
export const BRAND = {
  institution: "Dr. Yanga's Colleges, Inc.",
  institutionShort: 'DYCI',
  logoWhite: [`${REMOTE}/assets/logo/dyci-logo-with-text-white.webp`],
  logoColor: [`${REMOTE}/dyci-logo.png`],
};
