import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, type ColorValue } from 'react-native';
import { AssignmentSetup } from '../../../components/AssignmentSetup';
import { Body, Button, Loading, Screen, Title } from '../../../components/ui';
import { DayProvider, useDay } from '../../../lib/day';
import { goHome } from '../../../lib/nav';
import { colours, fonts } from '../../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

// Days where this admin chose to host without playing (kept for this app session).
const hostOnly = new Set<string>();

function DayGate() {
  const { data, error, me } = useDay();
  if (!data) {
    return error ? (
      <Screen edges={['top', 'bottom']}>
        <Body>{error}</Body>
        <Button title="Home" onPress={goHome} />
      </Screen>
    ) : (
      <Loading />
    );
  }

  if (data.day.status === 'closed') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Title>{data.day.name}</Title>
        <Body>This Game Day is closed.</Body>
        <Button title="Home" onPress={goHome} />
      </Screen>
    );
  }

  if (!me || me.status !== 'active') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Title>{data.day.name}</Title>
        <Body>
          {me?.status === 'removed'
            ? 'You were removed from this Game Day. Ask an admin to readmit you.'
            : 'You are not in this Game Day.'}
        </Body>
        <Button title="Home" onPress={goHome} />
      </Screen>
    );
  }

  return <ActiveDay initiallyAssigned={!!me.day_role && !!me.team_id} />;
}

// Mounted once the player is an active member of an open day.
function ActiveDay({ initiallyAssigned }: { initiallyAssigned: boolean }) {
  const { id, data, me, isAdmin } = useDay();
  // Setup counts as done if role + team were already set on arrival,
  // or once the player taps "Enter lobby".
  const [setupDone, setSetupDone] = useState(() => initiallyAssigned || hostOnly.has(id));
  if (!data || !me) return null;

  const assigned = !!me.day_role && !!me.team_id;
  if (!setupDone || (!assigned && !(isAdmin && hostOnly.has(id)))) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Title>Check in</Title>
        <Body muted>{data.day.name}</Body>
        <AssignmentSetup doneTitle="Check in" onDone={() => setSetupDone(true)} />
        {isAdmin && !assigned && (
          <Button
            title="Host only — not playing"
            variant="secondary"
            onPress={() => {
              hostOnly.add(id);
              setSetupDone(true);
            }}
          />
        )}
        <Button title="Home" variant="secondary" onPress={goHome} />
      </Screen>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colours.background },
        headerTintColor: colours.text,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
        headerTitle: data.day.name.toUpperCase(),
        headerLeft: () => (
          <Pressable onPress={goHome} style={{ paddingHorizontal: 16 }} accessibilityRole="button">
            <Text style={{ color: colours.accent, fontFamily: fonts.regular, fontSize: 16 }}>Home</Text>
          </Pressable>
        ),
        tabBarStyle: { backgroundColor: colours.background, borderTopColor: colours.border },
        tabBarActiveTintColor: colours.accent,
        tabBarInactiveTintColor: colours.textSecondary,
        tabBarLabelStyle: { fontFamily: fonts.medium },
        sceneStyle: { backgroundColor: colours.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Game', tabBarIcon: icon('radio-button-on-outline') }} />
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: icon('map-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('scan-outline') }} />
      <Tabs.Screen name="team" options={{ title: 'Squad', tabBarIcon: icon('people-outline') }} />
      {/* Admins get Host in place of More (docs/app-flow.md §5). */}
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: icon('menu-outline'), href: isAdmin ? null : undefined }}
      />
      <Tabs.Screen
        name="host"
        options={{ title: 'Host', tabBarIcon: icon('flag-outline'), href: isAdmin ? undefined : null }}
      />
    </Tabs>
  );
}

export default function DayLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DayProvider id={id}>
      <DayGate />
    </DayProvider>
  );
}
