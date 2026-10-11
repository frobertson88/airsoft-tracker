import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type LocationAccess = 'granted' | 'ask' | 'settings';

/** Location permission is required to join a Game Day (docs/app-flow.md §3). */
export async function requestLocationForJoin(): Promise<LocationAccess> {
  if (Platform.OS === 'web') return requestOnWeb();
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'settings';
  const next = await Location.requestForegroundPermissionsAsync();
  if (next.granted) return 'granted';
  return next.canAskAgain ? 'ask' : 'settings';
}

// Browsers only ask by trying to read a position, and a PC without GPS can wait on
// that forever. Only an explicit block counts as denied; a slow or failed fix still
// means permission was given.
function requestOnWeb(): Promise<LocationAccess> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve('settings');
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => resolve(err.code === err.PERMISSION_DENIED ? 'settings' : 'granted'),
      { timeout: 10000, maximumAge: Infinity },
    );
  });
}
