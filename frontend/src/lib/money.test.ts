import { describe, expect, it } from 'vitest';
import { parseEuroToCents } from './money';

describe('parseEuroToCents', () => {
  it.each([
    ['12.50', 1250],
    ['12,50', 1250],
    ['12.5', 1250],
    ['12,5', 1250],
    ['12', 1200],
    ['12.', 1200],
    ['0.01', 1],
    ['0.29', 29], // parseFloat('0.29') * 100 would give 28.999999999999996
    ['  7 ', 700],
    ['€4.99', 499],
    ['100000.00', 10_000_000],
    ['007.10', 710],
  ])('reads "%s" as %i cents', (input, cents) => {
    expect(parseEuroToCents(input)).toEqual({ ok: true, cents });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['12.345', 'decimals'],
    ['0,001', 'decimals'],
    ['-1', 'format'],
    ['abc', 'format'],
    ['1,234.50', 'format'],
    ['1.234,50', 'format'],
    ['.50', 'format'],
    ['12€', 'format'],
    ['1e3', 'format'],
  ])('rejects "%s" (%s)', (input, reason) => {
    expect(parseEuroToCents(input)).toEqual({ ok: false, reason });
  });

  it('adds up exactly once amounts are in cents', () => {
    const a = parseEuroToCents('0.10');
    const b = parseEuroToCents('0.20');
    expect(a.ok && b.ok && a.cents + b.cents).toBe(30); // 0.1 + 0.2 !== 0.3 in floats
  });
});
