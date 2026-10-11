// Shares this phone's position while you're in an open Game Day
// (docs/location-and-device-operation.md). Stage 3 tracks while the app is open;
// locked-screen tracking needs our own app build and comes later.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { requestLocationForJoin } from './location';

export type TrackingStatus = 'starting' | 'sharing' | 'unavailable' | 'error';

interface TrackingState {
  status: TrackingStatus;
  batterySaver: boolean;
  setBatterySaver: (on: boolean) => void;
  retry: () => void;
}

const TrackingContext = createContext<TrackingState | null>(null);
const SAVER_KEY = 'tracking.batterySaver';

// Normal: about every 5 seconds. Battery saver: about every 20 seconds.
const INTERVAL = { normal: 5000, saver: 20000 };

export function TrackingProvider({ dayId, children }: { dayId: string; children: ReactNode }) {
  const [status, setStatus] = useState<TrackingStatus>('starting');
  const [batterySaver, setSaver] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(SAVER_KEY)
      .then((v) => setSaver(v === '1'))
      .catch(() => {});
  }, []);

  const setBatterySaver = useCallback((on: boolean) => {
    setSaver(on);
    AsyncStorage.setItem(SAVER_KEY, on ? '1' : '0').catch(() => {});
  }, []);

  // Re-check permission when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setAttempt((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let watch: Location.LocationSubscription | null = null;
    let cancelled = false;
    let lastSent = 0;
    const every = batterySaver ? INTERVAL.saver : INTERVAL.normal;

    (async () => {
      try {
        // Location was allowed to join; this asks again only if it was turned off since.
        if ((await requestLocationForJoin()) !== 'granted') {
          setStatus('unavailable');
          return;
        }
        watch = await Location.watchPositionAsync(
          {
            accuracy: batterySaver ? Location.Accuracy.Balanced : Location.Accuracy.High,
            timeInterval: every,
            distanceInterval: 0,
          },
          (loc) => {
            const now = Date.now();
            if (now - lastSent < every - 500) return;
            lastSent = now;
            api
              .reportPosition(
                dayId,
                loc.coords.latitude,
                loc.coords.longitude,
                loc.coords.accuracy ?? null,
                new Date(loc.timestamp).toISOString(),
              )
              .then(
                () => !cancelled && setStatus('sharing'),
                () => !cancelled && setStatus('error'),
              );
          },
        );
        if (cancelled) watch.remove();
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      watch?.remove();
    };
  }, [dayId, batterySaver, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <TrackingContext.Provider value={{ status, batterySaver, setBatterySaver, retry }}>
      {children}
    </TrackingContext.Provider>
  );
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking outside TrackingProvider');
  return ctx;
}

export const TRACKING_LABEL: Record<TrackingStatus, string> = {
  starting: 'Starting location…',
  sharing: 'Sharing your location with your team',
  unavailable: 'Tracking unavailable: location is off for this app',
  error: 'Can’t reach the server. Retrying…',
};
