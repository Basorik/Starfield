# PolarGrid

An offline field companion for portable star trackers (Sky-Watcher Star Adventurer 2i/GTi, iOptron SkyGuider Pro, Move Shoot Move). It is built with Expo SDK 58, React Native, TypeScript, Expo Router, NativeWind and `react-native-svg`.

The app has two modules, and both run fully offline using `astronomy-engine`:

1. **Polar Scope.** Three views:
   - **Reticle** shows where Polaris sits on the Sky-Watcher 12-hour or iOptron 0–11 clock dial. In the Southern Hemisphere it instead draws the live orientation of the Octans trapezoid (σ, χ, τ, υ Octantis). You can switch between the inverted polar-scope view and the naked-eye view, and scrub the time by up to ±6 hours.
   - **Finder** is a naked-eye star chart around the pole, with your horizon drawn in and star-hop guides: Crux and the Pointers in the south, the Big Dipper pointers in the north.
   - **Rough align** uses the phone's compass (true north where the OS can correct for magnetic declination) and its tilt sensor to set the tracker's azimuth and altitude before the pole star is visible.

   The screen dims while this tab is open and goes back to your normal brightness when you leave it.
2. **Target Window & Meridian Flip Planner.** This tab ranks about 70 deep-sky targets by Moon-weighted usable time above your horizon floor. Each target gets a twilight-banded altitude chart that marks the meridian transit and the "sweet spot" window. The night summary shows Moon rise and set times and the Moon-free part of the dark window. In **Auto** darkness mode the planner falls back to nautical (then civil) twilight on summer nights when the Sun never reaches −18°. A Pro **dark-sky calendar** lists Moon-free hours for each of the next 30 nights.

## Getting started

```bash
npm install
npm test            # Vitest: astronomy engine, catalog, parsers
npm run typecheck   # tsc --noEmit
npx expo start      # dev server (Expo Go works except for in-app purchases)
```

`react-native-purchases` is a native module, so to test purchases you need a development build (`npx expo run:ios` / `npx expo run:android`, or `eas build --profile development`).

### RevenueCat

Copy `.env.example` to `.env` and add your public SDK keys:

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxx
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxx
```

To set up the store side:

- Create an entitlement named `pro`.
- Make a one-time (non-consumable) product priced at $19.99 and attach it to the current offering as the **Lifetime** package.

Without keys, billing is disabled and the paywall says the store is unavailable. In development builds, Settings has a "Developer: force Pro" switch.

Once a device has unlocked Pro, the entitlement is cached in AsyncStorage (`@polargrid_pro_cached`), so the app never re-locks offline at a dark site.

## Layout

```
src/
├── app/                      Expo Router routes
│   ├── _layout.tsx           Root stack, palette → NativeWind CSS variables, store provider
│   ├── paywall.tsx           PolarGrid Pro modal
│   └── (tabs)/               index (Polar Scope) · planner · settings
├── components/               ReticleSVG, AltitudeChartSVG, TargetCard, OffsetSlider, ui primitives
├── data/dsoCatalog.ts        Curated J2000 catalog with focal-length buckets
├── engine/
│   ├── coords.ts             LAST, J2000 → equator-of-date (precession + nutation)
│   ├── polarAlignment.ts     Polaris clock position, Octans reticle projection
│   ├── targetPlanner.ts      Twilight, 10-min altitude/Moon sampling, windows, transit, flip
│   └── __tests__/            Vitest suites + independent Meeus reference formulas
├── lib/                      billing (RevenueCat), formatting/parsing
├── store/useAppStore.tsx     Context store persisted to AsyncStorage, GPS via expo-location
├── theme/palette.ts          Night-Vision (crimson) and Standard palettes
└── types/astro.ts            Domain types
```

## How the math works

- **Sidereal time.** Local apparent sidereal time is `Astronomy.SiderealTime(date) + longitude/15`.
- **Precession.** Catalog positions (J2000) are rotated to the true equator of date with `Rotation_EQJ_EQD` before computing any hour angle or altitude. Polaris has moved from RA 2h32m (J2000) to about 3h in 2026, so this step matters.
- **Reticle orientation.** Facing the pole with the naked eye, the northern sky turns counter-clockwise and the southern sky turns clockwise. A star at HA = 0h sits directly above the pole. A refracting polar scope rotates the image by 180°, so in the scope HA 0h appears at 6 o'clock. The Octans stars are projected at their true polar distance on a 7° field radius. The Polaris ring is drawn schematically, the way it is etched on real reticles.
- **The night window.** Each session runs from 17:00 to 07:00 *local mean solar time* at the site's longitude. This keeps it centred on the real night whatever time zone the device uses. Displayed clock times use the device time zone.
- **Twilight.** Twilight times come from `SearchAltitude` on the geometric Sun (no refraction). Shoot windows are the longest contiguous run of 10-minute samples that pass the dark, altitude and (optional) Moon rules. Each window edge is refined by bisection to about 5 s.
- **Meridian flip warning.** The transit is the upper culmination nearest the middle of the night. A flip is flagged when the transit falls more than 15 minutes inside both ends of the window.
- **Moon.** Moon separation and the Moon's time in the window only count while the Moon is above the horizon. The optional avoidance rule ignores a Moon under 10% lit and otherwise needs a separation of 30° + 30° × illumination (60° at full Moon). Ranking uses the usable minutes, discounted by how bright and how close the Moon is.
- **Pole finder.** Stars are drawn in an azimuthal-equidistant projection around the visible pole, rotated by local sidereal time, as seen facing the pole with the zenith at the top. The horizon is the line where altitude is 0°.

The tests cross-check twilight, altitudes and hour angles against separate Meeus formulas for Sydney, London and New York, and they pass in any device time zone.

## Free vs Pro

| Free | Pro ($19.99 lifetime) |
| --- | --- |
| Live reticle (Polaris + Octans) for here and now | Polar scope time scrubbing (±6 h) |
| Pole finder chart, rough alignment, screen dimming | Tomorrow / any future date, dark-sky calendar |
| Tonight's top 3 ranked targets | Full catalog, focal-length filters, custom RA/Dec targets |
| Static altitude chart, horizon floor, Moon avoidance, darkness mode | Saved GPS sites, interactive chart inspector |
