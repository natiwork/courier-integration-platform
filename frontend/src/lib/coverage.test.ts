import { describe, expect, it } from 'vitest';
import { courierCoverage } from './coverage';

const PLATFORM = ['SE', 'DE', 'AT', 'DK', 'CH'];

describe('courierCoverage', () => {
  it('lists every platform country by code and marks the ones the courier serves', () => {
    expect(courierCoverage(['DK', 'SE', 'CH'], PLATFORM)).toEqual({
      cells: [
        { code: 'AT', name: 'Austria', covered: false },
        { code: 'CH', name: 'Switzerland', covered: true },
        { code: 'DE', name: 'Germany', covered: false },
        { code: 'DK', name: 'Denmark', covered: true },
        { code: 'SE', name: 'Sweden', covered: true },
      ],
      covered: 3,
      total: 5,
      // Names read better sorted by name, not by code.
      label: 'Delivers to 3 of 5 countries: Denmark, Sweden, Switzerland',
    });
  });

  it('says "all" instead of listing every country', () => {
    expect(courierCoverage(PLATFORM, PLATFORM).label).toBe('Delivers to all 5 countries');
  });

  it('ignores countries the platform does not ship to', () => {
    const coverage = courierCoverage(['DK', 'US'], PLATFORM);
    expect(coverage.covered).toBe(1);
    expect(coverage.cells.map((cell) => cell.code)).not.toContain('US');
  });

  it('handles a courier that serves none of them', () => {
    expect(courierCoverage([], PLATFORM).label).toBe('Delivers to none of the 5 countries');
  });
});
