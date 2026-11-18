import { useEffect, useMemo, useState } from 'react';
import { Calculator, Flame, Plus } from 'lucide-react';
import {
  FormField,
  INPUT_CLASS,
  ModalSheet,
  PrimaryButton,
} from '../ui/Primitives';
import {
  BARBELL_PRESETS_KG,
  BARBELL_PRESETS_LB,
  calculatePlatesPerSide,
  DEFAULT_PLATES_KG,
  DEFAULT_PLATES_LB,
  generateWarmupSets,
  loadPlateCalculatorConfig,
  savePlateCalculatorConfig,
  type PlateCalculatorConfig,
} from '../../lib/plateCalculator';
import type { WeightUnit } from '../../types/database';

function getPlateColorClass(weight: number, unit: WeightUnit): string {
  if (unit === 'kg') {
    if (weight >= 25) return 'bg-rose-500 text-white h-16';
    if (weight >= 20) return 'bg-sky-500 text-white h-14';
    if (weight >= 15) return 'bg-amber-400 text-[#08090B] h-13';
    if (weight >= 10) return 'bg-emerald-500 text-[#08090B] h-11';
    if (weight >= 5) return 'bg-zinc-200 text-[#08090B] h-9';
    return 'bg-zinc-500 text-white h-8';
  }
  if (weight >= 45) return 'bg-sky-500 text-white h-16';
  if (weight >= 35) return 'bg-amber-400 text-[#08090B] h-14';
  if (weight >= 25) return 'bg-emerald-500 text-[#08090B] h-12';
  if (weight >= 10) return 'bg-zinc-200 text-[#08090B] h-10';
  return 'bg-zinc-500 text-white h-8';
}

