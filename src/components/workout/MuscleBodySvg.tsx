import React from 'react';
import { MUSCLE_REGION_META, type MuscleRegionId } from '../../lib/muscleAnatomy';
import type { HeuristicRecoveryStatus } from '../../lib/muscleAnalytics';

export type MuscleBodyMode = 'highlight' | 'recovery';

export interface MuscleBodySvgProps {
  mode?: MuscleBodyMode;
  primaryMuscles?: MuscleRegionId[];
  secondaryMuscles?: MuscleRegionId[];
  recoveryByMuscle?: Partial<Record<MuscleRegionId, HeuristicRecoveryStatus>>;
  trainedMuscles?: MuscleRegionId[];
  selectedMuscle?: MuscleRegionId | null;
  onSelectMuscle?: (muscleId: MuscleRegionId) => void;
  compact?: boolean;
  showLegend?: boolean;
}

const REGION_PALETTE = {
  inactiveFill: '#222834',
  inactiveStroke: '#364054',
  primaryFill: 'var(--accent-primary, #C4F82A)',
  primaryStroke: '#E5FF80',
  secondaryFill: '#38BDF8',
  secondaryStroke: '#7DD3FC',
  freshFill: '#10B981',
  freshStroke: '#6EE7B7',
  recoveringFill: '#F59E0B',
  recoveringStroke: '#FCD34D',
  fatiguedFill: '#F43F5E',
  fatiguedStroke: '#FDA4AF',
};

interface MuscleShapeGroup {
  id: MuscleRegionId;
  paths: string[];
}

const FRONT_MUSCLES: MuscleShapeGroup[] = [
  {
    id: 'neck',
    paths: ['M101,45 L119,45 L122,63 L110,69 L98,63 Z'],
  },
  {
    id: 'traps',
    paths: [
      'M98,63 L73,73 L94,77 Z',
      'M122,63 L147,73 L126,77 Z',
    ],
  },
  {
    id: 'front_delts',
    paths: [
      'M73,73 C59,76 54,91 58,107 L72,103 C75,91 77,82 82,77 Z',
      'M147,73 C161,76 166,91 162,107 L148,103 C145,91 143,82 138,77 Z',
    ],
  },
  {
    id: 'chest',
    paths: [
      'M83,78 L108,82 L108,113 C95,115 79,110 74,99 C76,89 79,82 83,78 Z',
      'M137,78 L112,82 L112,113 C125,115 141,110 146,99 C144,89 141,82 137,78 Z',
    ],
  },
  {
    id: 'biceps',
    paths: [
      'M58,109 L71,106 C73,123 69,140 62,150 L50,146 C51,132 54,119 58,109 Z',
      'M162,109 L149,106 C147,123 151,140 158,150 L170,146 C169,132 166,119 162,109 Z',
    ],
  },
  {
    id: 'forearms',
    paths: [
      'M49,152 L61,155 C59,174 51,192 43,202 L35,197 C39,180 43,165 49,152 Z',
      'M171,152 L159,155 C161,174 169,192 177,202 L185,197 C181,180 177,165 171,152 Z',
    ],
  },
  {
    id: 'abs',
    paths: [
      // Rectus abdominis upper/mid/lower segments + obliques
      'M95,117 L108,117 L108,133 L95,133 Z',
      'M112,117 L125,117 L125,133 L112,133 Z',
      'M95,136 L108,136 L108,153 L96,153 Z',
      'M112,136 L125,136 L124,153 L112,153 Z',
      'M96,156 L108,156 L108,187 L98,178 Z',
      'M112,156 L124,156 L122,178 L112,187 Z',
      'M78,116 L92,121 L91,175 L80,183 C76,161 76,136 78,116 Z',
      'M142,116 L128,121 L129,175 L140,183 C144,161 144,136 142,116 Z',
    ],
  },
  {
    id: 'quads',
    paths: [
      'M79,196 L106,204 L103,292 L82,292 C73,262 72,224 79,196 Z',
      'M141,196 L114,204 L117,292 L138,292 C147,262 148,224 141,196 Z',
    ],
  },
  {
    id: 'calves',
    paths: [
      'M82,312 L100,312 C101,341 96,367 92,388 L82,388 C77,364 77,336 82,312 Z',
      'M138,312 L120,312 C119,341 124,367 128,388 L138,388 C143,364 143,336 138,312 Z',
    ],
  },
];

