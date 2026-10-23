import type { DSOObject } from '@/types/astro';

type Row = [
  id: string,
  commonName: string,
  type: DSOObject['type'],
  constellation: string,
  raHours: number,
  decDeg: number,
  sizeArcmin: number,
  magnitude: number,
  focalMin: number,
  focalMax: number,
  hemisphereBias: DSOObject['hemisphereBias'],
];

// J2000 coordinates. Focal lengths assume APS-C / full-frame on a portable tracker.
const ROWS: Row[] = [
  // ── Southern showcase ────────────────────────────────────────────────
  ['NGC 3372', 'Carina Nebula', 'Nebula', 'Carina', 10.7524, -59.8678, 120, 1.0, 50, 200, 'SOUTH'],
  ['IC 4604', 'Rho Ophiuchi Cloud Complex', 'Widefield', 'Ophiuchus', 16.4264, -23.4472, 300, 4.6, 24, 135, 'SOUTH'],
  ['LMC', 'Large Magellanic Cloud', 'Galaxy', 'Dorado', 5.3931, -69.7561, 650, 0.9, 24, 135, 'SOUTH'],
  ['NGC 2070', 'Tarantula Nebula', 'Nebula', 'Dorado', 5.645, -69.1008, 40, 8.0, 200, 600, 'SOUTH'],
  ['SMC', 'Small Magellanic Cloud', 'Galaxy', 'Tucana', 0.8792, -72.8286, 320, 2.7, 35, 200, 'SOUTH'],
  ['NGC 104', '47 Tucanae', 'Cluster', 'Tucana', 0.4016, -72.0814, 50, 4.1, 135, 600, 'SOUTH'],
  ['IC 2944', 'Running Chicken Nebula', 'Nebula', 'Centaurus', 11.6389, -63.3728, 75, 4.5, 135, 400, 'SOUTH'],
  ['NGC 3576', 'Statue of Liberty Nebula', 'Nebula', 'Carina', 11.1972, -61.3039, 40, 8.0, 200, 600, 'SOUTH'],
  ['Vela SNR', 'Vela Supernova Remnant', 'Nebula', 'Vela', 8.5833, -45.1833, 480, 12.0, 35, 135, 'SOUTH'],
  ['NGC 5139', 'Omega Centauri', 'Cluster', 'Centaurus', 13.4465, -47.4794, 36, 3.9, 200, 600, 'SOUTH'],
  ['IC 2602', 'Southern Pleiades', 'Cluster', 'Carina', 10.7161, -64.4, 100, 1.9, 85, 300, 'SOUTH'],
  ['Coalsack', 'Coal Sack & Crux', 'Dark Nebula', 'Crux', 12.8333, -62.5, 420, 99, 24, 85, 'SOUTH'],
  ['NGC 3324', 'Gabriela Mistral Nebula', 'Nebula', 'Carina', 10.6222, -58.6333, 16, 6.7, 200, 600, 'SOUTH'],
  ['IC 4628', 'Prawn Nebula', 'Nebula', 'Scorpius', 16.95, -40.3333, 90, 7.0, 135, 400, 'SOUTH'],
  ['NGC 6188', 'Fighting Dragons of Ara', 'Nebula', 'Ara', 16.6681, -48.7833, 20, 8.0, 200, 600, 'SOUTH'],
  ['NGC 4755', 'Jewel Box Cluster', 'Cluster', 'Crux', 12.8942, -60.3617, 10, 4.2, 300, 800, 'SOUTH'],
  ['NGC 2516', 'Southern Beehive', 'Cluster', 'Carina', 7.9678, -60.7533, 30, 3.8, 200, 600, 'SOUTH'],
  ['NGC 6334', "Cat's Paw Nebula", 'Nebula', 'Scorpius', 17.3472, -35.85, 40, 9.0, 200, 600, 'SOUTH'],
  ['NGC 6357', 'War and Peace Nebula', 'Nebula', 'Scorpius', 17.4119, -34.2, 50, 9.0, 200, 600, 'SOUTH'],
  ['NGC 6397', 'NGC 6397 Globular', 'Cluster', 'Ara', 17.6783, -53.6742, 32, 5.7, 300, 800, 'SOUTH'],
  ['NGC 6752', 'Great Peacock Globular', 'Cluster', 'Pavo', 19.1811, -59.9847, 29, 5.4, 300, 800, 'SOUTH'],
  ['NGC 253', 'Sculptor Galaxy', 'Galaxy', 'Sculptor', 0.7925, -25.2883, 28, 7.1, 300, 800, 'SOUTH'],
  ['NGC 5128', 'Centaurus A', 'Galaxy', 'Centaurus', 13.4243, -43.0192, 26, 6.8, 400, 1000, 'SOUTH'],
  ['NGC 300', 'Sculptor Pinwheel', 'Galaxy', 'Sculptor', 0.9149, -37.6844, 22, 8.1, 400, 1000, 'SOUTH'],
  ['NGC 55', 'String of Pearls Galaxy', 'Galaxy', 'Sculptor', 0.2483, -39.1969, 32, 7.9, 300, 800, 'SOUTH'],
  [
    'NGC 6726',
    'Corona Australis Dust Complex',
    'Dark Nebula',
    'Corona Australis',
    19.0275,
    -36.8833,
    40,
    7.2,
    135,
    400,
    'SOUTH',
  ],
  ['B78', 'Pipe Nebula', 'Dark Nebula', 'Ophiuchus', 17.35, -26.5, 420, 99, 24, 85, 'SOUTH'],
  [
    'Galactic Core',
    'Sagittarius Galactic Core',
    'Widefield',
    'Sagittarius',
    17.7611,
    -29.0078,
    1200,
    99,
    14,
    35,
    'SOUTH',
  ],
  ['M7', 'Ptolemy Cluster', 'Cluster', 'Scorpius', 17.8975, -34.7928, 80, 3.3, 135, 400, 'SOUTH'],
  ['M6', 'Butterfly Cluster', 'Cluster', 'Scorpius', 17.6722, -32.2542, 25, 4.2, 200, 600, 'SOUTH'],
  ['M83', 'Southern Pinwheel Galaxy', 'Galaxy', 'Hydra', 13.6169, -29.8658, 13, 7.5, 400, 1000, 'BOTH'],

  // ── Equatorial / all-sky showcase ────────────────────────────────────
  ['M42', 'Orion Nebula', 'Nebula', 'Orion', 5.5881, -5.3911, 85, 4.0, 135, 400, 'BOTH'],
  ['IC 434', 'Horsehead & Flame Nebulae', 'Dark Nebula', 'Orion', 5.6831, -2.4583, 60, 7.3, 200, 600, 'BOTH'],
  ['Sh2-276', "Barnard's Loop & Orion Belt", 'Widefield', 'Orion', 5.45, -4.0, 600, 5.0, 24, 50, 'BOTH'],
  ['IC 2118', 'Witch Head Nebula', 'Nebula', 'Eridanus', 5.0333, -7.9, 180, 13.0, 85, 200, 'BOTH'],
  ['M78', 'M78 Reflection Nebula', 'Nebula', 'Orion', 5.7796, 0.0139, 8, 8.3, 300, 800, 'BOTH'],
  ['M8 / M20', 'Lagoon & Trifid Nebulae', 'Nebula', 'Sagittarius', 18.05, -23.7, 120, 6.0, 135, 300, 'BOTH'],
  ['M16 / M17', 'Eagle & Omega Nebulae', 'Nebula', 'Serpens', 18.327, -15.0, 150, 6.0, 100, 300, 'BOTH'],
  ['M24', 'Sagittarius Star Cloud', 'Widefield', 'Sagittarius', 18.2817, -18.4833, 90, 4.6, 85, 200, 'BOTH'],
  ['M22', 'Great Sagittarius Cluster', 'Cluster', 'Sagittarius', 18.6067, -23.9033, 32, 5.1, 300, 800, 'BOTH'],
  ['NGC 2237', 'Rosette Nebula', 'Nebula', 'Monoceros', 6.5625, 4.9983, 80, 9.0, 200, 600, 'BOTH'],
  ['NGC 2264', 'Cone & Christmas Tree', 'Nebula', 'Monoceros', 6.685, 9.8833, 40, 3.9, 200, 600, 'BOTH'],
  ['IC 2177', 'Seagull Nebula', 'Nebula', 'Monoceros', 7.0736, -10.4542, 120, 9.0, 85, 300, 'BOTH'],
  ['NGC 2359', "Thor's Helmet", 'Nebula', 'Canis Major', 7.3083, -13.23, 16, 11.5, 400, 1000, 'BOTH'],
  ['NGC 7293', 'Helix Nebula', 'Nebula', 'Aquarius', 22.494, -20.8372, 25, 7.6, 400, 800, 'BOTH'],
  ['M45', 'Pleiades', 'Cluster', 'Taurus', 3.79, 24.1167, 110, 1.6, 135, 400, 'BOTH'],
  ['M44', 'Beehive Cluster', 'Cluster', 'Cancer', 8.6733, 19.6667, 95, 3.7, 135, 400, 'BOTH'],
  ['M104', 'Sombrero Galaxy', 'Galaxy', 'Virgo', 12.6665, -11.6231, 9, 8.0, 600, 1200, 'BOTH'],
  ['Leo Triplet', 'Leo Triplet (M65/M66/NGC 3628)', 'Galaxy', 'Leo', 11.3167, 13.2833, 60, 9.0, 400, 800, 'BOTH'],
  ["Markarian's Chain", "Markarian's Chain", 'Galaxy', 'Virgo', 12.45, 13.1667, 90, 9.0, 300, 600, 'BOTH'],
  ['NGC 2174', 'Monkey Head Nebula', 'Nebula', 'Orion', 6.1617, 20.5, 40, 6.8, 300, 800, 'BOTH'],
  ['M27', 'Dumbbell Nebula', 'Nebula', 'Vulpecula', 19.9934, 22.7211, 8, 7.5, 600, 1200, 'BOTH'],

  // ── Northern showcase ────────────────────────────────────────────────
  ['M31', 'Andromeda Galaxy', 'Galaxy', 'Andromeda', 0.7123, 41.2692, 190, 3.4, 135, 400, 'NORTH'],
  ['NGC 7000', 'North America & Pelican', 'Nebula', 'Cygnus', 20.9881, 44.5289, 120, 4.0, 85, 200, 'NORTH'],
  ['NGC 6992', 'Veil Nebula (Cygnus Loop)', 'Nebula', 'Cygnus', 20.85, 30.6667, 180, 7.0, 135, 300, 'NORTH'],
  ['IC 1805', 'Heart & Soul Nebulae', 'Nebula', 'Cassiopeia', 2.7, 61.0, 180, 6.5, 100, 300, 'NORTH'],
  ['M33', 'Triangulum Galaxy', 'Galaxy', 'Triangulum', 1.5641, 30.6603, 70, 5.7, 300, 600, 'NORTH'],
  ['M81 / M82', "Bode's & Cigar Galaxies", 'Galaxy', 'Ursa Major', 9.93, 69.37, 60, 6.9, 300, 800, 'NORTH'],
  ['NGC 1499', 'California Nebula', 'Nebula', 'Perseus', 4.055, 36.4217, 145, 6.0, 85, 200, 'NORTH'],
  ['M101', 'Pinwheel Galaxy', 'Galaxy', 'Ursa Major', 14.0535, 54.3492, 29, 7.9, 400, 1000, 'NORTH'],
  ['M51', 'Whirlpool Galaxy', 'Galaxy', 'Canes Venatici', 13.498, 47.1953, 11, 8.4, 600, 1200, 'NORTH'],
  ['M63', 'Sunflower Galaxy', 'Galaxy', 'Canes Venatici', 13.2637, 42.0292, 12, 8.6, 600, 1200, 'NORTH'],
  ['M13', 'Hercules Cluster', 'Cluster', 'Hercules', 16.6948, 36.4597, 20, 5.8, 400, 1000, 'NORTH'],
  ['NGC 869 / 884', 'Double Cluster', 'Cluster', 'Perseus', 2.3333, 57.1333, 60, 3.7, 135, 400, 'NORTH'],
  ['IC 1396', "Elephant's Trunk Nebula", 'Nebula', 'Cepheus', 21.6517, 57.5, 170, 3.5, 135, 300, 'NORTH'],
  ['IC 1318', 'Sadr Region (Gamma Cygni)', 'Widefield', 'Cygnus', 20.4333, 40.5, 240, 2.2, 50, 135, 'NORTH'],
  ['NGC 6888', 'Crescent Nebula', 'Nebula', 'Cygnus', 20.2019, 38.355, 18, 7.4, 400, 1000, 'NORTH'],
  ['NGC 7635', 'Bubble Nebula', 'Nebula', 'Cassiopeia', 23.3467, 61.2017, 15, 10.0, 600, 1200, 'NORTH'],
  ['NGC 7023', 'Iris Nebula', 'Nebula', 'Cepheus', 21.0267, 68.1667, 18, 6.8, 400, 1000, 'NORTH'],
  ['NGC 281', 'Pacman Nebula', 'Nebula', 'Cassiopeia', 0.8831, 56.6219, 35, 7.4, 400, 800, 'NORTH'],
];

