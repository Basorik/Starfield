import * as Haptics from 'expo-haptics';
import { Crosshair, Minus, Plus, Search, Snowflake } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { BottomSheet } from '@/components/ui';
import {
  STAR_COUNT,
  aimGuidance,
  apply,
  azAltToEnu,
  basisLookingAt,
  buildSkyFrame,
  cameraDirection,
  enuToAzAlt,
  namedStarObjects,
  projectDevice,
  starLabel,
  starMagnitude,
  type Mat3,
  type SkyObject,
  type SkyObjectKind,
} from '@/engine/skyView';
import type { Vec3 } from '@/engine/poleFinder';
import { useDeviceOrientation } from '@/lib/useDeviceOrientation';
import type { Palette } from '@/theme/palette';
import type { DSOObject, ObserverLocation } from '@/types/astro';

interface Props {
  location: ObserverLocation;
  date: Date;
  dsos: readonly DSOObject[];
  palette: Palette;
  width: number;
  height: number;
}

const FOVS = [25, 45, 70, 100];
const CENTRED_DEG = 2;
const EDGE_INSET = 22;
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const KIND_ORDER: SkyObjectKind[] = ['pole', 'moon', 'planet', 'dso', 'star'];
const KIND_TITLE: Record<SkyObjectKind, string> = {
  pole: 'Alignment',
  moon: 'Moon',
  planet: 'Planets',
  dso: 'Deep-sky targets',
  star: 'Bright stars',
};

/** Faintest magnitude drawn and the label thresholds for a field of view. */
function limitsFor(fov: number) {
  if (fov <= 30) return { stars: 5.8, names: 3.5, desig: 4.8, maxLabels: 60 };
  if (fov <= 50) return { stars: 5.0, names: 3.0, desig: 3.8, maxLabels: 55 };
  if (fov <= 75) return { stars: 4.3, names: 2.5, desig: 0, maxLabels: 50 };
  return { stars: 3.6, names: 1.8, desig: 0, maxLabels: 40 };
}

const cameraAzAlt = (basis: Mat3) => {
  const c = enuToAzAlt(cameraDirection(basis));
  return { az: c.azimuthDeg, alt: c.altitudeDeg };
};

interface LabelCandidate {
  key: string;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  /** Lower is placed first and wins collisions. */
  priority: number;
  anchor?: 'start' | 'middle';
  opacity?: number;
  bold?: boolean;
}

type Box = [number, number, number, number];

const labelBox = (l: LabelCandidate): Box => {
  const w = l.text.length * l.size * 0.58;
  const x0 = l.anchor === 'middle' ? l.x - w / 2 : l.x;
  return [x0 - 2, l.y - l.size - 1, x0 + w + 2, l.y + 3];
};
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Greedy de-cluttering: keep labels in priority order unless they collide with one already placed. */
function placeLabels(candidates: LabelCandidate[], reserved: Box[], max: number): LabelCandidate[] {
  const placed: Box[] = [...reserved];
  const out: LabelCandidate[] = [];
  for (const l of [...candidates].sort((a, b) => a.priority - b.priority)) {
    if (out.length >= max) break;
    const box = labelBox(l);
    if (placed.some((p) => overlaps(p, box))) continue;
    placed.push(box);
    out.push(l);
  }
  return out;
}

const describeTurn = (turn: number, raise: number) =>
  [
    Math.abs(turn) >= 1 && `turn ${turn > 0 ? 'right' : 'left'} ${Math.abs(turn).toFixed(0)}°`,
    Math.abs(raise) >= 1 && `${raise > 0 ? 'raise' : 'lower'} ${Math.abs(raise).toFixed(0)}°`,
  ]
    .filter(Boolean)
    .join(', ');

/**
 * Planetarium view of the patch of sky the phone points at (Stellarium-style),
 * with an arrow and directions to the chosen target. Without motion sensors it
 * falls back to drag-to-pan.
 */
