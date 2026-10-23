import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, Moon, Plus, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AltitudeChartSVG from '@/components/AltitudeChartSVG';
import LocationBanner from '@/components/LocationBanner';
import TargetCard, { describeMoon } from '@/components/TargetCard';
import { BottomSheet, Button, Card, Chip, SectionTitle } from '@/components/ui';
import { DSO_CATALOG, FOCAL_FILTERS, matchesFocalFilter } from '@/data/dsoCatalog';
import {
  computeNightContext,
  rankTargets,
  resolveDarkLimit,
  sessionDateFor,
  summarizeNight,
  type NightContext,
} from '@/engine/targetPlanner';
import { addDays, formatDay, formatDuration, formatMagnitude, formatTime, parseAngle } from '@/lib/format';
import { DARKNESS_MODES, useAppStore, type HorizonFloor } from '@/store/useAppStore';
import type { DarknessLevel, DSOObject, NightSummary, NightWindowReport } from '@/types/astro';

type DayMode = 'TONIGHT' | 'TOMORROW' | 'CUSTOM';

const FREE_TARGET_LIMIT = 3;
const LOCKED_TEASERS = 5;
const HORIZON_FLOORS: HorizonFloor[] = [20, 30, 40];

const openPaywall = () => router.push('/paywall');

const DARK_NAME: Record<DarknessLevel, string> = {
  ASTRONOMICAL: 'astronomical darkness',
  NAUTICAL: 'nautical darkness',
  CIVIL: 'civil twilight',
};

/** "2026-11-14" → device-local midnight, or null. */
function parseDateParam(value: string | undefined): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function moonEventsText(ctx: NightContext): string {
  const events = [
    ctx.moonrise && { t: ctx.moonrise, text: `rises ${formatTime(ctx.moonrise)}` },
    ctx.moonset && { t: ctx.moonset, text: `sets ${formatTime(ctx.moonset)}` },
  ]
    .filter((e): e is { t: Date; text: string } => !!e)
    .sort((a, b) => a.t.getTime() - b.t.getTime())
    .map((e) => e.text);
  if (events.length) return events.join(' · ');
  return ctx.moonAltitudes.every((a) => a > 0) ? 'up all night' : 'below the horizon all night';
}

