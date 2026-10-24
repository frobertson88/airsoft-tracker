// Location sharing status and the Battery saver switch (More and Host tabs), as
// list rows (docs/design-direction.md, List rows).
import { StyleSheet, Switch, Text } from 'react-native';
import { TRACKING_LABEL, useTracking } from '../lib/tracking';
import { colours, fonts } from '../theme';
import { Button, Label, List, ListRow, useOpenRow } from './ui';

/** The rows on their own, to sit in another List. */
export function TrackingRows() {
  const { status, batterySaver, setBatterySaver, retry } = useTracking();
  const rows = useOpenRow<'location'>();
  return (
    <>
      <ListRow
        title="Location"
        value={TRACKING_LABEL[status]}
        valueColour={status === 'sharing' ? colours.accent : status === 'starting' ? undefined : colours.danger}
        open={rows.isOpen('location')}
        onPress={() => rows.toggle('location')}
      >
        <Text style={styles.sub}>Keep the app open on screen while you play. Sharing stops when the phone locks.</Text>
        {status === 'unavailable' && <Button title="Try again" variant="secondary" onPress={retry} />}
      </ListRow>
      <ListRow
        title="Battery saver"
        detail="Sends your position about every 20 seconds instead of 5."
        right={
          <Switch
            value={batterySaver}
            onValueChange={setBatterySaver}
            trackColor={{ true: colours.actionFill, false: colours.border }}
            thumbColor={batterySaver ? colours.accent : colours.textSecondary}
          />
        }
      />
    </>
  );
}

export function TrackingSettings() {
  return (
    <>
      <Label>Location</Label>
      <List>
        <TrackingRows />
      </List>
    </>
  );
}

const styles = StyleSheet.create({
  sub: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
});