export default function SkyView({ location, date, dsos, palette, width, height }: Props) {
  const [fov, setFov] = useState(70);
  const [frozen, setFrozen] = useState(false);
  const [goalId, setGoalId] = useState('pole');
  const [picking, setPicking] = useState(false);
  const [manualView, setManualView] = useState<{ az: number; alt: number } | null>(null);

  const { basis: liveBasis, hasDeclination, compassAccuracy, unavailable } = useDeviceOrientation(!frozen);
  const frozenBasis = useRef<Mat3 | null>(null);
  if (!frozen && liveBasis) frozenBasis.current = liveBasis;

  const frame = useMemo(() => buildSkyFrame(location, date, dsos), [location, date, dsos]);
  const stars = useMemo(() => namedStarObjects(frame), [frame]);
  const allObjects = useMemo(() => [...frame.objects, ...stars], [frame, stars]);
  const goal = allObjects.find((o) => o.id === goalId) ?? frame.objects[0];

  // Without sensors (web, or none on the device) start looking at the target and allow panning.
  // With sensors, "Hold" freezes the view and then lets you drag to look around.
  const manual = !!unavailable || manualView !== null;
  const canDrag = !!unavailable || frozen || manualView !== null;
  const fallbackView = useMemo(() => {
    const g = enuToAzAlt(goal.enu);
    return { az: g.azimuthDeg, alt: Math.max(5, g.altitudeDeg) };
  }, [goal]);
  const sensorBasis = frozen ? frozenBasis.current : (liveBasis ?? frozenBasis.current);
  const view = manualView ?? fallbackView;
  const basis: Mat3 | null = manual ? basisLookingAt(view.az, view.alt) : sensorBasis;

  const f = width / 2 / Math.tan((fov / 2) * (Math.PI / 180));
  const cx = width / 2;
  const cy = height / 2;
  const toScreen = (v: Vec3) => {
    const p = projectDevice(apply(basis!, v.x, v.y, v.z), f);
    return { x: cx + p.x, y: cy - p.y, inFront: p.inFront };
  };
  const onScreen = (p: { x: number; y: number; inFront: boolean }, pad = 0) =>
    p.inFront && p.x >= -pad && p.x <= width + pad && p.y >= -pad && p.y <= height + pad;

  const guidance = basis ? aimGuidance(basis, goal.enu) : null;
  const centred = guidance !== null && guidance.separationDeg <= CENTRED_DEG;
  const wasCentred = useRef(false);
  useEffect(() => {
    if (centred && !wasCentred.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    wasCentred.current = centred;
  }, [centred]);

  // Drag to pan in manual mode: dragging the sky moves the view the other way.
  const dragStart = useRef<{ x: number; y: number; az: number; alt: number } | null>(null);
  const degPerPx = fov / width;
  const onGrant = (e: GestureResponderEvent) => {
    const from = manualView ?? (basis ? cameraAzAlt(basis) : fallbackView);
    dragStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, az: from.az, alt: from.alt };
  };
  const onMove = (e: GestureResponderEvent) => {
    const s = dragStart.current;
    if (!s) return;
    setManualView({
      az: (((s.az - (e.nativeEvent.pageX - s.x) * degPerPx) % 360) + 360) % 360,
      alt: Math.max(-30, Math.min(89, s.alt + (e.nativeEvent.pageY - s.y) * degPerPx)),
    });
  };

  const svg = basis ? renderSky() : null;

  function renderSky() {
    const limits = limitsFor(fov);
    const nodes: ReactNode[] = [];
    const labels: LabelCandidate[] = [];

    // Constellation figures, batched into one path (far cheaper to redraw than hundreds of lines).
    let figures = '';
    for (const polys of frame.lines) {
      for (const poly of polys) {
        for (let k = 0; k + 5 < poly.length; k += 3) {
          const a = toScreen({ x: poly[k], y: poly[k + 1], z: poly[k + 2] });
          const b = toScreen({ x: poly[k + 3], y: poly[k + 4], z: poly[k + 5] });
          if (!a.inFront || !b.inFront || (!onScreen(a, 40) && !onScreen(b, 40))) continue;
          figures += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        }
      }
    }
    if (figures) nodes.push(<Path key="figures" d={figures} stroke={palette.muted} strokeWidth={1} fill="none" />);
    if (fov >= 40) {
      frame.constellationLabels.forEach((c, i) => {
        const p = toScreen(c.enu);
        if (!onScreen(p, -10)) return;
        labels.push({
          key: `cl${i}`,
          x: p.x,
          y: p.y,
          text: c.name.toUpperCase(),
          size: 10,
          color: palette.muted,
          priority: 9,
          anchor: 'middle',
        });
      });
    }

    // Horizon and compass points.
    const horizon: string[][] = [[]];
    for (let az = 0; az <= 360; az += 3) {
      const p = toScreen(azAltToEnu(az, 0));
      if (p.inFront && onScreen(p, width)) horizon[horizon.length - 1].push(`${p.x},${p.y}`);
      else if (horizon[horizon.length - 1].length) horizon.push([]);
    }
    horizon.forEach((pts, i) => {
      if (pts.length < 2) return;
      nodes.push(
        <Polyline key={`h${i}`} points={pts.join(' ')} fill="none" stroke={palette.secondary} strokeWidth={2} />,
      );
    });
    CARDINALS.forEach((label, i) => {
      const p = toScreen(azAltToEnu(i * 45, 0));
      if (!onScreen(p, -12)) return;
      nodes.push(
        <SvgText
          key={`k${label}`}
          x={p.x}
          y={p.y + 16}
          fill={palette.primary}
          fontSize={label.length === 1 ? 14 : 11}
          fontWeight="bold"
          textAnchor="middle"
        >
          {label}
        </SvgText>,
      );
    });

    // Stars, brightest first, batched into one path per size (and horizon side).
    const starPaths = new Map<string, string>();
    for (let i = 0; i < STAR_COUNT; i++) {
      const mag = starMagnitude(i);
      if (mag > limits.stars) break;
      const v = { x: frame.stars[i * 3], y: frame.stars[i * 3 + 1], z: frame.stars[i * 3 + 2] };
      const p = toScreen(v);
      if (!onScreen(p, 4)) continue;
      const below = v.z < 0;
      const r = Math.round(Math.min(5.5, Math.max(0.8, (limits.stars + 1.2 - mag) * 0.8)) * 2) / 2;
      const bucket = `${r}|${below ? 1 : 0}`;
      starPaths.set(
        bucket,
        (starPaths.get(bucket) ?? '') +
          `M${(p.x - r).toFixed(1)} ${p.y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`,
      );
      const label = starLabel(i);
      const show = label && (mag <= limits.names || (limits.desig > 0 && mag <= limits.desig));
      if (show) {
        labels.push({
          key: `sl${i}`,
          x: p.x + r + 3,
          y: p.y - r - 1,
          text: label,
          size: mag <= 1.5 ? 12 : 10,
          color: palette.secondary,
          priority: 3 + mag / 10,
          opacity: below ? 0.5 : 1,
        });
      }
    }

    starPaths.forEach((d, bucket) =>
      nodes.push(
        <Path key={`stars${bucket}`} d={d} fill={palette.primary} opacity={bucket.endsWith('|1') ? 0.35 : 1} />,
      ),
    );

    // Pole, Moon, planets, deep-sky targets.
    frame.objects.forEach((o) => {
      const p = toScreen(o.enu);
      if (!onScreen(p, 10)) return;
      if (o.kind === 'dso' && fov > 80) return;
      const isGoal = o.id === goal.id;
      if (o.kind === 'pole') {
        nodes.push(
          <G key={o.id}>
            <Line x1={p.x - 9} y1={p.y} x2={p.x + 9} y2={p.y} stroke={palette.accent} strokeWidth={1.5} />
            <Line x1={p.x} y1={p.y - 9} x2={p.x} y2={p.y + 9} stroke={palette.accent} strokeWidth={1.5} />
          </G>,
        );
      } else if (o.kind === 'moon') {
        nodes.push(<Circle key={o.id} cx={p.x} cy={p.y} r={9} fill={palette.secondary} stroke={palette.primary} />);
      } else if (o.kind === 'planet') {
        nodes.push(<Circle key={o.id} cx={p.x} cy={p.y} r={3.5} fill={palette.accent} />);
      } else {
        nodes.push(
          <Circle
            key={o.id}
            cx={p.x}
            cy={p.y}
            r={6}
            fill="none"
            stroke={palette.secondary}
            strokeWidth={1}
            strokeDasharray="2 2"
          />,
        );
      }
      if (!isGoal) {
        labels.push({
          key: `ol${o.id}`,
          x: p.x + 10,
          y: p.y + 4,
          text: o.kind === 'pole' ? (location.latitude >= 0 ? 'NCP' : 'SCP') : o.name,
          size: 10,
          color: o.kind === 'dso' ? palette.secondary : palette.primary,
          priority: { pole: 0, moon: 1, planet: 2, dso: 5, star: 3 }[o.kind],
        });
      }
    });

    // Goal: ring when visible, edge arrow when not.
    const g = toScreen(goal.enu);
    const goalName = goal.kind === 'pole' ? (location.latitude >= 0 ? 'NCP' : 'SCP') : goal.name;
    const reserved: Box[] = [[cx - 24, cy - 24, cx + 24, cy + 24]];
    let goalNode: ReactNode;
    if (onScreen(g, -EDGE_INSET)) {
      reserved.push([g.x - 20, g.y - 20, g.x + 20, g.y + 20]);
      reserved.push(
        labelBox({ key: '', x: g.x, y: g.y - 24, text: goalName, size: 12, color: '', priority: 0, anchor: 'middle' }),
      );
      goalNode = (
        <G key="goal">
          <Circle cx={g.x} cy={g.y} r={18} stroke={palette.accent} strokeWidth={2} fill="none" />
          <SvgText x={g.x} y={g.y - 24} fill={palette.accent} fontSize={12} fontWeight="bold" textAnchor="middle">
            {goalName}
          </SvgText>
        </G>
      );
    } else {
      const d = apply(basis!, goal.enu.x, goal.enu.y, goal.enu.z);
      // Screen direction towards the target (behind the phone still points the right way round).
      const angle = Math.atan2(-d.y, d.x);
      const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
      const halfW = cx - EDGE_INSET;
      const halfH = cy - EDGE_INSET;
      const t = Math.min(
        Math.abs(ux) > 1e-6 ? halfW / Math.abs(ux) : Infinity,
        Math.abs(uy) > 1e-6 ? halfH / Math.abs(uy) : Infinity,
      );
      const [ax, ay] = [cx + ux * t, cy + uy * t];
      const tip = { x: ax + ux * 14, y: ay + uy * 14 };
      const left = { x: ax - uy * 9, y: ay + ux * 9 };
      const right = { x: ax + uy * 9, y: ay - ux * 9 };
      goalNode = (
        <G key="goal">
          <Polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`} fill={palette.accent} />
          <SvgText
            x={ax - ux * 18}
            y={ay - uy * 18 + 4}
            fill={palette.accent}
            fontSize={11}
            fontWeight="bold"
            textAnchor={ux > 0.3 ? 'end' : ux < -0.3 ? 'start' : 'middle'}
          >
            {goalName}
          </SvgText>
        </G>
      );
    }

    const placed = placeLabels(labels, reserved, limits.maxLabels);

    return (
      <Svg width={width} height={height}>
        {nodes}
        {placed.map((l) => (
          <SvgText
            key={l.key}
            x={l.x}
            y={l.y}
            fill={l.color}
            fontSize={l.size}
            fontWeight={l.bold ? 'bold' : 'normal'}
            textAnchor={l.anchor ?? 'start'}
            opacity={l.opacity ?? 1}
          >
            {l.text}
          </SvgText>
        ))}
        {/* Where the phone points */}
        <Circle cx={cx} cy={cy} r={12} stroke={palette.primary} strokeWidth={1.5} fill="none" />
        <Line x1={cx - 22} y1={cy} x2={cx - 14} y2={cy} stroke={palette.primary} strokeWidth={1.5} />
        <Line x1={cx + 14} y1={cy} x2={cx + 22} y2={cy} stroke={palette.primary} strokeWidth={1.5} />
        <Line x1={cx} y1={cy - 22} x2={cx} y2={cy - 14} stroke={palette.primary} strokeWidth={1.5} />
        <Line x1={cx} y1={cy + 14} x2={cx} y2={cy + 22} stroke={palette.primary} strokeWidth={1.5} />
        {goalNode}
      </Svg>
    );
  }

  const zoom = (dir: 1 | -1) => {
    const i = FOVS.indexOf(fov);
    setFov(FOVS[Math.max(0, Math.min(FOVS.length - 1, i + dir))]);
  };

  return (
    <View>
      <View
        className="overflow-hidden rounded-xl border border-border bg-bg"
        style={[{ width, height }, Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null]}
        onStartShouldSetResponder={() => canDrag}
        onMoveShouldSetResponder={() => canDrag}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        accessibilityLabel="Sky view"
      >
        {svg ?? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-sm text-secondary">
              Hold the phone up towards the sky — waiting for the compass and tilt sensors…
            </Text>
          </View>
        )}
        <View className="absolute right-2 top-2 gap-2">
          <Pressable
            onPress={() => zoom(-1)}
            accessibilityLabel="Zoom in"
            className="rounded-full border border-border bg-bg p-2"
          >
            <Plus size={16} color={palette.primary} />
          </Pressable>
          <Pressable
            onPress={() => zoom(1)}
            accessibilityLabel="Zoom out"
            className="rounded-full border border-border bg-bg p-2"
          >
            <Minus size={16} color={palette.primary} />
          </Pressable>
        </View>
        <Text className="absolute left-2 top-2 font-mono text-[10px] text-secondary">{fov}° FOV</Text>
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          className="flex-1 flex-row items-center rounded-full border border-primary px-3 py-2"
        >
          <Search size={14} color={palette.primary} />
          <Text className="ml-2 flex-1 text-sm text-primary" numberOfLines={1}>
            {goal.name}
          </Text>
        </Pressable>
        {!unavailable && (
          <Pressable
            onPress={() => {
              setManualView(null);
              setFrozen(!frozen);
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: frozen }}
            className={`flex-row items-center rounded-full border px-3 py-2 ${frozen ? 'border-primary' : 'border-border'}`}
          >
            <Snowflake size={14} color={frozen ? palette.primary : palette.secondary} />
            <Text className={`ml-1 text-xs ${frozen ? 'text-primary' : 'text-secondary'}`}>Hold</Text>
          </Pressable>
        )}
        {!unavailable && manualView && (
          <Pressable
            onPress={() => {
              setManualView(null);
              setFrozen(false);
            }}
            className="flex-row items-center rounded-full border border-border px-3 py-2"
          >
            <Crosshair size={14} color={palette.secondary} />
            <Text className="ml-1 text-xs text-secondary">Live</Text>
          </Pressable>
        )}
      </View>

      {guidance && (
        <View className="mt-3 rounded-xl border border-border bg-surface p-4">
          <Text className={`text-lg font-bold ${centred ? 'text-accent' : 'text-primary'}`}>
            {centred
              ? `On ${goal.kind === 'pole' ? 'the pole' : goal.name}`
              : `${describeTurn(guidance.turnDeg, guidance.raiseDeg) || 'Almost there'}`}
          </Text>
          <Text className="mt-1 font-mono text-xs text-secondary">
            {goal.kind === 'pole' ? 'Pole' : goal.name} az {guidance.target.azimuthDeg.toFixed(0)}° alt{' '}
            {guidance.target.altitudeDeg.toFixed(0)}° · {guidance.separationDeg.toFixed(1)}° away
            {guidance.target.altitudeDeg < 0 ? ' · below horizon' : ''}
          </Text>
          <Text className="mt-1 font-mono text-xs text-secondary">
            {manual ? 'View' : 'Phone'} az {guidance.camera.azimuthDeg.toFixed(0)}° alt{' '}
            {guidance.camera.altitudeDeg.toFixed(0)}°
            {manual || frozen ? ' · drag to look around' : hasDeclination ? ' · true north' : ' · magnetic north'}
          </Text>
          {unavailable && <Text className="mt-2 text-xs text-warn">{unavailable} Drag the view to look around.</Text>}
          {!manual && compassAccuracy !== null && compassAccuracy < 2 && (
            <Text className="mt-2 text-xs text-warn">Compass needs calibrating: move the phone in a figure-8.</Text>
          )}
          {!manual && (
            <Text className="mt-2 text-xs text-secondary">
              Hold the phone up and look "through" it: the BACK CAMERA points at the sky shown here. Keep clear of
              metal.
            </Text>
          )}
        </View>
      )}

      <TargetPicker
        visible={picking}
        objects={allObjects}
        palette={palette}
        onClose={() => setPicking(false)}
        onPick={(o) => {
          setGoalId(o.id);
          setManualView(null);
          setPicking(false);
        }}
      />
    </View>
  );
}

function TargetPicker({
  visible,
  objects,
  palette,
  onClose,
  onPick,
}: {
  visible: boolean;
  objects: SkyObject[];
  palette: Palette;
  onClose: () => void;
  onPick: (o: SkyObject) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const sections = KIND_ORDER.map((kind) => ({
    kind,
    items: objects
      .filter((o) => o.kind === kind && (!q || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)))
      .sort((a, b) => enuToAzAlt(b.enu).altitudeDeg - enuToAzAlt(a.enu).altitudeDeg),
  })).filter((s) => s.items.length);

  return (
    <BottomSheet visible={visible} onClose={onClose} palette={palette}>
      <Text className="text-lg font-bold text-primary">Point me at…</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search stars, planets, targets"
        placeholderTextColor={palette.muted}
        autoCorrect={false}
        className="mt-3 rounded-lg border border-border px-3 py-2 text-primary"
      />
      <ScrollView className="mt-2" keyboardShouldPersistTaps="handled">
        {sections.map((s) => (
          <View key={s.kind} className="mt-3">
            <Text className="mb-1 text-[11px] font-bold uppercase tracking-widest text-secondary">
              {KIND_TITLE[s.kind]}
            </Text>
            {s.items.slice(0, q ? 30 : s.kind === 'star' ? 25 : 40).map((o) => {
              const alt = enuToAzAlt(o.enu).altitudeDeg;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => onPick(o)}
                  className="flex-row items-center border-b border-border py-2.5"
                  style={{ opacity: alt < 0 ? 0.45 : 1 }}
                >
                  <Text className="flex-1 text-sm text-primary">{o.name}</Text>
                  <Text className="font-mono text-xs text-secondary">
                    {alt < 0 ? 'below horizon' : `alt ${alt.toFixed(0)}°`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        {!sections.length && <Text className="mt-4 text-sm text-secondary">Nothing matches “{query}”.</Text>}
      </ScrollView>
    </BottomSheet>
  );
}