export default function PlannerScreen() {
  const store = useAppStore();
  const { palette, location, isPro, minHorizonDeg, avoidMoon, darknessMode, focalFilter, customTargets, update } =
    store;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();

  const [dayMode, setDayMode] = useState<DayMode>('TONIGHT');
  const tonight = sessionDateFor(new Date(), location.longitude);
  const [customDate, setCustomDate] = useState(() => addDays(tonight, 7));
  const sessionDate = dayMode === 'TONIGHT' ? tonight : dayMode === 'TOMORROW' ? addDays(tonight, 1) : customDate;
  const sessionKey = sessionDate.getTime();

  // A night picked in the dark-sky calendar arrives as ?date=YYYY-MM-DD.
  useEffect(() => {
    const picked = parseDateParam(params.date);
    if (picked && isPro) {
      setCustomDate(picked);
      setDayMode('CUSTOM');
    }
  }, [params.date, isPro]);

  const [plan, setPlan] = useState<{
    ctx: NightContext;
    summary: NightSummary;
    ranked: NightWindowReport[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NightWindowReport | null>(null);
  const [showBelowFloor, setShowBelowFloor] = useState(false);
  const [addingTarget, setAddingTarget] = useState(false);

  const catalog = useMemo(() => [...DSO_CATALOG, ...customTargets], [customTargets]);

  // Ranking ~70 targets is pure CPU work; yield a frame so the spinner can paint first.
  useEffect(() => {
    setLoading(true);
    const id = setTimeout(() => {
      const ctx = computeNightContext(location, new Date(sessionKey));
      const darkLimit = resolveDarkLimit(ctx, darknessMode);
      setPlan({
        ctx,
        summary: summarizeNight(ctx, darkLimit),
        ranked: rankTargets(ctx, catalog, { minHorizonDeg, avoidMoon, sunLimitDeg: darkLimit.sunLimitDeg }),
      });
      setLoading(false);
    }, 16);
    return () => clearTimeout(id);
  }, [location, sessionKey, catalog, minHorizonDeg, avoidMoon, darknessMode]);

  const activeFilter = isPro ? focalFilter : 'ALL';
  const filtered = useMemo(
    () => (plan?.ranked ?? []).filter((r) => matchesFocalFilter(r.dso, activeFilter)),
    [plan, activeFilter],
  );
  const shootable = filtered.filter((r) => r.totalShootableMinutes > 0);
  const belowFloor = filtered.filter((r) => r.totalShootableMinutes === 0);
  const visible = isPro ? shootable : shootable.slice(0, FREE_TARGET_LIMIT);
  const lockedCount = isPro ? 0 : Math.max(0, shootable.length - FREE_TARGET_LIMIT);

  const chooseDay = (mode: DayMode) => {
    if (mode !== 'TONIGHT' && !isPro) return openPaywall();
    setDayMode(mode);
  };

  const summary = plan?.summary;
  const lowestSun = plan ? Math.min(...plan.ctx.sunAltitudes) : 0;

  return (
    <View className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32, paddingHorizontal: 16 }}>
        <Text className="text-2xl font-bold text-primary">Target Window</Text>
        <Text className="mb-3 text-xs text-secondary">
          {location.label ?? 'Manual location'} · times in device time zone
        </Text>
        <LocationBanner />

        {/* Date */}
        <SectionTitle>Session</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          <Chip label="Tonight" active={dayMode === 'TONIGHT'} palette={palette} onPress={() => chooseDay('TONIGHT')} />
          <Chip
            label="Tomorrow"
            active={dayMode === 'TOMORROW'}
            palette={palette}
            locked={!isPro}
            onPress={() => chooseDay('TOMORROW')}
          />
          <Chip
            label="Pick date"
            active={dayMode === 'CUSTOM'}
            palette={palette}
            locked={!isPro}
            onPress={() => chooseDay('CUSTOM')}
          />
          <Pressable
            onPress={() => (isPro ? router.push('/calendar') : openPaywall())}
            accessibilityRole="button"
            className="flex-row items-center rounded-full border border-border px-3 py-1.5"
          >
            <CalendarDays size={12} color={palette.primary} />
            <Text className="ml-1 text-xs text-primary">Dark-sky calendar{isPro ? '' : ' · PRO'}</Text>
          </Pressable>
        </View>
        {dayMode === 'CUSTOM' && (
          <View className="mt-3 flex-row items-center justify-between rounded-lg border border-border px-2 py-1">
            <Pressable onPress={() => setCustomDate(addDays(customDate, -7))} className="px-2 py-2">
              <Text className="text-xs text-secondary">−7d</Text>
            </Pressable>
            <Pressable onPress={() => setCustomDate(addDays(customDate, -1))} className="p-2">
              <ChevronLeft size={18} color={palette.primary} />
            </Pressable>
            <Text className="font-mono text-sm font-bold text-primary">{formatDay(customDate)}</Text>
            <Pressable onPress={() => setCustomDate(addDays(customDate, 1))} className="p-2">
              <ChevronRight size={18} color={palette.primary} />
            </Pressable>
            <Pressable onPress={() => setCustomDate(addDays(customDate, 7))} className="px-2 py-2">
              <Text className="text-xs text-secondary">+7d</Text>
            </Pressable>
          </View>
        )}

        {/* Lens & horizon */}
        <SectionTitle>Focal length</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {FOCAL_FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              active={activeFilter === f.key}
              palette={palette}
              locked={!isPro && f.key !== 'ALL'}
              onPress={() => (isPro || f.key === 'ALL' ? update({ focalFilter: f.key }) : openPaywall())}
            />
          ))}
        </View>

        <SectionTitle>Horizon floor</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {HORIZON_FLOORS.map((deg) => (
            <Chip
              key={deg}
              label={`${deg}°`}
              active={minHorizonDeg === deg}
              palette={palette}
              onPress={() => update({ minHorizonDeg: deg })}
            />
          ))}
          <Chip
            label="Avoid Moon"
            active={avoidMoon}
            palette={palette}
            onPress={() => update({ avoidMoon: !avoidMoon })}
          />
        </View>

        <SectionTitle>Darkness</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {DARKNESS_MODES.map((m) => (
            <Chip
              key={m.key}
              label={m.label}
              active={darknessMode === m.key}
              palette={palette}
              onPress={() => update({ darknessMode: m.key })}
            />
          ))}
        </View>

        {/* Night summary */}
        <Card className="mt-5">
          <Text className="text-xs uppercase tracking-widest text-secondary">
            {formatDay(sessionDate)} · {summary ? DARK_NAME[summary.darkLimit.level] : 'dark window'}
          </Text>
          {plan && summary ? (
            <>
              <Text className="mt-1 font-mono text-lg font-bold text-primary">
                {summary.darkAllSession
                  ? 'Dark all night'
                  : summary.darkStart
                    ? `${formatTime(summary.darkStart)} – ${formatTime(summary.darkEnd)} (${formatDuration(summary.darkMinutes)})`
                    : `No ${DARK_NAME[summary.darkLimit.level]} tonight`}
              </Text>
              {summary.darkLimit.isFallback && (
                <Text className="mt-1 text-xs text-warn">
                  The Sun only gets to {lowestSun.toFixed(0)}° tonight, so there is no astronomical darkness. Planning
                  for {DARK_NAME[summary.darkLimit.level]} instead — expect a brighter sky; favour bright targets and
                  narrowband filters.
                </Text>
              )}
              <View className="mt-2 flex-row items-center">
                <Moon size={12} color={palette.secondary} />
                <Text className="ml-1.5 flex-1 text-xs text-secondary">
                  Moon {summary.moonIlluminationPct.toFixed(0)}% · {moonEventsText(plan.ctx)}
                </Text>
              </View>
              <Text className="mt-1 text-xs text-primary">
                {summary.moonFreeStart
                  ? `Moon-free dark: ${formatTime(summary.moonFreeStart)} – ${formatTime(summary.moonFreeEnd)} (${formatDuration(summary.moonFreeMinutes)})`
                  : summary.darkMinutes > 0
                    ? 'No Moon-free darkness tonight'
                    : ''}
              </Text>
            </>
          ) : (
            <Text className="mt-1 text-sm text-secondary">Computing…</Text>
          )}
        </Card>

        {/* Ranked targets */}
        <View className="mb-2 mt-5 flex-row items-center">
          <Text className="text-[11px] font-bold uppercase tracking-widest text-secondary">
            Ranked targets · ≥{minHorizonDeg}°
          </Text>
          <Pressable
            onPress={() => (isPro ? setAddingTarget(true) : openPaywall())}
            className="ml-auto flex-row items-center rounded-full border border-border px-3 py-1"
          >
            <Plus size={12} color={palette.primary} />
            <Text className="ml-1 text-xs text-primary">Custom RA/Dec{isPro ? '' : ' · PRO'}</Text>
          </Pressable>
        </View>

        {loading && <ActivityIndicator color={palette.primary} style={{ marginVertical: 24 }} />}

        {!loading && shootable.length === 0 && (
          <Text className="my-4 text-sm text-secondary">
            Nothing clears {minHorizonDeg}° during {summary ? DARK_NAME[summary.darkLimit.level] : 'darkness'} with
            these filters.
          </Text>
        )}

        {!loading &&
          visible.map((r, i) => (
            <TargetCard key={r.dso.id} report={r} rank={i + 1} palette={palette} onPress={() => setSelected(r)} />
          ))}

        {!loading && lockedCount > 0 && (
          <>
            {shootable.slice(FREE_TARGET_LIMIT, FREE_TARGET_LIMIT + LOCKED_TEASERS).map((r, i) => (
              <TargetCard
                key={r.dso.id}
                report={r}
                rank={FREE_TARGET_LIMIT + i + 1}
                palette={palette}
                locked
                onPress={openPaywall}
              />
            ))}
            <Button
              label={`Unlock all ${lockedCount + FREE_TARGET_LIMIT} targets for tonight`}
              variant="solid"
              onPress={openPaywall}
            />
          </>
        )}

        {!loading && isPro && belowFloor.length > 0 && (
          <>
            <Pressable onPress={() => setShowBelowFloor(!showBelowFloor)} className="mt-4 py-2">
              <Text className="text-xs text-secondary">
                {showBelowFloor ? 'Hide' : 'Show'} {belowFloor.length} targets that never clear {minHorizonDeg}° in
                darkness
              </Text>
            </Pressable>
            {showBelowFloor &&
              belowFloor.map((r, i) => (
                <TargetCard
                  key={r.dso.id}
                  report={r}
                  rank={shootable.length + i + 1}
                  palette={palette}
                  onPress={() => setSelected(r)}
                />
              ))}
          </>
        )}
      </ScrollView>

      <TargetDetail report={selected} onClose={() => setSelected(null)} />
      <CustomTargetSheet visible={addingTarget} onClose={() => setAddingTarget(false)} />
    </View>
  );
}

