import type { HeightUnit, WeightUnit } from '../types/database';

const KG_TO_LB = 2.20462262;
const CM_TO_IN = 0.39370079;

export function toDisplayWeight(weightKg: number, unit: WeightUnit): number {
  if (unit === 'lb') {
    return Math.round(weightKg * KG_TO_LB * 10) / 10;
  }
  return Math.round(weightKg * 10) / 10;
}

export function toCanonicalWeightKg(displayWeight: number, unit: WeightUnit): number {
  if (!Number.isFinite(displayWeight) || displayWeight < 0) return 0;
  if (unit === 'lb') {
    return Math.round((displayWeight / KG_TO_LB) * 100) / 100;
  }
  return Math.round(displayWeight * 100) / 100;
}

export function formatWeight(weightKg: number | null | undefined, unit: WeightUnit): string {
  if (weightKg === null || weightKg === undefined || Number.isNaN(weightKg)) return '—';
  return `${toDisplayWeight(weightKg, unit)} ${unit.toUpperCase()}`;
}

export function formatHeight(heightCm: number | null | undefined, unit: HeightUnit): string {
  if (!heightCm) return '—';
  if (unit === 'ft') {
    const totalInches = Math.round(heightCm * CM_TO_IN);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
  }
  return `${Math.round(heightCm)} cm`;
}

export function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  const remSecs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${remMins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${String(remSecs).padStart(2, '0')}s`;
  }
  return `${remSecs}s`;
}

export function estimateOneRepMaxKg(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return Math.round(weightKg * 10) / 10;
  // Epley formula
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}
