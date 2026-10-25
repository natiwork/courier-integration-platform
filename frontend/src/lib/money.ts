// Turning what a person types ("12.50", "12,5", "€4.99") into integer cents — without floating point.
// parseFloat("0.29") * 100 is 28.999999999999996; splitting the string into euros and cents is exact.

export type EuroParseResult =
  | { ok: true; cents: number }
  | { ok: false; reason: 'empty' | 'format' | 'decimals' };

export function parseEuroToCents(input: string): EuroParseResult {
  const value = input.replace(/\s/g, '').replace(/^€/, '');
  if (value === '') return { ok: false, reason: 'empty' };

  // Digits, optionally followed by "." or "," and more digits. No signs, no thousands separators.
  const match = /^(\d+)(?:[.,](\d*))?$/.exec(value);
  if (!match) return { ok: false, reason: 'format' };

  const [, euros = '0', fraction = ''] = match;
  if (fraction.length > 2) return { ok: false, reason: 'decimals' };

  const cents = Number(euros) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return { ok: false, reason: 'format' };
  return { ok: true, cents };
}
