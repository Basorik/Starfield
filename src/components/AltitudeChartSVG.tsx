import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { formatTime } from '@/lib/format';
import type { Palette } from '@/theme/palette';
import type { NightWindowReport } from '@/types/astro';

interface Props {
  report: NightWindowReport;
  minHorizonDeg: number;
  palette: Palette;
  width: number;
  height?: number;
  /** Pro: touch-and-drag inspector with a live readout. */
  interactive: boolean;
  onLockedPress?: () => void;
}

const PAD = { left: 30, right: 10, top: 10, bottom: 22 };
/** A touch that travels further than this is a scroll, not a tap. */
const TAP_SLOP_PX = 10;
const Y_MIN = -10;
const Y_MAX = 90;

type Band = 'day' | 'civil' | 'nautical' | 'astro' | 'night';
const BAND_OPACITY: Record<Band, number> = { day: 0.34, civil: 0.24, nautical: 0.15, astro: 0.08, night: 0 };

function bandFor(sunAlt: number): Band {
  if (sunAlt > 0) return 'day';
  if (sunAlt > -6) return 'civil';
  if (sunAlt > -12) return 'nautical';
  if (sunAlt > -18) return 'astro';
  return 'night';
}

export default function AltitudeChartSVG({
  report,
  minHorizonDeg,
  palette,
  width,
  height = 230,
  interactive,
  onLockedPress,
}: Props) {
  const [cursor, setCursor] = useState<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const { samples, sessionStart, sessionEnd } = report;
  const t0 = sessionStart.getTime();
  const span = sessionEnd.getTime() - t0;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const x = (t: Date) => PAD.left + ((t.getTime() - t0) / span) * plotW;
  const y = (alt: number) => PAD.top + ((Y_MAX - Math.max(Y_MIN, Math.min(Y_MAX, alt))) / (Y_MAX - Y_MIN)) * plotH;

  const bands = useMemo(() => {
    const out: { band: Band; from: Date; to: Date }[] = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const band = bandFor((samples[i].sunAltitudeDeg + samples[i + 1].sunAltitudeDeg) / 2);
      const last = out[out.length - 1];
      if (last && last.band === band) last.to = samples[i + 1].time;
      else out.push({ band, from: samples[i].time, to: samples[i + 1].time });
    }
    return out;
  }, [samples]);

  const hourTicks = useMemo(() => {
    const ticks: Date[] = [];
    const first = new Date(t0);
    first.setMinutes(0, 0, 0);
    for (let t = first.getTime() + 3_600_000; t < sessionEnd.getTime(); t += 3_600_000) ticks.push(new Date(t));
    return ticks;
  }, [t0, sessionEnd]);

  const targetPoints = samples.map((s) => `${x(s.time)},${y(s.targetAltitudeDeg)}`).join(' ');
  const moonPoints = samples.map((s) => `${x(s.time)},${y(s.moonAltitudeDeg)}`).join(' ');

  const handleTouch = (e: GestureResponderEvent) => {
    const fx = (e.nativeEvent.locationX - PAD.left) / plotW;
    const i = Math.round(Math.max(0, Math.min(1, fx)) * (samples.length - 1));
    setCursor(i);
  };

  const cursorSample = cursor !== null ? samples[cursor] : null;

  return (
    <View>
      {/* Pro: drag to scrub. Free: a tap (never a scroll that starts here) opens the paywall. */}
      <Pressable
        disabled={interactive}
        onPressIn={(e) => {
          pressStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        }}
        onPress={(e) => {
          const start = pressStart.current;
          const moved = start ? Math.hypot(e.nativeEvent.pageX - start.x, e.nativeEvent.pageY - start.y) : 0;
          if (moved <= TAP_SLOP_PX) onLockedPress?.();
        }}
        accessibilityRole={interactive ? 'adjustable' : 'button'}
        accessibilityLabel="Altitude chart"
      >
        <View
          onStartShouldSetResponder={() => interactive}
          onMoveShouldSetResponder={() => interactive}
          onResponderTerminationRequest={() => false}
          onResponderGrant={handleTouch}
          onResponderMove={handleTouch}
        >
          <Svg width={width} height={height}>
            {bands.map((b, i) =>
              BAND_OPACITY[b.band] > 0 ? (
                <Rect
                  key={i}
                  x={x(b.from)}
                  y={PAD.top}
                  width={Math.max(0, x(b.to) - x(b.from))}
                  height={plotH}
                  fill={palette.secondary}
                  opacity={BAND_OPACITY[b.band]}
                />
              ) : null,
            )}

            {report.optimalStart && report.optimalEnd && (
              <Rect
                x={x(report.optimalStart)}
                y={y(Y_MAX)}
                width={Math.max(1, x(report.optimalEnd) - x(report.optimalStart))}
                height={y(minHorizonDeg) - y(Y_MAX)}
                fill={palette.accent}
                opacity={0.16}
                stroke={palette.accent}
                strokeWidth={1}
                strokeOpacity={0.6}
              />
            )}

            {/* Altitude grid */}
            {[0, 30, 60, 90].map((alt) => (
              <G key={alt}>
                <Line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(alt)}
                  y2={y(alt)}
                  stroke={palette.border}
                  strokeWidth={alt === 0 ? 1.5 : 1}
                />
                <SvgText x={PAD.left - 4} y={y(alt) + 3} fill={palette.secondary} fontSize={9} textAnchor="end">
                  {`${alt}°`}
                </SvgText>
              </G>
            ))}

            {hourTicks.map((t, i) => (
              <G key={t.getTime()}>
                <Line x1={x(t)} x2={x(t)} y1={PAD.top + plotH} y2={PAD.top + plotH + 4} stroke={palette.secondary} />
                {i % 2 === 0 && (
                  <SvgText x={x(t)} y={height - 6} fill={palette.secondary} fontSize={9} textAnchor="middle">
                    {formatTime(t)}
                  </SvgText>
                )}
              </G>
            ))}

            <Line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(minHorizonDeg)}
              y2={y(minHorizonDeg)}
              stroke={palette.secondary}
              strokeWidth={1}
              strokeDasharray="6 4"
            />

            {report.transitInSession && (
              <G>
                <Line
                  x1={x(report.meridianTransitTime)}
                  x2={x(report.meridianTransitTime)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke={palette.warn}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                <SvgText x={x(report.meridianTransitTime) + 3} y={PAD.top + 9} fill={palette.warn} fontSize={9}>
                  HA 0h
                </SvgText>
              </G>
            )}

            <Polyline
              points={moonPoints}
              fill="none"
              stroke={palette.secondary}
              strokeWidth={1.5}
              strokeDasharray="1 4"
              strokeLinecap="round"
            />
            <Polyline
              points={targetPoints}
              fill="none"
              stroke={palette.primary}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />

            {cursorSample && (
              <G>
                <Line
                  x1={x(cursorSample.time)}
                  x2={x(cursorSample.time)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke={palette.primary}
                  strokeWidth={1}
                />
                <Rect
                  x={x(cursorSample.time) - 4}
                  y={y(cursorSample.targetAltitudeDeg) - 4}
                  width={8}
                  height={8}
                  fill={palette.primary}
                />
              </G>
            )}
          </Svg>
        </View>
      </Pressable>

      <View className="mt-2 min-h-[36px] flex-row flex-wrap gap-x-4 gap-y-1">
        {cursorSample ? (
          <>
            <Text className="font-mono text-xs text-primary">{formatTime(cursorSample.time)}</Text>
            <Text className="font-mono text-xs text-primary">Alt {cursorSample.targetAltitudeDeg.toFixed(1)}°</Text>
            <Text className="font-mono text-xs text-primary">Az {cursorSample.targetAzimuthDeg.toFixed(0)}°</Text>
            <Text className="font-mono text-xs text-secondary">Sun {cursorSample.sunAltitudeDeg.toFixed(0)}°</Text>
            <Text className="font-mono text-xs text-secondary">
              Moon {cursorSample.moonAltitudeDeg.toFixed(0)}° · {cursorSample.moonSeparationDeg.toFixed(0)}° away
            </Text>
          </>
        ) : (
          <Text className="text-xs text-secondary">
            {interactive
              ? 'Drag across the chart to inspect any moment.'
              : 'Pro: drag across the chart to inspect any moment.'}
          </Text>
        )}
      </View>
    </View>
  );
}
