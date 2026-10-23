import Svg, { Circle, ClipPath, Defs, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { PoleFinderState, Vec2 } from '@/engine/poleFinder';
import type { Palette } from '@/theme/palette';

interface Props {
  finder: PoleFinderState;
  palette: Palette;
  size: number;
  /** Where the phone's camera points; `clamped` when it is off the chart edge. */
  aim?: (Vec2 & { clamped: boolean }) | null;
}

const MARGIN = 10;
// Stars with dense labels near the pole: only the brightest guide stars get names.
const UNLABELLED = new Set([
  'δ Cru',
  'Mimosa',
  'Hadar',
  'Megrez',
  'Phecda',
  'Alioth',
  'Mizar',
  'Pherkad',
  'Segin',
  'Ruchbah',
  'Caph',
]);
// Close pairs whose labels would collide get theirs on the left.
const LABEL_LEFT = new Set(['Gacrux', 'Merak']);
const LABEL_TEXT: Record<string, string> = { 'α Cen': 'α Cen & Hadar' };

/**
 * Naked-eye chart of the sky around the celestial pole, oriented as you see it
 * facing the pole (zenith up), with star-hop guides converging on the pole.
 */
export default function PoleFinderSVG({ finder, palette, size, aim }: Props) {
  const c = size / 2;
  const R = size / 2 - MARGIN;
  const px = (x: number) => c + x * R;
  const py = (y: number) => c - y * R;
  const isSouth = finder.hemisphere === 'SOUTH';

  return (
    <Svg width={size} height={size} accessibilityLabel="Pole finder star chart">
      <Defs>
        <ClipPath id="chart">
          <Circle cx={c} cy={c} r={R} />
        </ClipPath>
      </Defs>

      <Circle cx={c} cy={c} r={R} stroke={palette.border} strokeWidth={1.5} fill="none" />
      {[10, 20, 30].map((deg) => (
        <Circle
          key={deg}
          cx={c}
          cy={c}
          r={(deg / finder.radiusDeg) * R}
          stroke={palette.muted}
          strokeWidth={1}
          strokeDasharray="2 6"
          fill="none"
        />
      ))}

      <G clipPath="url(#chart)">
        {/* Horizon (altitude 0°); anything below it is drawn dimmed. */}
        {finder.horizon.map((segment, i) => (
          <Polyline
            key={`h${i}`}
            points={segment.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
            fill="none"
            stroke={palette.secondary}
            strokeWidth={2}
          />
        ))}

        {finder.guides.map((g) => (
          <Line
            key={g.label}
            x1={px(g.from.x)}
            y1={py(g.from.y)}
            x2={px(g.to.x)}
            y2={py(g.to.y)}
            stroke={palette.secondary}
            strokeWidth={1}
            strokeDasharray="6 5"
          />
        ))}

        {finder.lines.map(([a, b]) => (
          <Line
            key={`${a}-${b}`}
            x1={px(finder.stars[a].x)}
            y1={py(finder.stars[a].y)}
            x2={px(finder.stars[b].x)}
            y2={py(finder.stars[b].y)}
            stroke={palette.primary}
            strokeOpacity={0.6}
            strokeWidth={1.25}
          />
        ))}

        {finder.stars.map((s) => {
          const below = s.altitudeDeg < 0;
          const opacity = below ? 0.35 : 1;
          if (s.radius) {
            return (
              <G key={s.name} opacity={opacity}>
                <Circle cx={px(s.x)} cy={py(s.y)} r={s.radius * R} fill={palette.secondary} opacity={0.25} />
                <SvgText x={px(s.x)} y={py(s.y) + 3} fill={palette.secondary} fontSize={9} textAnchor="middle">
                  {s.name}
                </SvgText>
              </G>
            );
          }
          return (
            <G key={s.name} opacity={opacity}>
              <Circle cx={px(s.x)} cy={py(s.y)} r={Math.max(1.2, 4.2 - s.mag * 0.8)} fill={palette.primary} />
              {!UNLABELLED.has(s.name) &&
                (() => {
                  const left = LABEL_LEFT.has(s.name) || s.x > 0.55;
                  return (
                    <SvgText
                      x={px(s.x) + (left ? -6 : 6)}
                      y={py(s.y) - 5}
                      textAnchor={left ? 'end' : 'start'}
                      fill={palette.secondary}
                      fontSize={10}
                    >
                      {LABEL_TEXT[s.name] ?? s.name}
                    </SvgText>
                  );
                })()}
            </G>
          );
        })}
      </G>

      {/* The pole itself */}
      <Line x1={c - 8} y1={c} x2={c + 8} y2={c} stroke={palette.accent} strokeWidth={1.5} />
      <Line x1={c} y1={c - 8} x2={c} y2={c + 8} stroke={palette.accent} strokeWidth={1.5} />
      <Circle cx={c} cy={c} r={12} stroke={palette.accent} strokeWidth={1} fill="none" />
      <Rect x={c + 14} y={c + 6} width={30} height={13} fill={palette.bg} opacity={0.8} />
      <SvgText x={c + 16} y={c + 16} fill={palette.accent} fontSize={10} fontWeight="bold">
        {isSouth ? 'SCP' : 'NCP'}
      </SvgText>

      {aim && (
        <G>
          <Line
            x1={px(aim.x)}
            y1={py(aim.y)}
            x2={c}
            y2={c}
            stroke={palette.primary}
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <Circle
            cx={px(aim.x)}
            cy={py(aim.y)}
            r={16}
            stroke={palette.primary}
            strokeWidth={2}
            strokeDasharray={aim.clamped ? '4 4' : undefined}
            fill="none"
          />
          {[0, 90, 180, 270].map((deg) => {
            const a = (deg * Math.PI) / 180;
            return (
              <Line
                key={deg}
                x1={px(aim.x) + 16 * Math.sin(a)}
                y1={py(aim.y) - 16 * Math.cos(a)}
                x2={px(aim.x) + 24 * Math.sin(a)}
                y2={py(aim.y) - 24 * Math.cos(a)}
                stroke={palette.primary}
                strokeWidth={2}
              />
            );
          })}
          <SvgText x={px(aim.x)} y={py(aim.y) + 36} fill={palette.primary} fontSize={9} textAnchor="middle">
            PHONE
          </SvgText>
        </G>
      )}

      <SvgText x={c} y={MARGIN + 12} fill={palette.secondary} fontSize={10} textAnchor="middle">
        ↑ zenith
      </SvgText>
    </Svg>
  );
}
