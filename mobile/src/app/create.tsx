import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, ErrorText, Field, Screen } from '../components/ui';
import { api, friendlyError } from '../lib/api';

export default function Create() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const id = await api.createGameDay(name.trim());
      router.replace(`/day/${id}`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Body muted>Open Game Days are visible to everyone in Join.</Body>
      <Field
        value={name}
        onChangeText={setName}
        placeholder="Game Day name"
        maxLength={60}
        autoFocus
        onSubmitEditing={create}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Create" onPress={create} busy={busy} disabled={!name.trim()} />
    </Screen>
  );
}
