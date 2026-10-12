// Host a game day: name it and pick the field, which stays for the whole day.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Label, Screen } from '../components/ui';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { SavedField } from '../lib/field';
import { supabase } from '../lib/supabase';
import { colours, display, fonts } from '../theme';

type FieldRow = Pick<SavedField, 'id' | 'name' | 'location'>;

export default function Create() {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [fields, setFields] = useState<FieldRow[] | null>(null);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reload on return, so a field made from here shows up.
  useFocusEffect(
    useCallback(() => {
      supabase
        .from('fields')
        .select('id, name, location')
        .eq('owner_id', session!.user.id)
        .eq('archived', false)
        .order('updated_at', { ascending: false })
        .then(({ data }) => {
          const list = (data ?? []) as FieldRow[];
          setFields(list);
          setFieldId((cur) => cur ?? (list.length === 1 ? list[0].id : null));
        });
    }, [session]),
  );

  const create = async () => {
    if (!fieldId) return setError('Pick the field you’re playing on.');
    setBusy(true);
    setError('');
    try {
      const id = await api.createGameDay(name.trim());
      await api.selectDayField(id, fieldId);
      router.replace(`/day/${id}`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Body muted>Open Game Days are visible to everyone in Join.</Body>
      <Field value={name} onChangeText={setName} placeholder="Game Day name" maxLength={60} />

      <Label>Field</Label>
      {fields && fields.length === 0 && <Body muted>You haven’t saved a field yet. Create one first.</Body>}
      {fields?.map((f) => (
        <Pressable key={f.id} onPress={() => setFieldId(f.id)} accessibilityRole="button" accessibilityState={{ selected: fieldId === f.id }}>
          <Card style={fieldId === f.id ? styles.chosen : undefined}>
            <Text style={styles.name}>{f.name}</Text>
            {!!f.location && <Text style={styles.meta}>{f.location}</Text>}
          </Card>
        </Pressable>
      ))}
      <Button title="Create a field" variant="quiet" onPress={() => router.push('/fields/new')} />

      <ErrorText>{error}</ErrorText>
      <Button title="Host game day" onPress={create} busy={busy} disabled={!name.trim() || !fieldId} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chosen: { borderColor: colours.accent, backgroundColor: colours.selection },
  name: { color: colours.text, fontSize: 22, ...display },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
});
