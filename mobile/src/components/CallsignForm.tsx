import { useState } from 'react';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, ErrorText, Field } from './ui';

export function CallsignForm({ onSaved }: { onSaved?: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const [callsign, setCallsign] = useState(profile?.callsign ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = callsign.trim();

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.setCallsign(value);
      await refreshProfile();
      onSaved?.();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field
        value={callsign}
        onChangeText={setCallsign}
        placeholder="Callsign"
        maxLength={24}
        autoCapitalize="words"
        onSubmitEditing={save}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Save"
        onPress={save}
        busy={busy}
        disabled={!value || value === profile?.callsign}
      />
    </>
  );
}
