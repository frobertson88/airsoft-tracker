// Hosting: what the one person running the day needs before it starts.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Body, Button, List, ListRow, Screen } from '../components/ui';
import { colours } from '../theme';

export default function Hosting() {
  return (
    <Screen>
      <Body muted>Running the day? Set up your field first, then open a game day for players to join.</Body>

      <List>
        <ListRow
          title="Fields"
          detail="Draw a field once and reuse it"
          left={<Ionicons name="map-outline" size={20} color={colours.accent} />}
          onPress={() => router.push('/fields')}
        />
        <ListRow
          title="Games"
          detail="Set up games before the day, including Patrol missions"
          left={<Ionicons name="flag-outline" size={20} color={colours.accent} />}
          onPress={() => router.push('/games')}
        />
        <ListRow
          title="Medic rules"
          detail="Wounds, who can treat them and bleed-out"
          left={<Ionicons name="medkit-outline" size={20} color={colours.accent} />}
          onPress={() => router.push('/medic')}
        />
      </List>

      <Button title="Host a game day" onPress={() => router.push('/create')} />
    </Screen>
  );
}