export function PlateCalculatorModal({
  open,
  onClose,
  userId,
  defaultUnit,
  initialTargetDisplayWeight,
  exerciseName,
  onInsertWarmups,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  defaultUnit: WeightUnit;
  initialTargetDisplayWeight: number;
  exerciseName?: string;
  onInsertWarmups?: (warmups: Array<{ weight_kg: number; reps: number }>) => void;
}) {
  const [mode, setMode] = useState<'plates' | 'warmup'>('plates');
  const [unit, setUnit] = useState<WeightUnit>(defaultUnit);
  const [targetWeight, setTargetWeight] = useState<string>(
    String(initialTargetDisplayWeight > 0 ? initialTargetDisplayWeight : defaultUnit === 'kg' ? 60 : 135)
  );
  const [config, setConfig] = useState<PlateCalculatorConfig>(() =>
    loadPlateCalculatorConfig(userId)
  );

  useEffect(() => {
    if (!open) return;
    setUnit(defaultUnit);
    setConfig(loadPlateCalculatorConfig(userId));
    setTargetWeight(
      String(
        initialTargetDisplayWeight > 0
          ? initialTargetDisplayWeight
          : defaultUnit === 'kg'
            ? 60
            : 135
      )
    );
  }, [defaultUnit, initialTargetDisplayWeight, open, userId]);

  const barWeight = unit === 'kg' ? config.barWeightKg : config.barWeightLb;
  const allPlates = unit === 'kg' ? DEFAULT_PLATES_KG : DEFAULT_PLATES_LB;
  const enabledPlates = unit === 'kg' ? config.enabledPlatesKg : config.enabledPlatesLb;
  const barPresets = unit === 'kg' ? BARBELL_PRESETS_KG : BARBELL_PRESETS_LB;

  const updateConfig = (next: PlateCalculatorConfig) => {
    setConfig(next);
    savePlateCalculatorConfig(userId, next);
  };

  const setBarWeightForUnit = (val: number) => {
    const clean = Math.max(0, Number(val) || 0);
    updateConfig(
      unit === 'kg'
        ? { ...config, barWeightKg: clean }
        : { ...config, barWeightLb: clean }
    );
  };

  const togglePlate = (plate: number) => {
    const current = unit === 'kg' ? config.enabledPlatesKg : config.enabledPlatesLb;
    const exists = current.includes(plate);
    if (exists && current.length <= 1) return; // keep at least 1 plate option
    const nextList = exists
      ? current.filter((p) => p !== plate)
      : [...current, plate].sort((a, b) => b - a);
    updateConfig(
      unit === 'kg'
        ? { ...config, enabledPlatesKg: nextList }
        : { ...config, enabledPlatesLb: nextList }
    );
  };

  const parsedTarget = Math.max(0, parseFloat(targetWeight) || 0);

  const calculation = useMemo(
    () =>
      calculatePlatesPerSide({
        targetWeight: parsedTarget,
        barWeight,
        availablePlates: enabledPlates,
        unit,
      }),
    [barWeight, enabledPlates, parsedTarget, unit]
  );

  const warmups = useMemo(
    () =>
      generateWarmupSets({
        workingWeightDisplay: parsedTarget,
        barWeightDisplay: barWeight,
        availablePlates: enabledPlates,
        unit,
      }),
    [barWeight, enabledPlates, parsedTarget, unit]
  );

  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title={exerciseName ? `${exerciseName} · Bar & Warm-up` : 'Barbell Plate Calculator'}
    >
      <div className="space-y-4">
        {/* Mode Switch & Unit Switch */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D0F13] border border-white/10 flex-1">
            <button
              type="button"
              onClick={() => setMode('plates')}
              className={`min-h-[36px] flex-1 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 ${
                mode === 'plates' ? 'text-[#08090B]' : 'text-zinc-400 hover:text-white'
              }`}
              style={
                mode === 'plates'
                  ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                  : undefined
              }
            >
              <Calculator className="w-3.5 h-3.5" />
              Plates
            </button>
            <button
              type="button"
              onClick={() => setMode('warmup')}
              className={`min-h-[36px] flex-1 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 ${
                mode === 'warmup' ? 'text-[#08090B]' : 'text-zinc-400 hover:text-white'
              }`}
              style={
                mode === 'warmup'
                  ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                  : undefined
              }
            >
              <Flame className="w-3.5 h-3.5" />
              Warm-up Sets
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D0F13] border border-white/10">
            {(['kg', 'lb'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-mono-num font-bold uppercase ${
                  unit === u
                    ? 'bg-white/15 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Target Weight + Bar Weight */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label={mode === 'plates' ? `Target Weight (${unit.toUpperCase()})` : `Working Weight (${unit.toUpperCase()})`}>
            <input
              type="number"
              step="0.5"
              min={0}
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              className={`${INPUT_CLASS} font-mono-num text-center font-bold`}
            />
          </FormField>
          <FormField label={`Bar Weight (${unit.toUpperCase()})`}>
            <input
              type="number"
              step="0.5"
              min={0}
              value={barWeight}
              onChange={(e) => setBarWeightForUnit(parseFloat(e.target.value) || 0)}
              className={`${INPUT_CLASS} font-mono-num text-center`}
            />
          </FormField>
        </div>

        {/* Barbell Presets */}
        <div className="flex flex-wrap gap-1.5">
          {barPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setBarWeightForUnit(preset.weight)}
              className={`min-h-[32px] px-2.5 rounded-lg border text-[11px] font-medium transition-colors ${
                barWeight === preset.weight
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-white'
                  : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Available Plates Config */}
        <div className="space-y-1.5">
          <span className="block text-[11px] font-medium text-zinc-400">
            Available Plates ({unit.toUpperCase()})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {allPlates.map((plate) => {
              const active = enabledPlates.includes(plate);
              return (
                <button
                  key={plate}
                  type="button"
                  onClick={() => togglePlate(plate)}
                  className={`min-h-[32px] px-2.5 rounded-lg border text-xs font-mono-num font-semibold transition-colors ${
                    active
                      ? 'border-[var(--accent-primary)] text-white bg-white/[0.08]'
                      : 'border-white/10 text-zinc-600 bg-transparent line-through'
                  }`}
                >
                  {plate}
                </button>
              );
            })}
          </div>
        </div>

        {mode === 'plates' ? (
          <div className="rounded-2xl border border-white/10 bg-[#0D0F13] p-4 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">
                Load <strong className="text-white">Per Side</strong>
              </span>
              <span className="font-mono-num font-bold text-white">
                {calculation.perSideWeightLoaded} {unit.toUpperCase()} / side · Total{' '}
                <span style={{ color: 'var(--accent-primary)' }}>
                  {calculation.achievableWeight} {unit.toUpperCase()}
                </span>
              </span>
            </div>

            {calculation.belowBarWeight ? (
              <p className="text-xs text-amber-300">
                Target weight ({parsedTarget} {unit.toUpperCase()}) is lighter than your{' '}
                {barWeight} {unit.toUpperCase()} bar. Switch to a lighter bar or 0 for machine
                plates.
              </p>
            ) : calculation.platesPerSide.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-2">
                Empty bar only — no plates needed per side.
              </p>
            ) : (
              <>
                {/* Visual Barbell Sleeve Preview */}
                <div className="flex items-center justify-center gap-1 py-2 overflow-x-auto">
                  <div className="h-3 w-12 rounded-l-full bg-zinc-600 shrink-0" />
                  <div className="h-6 w-2 rounded-sm bg-zinc-400 shrink-0" />
                  {calculation.platesPerSide.flatMap((item) =>
                    Array.from({ length: item.countPerSide }, (_, idx) => (
                      <div
                        key={`${item.weight}-${idx}`}
                        className={`w-6 rounded-sm flex items-center justify-center text-[10px] font-mono-num font-bold shrink-0 ${getPlateColorClass(item.weight, unit)}`}
                      >
                        {item.weight}
                      </div>
                    ))
                  )}
                  <div className="h-2.5 w-8 rounded-r-full bg-zinc-600 shrink-0" />
                </div>

                {/* Breakdown List */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {calculation.platesPerSide.map((item) => (
                    <div
                      key={item.weight}
                      className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-between text-xs font-mono-num"
                    >
                      <span className="text-white font-bold">
                        {item.weight} {unit.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--accent-primary)' }}>
                        × {item.countPerSide}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {Math.abs(calculation.remainderTotal) > 0.05 && !calculation.belowBarWeight && (
              <p className="text-[11px] text-amber-300">
                Closest achievable load is {calculation.achievableWeight} {unit.toUpperCase()} (diff:{' '}
                {calculation.remainderTotal > 0 ? '+' : ''}
                {calculation.remainderTotal} {unit.toUpperCase()}).
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#0D0F13] p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Suggested Warm-Up Ramp</span>
              <span className="text-zinc-400 font-mono-num">
                Target {parsedTarget} {unit.toUpperCase()}
              </span>
            </div>

            {warmups.length === 0 ? (
              <p className="text-xs text-zinc-400 py-2">
                Enter a working weight above 0 to generate warm-up sets.
              </p>
            ) : (
              <div className="space-y-2">
                {warmups.map((w, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono-num font-bold text-[11px]">
                        W
                      </span>
                      <span className="text-zinc-300">{w.stepLabel}</span>
                      <span className="text-zinc-500 font-mono-num">({w.percentageLabel})</span>
                    </div>
                    <span className="font-mono-num font-bold text-white">
                      {w.weightDisplay} {unit.toUpperCase()} × {w.reps} reps
                    </span>
                  </div>
                ))}
              </div>
            )}

            {onInsertWarmups && warmups.length > 0 && (
              <PrimaryButton
                onClick={() => {
                  onInsertWarmups(
                    warmups.map((w) => ({ weight_kg: w.weightKg, reps: w.reps }))
                  );
                  onClose();
                }}
                className="w-full"
              >
                <Plus className="w-4 h-4" />
                Insert {warmups.length} Warm-Up Sets into {exerciseName || 'Exercise'}
              </PrimaryButton>
            )}
          </div>
        )}
      </div>
    </ModalSheet>
  );
}
