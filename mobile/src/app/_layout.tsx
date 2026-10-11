import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../lib/auth';
import { colours, fonts } from '../theme';

function RootStack() {
  const { loading, session, profile } = useAuth();
  if (loading) return <Loading />;

  const signedIn = !!session;
  const ready = signedIn && !!profile;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colours.background },
        headerTintColor: colours.text,
        headerTitleStyle: { fontFamily: fonts.semibold },
        contentStyle: { backgroundColor: colours.background },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !profile}>
        <Stack.Screen name="callsign" options={{ title: 'Your callsign' }} />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ title: 'Host a game day' }} />
        <Stack.Screen name="join" options={{ title: 'Join Game Day' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="day/[id]" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.display]: require('../../assets/fonts/BarlowCondensed-Bold.ttf'),
    [fonts.displaySemi]: require('../../assets/fonts/BarlowCondensed-SemiBold.ttf'),
    [fonts.regular]: require('../../assets/fonts/IBMPlexSans-Regular.ttf'),
    [fonts.medium]: require('../../assets/fonts/IBMPlexSans-Medium.ttf'),
    [fonts.semibold]: require('../../assets/fonts/IBMPlexSans-SemiBold.ttf'),
  });
  // If a font fails to load, carry on with system fonts rather than block the app.
  if (!fontsLoaded && !fontError) return <Loading />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
