/** 更新 Business 信息抽屉：币种 / 国家 / 时区选项（与 Meta 后台常见项对齐） */

export const UPDATE_BUSINESS_CURRENCIES: { code: string; label: string }[] = [
  { code: 'USD', label: 'USD - US Dollars' },
  { code: 'EUR', label: 'EUR - Euro' },
  { code: 'GBP', label: 'GBP - British Pound' },
  { code: 'CAD', label: 'CAD - Canadian Dollar' },
  { code: 'AUD', label: 'AUD - Australian Dollar' },
  { code: 'HKD', label: 'HKD - Hong Kong Dollar' },
  { code: 'SGD', label: 'SGD - Singapore Dollar' },
  { code: 'JPY', label: 'JPY - Japanese Yen' },
  { code: 'CNY', label: 'CNY - Chinese Yuan' },
];

export const UPDATE_BUSINESS_COUNTRIES: { code: string; label: string }[] = [
  { code: 'US', label: 'US - United States of America' },
  { code: 'CA', label: 'CA - Canada' },
  { code: 'GB', label: 'GB - United Kingdom' },
  { code: 'AU', label: 'AU - Australia' },
  { code: 'DE', label: 'DE - Germany' },
  { code: 'FR', label: 'FR - France' },
  { code: 'HK', label: 'HK - Hong Kong' },
  { code: 'SG', label: 'SG - Singapore' },
];

export const UPDATE_BUSINESS_TIMEZONES: { id: string; label: string }[] = [
  { id: 'America/Phoenix', label: '(GMT-07:00) Phoenix, America' },
  { id: 'America/Los_Angeles', label: '(GMT-08:00) Los Angeles, America' },
  { id: 'America/Denver', label: '(GMT-07:00) Denver, America' },
  { id: 'America/Chicago', label: '(GMT-06:00) Chicago, America' },
  { id: 'America/New_York', label: '(GMT-05:00) New York, America' },
  { id: 'Europe/London', label: '(GMT+00:00) London, Europe' },
  { id: 'Europe/Paris', label: '(GMT+01:00) Paris, Europe' },
  { id: 'Asia/Hong_Kong', label: '(GMT+08:00) Hong Kong, Asia' },
  { id: 'Asia/Singapore', label: '(GMT+08:00) Singapore, Asia' },
  { id: 'Asia/Tokyo', label: '(GMT+09:00) Tokyo, Asia' },
];

export const DEFAULT_UPDATE_BUSINESS_BM = {
  countryCode: 'US',
  companyName: 'Default Company LLC',
  city: 'Fresno',
  street1: '4277 Park Point St',
  street2: '',
  state: 'CA',
  zip: '91928',
  taxId: '',
  adsForBusinessPurpose: false,
} as const;
