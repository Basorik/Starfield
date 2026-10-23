import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import { MapPin, RotateCcw, SunDim } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import LocationBanner from '@/components/LocationBanner';
import OffsetSlider from '@/components/OffsetSlider';
import PoleFinderSVG from '@/components/PoleFinderSVG';
import ReticleSVG from '@/components/ReticleSVG';
import RoughAlignPanel from '@/components/RoughAlignPanel';
import { Card, Chip } from '@/components/ui';
import { computePolarAlignment, formatSiderealTime } from '@/engine/polarAlignment';
import { computePoleFinder } from '@/engine/poleFinder';
import { formatLatLon, formatSignedHours, formatTime } from '@/lib/format';
import { useDimScreen } from '@/lib/useDimScreen';
import { RIG_PRESETS, useAppStore } from '@/store/useAppStore';

const KEEP_AWAKE_TAG = 'polar-scope';
const MAX_OFFSET_HOURS = 6;

const selectionHaptic = () => Haptics.selectionAsync().catch(() => {});

type ViewMode = 'RETICLE' | 'FINDER' | 'ROUGH';

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'RETICLE', label: 'Reticle' },
  { key: 'FINDER', label: 'Finder' },
  { key: 'ROUGH', label: 'Rough align' },
];

const FINDER_HELP = {
  SOUTH:
    'Facing south, zenith up. Extend the long axis of the Southern Cross about 4.5× its length; the perpendicular bisector of α Cen–Hadar meets that line near the pole, which also sits midway between Achernar and Acrux. Then switch to Reticle to place faint σ Oct (mag 5.4).',
  NORTH:
    "Facing north, zenith up. Follow the Big Dipper's pointer stars (Merak → Dubhe) about 5× their gap to Polaris. Cassiopeia's W sits on the opposite side of the pole.",
};

