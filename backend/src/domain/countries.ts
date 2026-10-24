// Destination countries we ship to (ISO 3166-1 alpha-2): the EU plus GB, CH, NO and IS.
// The single source for validation and demo data; display names come from Intl.DisplayNames on the client.
export const SUPPORTED_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH', 'NO', 'IS',
] as const;

export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number];
