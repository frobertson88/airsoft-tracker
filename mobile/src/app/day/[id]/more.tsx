import { router } from 'expo-router';
import { TrackingSettings } from '../../../components/TrackingSettings';
import { Body, Button, Card, ConfirmButton, ErrorText, Label, Screen } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useCommand, useDay } from '../../../lib/day';
import { goHome } from '../../../lib/nav';

// Players only; admins get these options on the Host tab instead.
export default function MoreTab() {
  const { id } = useDay();
  const { profile } = useAuth();
  const { run, busy, error } = useCommand();

  return (
    <Screen>
      <Card>
        <Body>{profile?.callsign}</Body>
        <Button title="Edit profile" variant="secondary" onPress={() => router.push('/profile')} />
      </Card>
      <TrackingSettings />

      <Label>Leave</Label>
      <ConfirmButton
        title="Leave Game Day"
        confirmTitle="Tap again to leave"
        busy={busy}
        onConfirm={async () => {
          if (await run(() => api.leaveGameDay(id))) goHome();
        }}
      />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
