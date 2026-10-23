import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { RETICLE_FOV_RADIUS_DEG } from '@/engine/polarAlignment';
import type { Palette } from '@/theme/palette';
import type { PolarAlignmentState, ReticleType } from '@/types/astro';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  state: PolarAlignmentState;
  reticleType: ReticleType;
  palette: Palette;
  size: number;
}

// Perimeter order of the Octans trapezoid: σ → χ → υ → τ.
const TRAPEZOID_ORDER = [0, 1, 3, 2];
/** Radius of the schematic Polaris clock ring as a fraction of the reticle radius. */
const POLARIS_RING = 0.62;
const LABEL_MARGIN = 24;

const polar = (cx: number, cy: number, r: number, angleDeg: number) => {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
};

/** Label position `gap` px beyond (px, py) along the ray from (cx, cy). */
function outwardLabel(cx: number, cy: number, px: number, py: number, gap: number) {
  const dx = px - cx;
  const dy = py - cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const anchor: 'start' | 'middle' | 'end' = ux > 0.35 ? 'start' : ux < -0.35 ? 'end' : 'middle';
  return { x: px + ux * gap, y: py + uy * gap + 4, anchor };
}

function usePulse() {
  const value = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 0.85,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(value, {
          toValue: 0.25,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  return value;
}

function ClockRing({
  cx,
  cy,
  r,
  palette,
  labels,
}: {
  cx: number;
  cy: number;
  r: number;
  palette: Palette;
  labels: string[];
}) {
  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const angle = i * 6;
    const outer = polar(cx, cy, r, angle);
    const inner = polar(cx, cy, r - (major ? 14 : 6), angle);
    ticks.push(
      <Line
        key={`t${i}`}
        x1={outer.x}
        y1={outer.y}
        x2={inner.x}
        y2={inner.y}
        stroke={major ? palette.primary : palette.secondary}
        strokeWidth={major ? 2 : 1}
      />,
    );
  }
  const text = labels.map((label, i) => {
    const p = polar(cx, cy, r + 13, i * 30);
    const cardinal = i % 3 === 0;
    return (
      <SvgText
        key={`l${i}`}
        x={p.x}
        y={p.y + 4}
        fill={cardinal ? palette.primary : palette.secondary}
        fontSize={cardinal ? 13 : 10}
        fontWeight={cardinal ? 'bold' : 'normal'}
        textAnchor="middle"
      >
        {label}
      </SvgText>
    );
  });
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} stroke={palette.primary} strokeWidth={2} fill="none" />
      {ticks}
      {text}
    </G>
  );
}

function Crosshair({ cx, cy, r, palette }: { cx: number; cy: number; r: number; palette: Palette }) {
  const gap = 8;
  return (
    <G stroke={palette.muted} strokeWidth={1}>
      <Line x1={cx - r} y1={cy} x2={cx - gap} y2={cy} />
      <Line x1={cx + gap} y1={cy} x2={cx + r} y2={cy} />
      <Line x1={cx} y1={cy - r} x2={cx} y2={cy - gap} />
      <Line x1={cx} y1={cy + gap} x2={cx} y2={cy + r} />
      <Circle cx={cx} cy={cy} r={3} fill={palette.secondary} stroke="none" />
    </G>
  );
}

