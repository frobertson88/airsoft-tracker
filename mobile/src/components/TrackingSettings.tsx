// Location sharing status and the Battery saver switch (More and Host tabs).
import { StyleSheet, Switch, Text, View } from 'react-native';
import { TRACKING_LABEL, useTracking } from '../lib/tracking';
import { colours, fonts, space } from '../theme';
import { Body, Button, Card, Label } from './ui';

export function TrackingSettings() {
  const { status, batterySaver, setBatterySaver, retry } = useTracking();
  return (
    <>
      <Label>Location</Label>
      <Card style={{ gap: space.md }}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: status === 'sharing' ? colours.accent : colours.danger }]} />
          <Body muted={status === 'starting'}>{TRACKING_LABEL[status]}</Body>
        </View>
        {status === 'unavailable' && <Button title="Try again" variant="secondary" onPress={retry} />}
        <View style={styles.between}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.title}>Battery saver</Text>
            <Text style={styles.sub}>Sends your position about every 20 seconds instead of 5.</Text>
          </View>
          <Switch
            value={batterySaver}
            onValueChange={setBatterySaver}
            trackColor={{ true: colours.actionFill, false: colours.border }}
            thumbColor={batterySaver ? colours.accent : colours.textSecondary}
          />
        </View>
        <Text style={styles.sub}>Keep the app open on screen while you play. Sharing stops when the phone locks.</Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { color: colours.text, fontFamily: fonts.medium, fontSize: 16 },
  sub: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
});
