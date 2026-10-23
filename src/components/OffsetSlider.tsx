import { useRef, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import type { Palette } from '@/theme/palette';

interface Props {
  value: number; // hours
  min: number;
  max: number;
  stepHours: number;
  palette: Palette;
  onChange: (hours: number) => void;
  /** Called instead of onChange when the control is locked. */
  onLockedPress?: () => void;
  locked?: boolean;
}

const THUMB = 22;

/** Minimal dependency-free horizontal slider with a centre (zero) mark. */
export default function OffsetSlider({ value, min, max, stepHours, palette, onChange, onLockedPress, locked }: Props) {
  const [width, setWidth] = useState(0);
  const last = useRef(value);
  last.current = value;

  const track = Math.max(1, width - THUMB);
  const toValue = (locationX: number) => {
    const f = Math.max(0, Math.min(1, (locationX - THUMB / 2) / track));
    return Math.round((min + f * (max - min)) / stepHours) * stepHours;
  };
  const handle = (e: GestureResponderEvent) => {
    const v = toValue(e.nativeEvent.locationX);
    if (v !== last.current) onChange(v);
  };

  const thumbLeft = ((value - min) / (max - min)) * track;
  const zeroLeft = ((0 - min) / (max - min)) * track + THUMB / 2;
  const fillFrom = Math.min(zeroLeft, thumbLeft + THUMB / 2);
  const fillWidth = Math.abs(thumbLeft + THUMB / 2 - zeroLeft);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => !locked}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => (locked ? onLockedPress?.() : handle(e))}
      onResponderMove={(e) => !locked && handle(e)}
      accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}
      style={{ height: 36, justifyContent: 'center', opacity: locked ? 0.45 : 1 }}
    >
      <View
        pointerEvents="none"
        style={{ height: 3, marginHorizontal: THUMB / 2, backgroundColor: palette.border, borderRadius: 2 }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: fillFrom,
          width: fillWidth,
          height: 3,
          backgroundColor: palette.secondary,
        }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: zeroLeft - 1, width: 2, height: 14, backgroundColor: palette.secondary }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: thumbLeft,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          borderWidth: 2,
          borderColor: palette.primary,
          backgroundColor: palette.bg,
        }}
      />
    </View>
  );
}
