export const APP_NAME = 'Lumen CRM';
export const ACCENT_COLOR = '#D4AF37';

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type UserId = Brand<string, 'UserId'>;
export type LeadId = Brand<string, 'LeadId'>;
