/**
 * Money helpers. Amounts are stored as whole numbers of hundredths ("cents")
 * so totals never pick up floating-point rounding errors.
 */

export type Cents = number;

export const MAX_AMOUNT_CENTS = 100_000_000_00; // 100 million

export type AmountParseResult = { ok: true; cents: Cents } | { ok: false; error: string };

/**
 * Parse what a person types into an amount field. Accepts "12", "12.5",
 * "$1,234.56", "1 234,56" and similar. Rejects zero, negatives, and more
 * than two decimal places.
 */
export function parseAmount(input: string, { allowZero = false } = {}): AmountParseResult {
  const raw = (input ?? '').trim();
  if (raw === '') return { ok: false, error: 'Enter an amount.' };
  if (/^-|^\(.*\)$/.test(raw) || raw.includes('-')) {
    return { ok: false, error: 'Enter the amount without a minus sign. Choose Expense or Income instead.' };
  }

  // Strip currency symbols, letters (e.g. "USD") and spaces.
  let s = raw.replace(/[^\d.,]/g, '');
  if (s === '' || !/\d/.test(s)) return { ok: false, error: 'Use numbers only, like 24.99.' };

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Whichever separator comes last is the decimal mark.
    if (lastDot > lastComma) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma !== -1) {
    const commas = (s.match(/,/g) ?? []).length;
    const decimals = s.length - lastComma - 1;
    // "12,50" -> decimal comma; "1,234" or "1,234,567" -> thousands separators.
    if (commas === 1 && decimals > 0 && decimals <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const groups = s.split('.');
    if (groups.length > 2) {
      // Several dots only make sense as thousands separators: "1.234.567".
      const last = groups[groups.length - 1];
      const middleOk = groups.slice(1, -1).every((g) => g.length === 3);
      if (middleOk && last.length === 3) s = groups.join('');
      else if (middleOk && last.length >= 1 && last.length <= 2) s = `${groups.slice(0, -1).join('')}.${last}`;
      else return { ok: false, error: 'Use numbers only, like 24.99.' };
    }
  }

  if (!/^\d*\.?\d*$/.test(s) || s === '.') return { ok: false, error: 'Use numbers only, like 24.99.' };
  const [whole, frac = ''] = s.split('.');
  if (frac.length > 2) return { ok: false, error: 'Use at most 2 decimal places.' };

  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0');
  if (!Number.isFinite(cents)) return { ok: false, error: 'That amount is too large.' };
  if (cents === 0 && !allowZero) return { ok: false, error: 'Amount must be more than zero.' };
  if (cents > MAX_AMOUNT_CENTS) return { ok: false, error: 'That amount is too large.' };
  return { ok: true, cents };
}

/** Parse a signed balance such as "-120.50" (used for the starting balance). */
export function parseSignedAmount(input: string): AmountParseResult {
  const raw = (input ?? '').trim();
  const negative = /^-/.test(raw) || /^\(.*\)$/.test(raw);
  const result = parseAmount(raw.replace(/^-/, '').replace(/^\((.*)\)$/, '$1'), { allowZero: true });
  if (!result.ok) {
    if (raw === '') return { ok: false, error: 'Enter an amount (0 is fine).' };
    return result;
  }
  return { ok: true, cents: negative ? -result.cents : result.cents };
}

/** Format cents for an editable input: 1250 -> "12.50", 1200 -> "12". */
export function centsToInput(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return frac === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

/** Plain decimal string for CSV export: 1250 -> "12.50", -5 -> "-0.05". */
export function centsToDecimal(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const formatCache = new Map<string, Intl.NumberFormat>();

function numberFormat(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${compact}`;
  let f = formatCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
    formatCache.set(key, f);
  }
  return f;
}

export interface FormatOptions {
  /** Show "+" for positive amounts. */
  signed?: boolean;
  /** Short form for charts, e.g. "$1.2K". */
  compact?: boolean;
}

export function formatMoney(cents: Cents, currency: string, { signed = false, compact = false }: FormatOptions = {}): string {
  const value = Math.round(cents) / 100;
  const text = numberFormat(currency, compact).format(Math.abs(value));
  if (value < 0) return `−${text}`;
  if (signed && value > 0) return `+${text}`;
  return text;
}

export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'USD', name: 'US dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'BRL', name: 'Brazilian real' },
];