export default function ReticleSVG({ state, reticleType, palette, size }: Props) {
  const pulse = usePulse();
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - LABEL_MARGIN;
  const labels =
    reticleType === 'IOPTRON'
      ? Array.from({ length: 12 }, (_, i) => String(i))
      : Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i));

  if (state.hemisphere === 'NORTH') {
    const ringR = R * POLARIS_RING;
    const star = polar(cx, cy, ringR, state.clockFaceAngleDeg);
    return (
      <Svg
        width={size}
        height={size}
        accessibilityLabel={`Polaris at ${state.clockFaceString} on the polar scope dial`}
      >
        <Crosshair cx={cx} cy={cy} r={R} palette={palette} />
        <ClockRing cx={cx} cy={cy} r={R} palette={palette} labels={labels} />
        {/* Polaris ring with hour graduations, as etched on Sky-Watcher / iOptron reticles. */}
        <Circle cx={cx} cy={cy} r={ringR} stroke={palette.secondary} strokeWidth={1.5} fill="none" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = polar(cx, cy, ringR - 5, i * 30);
          const b = polar(cx, cy, ringR + 5, i * 30);
          return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={palette.secondary} strokeWidth={1} />;
        })}
        <Line x1={cx} y1={cy} x2={star.x} y2={star.y} stroke={palette.muted} strokeWidth={1} strokeDasharray="4 4" />
        <AnimatedCircle cx={star.x} cy={star.y} r={16} fill={palette.accent} opacity={pulse} />
        <Circle cx={star.x} cy={star.y} r={9} fill="none" stroke={palette.accent} strokeWidth={2} />
        <Circle cx={star.x} cy={star.y} r={4} fill={palette.primary} />
        <SvgText x={star.x} y={star.y - 20} fill={palette.primary} fontSize={12} fontWeight="bold" textAnchor="middle">
          Polaris
        </SvgText>
        <SvgText x={cx + 6} y={cy - 8} fill={palette.secondary} fontSize={9}>
          NCP
        </SvgText>
      </Svg>
    );
  }

  const stars = state.octansStarsScreenCoords.map((s) => ({ ...s, px: cx + s.x * R, py: cy - s.y * R }));
  const trapezoid = TRAPEZOID_ORDER.map((i) => `${stars[i].px},${stars[i].py}`).join(' ');
  const sigma = stars[0];

  return (
    <Svg
      width={size}
      height={size}
      accessibilityLabel={`Sigma Octantis at ${state.clockFaceString} on the polar scope dial`}
    >
      <Crosshair cx={cx} cy={cy} r={R} palette={palette} />
      {/* Concentric graduations every degree from the South Celestial Pole. */}
      {Array.from({ length: Math.floor(RETICLE_FOV_RADIUS_DEG) - 1 }, (_, i) => {
        const deg = i + 1;
        const r = (deg / RETICLE_FOV_RADIUS_DEG) * R;
        return (
          <G key={deg}>
            <Circle cx={cx} cy={cy} r={r} stroke={palette.muted} strokeWidth={1} strokeDasharray="2 5" fill="none" />
            <SvgText x={cx + 3} y={cy - r - 2} fill={palette.muted} fontSize={8}>
              {`${deg}°`}
            </SvgText>
          </G>
        );
      })}
      <ClockRing cx={cx} cy={cy} r={R} palette={palette} labels={labels} />
      <Polygon points={trapezoid} fill="none" stroke={palette.secondary} strokeWidth={1.25} strokeDasharray="5 4" />
      <Line x1={cx} y1={cy} x2={sigma.px} y2={sigma.py} stroke={palette.muted} strokeWidth={1} strokeDasharray="3 3" />
      <AnimatedCircle cx={sigma.px} cy={sigma.py} r={14} fill={palette.accent} opacity={pulse} />
      {stars.map((s, i) => {
        // Labels sit radially outward so they clear the pole marker and σ's halo.
        const label = outwardLabel(cx, cy, s.px, s.py, i === 0 ? 22 : 12);
        return (
          <G key={s.name}>
            <Circle cx={s.px} cy={s.py} r={2.5 + (6 - s.mag) * 1.6} fill={palette.primary} />
            <SvgText
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              fill={i === 0 ? palette.primary : palette.secondary}
              fontSize={i === 0 ? 12 : 10}
              fontWeight={i === 0 ? 'bold' : 'normal'}
            >
              {s.name}
            </SvgText>
          </G>
        );
      })}
      {(() => {
        // Put the pole label on the side away from σ Octantis.
        const p = outwardLabel(sigma.px, sigma.py, cx, cy, 12);
        return (
          <SvgText x={p.x} y={p.y} textAnchor={p.anchor} fill={palette.secondary} fontSize={9}>
            SCP
          </SvgText>
        );
      })()}
    </Svg>
  );
}
