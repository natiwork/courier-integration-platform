import { countryName } from './format';

export interface CoverageCell {
  code: string;
  name: string;
  covered: boolean;
}

export interface Coverage {
  cells: CoverageCell[]; // every platform country, sorted by code (the tiles show codes)
  covered: number;
  total: number;
  // For screen readers: the count and the names of the covered countries.
  label: string;
}

// Which of the platform's destination countries a courier delivers to.
export function courierCoverage(supported: readonly string[], platform: readonly string[]): Coverage {
  const served = new Set(supported);
  const cells = platform
    .map((code) => ({ code, name: countryName(code), covered: served.has(code) }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const coveredNames = cells
    .filter((cell) => cell.covered)
    .map((cell) => cell.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
  const total = cells.length;
  const covered = coveredNames.length;

  let label: string;
  if (covered === 0) label = `Delivers to none of the ${total} countries`;
  else if (covered === total) label = `Delivers to all ${total} countries`;
  else label = `Delivers to ${covered} of ${total} countries: ${coveredNames.join(', ')}`;

  return { cells, covered, total, label };
}