const BACK_MUSCLES: MuscleShapeGroup[] = [
  {
    id: 'neck',
    paths: ['M100,45 L120,45 L122,63 L98,63 Z'],
  },
  {
    id: 'traps',
    paths: ['M98,64 L122,64 L145,74 L122,95 L110,137 L98,95 L75,74 Z'],
  },
  {
    id: 'rear_delts',
    paths: [
      'M75,74 C60,78 55,92 59,106 L74,102 C77,92 80,82 84,78 Z',
      'M145,74 C160,78 165,92 161,106 L146,102 C143,92 140,82 136,78 Z',
    ],
  },
  {
    id: 'triceps',
    paths: [
      'M58,108 L73,105 C73,123 68,141 61,150 L50,146 C51,132 54,118 58,108 Z',
      'M162,108 L147,105 C147,123 152,141 159,150 L170,146 C169,132 166,118 162,108 Z',
    ],
  },
  {
    id: 'forearms',
    paths: [
      'M49,152 L61,155 C59,174 51,192 43,202 L35,197 C39,180 43,165 49,152 Z',
      'M171,152 L159,155 C161,174 169,192 177,202 L185,197 C181,180 177,165 171,152 Z',
    ],
  },
  {
    id: 'lats',
    paths: [
      'M75,103 L96,97 L108,139 L94,166 L80,155 C75,138 73,118 75,103 Z',
      'M145,103 L124,97 L112,139 L126,166 L140,155 C145,138 147,118 145,103 Z',
    ],
  },
  {
    id: 'lower_back',
    paths: [
      'M95,142 L108,140 L108,185 L92,184 Z',
      'M125,142 L112,140 L112,185 L128,184 Z',
    ],
  },
  {
    id: 'glutes',
    paths: [
      'M82,188 L108,190 L108,228 C95,232 78,224 76,208 C77,199 79,192 82,188 Z',
      'M138,188 L112,190 L112,228 C125,232 142,224 144,208 C143,199 141,192 138,188 Z',
    ],
  },
  {
    id: 'hamstrings',
    paths: [
      'M78,233 C88,237 100,236 106,233 L103,294 L82,294 C76,274 75,253 78,233 Z',
      'M142,233 C132,237 120,236 114,233 L117,294 L138,294 C144,274 145,253 142,233 Z',
    ],
  },
  {
    id: 'calves',
    paths: [
      'M81,311 L102,311 C104,339 99,365 93,388 L82,388 C76,363 76,335 81,311 Z',
      'M139,311 L118,311 C116,339 121,365 127,388 L138,388 C144,363 144,335 139,311 Z',
    ],
  },
];

function resolveRegionColors(
  id: MuscleRegionId,
  opts: Pick<
    MuscleBodySvgProps,
    'mode' | 'primaryMuscles' | 'secondaryMuscles' | 'recoveryByMuscle' | 'trainedMuscles' | 'selectedMuscle'
  >
): { fill: string; stroke: string; opacity: number } {
  const isSelected = opts.selectedMuscle === id;

  if (opts.mode === 'recovery') {
    const trained = opts.trainedMuscles?.includes(id) ?? false;
    const status = opts.recoveryByMuscle?.[id];
    if (!trained) {
      return {
        fill: REGION_PALETTE.inactiveFill,
        stroke: isSelected ? '#FFFFFF' : REGION_PALETTE.inactiveStroke,
        opacity: isSelected ? 1 : 0.85,
      };
    }
    if (status === 'fatigued') {
      return {
        fill: REGION_PALETTE.fatiguedFill,
        stroke: isSelected ? '#FFFFFF' : REGION_PALETTE.fatiguedStroke,
        opacity: 0.92,
      };
    }
    if (status === 'recovering') {
      return {
        fill: REGION_PALETTE.recoveringFill,
        stroke: isSelected ? '#FFFFFF' : REGION_PALETTE.recoveringStroke,
        opacity: 0.9,
      };
    }
    return {
      fill: REGION_PALETTE.freshFill,
      stroke: isSelected ? '#FFFFFF' : REGION_PALETTE.freshStroke,
      opacity: 0.88,
    };
  }

  const isPrimary = opts.primaryMuscles?.includes(id) ?? false;
  const isSecondary = !isPrimary && (opts.secondaryMuscles?.includes(id) ?? false);

  if (isPrimary) {
    return {
      fill: REGION_PALETTE.primaryFill,
      stroke: isSelected ? '#FFFFFF' : REGION_PALETTE.primaryStroke,
      opacity: 0.95,
    };
  }
  if (isSecondary) {
    return {
      fill: REGION_PALETTE.secondaryFill,
      stroke: isSelected ? '#FFFFFF' : REGION_PALETTE.secondaryStroke,
      opacity: 0.82,
    };
  }
  return {
    fill: REGION_PALETTE.inactiveFill,
    stroke: isSelected ? '#FFFFFF' : REGION_PALETTE.inactiveStroke,
    opacity: isSelected ? 0.95 : 0.78,
  };
}