export const DSO_CATALOG: DSOObject[] = ROWS.map(
  ([
    id,
    commonName,
    type,
    constellation,
    raHours,
    decDeg,
    sizeArcmin,
    magnitude,
    focalMin,
    focalMax,
    hemisphereBias,
  ]) => ({
    id,
    commonName,
    type,
    constellation,
    raHours,
    decDeg,
    sizeArcmin,
    magnitude,
    recommendedFocalLengthMm: [focalMin, focalMax],
    hemisphereBias,
  }),
);

export type FocalFilter = 'ALL' | 'WIDE' | 'STANDARD' | 'TELE';

export const FOCAL_FILTERS: { key: FocalFilter; label: string; range: [number, number] }[] = [
  { key: 'ALL', label: 'All', range: [0, Infinity] },
  { key: 'WIDE', label: 'Wide <35mm', range: [0, 34] },
  { key: 'STANDARD', label: 'Std 50–85mm', range: [50, 85] },
  { key: 'TELE', label: 'Tele 135–300mm', range: [135, 300] },
];

/** A target suits a lens bucket when its recommended focal range overlaps the bucket. */
export function matchesFocalFilter(dso: DSOObject, filter: FocalFilter): boolean {
  const bucket = FOCAL_FILTERS.find((f) => f.key === filter)!.range;
  const [min, max] = dso.recommendedFocalLengthMm;
  return min <= bucket[1] && max >= bucket[0];
}

export function formatFocalRange(dso: DSOObject): string {
  const [min, max] = dso.recommendedFocalLengthMm;
  return `${min}–${max}mm`;
}
