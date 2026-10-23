import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Star, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { computeNightContext, resolveDarkLimit, sessionDateFor, summarizeNight } from '@/engine/targetPlanner';
import { addDays, formatDay, formatDuration, formatTime } from '@/lib/format';
import { useAppStore } from '@/store/useAppStore';
import type { NightSummary } from '@/types/astro';

const NIGHTS = 30;
const BEST_COUNT = 3;
/** Nights computed per frame, so the list fills in without freezing the UI. */
const NIGHTS_PER_TICK = 3;

const isWeekendNight = (d: Date) => d.getDay() === 5 || d.getDay() === 6;

const dateParam = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Month of nights ranked by Moon-free darkness: the "best new-Moon weekends" view. */
export default function CalendarScreen() {
  const { palette, location, darknessMode, isPro } = useAppStore();
  const insets = useSafeAreaInsets();
  const tonight = sessionDateFor(new Date(), location.longitude);
  const [pageStart, setPageStart] = useState(tonight);
  const [nights, setNights] = useState<NightSummary[]>([]);

  useEffect(() => {
    if (!isPro) router.replace('/paywall');
  }, [isPro]);

  const startKey = pageStart.getTime();
  useEffect(() => {
    setNights([]);
    let n = 0;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const batch: NightSummary[] = [];
      for (let k = 0; k < NIGHTS_PER_TICK && n < NIGHTS; k++, n++) {
        const ctx = computeNightContext(location, addDays(new Date(startKey), n));
        batch.push(summarizeNight(ctx, resolveDarkLimit(ctx, darknessMode)));
      }
      setNights((prev) => [...prev, ...batch]);
      if (n < NIGHTS) id = setTimeout(tick, 0);
    };
    id = setTimeout(tick, 16);
    return () => clearTimeout(id);
  }, [location, startKey, darknessMode]);

  const done = nights.length === NIGHTS;
  const maxMinutes = Math.max(60, ...nights.map((n) => n.darkMinutes));
  const best = useMemo(() => {
    if (!done) return new Set<number>();
    const ranked = [...nights]
      .filter((n) => n.moonFreeMinutes > 0)
      .sort((a, b) => b.moonFreeMinutes - a.moonFreeMinutes);
    return new Set(ranked.slice(0, BEST_COUNT).map((n) => n.date.getTime()));
  }, [nights, done]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/planner'));
  const openNight = (n: NightSummary) =>
    router.dismissTo({ pathname: '/planner', params: { date: dateParam(n.date) } });

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-primary">Dark-sky calendar</Text>
          <Text className="text-xs text-secondary">
            {location.label ?? 'Manual location'} · Moon-free darkness per night
          </Text>
        </View>
        <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
          <X size={24} color={palette.primary} />
        </Pressable>
      </View>

      <View className="mt-4 flex-row items-center justify-between rounded-lg border border-border px-2 py-1">
        <Pressable
          onPress={() => setPageStart(addDays(pageStart, -NIGHTS))}
          disabled={startKey <= tonight.getTime()}
          className="p-2"
          style={{ opacity: startKey <= tonight.getTime() ? 0.3 : 1 }}
          accessibilityLabel="Previous 30 nights"
        >
          <ChevronLeft size={18} color={palette.primary} />
        </Pressable>
        <Text className="font-mono text-sm font-bold text-primary">
          {formatDay(pageStart)} – {formatDay(addDays(pageStart, NIGHTS - 1))}
        </Text>
        <Pressable
          onPress={() => setPageStart(addDays(pageStart, NIGHTS))}
          className="p-2"
          accessibilityLabel="Next 30 nights"
        >
          <ChevronRight size={18} color={palette.primary} />
        </Pressable>
      </View>

      <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1">
        <View className="flex-row items-center">
          <View style={{ width: 14, height: 6, backgroundColor: palette.primary }} />
          <Text className="ml-1.5 text-[10px] text-secondary">Moon-free dark</Text>
        </View>
        <View className="flex-row items-center">
          <View style={{ width: 14, height: 6, backgroundColor: palette.muted }} />
          <Text className="ml-1.5 text-[10px] text-secondary">Dark, Moon up</Text>
        </View>
        <View className="flex-row items-center">
          <Star size={10} color={palette.accent} />
          <Text className="ml-1.5 text-[10px] text-secondary">Best {BEST_COUNT} nights</Text>
        </View>
      </View>

      <View className="mt-3">
        {nights.map((n) => {
          const isBest = best.has(n.date.getTime());
          const weekend = isWeekendNight(n.date);
          return (
            <Pressable
              key={n.date.getTime()}
              onPress={() => openNight(n)}
              accessibilityRole="button"
              className={`mb-2 rounded-lg border px-3 py-2 ${isBest ? 'border-accent' : 'border-border'} ${weekend ? 'bg-surface' : ''}`}
            >
              <View className="flex-row items-center">
                {isBest && <Star size={12} color={palette.accent} style={{ marginRight: 4 }} />}
                <Text className={`w-24 text-sm ${weekend ? 'font-bold text-primary' : 'text-primary'}`}>
                  {formatDay(n.date)}
                </Text>
                <Text className="w-14 font-mono text-xs text-secondary">☾ {n.moonIlluminationPct.toFixed(0)}%</Text>
                <Text className="ml-auto font-mono text-xs text-primary">
                  {n.darkAllSession
                    ? 'dark all night'
                    : n.moonFreeMinutes > 0
                      ? `${formatDuration(n.moonFreeMinutes)} Moon-free`
                      : n.darkMinutes > 0
                        ? 'Moon up all dark'
                        : 'no darkness'}
                </Text>
              </View>
              <View
                className="mt-1.5 h-1.5 flex-row overflow-hidden rounded-full"
                style={{ backgroundColor: palette.border }}
              >
                <View
                  style={{ width: `${(n.moonFreeMinutes / maxMinutes) * 100}%`, backgroundColor: palette.primary }}
                />
                <View
                  style={{
                    width: `${(Math.max(0, n.darkMinutes - n.moonFreeMinutes) / maxMinutes) * 100}%`,
                    backgroundColor: palette.muted,
                  }}
                />
              </View>
              {n.moonFreeStart && (
                <Text className="mt-1 text-[10px] text-secondary">
                  {formatTime(n.moonFreeStart)} – {formatTime(n.moonFreeEnd)}
                  {n.darkLimit.isFallback ? ` · ${n.darkLimit.level.toLowerCase()} only` : ''}
                </Text>
              )}
            </Pressable>
          );
        })}
        {!done && <ActivityIndicator color={palette.primary} style={{ marginVertical: 16 }} />}
      </View>

      <Text className="mt-2 text-[10px] text-secondary">
        Tap a night to open it in the planner. Weekend nights (Fri, Sat) are highlighted.
      </Text>
    </ScrollView>
  );
}
