import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { FocalFilter } from '@/data/dsoCatalog';
import { cachePro, initBilling, loadCachedPro } from '@/lib/billing';
import { paletteFor, type Palette } from '@/theme/palette';
import type { DSOObject, ObserverLocation, ReticleType } from '@/types/astro';

const SETTINGS_KEY = '@polargrid_settings_v1';

export type RigPreset = 'SA2I' | 'SA_GTI' | 'SKYGUIDER_PRO' | 'MSM_NOMAD';

export const RIG_PRESETS: { key: RigPreset; label: string; northReticle: ReticleType }[] = [
  { key: 'SA2I', label: 'Sky-Watcher Star Adventurer 2i', northReticle: 'SW_CLOCK' },
  { key: 'SA_GTI', label: 'Sky-Watcher Star Adventurer GTi', northReticle: 'SW_CLOCK' },
  { key: 'SKYGUIDER_PRO', label: 'iOptron SkyGuider Pro', northReticle: 'IOPTRON' },
  { key: 'MSM_NOMAD', label: 'Move Shoot Move Nomad', northReticle: 'SW_CLOCK' },
];

export type HorizonFloor = 20 | 30 | 40;

/** Used until GPS or a manual location is available: Siding Spring Observatory. */
export const FALLBACK_LOCATION: ObserverLocation = {
  latitude: -31.2733,
  longitude: 149.0617,
  elevationMeters: 1165,
  isManualOverride: false,
  label: 'Default · Siding Spring, NSW',
};

export interface Settings {
  isNightVisionMode: boolean;
  invertScope: boolean;
  rigPreset: RigPreset;
  minHorizonDeg: HorizonFloor;
  avoidMoon: boolean;
  focalFilter: FocalFilter;
  manualLocation: ObserverLocation | null;
  lastGpsLocation: ObserverLocation | null;
  savedLocations: ObserverLocation[];
  customTargets: DSOObject[];
}

const DEFAULT_SETTINGS: Settings = {
  isNightVisionMode: true,
  invertScope: true,
  rigPreset: 'SA2I',
  minHorizonDeg: 30,
  avoidMoon: false,
  focalFilter: 'ALL',
  manualLocation: null,
  lastGpsLocation: null,
  savedLocations: [],
  customTargets: [],
};

export type GpsStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'error';

interface AppStore extends Settings {
  hydrated: boolean;
  isPro: boolean;
  gpsStatus: GpsStatus;
  location: ObserverLocation;
  palette: Palette;
  reticleType: ReticleType;
  update: (patch: Partial<Settings>) => void;
  refreshGps: () => Promise<void>;
  setPro: (isPro: boolean) => void;
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setPro = useCallback((pro: boolean) => {
    setIsPro(pro);
    void cachePro(pro);
  }, []);

  // GPS works without a data connection; it only needs a satellite fix.
  const refreshGps = useCallback(async () => {
    setGpsStatus('locating');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsStatus('denied');
        return;
      }
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      update({
        lastGpsLocation: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          elevationMeters: position.coords.altitude ?? 0,
          isManualOverride: false,
          label: 'GPS Live',
        },
      });
      setGpsStatus('ok');
    } catch {
      setGpsStatus('error');
    }
  }, [update]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [raw, cachedPro] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEY).catch(() => null),
        loadCachedPro(),
      ]);
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch {
          // Corrupt settings: fall back to defaults.
        }
      }
      setIsPro(cachedPro);
      setHydrated(true);
      void initBilling(setIsPro);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated && !settingsRef.current.manualLocation) void refreshGps();
  }, [hydrated, refreshGps]);

  const value = useMemo<AppStore>(() => {
    const location = settings.manualLocation ?? settings.lastGpsLocation ?? FALLBACK_LOCATION;
    const rig = RIG_PRESETS.find((r) => r.key === settings.rigPreset) ?? RIG_PRESETS[0];
    return {
      ...settings,
      hydrated,
      isPro,
      gpsStatus,
      location,
      palette: paletteFor(settings.isNightVisionMode),
      reticleType: location.latitude < 0 ? 'OCTANS_TRAPEZOID' : rig.northReticle,
      update,
      refreshGps,
      setPro,
    };
  }, [settings, hydrated, isPro, gpsStatus, update, refreshGps, setPro]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return store;
}
