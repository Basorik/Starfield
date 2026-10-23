import type { ObserverLocation } from '@/types/astro';

const pad = (n: number) => String(n).padStart(2, '0');

/** "HH:MM" in the device time zone. */
export function formatTime(date: Date | null | undefined): string {
  if (!date) return '--:--';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDay(date: Date): string {
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatLatLon(loc: ObserverLocation): string {
  const lat = `${Math.abs(loc.latitude).toFixed(2)}° ${loc.latitude < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(loc.longitude).toFixed(2)}° ${loc.longitude < 0 ? 'W' : 'E'}`;
  return `${lat}, ${lon}`;
}

export function formatSignedHours(hours: number): string {
  const sign = hours < 0 ? '−' : '+';
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  return `${sign}${Math.floor(totalMinutes / 60)}h ${pad(totalMinutes % 60)}m`;
}

export function formatMagnitude(mag: number): string {
  return mag >= 30 ? '—' : mag.toFixed(1);
}

/** Device-local midnight for `date` plus `days`. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Parse decimal ("-59.87") or sexagesimal ("-59 52 04", "10:45:08", "10h45m08s")
 * input into a decimal number. Returns null when the text is not a number.
 */
export function parseAngle(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const negative = /^[-−]/.test(trimmed);
  const parts = trimmed
    .replace(/^[-−+]/, '')
    .split(/[\s:hmsd°'"′″]+/i)
    .filter(Boolean)
    .map(Number);
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.slice(1).some((p) => p >= 60)) return null;
  const value = parts[0] + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  return negative ? -value : value;
}
