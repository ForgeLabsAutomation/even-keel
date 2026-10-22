import { describe, expect, it } from 'vitest';
import { centsToDecimal, centsToInput, formatMoney, parseAmount, parseSignedAmount } from './money';

const ok = (input: string) => {
  const r = parseAmount(input);
  if (!r.ok) throw new Error(`Expected ${input} to parse: ${r.error}`);
  return r.cents;
};

describe('parseAmount', () => {
  it('reads everyday ways of typing money', () => {
    expect(ok('12')).toBe(1200);
    expect(ok('12.5')).toBe(1250);
    expect(ok('12.50')).toBe(1250);
    expect(ok('.99')).toBe(99);
    expect(ok('$1,234.56')).toBe(123456);
    expect(ok(' 1 234.56 ')).toBe(123456);
    expect(ok('1,234')).toBe(123400);
    expect(ok('12,50')).toBe(1250);
    expect(ok('1.234,56')).toBe(123456);
    expect(ok('1.234.567')).toBe(123456700);
    expect(ok('USD 40')).toBe(4000);
  });

  it('explains what is wrong', () => {
    expect(parseAmount('')).toEqual({ ok: false, error: 'Enter an amount.' });
    expect(parseAmount('0')).toMatchObject({ ok: false, error: 'Amount must be more than zero.' });
    expect(parseAmount('-5')).toMatchObject({ ok: false });
    expect(parseAmount('abc')).toMatchObject({ ok: false, error: 'Use numbers only, like 24.99.' });
    expect(parseAmount('1.999')).toMatchObject({ ok: false });
    expect(parseAmount('12.345')).toMatchObject({ ok: false, error: 'Use at most 2 decimal places.' });
    expect(parseAmount('1.2.3')).toMatchObject({ ok: false });
    expect(parseAmount('999999999999')).toMatchObject({ ok: false, error: 'That amount is too large.' });
  });

  it('allows zero when asked', () => {
    expect(parseAmount('0', { allowZero: true })).toEqual({ ok: true, cents: 0 });
  });
});

describe('parseSignedAmount', () => {
  it('accepts negative balances', () => {
    expect(parseSignedAmount('-120.50')).toEqual({ ok: true, cents: -12050 });
    expect(parseSignedAmount('(40)')).toEqual({ ok: true, cents: -4000 });
    expect(parseSignedAmount('0')).toEqual({ ok: true, cents: 0 });
    expect(parseSignedAmount('')).toMatchObject({ ok: false });
  });
});

describe('formatting', () => {
  it('turns cents back into editable text', () => {
    expect(centsToInput(1250)).toBe('12.50');
    expect(centsToInput(1200)).toBe('12');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(-12050)).toBe('-120.50');
    expect(centsToDecimal(1200)).toBe('12.00');
    expect(centsToDecimal(-5)).toBe('-0.05');
  });

  it('formats currency with a true minus sign and optional plus', () => {
    const usd = formatMoney(123456, 'USD');
    expect(usd).toContain('1,234.56');
    expect(formatMoney(-500, 'USD').startsWith('−')).toBe(true);
    expect(formatMoney(500, 'USD', { signed: true }).startsWith('+')).toBe(true);
    expect(formatMoney(0, 'USD', { signed: true }).startsWith('+')).toBe(false);
  });

  it('falls back gracefully for an unknown currency code', () => {
    expect(() => formatMoney(100, 'XXXX')).not.toThrow();
  });
});
