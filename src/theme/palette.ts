export interface Palette {
  bg: string;
  surface: string;
  border: string;
  primary: string; // primary text & reticle lines
  secondary: string; // secondary labels
  muted: string; // faint graduations, disabled states
  accent: string; // highlights (Polaris marker, sweet-spot band)
  warn: string; // meridian flip / Moon warnings
}

/** Red-Shift Dark Sky UI: pure black + monochrome crimson to protect scotopic vision. */
export const NIGHT_VISION: Palette = {
  bg: '#000000',
  surface: '#0D0202',
  border: '#3D0A0A',
  primary: '#FF2424',
  secondary: '#A61717',
  muted: '#4D0707',
  accent: '#FF1E1E',
  warn: '#FF1E1E',
};

/** Standard dark palette for planning indoors. */
export const STANDARD: Palette = {
  bg: '#05070D',
  surface: '#0F1522',
  border: '#1F2A3D',
  primary: '#E6EDF7',
  secondary: '#8A9BB5',
  muted: '#34425A',
  accent: '#5EA8FF',
  warn: '#FFB020',
};

export function paletteFor(isNightVisionMode: boolean): Palette {
  return isNightVisionMode ? NIGHT_VISION : STANDARD;
}

const triplet = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** CSS variables consumed by the Tailwind color tokens in tailwind.config.js. */
export function paletteCssVars(p: Palette): Record<`--color-${string}`, string> {
  return {
    '--color-bg': triplet(p.bg),
    '--color-surface': triplet(p.surface),
    '--color-border': triplet(p.border),
    '--color-primary': triplet(p.primary),
    '--color-secondary': triplet(p.secondary),
    '--color-muted': triplet(p.muted),
    '--color-accent': triplet(p.accent),
    '--color-warn': triplet(p.warn),
  };
}
