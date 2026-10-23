import { describe, expect, it } from 'vitest';

import { DSO_CATALOG, matchesFocalFilter } from '@/data/dsoCatalog';
import { parseAngle } from '@/lib/format';

describe('DSO catalog', () => {
  it('has unique ids and valid J2000 coordinates', () => {
    expect(DSO_CATALOG.length).toBeGreaterThanOrEqual(40);
    expect(new Set(DSO_CATALOG.map((d) => d.id)).size).toBe(DSO_CATALOG.length);
    for (const d of DSO_CATALOG) {
      expect(d.raHours).toBeGreaterThanOrEqual(0);
      expect(d.raHours).toBeLessThan(24);
      expect(Math.abs(d.decDeg)).toBeLessThanOrEqual(90);
      expect(d.recommendedFocalLengthMm[0]).toBeLessThanOrEqual(d.recommendedFocalLengthMm[1]);
    }
  });

  it('includes the southern showcase targets', () => {
    for (const id of [
      'NGC 3372',
      'IC 4604',
      'NGC 2070',
      'NGC 104',
      'IC 2944',
      'NGC 3576',
      'Vela SNR',
      'NGC 5139',
      'IC 2602',
      'Coalsack',
      'NGC 3324',
      'IC 4628',
      'NGC 6188',
    ]) {
      expect(DSO_CATALOG.some((d) => d.id === id)).toBe(true);
    }
  });

  it('matches focal length buckets by range overlap', () => {
    const core = DSO_CATALOG.find((d) => d.id === 'Galactic Core')!;
    const m31 = DSO_CATALOG.find((d) => d.id === 'M31')!;
    expect(matchesFocalFilter(core, 'WIDE')).toBe(true);
    expect(matchesFocalFilter(core, 'TELE')).toBe(false);
    expect(matchesFocalFilter(m31, 'TELE')).toBe(true);
    expect(matchesFocalFilter(m31, 'ALL')).toBe(true);
  });
});

describe('parseAngle', () => {
  it('parses decimal and sexagesimal input', () => {
    expect(parseAngle('10.75')).toBeCloseTo(10.75);
    expect(parseAngle('10:45:08')).toBeCloseTo(10.7522, 4);
    expect(parseAngle('10h45m08s')).toBeCloseTo(10.7522, 4);
    expect(parseAngle('-59 52 04')).toBeCloseTo(-59.8678, 4);
    expect(parseAngle('−0:30')).toBeCloseTo(-0.5);
    expect(parseAngle('abc')).toBeNull();
    expect(parseAngle('10:75')).toBeNull();
    expect(parseAngle('')).toBeNull();
  });
});
