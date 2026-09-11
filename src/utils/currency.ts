export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  label: string;
}

/**
 * Supported currencies list with IDR (Rupiah Indonesia) at the very top as requested.
 */
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'IDR', symbol: 'Rp', name: 'Rupiah Indonesia', label: 'IDR - Indonesian Rupiah (Rp)' },
  { code: 'USD', symbol: '$', name: 'US Dollar', label: 'USD - United States Dollar ($)' },
  { code: 'EUR', symbol: '€', name: 'Euro', label: 'EUR - Euro (€)' },
  { code: 'GBP', symbol: '£', name: 'British Pound', label: 'GBP - British Pound (£)' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', label: 'JPY - Japanese Yen (¥)' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', label: 'SGD - Singapore Dollar (S$)' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', label: 'MYR - Malaysian Ringgit (RM)' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', label: 'AUD - Australian Dollar (A$)' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', label: 'CAD - Canadian Dollar (C$)' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', label: 'CHF - Swiss Franc (CHF)' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', label: 'CNY - Chinese Yuan (¥)' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', label: 'HKD - Hong Kong Dollar (HK$)' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', label: 'KRW - South Korean Won (₩)' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', label: 'INR - Indian Rupee (₹)' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', label: 'THB - Thai Baht (฿)' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', label: 'VND - Vietnamese Dong (₫)' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', label: 'PHP - Philippine Peso (₱)' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan New Dollar', label: 'TWD - Taiwan New Dollar (NT$)' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', label: 'NZD - New Zealand Dollar (NZ$)' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', label: 'AED - UAE Dirham (AED)' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', label: 'SAR - Saudi Riyal (SAR)' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', label: 'TRY - Turkish Lira (₺)' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', label: 'BRL - Brazilian Real (R$)' },
  { code: 'MXN', symbol: 'Mex$', name: 'Mexican Peso', label: 'MXN - Mexican Peso (Mex$)' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', label: 'ZAR - South African Rand (R)' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', label: 'SEK - Swedish Krona (kr)' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', label: 'NOK - Norwegian Krone (kr)' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', label: 'DKK - Danish Krone (kr)' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', label: 'PLN - Polish Zloty (zł)' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', label: 'RUB - Russian Ruble (₽)' },
];

/**
 * Normalize any currency string (symbol, loose code, variant) into a standard ISO currency code.
 * Defaults to 'IDR' if unspecified.
 */
export function normalizeCurrencyCode(currency?: string | null): string {
  if (!currency) return 'IDR';
  const trimmed = currency.trim();
  const upper = trimmed.toUpperCase();

  // Rupiah variants
  if (upper === 'IDR' || upper === 'RP' || upper === 'RUPIAH' || upper.startsWith('RP') || upper === 'IDR.') {
    return 'IDR';
  }

  // Dollar variants
  if (trimmed === '$' || upper === 'USD' || upper === 'US$' || upper === 'DOLLAR') {
    return 'USD';
  }

  // Euro variants
  if (trimmed === '€' || upper === 'EUR') {
    return 'EUR';
  }

  // British Pound variants
  if (trimmed === '£' || upper === 'GBP') {
    return 'GBP';
  }

  // Japanese Yen variants
  if (trimmed === '¥' || upper === 'JPY') {
    return 'JPY';
  }

  // Other currencies check against CURRENCY_OPTIONS
  const matched = CURRENCY_OPTIONS.find((c) => c.code === upper || c.symbol === trimmed);
  if (matched) {
    return matched.code;
  }

  return upper || 'IDR';
}

/**
 * Format a price with its corresponding currency code or symbol.
 * Defaults to Indonesian Rupiah (IDR) as requested.
 */
export function formatCurrencyPrice(price: number | string | undefined | null, currency: string = 'IDR'): string {
  if (price === undefined || price === null || price === '') return '';
  const num = typeof price === 'number' ? price : Number(price);
  if (isNaN(num)) return String(price);

  const code = normalizeCurrencyCode(currency);

  // Rupiah format
  if (code === 'IDR') {
    return `Rp ${Math.round(num).toLocaleString('id-ID')}`;
  }

  // Known options
  const option = CURRENCY_OPTIONS.find((c) => c.code === code);
  if (option) {
    if (option.code === 'JPY' || option.code === 'KRW' || option.code === 'VND') {
      return `${option.symbol} ${Math.round(num).toLocaleString()}`;
    }
    return `${option.symbol}${num.toLocaleString('en-US')}`;
  }

  // Legacy symbols
  if (code === 'USD') {
    return `$${num.toLocaleString('en-US')}`;
  }
  if (code === 'EUR') {
    return `€${num.toLocaleString('en-US')}`;
  }
  if (code === 'GBP') {
    return `£${num.toLocaleString('en-US')}`;
  }

  // Fallback: Code + formatted number
  return `${code} ${num.toLocaleString()}`;
}
