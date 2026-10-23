import { Lock, Moon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { formatFocalRange } from '@/data/dsoCatalog';
import { MOON_IGNORE_FRACTION } from '@/engine/targetPlanner';
import { formatDuration, formatTime } from '@/lib/format';
import type { Palette } from '@/theme/palette';
import type { NightWindowReport } from '@/types/astro';

interface Props {
  report: NightWindowReport;
  rank: number;
  palette: Palette;
  locked?: boolean;
  onPress: () => void;
}

/** One-line Moon impact for the shooting window. */
export function describeMoon(report: NightWindowReport): string {
  const pct = report.moonIlluminationPct;
  if (pct < MOON_IGNORE_FRACTION * 100) return `Moon ${pct.toFixed(0)}% · no interference`;
  if (report.minMoonSeparationDeg === null) return `Moon ${pct.toFixed(0)}% · below horizon all window`;
  const upFor = report.moonUpMinutesInWindow > 0 ? ` · up ${formatDuration(report.moonUpMinutesInWindow)}` : '';
  return `Moon ${pct.toFixed(0)}% · ${report.minMoonSeparationDeg.toFixed(0)}° away${upFor}`;
}

function Badge({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'accent' | 'warn' }) {
  const toneClass =
    tone === 'warn'
      ? 'border-warn text-warn'
      : tone === 'accent'
        ? 'border-accent text-accent'
        : 'border-border text-secondary';
  return <Text className={`rounded-full border px-2 py-0.5 text-[11px] ${toneClass}`}>{children}</Text>;
}

export default function TargetCard({ report, rank, palette, locked, onPress }: Props) {
  const { dso } = report;
  const shootable = report.totalShootableMinutes > 0;

  if (locked) {
    return (
      <Pressable
        onPress={onPress}
        className="mb-2 flex-row items-center rounded-xl border border-border bg-surface px-4 py-3"
      >
        <Lock size={14} color={palette.secondary} />
        <Text className="ml-2 flex-1 text-sm text-secondary">
          #{rank} · {dso.type} in {dso.constellation}
        </Text>
        <Text className="text-xs text-secondary">{shootable ? formatDuration(report.totalShootableMinutes) : '—'}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className="mb-3 rounded-xl border border-border bg-surface p-4"
      style={{ opacity: shootable ? 1 : 0.45 }}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-base font-bold text-primary" numberOfLines={1}>
            {rank}. {dso.commonName}
          </Text>
          <Text className="mt-0.5 text-xs text-secondary">
            {dso.id} · {dso.constellation} · {dso.type}
          </Text>
        </View>
        <Badge>{formatFocalRange(dso)}</Badge>
      </View>

      <View className="mt-3 flex-row flex-wrap gap-2">
        {shootable ? (
          <Badge tone="accent">
            {`${formatTime(report.optimalStart)} – ${formatTime(report.optimalEnd)} (${formatDuration(report.totalShootableMinutes)})`}
          </Badge>
        ) : (
          <Badge>{`Below floor or not dark · max ${report.maxAltitudeDeg.toFixed(0)}°`}</Badge>
        )}
        {report.meridianFlipRequiredInWindow ? (
          <Badge tone="warn">{`Flip @ ${formatTime(report.meridianTransitTime)} (${report.maxAltitudeDeg.toFixed(0)}° Max Alt)`}</Badge>
        ) : (
          shootable && <Badge>{`Max ${report.maxAltitudeDeg.toFixed(0)}° · no flip`}</Badge>
        )}
      </View>

      <View className="mt-2 flex-row items-center">
        <Moon size={12} color={palette.secondary} />
        <Text className={`ml-1.5 text-xs ${report.moonPenalty > 0.35 ? 'text-warn' : 'text-secondary'}`}>
          {describeMoon(report)}
        </Text>
      </View>
    </Pressable>
  );
}
