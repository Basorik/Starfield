/** @type {import('tailwindcss').Config} */
// Colors resolve to CSS variables that ThemeRoot swaps between the
// Night-Vision (crimson) and Standard palettes at runtime.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        border: token('border'),
        primary: token('primary'),
        secondary: token('secondary'),
        muted: token('muted'),
        accent: token('accent'),
        warn: token('warn'),
      },
      fontFamily: {
        mono: ['SpaceMono'],
      },
    },
  },
  plugins: [],
};
