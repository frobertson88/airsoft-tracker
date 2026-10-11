// Map tab: the day's field with your own position (docs/field-library.md).
// Sharing positions with your team comes with tracking in Stage 3.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FieldMap, type FieldMapHandle } from '../../../components/FieldMap';
import { Body, Button, Screen } from '../../../components/ui';
import { useDay } from '../../../lib/day';
import { colours, fonts, radius, space } from '../../../theme';

export default function MapTab() {
  const { id, data, isAdmin } = useDay();
  const mapRef = useRef<FieldMapHandle>(null);
  if (!data) return null;

  const field = data.field;
  if (!field) {
    return (
      <Screen>
        <Body>No field picked yet.</Body>
        <Body muted>{isAdmin ? 'Choose one on the Host tab.' : 'The host will pick one before the first game.'}</Body>
        {isAdmin && <Button title="Go to Host" variant="quiet" onPress={() => router.navigate(`/day/${id}/host`)} />}
      </Screen>
    );
  }

  const goToMe = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude, latDelta: 0.004, lngDelta: 0.004 });
    } catch {
      // Location off: the map just stays where it is.
    }
  };

  return (
    <View style={styles.screen}>
      <FieldMap ref={mapRef} data={field.data} showsUserLocation={Platform.OS !== 'web'} />
      <View style={styles.banner} pointerEvents="none">
        <Text style={styles.fieldName}>{field.name}</Text>
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: 'rgba(255,159,69,0.6)' }]} />
          <Text style={styles.legendText}>No-go</Text>
          <View style={[styles.swatch, styles.swatchDashed]} />
          <Text style={styles.legendText}>Danger</Text>
        </View>
      </View>
      <View style={styles.fabs}>
        <Pressable onPress={() => mapRef.current?.fit()} accessibilityRole="button" accessibilityLabel="Show whole field" style={styles.fab}>
          <Ionicons name="scan-outline" size={22} color={colours.text} />
        </Pressable>
        <Pressable onPress={goToMe} accessibilityRole="button" accessibilityLabel="Go to my location" style={styles.fab}>
          <Ionicons name="locate" size={22} color={colours.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background },
  banner: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    right: space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(11,16,12,0.85)',
    borderRadius: radius,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  fieldName: { color: colours.text, fontFamily: fonts.display, fontSize: 18, textTransform: 'uppercase', flexShrink: 1 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendText: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 12, marginRight: space.xs },
  swatch: { width: 14, height: 14, borderRadius: 3, borderColor: colours.danger, borderWidth: 1 },
  swatchDashed: { borderStyle: 'dashed', borderWidth: 2 },
  fabs: { position: 'absolute', right: space.md, bottom: space.md, gap: space.sm },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colours.surface,
    borderColor: colours.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
