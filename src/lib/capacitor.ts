import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function initializeAndroidShell(backgroundColor = '#08090B'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Prevent WebView from drawing behind the system status bar on Android
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: backgroundColor });
  } catch {
    // Ignore when plugin isn't active in web browser
  }

  try {
    await Keyboard.setScroll({ isDisabled: false });
  } catch {
    // Ignore on web
  }
}

export async function updateStatusBarColor(backgroundColor: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setBackgroundColor({ color: backgroundColor });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Ignore on web
  }
}

export async function triggerHaptic(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const impact =
      style === 'heavy'
        ? ImpactStyle.Heavy
        : style === 'medium'
          ? ImpactStyle.Medium
          : ImpactStyle.Light;
    await Haptics.impact({ style: impact });
  } catch {
    // Ignore on web
  }
}

export function registerAndroidBackHandler(onBack: () => boolean): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  const listenerPromise = CapApp.addListener('backButton', ({ canGoBack }) => {
    const handled = onBack();
    if (!handled) {
      if (canGoBack) {
        window.history.back();
      } else {
        CapApp.exitApp();
      }
    }
  });

  return () => {
    void listenerPromise.then((handle) => handle.remove());
  };
}
