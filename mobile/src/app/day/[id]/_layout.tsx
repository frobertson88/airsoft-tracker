import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, Vibration, type ColorValue } from 'react-native';
import { AssignmentSetup } from '../../../components/AssignmentSetup';
import { Body, Button, Loading, Screen, Title } from '../../../components/ui';
import { api } from '../../../lib/api';
import { DayProvider, useDay } from '../../../lib/day';
import { clockFor, useServerNow, type GameState } from '../../../lib/game';
import { goHome } from '../../../lib/nav';
import { TrackingProvider } from '../../../lib/tracking';
import { colours, fonts } from '../../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

// Keeps the game moving on time and buzzes the phone when its state changes.
// The backend advances lazily, so when this phone's projected clock says a
// countdown or timed game is over, it nudges the backend with tick_game.
function GameWatcher() {
  const { data, reload, me } = useDay();
  const now = useServerNow(500);
  const game = data?.game ?? null;
  const projected = game ? clockFor(game, now).state : null;
  const ticked = useRef({ key: '', at: 0 });
  const last = useRef<{ id: string; state: GameState } | null>(null);

  useEffect(() => {
    if (!game || !projected || projected === game.state) return;
    const key = `${game.id}:${game.state}:${projected}`;
    // Retry every couple of seconds in case the server's clock is a touch behind.
    if (ticked.current.key === key && now - ticked.current.at < 2000) return;
    ticked.current = { key, at: now };
    api.tickGame(game.id).then(reload, () => {});
  }, [game, projected, now, reload]);

  useEffect(() => {
    if (!game || !projected) return;
    const prev = last.current;
    last.current = { id: game.id, state: projected };
    if (!prev || prev.id !== game.id || prev.state === projected) return;
    if (projected === 'live' || projected === 'paused' || projected === 'complete') {
      Vibration.vibrate(projected === 'complete' ? [0, 400, 200, 400] : 400);
    }
  }, [game, projected]);

  // Buzz when an admin moves you to another team (e.g. a shuffle).
  const lastTeam = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const team = me?.team_id ?? null;
    if (lastTeam.current !== undefined && team && team !== lastTeam.current) Vibration.vibrate(400);
    lastTeam.current = team;
  }, [me?.team_id]);

  // King of the Hill: buzz when the hill moves or changes hands.
  const koth = data?.koth ?? null;
  const lastHill = useRef('');
  useEffect(() => {
    if (!koth || koth.result) return;
    const key = `${koth.game_id}:${koth.hill_number}:${koth.control}:${koth.holder_team_id ?? ''}`;
    const prev = lastHill.current;
    lastHill.current = key;
    if (prev && prev !== key && prev.startsWith(koth.game_id)) Vibration.vibrate([0, 150, 100, 150]);
  }, [koth]);

  return null;
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
        <Title>{setupDone ? 'Pick your team' : 'Check in'}</Title>
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
    <TrackingProvider dayId={id}>
      <GameWatcher />
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
    </TrackingProvider>
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
