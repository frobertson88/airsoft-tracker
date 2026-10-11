// Hosting: what the one person running the day needs before it starts.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Screen } from '../components/ui';
import { colours, fonts, radius, space } from '../theme';

export default function Hosting() {
  return (
    <Screen>
      <Body muted>Running the day? Set up your field first, then open a game day for players to join.</Body>

      <Pressable
        onPress={() => router.push('/fields')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="map-outline" size={20} color={colours.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fields</Text>
          <Text style={styles.meta}>Draw a field once and reuse it</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colours.textSecondary} />
      </Pressable>

      <Button title="Host a game day" onPress={() => router.push('/create')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.md,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colours.border,
    backgroundColor: colours.surface,
  },
  title: { color: colours.text, fontFamily: fonts.semibold, fontSize: 16 },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
});
