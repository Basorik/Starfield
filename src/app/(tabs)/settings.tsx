import { router } from 'expo-router';
import { Crown, MapPin, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Chip, SectionTitle, ThemedSwitch } from '@/components/ui';
import { restorePro } from '@/lib/billing';
import { formatLatLon, parseAngle } from '@/lib/format';
import {
  DARKNESS_MODES,
  DIM_LEVELS,
  RIG_PRESETS,
  useAppStore,
  type GpsStatus,
  type HorizonFloor,
} from '@/store/useAppStore';
import type { ObserverLocation } from '@/types/astro';

const GPS_STATUS_TEXT: Record<GpsStatus, string> = {
  idle: 'GPS idle',
  locating: 'Acquiring GPS fix…',
  ok: 'GPS fix acquired',
  denied: 'Location permission denied — enter coordinates manually',
  error: 'No GPS fix — enter coordinates manually',
};

const sameSpot = (a: ObserverLocation, b: ObserverLocation) =>
  Math.abs(a.latitude - b.latitude) < 1e-4 && Math.abs(a.longitude - b.longitude) < 1e-4;

export default function SettingsScreen() {
  const store = useAppStore();
  const { palette, location, isPro, update } = store;
  const insets = useSafeAreaInsets();

  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [elev, setElev] = useState('');
  const [label, setLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  const applyOverride = () => {
    const latitude = parseAngle(lat);
    const longitude = parseAngle(lon);
    const elevation = elev.trim() ? Number(elev) : 0;
    if (latitude === null || Math.abs(latitude) > 90)
      return setFormError('Latitude must be −90 to +90 (south is negative).');
    if (longitude === null || Math.abs(longitude) > 180)
      return setFormError('Longitude must be −180 to +180 (west is negative).');
    if (!Number.isFinite(elevation)) return setFormError('Elevation must be a number of metres.');
    setFormError(null);
    update({
      manualLocation: {
        latitude,
        longitude,
        elevationMeters: elevation,
        isManualOverride: true,
        label: label.trim() || 'Manual override',
      },
    });
  };

  const useGps = () => {
    update({ manualLocation: null });
    void store.refreshGps();
  };

  const saveCurrent = () => {
    if (!isPro) return router.push('/paywall');
    if (store.savedLocations.some((s) => sameSpot(s, location))) return;
    const name =
      location.label && location.label !== 'GPS Live' ? location.label : `Site ${store.savedLocations.length + 1}`;
    update({ savedLocations: [...store.savedLocations, { ...location, label: name, isManualOverride: true }] });
  };

  const restore = async () => {
    setRestoreMsg('Restoring…');
    const outcome = await restorePro();
    if (outcome === 'unlocked') store.setPro(true);
    setRestoreMsg(
      outcome === 'unlocked'
        ? 'PolarGrid Pro restored.'
        : outcome === 'unavailable'
          ? 'Store unavailable in this build.'
          : 'No previous purchase found.',
    );
  };

  const inputClass = 'mt-1 rounded-lg border border-border px-3 py-2 font-mono text-primary';

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32, paddingHorizontal: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-2xl font-bold text-primary">Settings</Text>

      <SectionTitle>Display</SectionTitle>
      <Card>
        <View className="flex-row items-center">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold text-primary">Night-Vision Mode</Text>
            <Text className="text-xs text-secondary">Pure black + deep crimson to preserve dark adaptation.</Text>
          </View>
          <ThemedSwitch
            value={store.isNightVisionMode}
            onValueChange={(v) => update({ isNightVisionMode: v })}
            palette={palette}
          />
        </View>
      </Card>

      <SectionTitle>Location</SectionTitle>
      <Card>
        <View className="flex-row items-center">
          <MapPin size={14} color={palette.primary} />
          <Text className="ml-2 font-mono text-sm text-primary">{formatLatLon(location)}</Text>
        </View>
        <Text className="mt-1 text-xs text-secondary">
          {location.label ?? 'Unnamed'} · {location.elevationMeters.toFixed(0)} m
          {location.isManualOverride ? ' · manual override' : ''}
        </Text>
        {!store.manualLocation && (
          <Text className="mt-1 text-xs text-secondary">{GPS_STATUS_TEXT[store.gpsStatus]}</Text>
        )}
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <Button label="Use GPS" onPress={useGps} />
          </View>
          <View className="flex-1">
            <Button label={isPro ? 'Save this site' : 'Save site · PRO'} onPress={saveCurrent} />
          </View>
        </View>

        <Text className="mt-4 text-xs font-bold text-secondary">GPS override</Text>
        <View className="mt-1 flex-row gap-2">
          <View className="flex-1">
            <TextInput
              value={lat}
              onChangeText={setLat}
              placeholder="Lat -31.27"
              placeholderTextColor={palette.muted}
              keyboardType="numbers-and-punctuation"
              className={inputClass}
            />
          </View>
          <View className="flex-1">
            <TextInput
              value={lon}
              onChangeText={setLon}
              placeholder="Lon 149.06"
              placeholderTextColor={palette.muted}
              keyboardType="numbers-and-punctuation"
              className={inputClass}
            />
          </View>
        </View>
        <View className="mt-1 flex-row gap-2">
          <View className="flex-1">
            <TextInput
              value={elev}
              onChangeText={setElev}
              placeholder="Elev m"
              placeholderTextColor={palette.muted}
              keyboardType="numbers-and-punctuation"
              className={inputClass}
            />
          </View>
          <View className="flex-[2]">
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Label (e.g. Coonabarabran)"
              placeholderTextColor={palette.muted}
              className={inputClass}
            />
          </View>
        </View>
        {formError && <Text className="mt-2 text-xs text-warn">{formError}</Text>}
        <View className="mt-3">
          <Button label="Apply override" variant="solid" onPress={applyOverride} />
        </View>

        {store.savedLocations.length > 0 && (
          <>
            <Text className="mt-4 text-xs font-bold text-secondary">Saved sites</Text>
            {store.savedLocations.map((site, i) => {
              const active = store.manualLocation !== null && sameSpot(site, store.manualLocation);
              return (
                <View key={`${site.latitude},${site.longitude}`} className="mt-2 flex-row items-center">
                  <Pressable
                    onPress={() => update({ manualLocation: { ...site, isManualOverride: true } })}
                    className={`flex-1 rounded-lg border px-3 py-2 ${active ? 'border-primary' : 'border-border'}`}
                  >
                    <Text className="text-sm text-primary">{site.label}</Text>
                    <Text className="font-mono text-[11px] text-secondary">{formatLatLon(site)}</Text>
                  </Pressable>
                  <Pressable
                    hitSlop={10}
                    className="ml-2 p-1"
                    accessibilityLabel={`Delete ${site.label}`}
                    onPress={() => update({ savedLocations: store.savedLocations.filter((_, j) => j !== i) })}
                  >
                    <X size={16} color={palette.secondary} />
                  </Pressable>
                </View>
              );
            })}
          </>
        )}
      </Card>

      <SectionTitle>Rig preset</SectionTitle>
      <View className="gap-2">
        {RIG_PRESETS.map((rig) => (
          <Pressable
            key={rig.key}
            onPress={() => update({ rigPreset: rig.key })}
            className={`rounded-lg border px-3 py-2.5 ${store.rigPreset === rig.key ? 'border-primary bg-surface' : 'border-border'}`}
          >
            <Text className={`text-sm ${store.rigPreset === rig.key ? 'font-bold text-primary' : 'text-secondary'}`}>
              {rig.label}
            </Text>
            <Text className="text-[11px] text-secondary">
              North reticle: {rig.northReticle === 'IOPTRON' ? 'iOptron 0–11 dial' : 'Sky-Watcher 12-hour clock'} ·
              South: Octans trapezoid
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>Planner defaults</SectionTitle>
      <Card>
        <Text className="text-xs text-secondary">Horizon floor (trees, fences, light domes)</Text>
        <View className="mt-2 flex-row gap-2">
          {([20, 30, 40] as HorizonFloor[]).map((deg) => (
            <Chip
              key={deg}
              label={`${deg}°`}
              active={store.minHorizonDeg === deg}
              palette={palette}
              onPress={() => update({ minHorizonDeg: deg })}
            />
          ))}
        </View>
        <View className="mt-4 flex-row items-center">
          <View className="flex-1 pr-3">
            <Text className="text-sm text-primary">Avoid the Moon</Text>
            <Text className="text-xs text-secondary">
              Exclude time when the Moon is up and close to the target: 33° for a crescent up to 60° at full; ignored
              below 10% illumination.
            </Text>
          </View>
          <ThemedSwitch value={store.avoidMoon} onValueChange={(v) => update({ avoidMoon: v })} palette={palette} />
        </View>
        <Text className="mt-4 text-xs text-secondary">
          Darkness — Auto uses astronomical darkness and falls back to nautical (then civil) twilight on summer nights
          when the Sun never gets low enough.
        </Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {DARKNESS_MODES.map((m) => (
            <Chip
              key={m.key}
              label={m.label}
              active={store.darknessMode === m.key}
              palette={palette}
              onPress={() => update({ darknessMode: m.key })}
            />
          ))}
        </View>
      </Card>

      <SectionTitle>Polar scope screen</SectionTitle>
      <Card>
        <View className="flex-row items-center">
          <View className="flex-1 pr-3">
            <Text className="text-sm text-primary">Dim the screen</Text>
            <Text className="text-xs text-secondary">
              Lowers brightness while the Polar Scope tab is open and restores it when you leave.
            </Text>
          </View>
          <ThemedSwitch value={store.dimScreen} onValueChange={(v) => update({ dimScreen: v })} palette={palette} />
        </View>
        <View className="mt-3 flex-row gap-2">
          {DIM_LEVELS.map((l) => (
            <Chip
              key={l.label}
              label={l.label}
              active={store.dimLevel === l.value}
              palette={palette}
              onPress={() => update({ dimLevel: l.value, dimScreen: true })}
            />
          ))}
        </View>
      </Card>

      <SectionTitle>PolarGrid Pro</SectionTitle>
      <Card>
        <View className="flex-row items-center">
          <Crown size={16} color={palette.primary} />
          <Text className="ml-2 text-sm font-bold text-primary">
            {isPro ? 'Pro unlocked — thank you!' : 'Free tier'}
          </Text>
        </View>
        <Text className="mt-1 text-xs text-secondary">
          {isPro
            ? 'Your unlock is cached on this device and works fully offline.'
            : 'Unlock future-date planning, the full catalog, custom targets, saved sites and the chart inspector.'}
        </Text>
        {!isPro && (
          <View className="mt-3">
            <Button label="See PolarGrid Pro" variant="solid" onPress={() => router.push('/paywall')} />
          </View>
        )}
        <View className="mt-2">
          <Button label="Restore purchases" onPress={restore} />
        </View>
        {restoreMsg && <Text className="mt-2 text-xs text-secondary">{restoreMsg}</Text>}
        {__DEV__ && (
          <View className="mt-4 flex-row items-center">
            <Text className="flex-1 text-xs text-secondary">Developer: force Pro</Text>
            <ThemedSwitch value={isPro} onValueChange={store.setPro} palette={palette} />
          </View>
        )}
      </Card>

      <Text className="mt-6 text-center text-[10px] text-muted">
        All ephemerides computed on-device with astronomy-engine. No network required.
      </Text>
    </ScrollView>
  );
}
