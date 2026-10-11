import { CallsignForm } from '../components/CallsignForm';
import { Body, Button, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';

export default function Callsign() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <Body muted>Other players see this name.</Body>
      <CallsignForm />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
