import { triggerHaptic } from './capacitor';

const REST_AUDIO_KEY = (userId: string) => `gympaglu_rest_audio_v1_${userId || 'default'}`;

let sharedAudioCtx: AudioContext | null = null;

export function loadRestAudioEnabled(userId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(REST_AUDIO_KEY(userId));
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function saveRestAudioEnabled(userId: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REST_AUDIO_KEY(userId), String(enabled));
  } catch {
    // Ignore
  }
}

/**
 * Plays a crisp, non-intrusive two-tone gym rest chime offline via Web Audio API.
 */
export function playRestCompleteChime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return false;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtor();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }

    const now = sharedAudioCtx.currentTime;
    const playTone = (freq: number, startOffset: number, duration: number) => {
      if (!sharedAudioCtx) return;
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.22, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(587.33, 0, 0.18);
    playTone(880, 0.2, 0.28);
    return true;
  } catch {
    return false;
  }
}

export function triggerRestAlertFeedback(audioEnabled: boolean): void {
  if (audioEnabled) {
    playRestCompleteChime();
  }
  void triggerHaptic('heavy');
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([180, 90, 220]);
    } catch {
      // Ignore browser permission constraints
    }
  }
}