export default function PolarScopeScreen() {
  const { palette, location, invertScope, reticleType, rigPreset, isPro, dimScreen, dimLevel, update } = useAppStore();
  const [mode, setMode] = useState<ViewMode>('RETICLE');
  useDimScreen(dimScreen, dimLevel);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const [offsetHours, setOffsetHours] = useState(0);
  const lastWholeHour = useRef(0);

  // Tick once a second and keep the screen on only while this tab is visible.
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const id = setInterval(() => setNow(new Date()), 1000);
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      return () => {
        clearInterval(id);
        deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      };
    }, []),
  );

  const viewTime = useMemo(() => new Date(now.getTime() + offsetHours * 3_600_000), [now, offsetHours]);
  const state = useMemo(
    () => computePolarAlignment(location, viewTime, invertScope),
    [location, viewTime, invertScope],
  );

  const finder = useMemo(
    () => (mode === 'FINDER' ? computePoleFinder(location, viewTime) : null),
    [mode, location, viewTime],
  );

  const reticleSize = Math.min(width - 32, height * 0.48, 440);
  const isNorth = state.hemisphere === 'NORTH';
  const rigLabel = RIG_PRESETS.find((r) => r.key === rigPreset)?.label ?? '';
  const dialName = reticleType === 'IOPTRON' ? 'iOptron' : 'Sky-Watcher';
  const clock = reticleType === 'IOPTRON' ? state.clockFaceString.replace(/^12:/, '00:') : state.clockFaceString;

  const onOffsetChange = (hours: number) => {
    setOffsetHours(hours);
    const whole = Math.trunc(hours);
    if (whole !== lastWholeHour.current) {
      lastWholeHour.current = whole;
      selectionHaptic();
    }
  };

  const resetToNow = () => {
    setOffsetHours(0);
    lastWholeHour.current = 0;
    selectionHaptic();
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, paddingHorizontal: 16 }}
    >
      {/* Status strip */}
      <View className="flex-row flex-wrap items-center gap-2">
        <Pressable
          onPress={() => router.navigate('/settings')}
          className="flex-row items-center rounded-full border border-border px-3 py-1"
        >
          <MapPin size={12} color={palette.secondary} />
          <Text className="ml-1 font-mono text-xs text-primary">{formatLatLon(location)}</Text>
        </Pressable>
        <Text className="rounded-full border border-primary px-3 py-1 text-xs font-bold text-primary">
          {isNorth ? 'NORTH — POLARIS' : 'SOUTH — OCTANS'}
        </Text>
        <Text className="ml-auto font-mono text-sm text-primary">
          LST {formatSiderealTime(state.localSiderealTimeHours)}
        </Text>
      </View>

      <View className="mt-3">
        <LocationBanner />
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {VIEW_MODES.map((m) => (
          <Chip key={m.key} label={m.label} active={mode === m.key} palette={palette} onPress={() => setMode(m.key)} />
        ))}
        <Pressable
          onPress={() => update({ dimScreen: !dimScreen })}
          accessibilityRole="switch"
          accessibilityState={{ checked: dimScreen }}
          accessibilityLabel="Dim screen"
          className={`ml-auto flex-row items-center rounded-full border px-3 py-1.5 ${dimScreen ? 'border-primary' : 'border-border'}`}
        >
          <SunDim size={14} color={dimScreen ? palette.primary : palette.secondary} />
          <Text className={`ml-1 text-xs ${dimScreen ? 'text-primary' : 'text-secondary'}`}>Dim</Text>
        </Pressable>
      </View>

      {mode === 'ROUGH' && (
        <View className="mt-4">
          <RoughAlignPanel latitude={location.latitude} palette={palette} />
        </View>
      )}

      {mode === 'FINDER' && finder && (
        <>
          <View className="mt-4 items-center">
            <PoleFinderSVG finder={finder} palette={palette} size={reticleSize} />
          </View>
          <Card className="mt-3">
            <Text className="text-xs uppercase tracking-widest text-secondary">
              Star-hop to the {isNorth ? 'north' : 'south'} celestial pole · naked eye
            </Text>
            <Text className="mt-1 text-sm text-primary">{FINDER_HELP[finder.hemisphere]}</Text>
            <Text className="mt-2 text-xs text-secondary">
              Pole altitude {finder.poleAltitudeDeg.toFixed(1)}° · stars below your horizon are dimmed · rings every 10°
            </Text>
          </Card>
        </>
      )}

      {mode === 'RETICLE' && (
        <>
          {/* Reticle */}
          <View className="mt-4 items-center">
            <ReticleSVG state={state} reticleType={reticleType} palette={palette} size={reticleSize} />
          </View>

          <Card className="mt-3">
            <Text className="text-xs uppercase tracking-widest text-secondary">
              {isNorth ? `${dialName} clock dial` : 'Octans trapezoid'} ·{' '}
              {state.inverted ? 'through polar scope' : 'naked eye'}
            </Text>
            <Text className="mt-1 text-lg text-primary">
              {isNorth ? 'Place Polaris at ' : 'Rotate so σ Oct sits at '}
              <Text className="font-mono text-2xl font-bold">{clock}</Text>
            </Text>
            <Text className="mt-1 font-mono text-xs text-secondary">
              HA {state.hourAngleHours.toFixed(2)}h · {state.poleStarOffsetDeg.toFixed(2)}° from{' '}
              {isNorth ? 'NCP' : 'SCP'}
              {!isNorth && ` · trapezoid ${state.octansRotationDeg.toFixed(0)}°`}
            </Text>
            <Text className="mt-1 text-xs text-secondary">{rigLabel}</Text>
          </Card>

          {/* Optics */}
          <Text className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-widest text-secondary">Scope view</Text>
          <View className="flex-row gap-2">
            <Chip
              label="Inverted (Polar Scope)"
              active={invertScope}
              palette={palette}
              onPress={() => update({ invertScope: true })}
            />
            <Chip
              label="Direct (Naked Eye)"
              active={!invertScope}
              palette={palette}
              onPress={() => update({ invertScope: false })}
            />
          </View>
        </>
      )}

      {mode !== 'ROUGH' && (
        <>
          {/* Time scrubbing */}
          <View className="mb-1 mt-5 flex-row items-center">
            <Text className="text-[11px] font-bold uppercase tracking-widest text-secondary">Time offset</Text>
            {!isPro && <Text className="ml-2 text-[10px] text-secondary">PRO</Text>}
            <Text className="ml-auto font-mono text-xs text-primary">
              {formatSignedHours(offsetHours)} → {formatTime(viewTime)}
            </Text>
          </View>
          <OffsetSlider
            value={offsetHours}
            min={-MAX_OFFSET_HOURS}
            max={MAX_OFFSET_HOURS}
            stepHours={5 / 60}
            palette={palette}
            locked={!isPro}
            onChange={onOffsetChange}
            onLockedPress={() => router.push('/paywall')}
          />
          <View className="flex-row justify-between">
            <Text className="text-[10px] text-secondary">−6h</Text>
            <Pressable
              onPress={resetToNow}
              className="flex-row items-center rounded-full border border-border px-3 py-1"
            >
              <RotateCcw size={12} color={palette.primary} />
              <Text className="ml-1 text-xs text-primary">Reset to Now</Text>
            </Pressable>
            <Text className="text-[10px] text-secondary">+6h</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}