function BodySilhouetteBase({ side }: { side: 'front' | 'back' }) {
  return (
    <g aria-hidden="true">
      {/* Head */}
      <ellipse cx="110" cy="26" rx="15" ry="19" fill="#151922" stroke="#2D3546" strokeWidth="1.4" />
      {/* Base torso/arms/legs silhouette */}
      <path
        d="M98,46 L122,46 L148,73 C162,76 168,92 164,112 L173,152 L187,199 L174,205 L157,154 L145,118 L143,192 L147,238 L141,298 L143,392 L124,392 L119,302 L110,234 L101,302 L96,392 L77,392 L79,298 L73,238 L77,192 L75,118 L63,154 L46,205 L33,199 L47,152 L56,112 C52,92 58,76 72,73 Z"
        fill="#131720"
        stroke="#272F40"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Subtle hands & feet */}
      <ellipse cx="38" cy="209" rx="5.5" ry="8" fill="#151922" stroke="#272F40" strokeWidth="1.2" />
      <ellipse cx="182" cy="209" rx="5.5" ry="8" fill="#151922" stroke="#272F40" strokeWidth="1.2" />
      <path d="M77,392 L96,392 L95,405 L73,405 Z" fill="#151922" stroke="#272F40" strokeWidth="1.2" />
      <path d="M124,392 L143,392 L147,405 L125,405 Z" fill="#151922" stroke="#272F40" strokeWidth="1.2" />
      {/* Subtle knee joints */}
      {side === 'front' ? (
        <>
          <ellipse cx="91" cy="301" rx="8" ry="6" fill="#181D28" stroke="#2D3546" strokeWidth="1" />
          <ellipse cx="129" cy="301" rx="8" ry="6" fill="#181D28" stroke="#2D3546" strokeWidth="1" />
        </>
      ) : (
        <>
          <line x1="81" y1="301" x2="101" y2="301" stroke="#2D3546" strokeWidth="1.2" />
          <line x1="119" y1="301" x2="139" y2="301" stroke="#2D3546" strokeWidth="1.2" />
        </>
      )}
    </g>
  );
}

export function MuscleBodySvg({
  mode = 'highlight',
  primaryMuscles = [],
  secondaryMuscles = [],
  recoveryByMuscle,
  trainedMuscles = [],
  selectedMuscle = null,
  onSelectMuscle,
  compact = false,
  showLegend = true,
}: MuscleBodySvgProps) {
  const interactive = typeof onSelectMuscle === 'function';

  const handleKey = (e: React.KeyboardEvent, id: MuscleRegionId) => {
    if (!onSelectMuscle) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectMuscle(id);
    }
  };

  const renderHalf = (side: 'front' | 'back', groups: MuscleShapeGroup[]) => (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 220 415"
        role="img"
        aria-label={`Anatomical ${side} muscle diagram`}
        className={compact ? 'w-32 sm:w-36 h-auto select-none' : 'w-40 sm:w-48 h-auto select-none'}
      >
        <BodySilhouetteBase side={side} />
        {groups.map((grp) => {
          const colors = resolveRegionColors(grp.id, {
            mode,
            primaryMuscles,
            secondaryMuscles,
            recoveryByMuscle,
            trainedMuscles,
            selectedMuscle,
          });
          const meta = MUSCLE_REGION_META[grp.id];
          const isSelected = selectedMuscle === grp.id;
          return (
            <g
              key={`${side}-${grp.id}`}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={meta.label}
              aria-pressed={interactive ? isSelected : undefined}
              onClick={interactive ? () => onSelectMuscle?.(grp.id) : undefined}
              onKeyDown={interactive ? (e) => handleKey(e, grp.id) : undefined}
              className={
                interactive
                  ? 'cursor-pointer transition-opacity duration-150 hover:opacity-100 focus:outline-none'
                  : undefined
              }
            >
              <title>{meta.label}</title>
              {grp.paths.map((d, idx) => (
                <path
                  key={`${grp.id}-${idx}`}
                  d={d}
                  fill={colors.fill}
                  fillOpacity={colors.opacity}
                  stroke={colors.stroke}
                  strokeWidth={isSelected ? 2 : 1.15}
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}
      </svg>
      <span className="text-[11px] font-medium text-zinc-400 mt-1">
        {side === 'front' ? 'Front View' : 'Back View'}
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:gap-5 items-center justify-items-center rounded-2xl border border-white/[0.08] bg-[#0B0D12] p-3 sm:p-4">
        {renderHalf('front', FRONT_MUSCLES)}
        {renderHalf('back', BACK_MUSCLES)}
      </div>

      {showLegend && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300 px-0.5">
          {mode === 'highlight' ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm inline-block"
                  style={{ backgroundColor: 'var(--accent-primary, #C4F82A)' }}
                />
                Primary Target
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block bg-sky-400" />
                Secondary Synergist
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500" />
                Fresh
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block bg-amber-500" />
                Recovering
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block bg-rose-500" />
                Potentially Fatigued
              </span>
            </div>
          )}

          {interactive && (
            <span className="text-zinc-500">Tap any muscle to inspect or filter</span>
          )}
        </div>
      )}
    </div>
  );
}