function TargetDetail({ report, onClose }: { report: NightWindowReport | null; onClose: () => void }) {
  const { palette, isPro, minHorizonDeg, customTargets, update } = useAppStore();
  const { width } = useWindowDimensions();
  if (!report) return null;
  const { dso } = report;

  const rows: [string, string][] = [
    [
      'Shoot window',
      report.optimalStart ? `${formatTime(report.optimalStart)} – ${formatTime(report.optimalEnd)}` : 'None tonight',
    ],
    ['Usable time', formatDuration(report.totalShootableMinutes)],
    ['Meridian transit', `${formatTime(report.meridianTransitTime)}${report.transitInSession ? '' : ' (daytime)'}`],
    ['Max altitude', `${report.maxAltitudeDeg.toFixed(1)}°`],
    ['Astro dusk / dawn', `${formatTime(report.astronomicalDusk)} / ${formatTime(report.astronomicalDawn)}`],
    ['Darkness limit', `Sun ≤ ${report.sunLimitDeg}°`],
    ['Moon', describeMoon(report).replace(/^Moon /, '')],
    ['RA / Dec (J2000)', `${dso.raHours.toFixed(3)}h / ${dso.decDeg.toFixed(2)}°`],
    ['Size / Mag', `${dso.sizeArcmin}′ / ${formatMagnitude(dso.magnitude)}`],
  ];

  const removeCustom = () => {
    update({ customTargets: customTargets.filter((t) => t.id !== dso.id) });
    onClose();
  };

  return (
    <BottomSheet visible onClose={onClose} palette={palette}>
      <ScrollView>
        <View className="flex-row items-start">
          <View className="flex-1">
            <Text className="text-xl font-bold text-primary">{dso.commonName}</Text>
            <Text className="text-xs text-secondary">
              {dso.id} · {dso.constellation} · {dso.recommendedFocalLengthMm[0]}–{dso.recommendedFocalLengthMm[1]}mm
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <X size={22} color={palette.primary} />
          </Pressable>
        </View>

        {report.meridianFlipRequiredInWindow && (
          <View className="mt-3 rounded-lg border border-warn p-3">
            <Text className="text-sm font-bold text-warn">
              Meridian flip @ {formatTime(report.meridianTransitTime)}
            </Text>
            <Text className="mt-1 text-xs text-secondary">
              The target crosses the meridian mid-window. Check camera and lens clearance against the tripod legs and
              the tracker's declination bracket before then, and re-frame after the flip.
            </Text>
          </View>
        )}

        <View className="mt-4">
          <AltitudeChartSVG
            report={report}
            minHorizonDeg={minHorizonDeg}
            palette={palette}
            width={width - 32}
            interactive={isPro}
            onLockedPress={() => {
              onClose();
              openPaywall();
            }}
          />
        </View>
        <View className="mt-1 flex-row flex-wrap gap-x-4">
          <Text className="text-[10px] text-primary">━ target</Text>
          <Text className="text-[10px] text-secondary">┈ Moon</Text>
          <Text className="text-[10px] text-secondary">╌ {minHorizonDeg}° floor</Text>
          <Text className="text-[10px] text-warn">┊ transit</Text>
          <Text className="text-[10px] text-accent">▮ sweet spot</Text>
        </View>

        <View className="mt-4 rounded-xl border border-border bg-surface px-4 py-2">
          {rows.map(([k, v]) => (
            <View key={k} className="flex-row justify-between border-b border-border py-2">
              <Text className="text-xs text-secondary">{k}</Text>
              <Text className="font-mono text-xs text-primary">{v}</Text>
            </View>
          ))}
        </View>

        {dso.isCustom && (
          <View className="mt-4">
            <Button label="Remove custom target" onPress={removeCustom} />
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function CustomTargetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette, customTargets, update } = useAppStore();
  const [name, setName] = useState('');
  const [ra, setRa] = useState('');
  const [dec, setDec] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const raHours = parseAngle(ra);
    const decDeg = parseAngle(dec);
    if (!name.trim()) return setError('Give the target a name.');
    if (raHours === null || raHours < 0 || raHours >= 24) return setError('RA must be 0–24h (e.g. 10.75 or 10:45:08).');
    if (decDeg === null || Math.abs(decDeg) > 90)
      return setError('Dec must be −90° to +90° (e.g. -59.87 or -59 52 04).');
    const target: DSOObject = {
      id: `Custom ${name.trim()}`,
      commonName: name.trim(),
      type: 'Widefield',
      constellation: 'Custom',
      raHours,
      decDeg,
      sizeArcmin: 60,
      magnitude: 99,
      recommendedFocalLengthMm: [14, 600],
      hemisphereBias: decDeg < 0 ? 'SOUTH' : 'NORTH',
      isCustom: true,
    };
    update({ customTargets: [...customTargets.filter((t) => t.id !== target.id), target] });
    setName('');
    setRa('');
    setDec('');
    setError(null);
    onClose();
  };

  const inputClass = 'mt-1 rounded-lg border border-border px-3 py-2 font-mono text-primary';

  return (
    <BottomSheet visible={visible} onClose={onClose} palette={palette}>
      <Text className="text-lg font-bold text-primary">Custom target (J2000)</Text>
      <Text className="mt-3 text-xs text-secondary">Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Comet C/2026 A1"
        placeholderTextColor={palette.muted}
        className={inputClass}
      />
      <Text className="mt-3 text-xs text-secondary">Right Ascension (hours)</Text>
      <TextInput
        value={ra}
        onChangeText={setRa}
        placeholder="10:45:08"
        placeholderTextColor={palette.muted}
        keyboardType="numbers-and-punctuation"
        className={inputClass}
      />
      <Text className="mt-3 text-xs text-secondary">Declination (degrees)</Text>
      <TextInput
        value={dec}
        onChangeText={setDec}
        placeholder="-59 52 04"
        placeholderTextColor={palette.muted}
        keyboardType="numbers-and-punctuation"
        className={inputClass}
      />
      {error && <Text className="mt-2 text-xs text-warn">{error}</Text>}
      <View className="mt-4 flex-row gap-2">
        <View className="flex-1">
          <Button label="Cancel" onPress={onClose} />
        </View>
        <View className="flex-1">
          <Button label="Add target" variant="solid" onPress={save} />
        </View>
      </View>
    </BottomSheet>
  );
}
