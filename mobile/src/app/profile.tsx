import { router } from 'expo-router';
import { CallsignForm } from '../components/CallsignForm';
import { Body, Button, Label, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  return (
    <Screen>
      <Label>Callsign</Label>
      <CallsignForm onSaved={() => router.back()} />
      <Label>Account</Label>
      <Body muted>{session?.user.email}</Body>
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
