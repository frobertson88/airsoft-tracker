// Field Library: your saved fields (docs/field-library.md#library-and-editor-screens).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Label, Row, Screen } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { SavedField } from '../../lib/field';
import { supabase } from '../../lib/supabase';
import { colours, display, fonts, space } from '../../theme';

type FieldRow = Pick<SavedField, 'id' | 'name' | 'location' | 'archived' | 'updated_at' | 'data'>;

export default function FieldLibrary() {
  const { session } = useAuth();
  const [fields, setFields] = useState<FieldRow[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('fields')
      .select('id, name, location, archived, updated_at, data')
      .eq('owner_id', session!.user.id)
      .order('updated_at', { ascending: false });
    if (e) setError(e.message);
    setFields((data ?? []) as FieldRow[]);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (fieldId: string, fn: () => Promise<unknown>) => {
    setBusy(fieldId);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const active = fields?.filter((f) => !f.archived) ?? [];
  const archived = fields?.filter((f) => f.archived) ?? [];

  return (
    <Screen>
      <Body muted>Set up a field once, then pick it when you host a Game Day.</Body>
      <Button title="Create a field" onPress={() => router.push('/fields/new')} />
      <ErrorText>{error}</ErrorText>

      {fields && active.length === 0 && <Body muted>No fields yet.</Body>}
      {active.map((f) => (
        <Card key={f.id}>
          <Pressable onPress={() => router.push(`/fields/${f.id}`)} accessibilityRole="button">
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.meta}>
              {[f.location, `${f.data.areas?.length ?? 0} areas`, `${f.data.points?.length ?? 0} points`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
          <Row>
            <Button title="Edit" variant="quiet" onPress={() => router.push(`/fields/${f.id}`)} />
            <Button title="Duplicate" variant="secondary" busy={busy === f.id} onPress={() => act(f.id, () => api.duplicateField(f.id))} />
            <Button title="Archive" variant="secondary" busy={busy === f.id} onPress={() => act(f.id, () => api.archiveField(f.id, true))} />
          </Row>
        </Card>
      ))}

      {archived.length > 0 && (
        <Pressable onPress={() => setShowArchived(!showArchived)} accessibilityRole="button" style={styles.toggle}>
          <Label>
            Archived · {archived.length} {showArchived ? '▲' : '▼'}
          </Label>
        </Pressable>
      )}
      {showArchived &&
        archived.map((f) => (
          <Card key={f.id}>
            <View style={styles.between}>
              <Text style={[styles.name, { color: colours.textSecondary }]}>{f.name}</Text>
              <Button title="Restore" variant="secondary" busy={busy === f.id} onPress={() => act(f.id, () => api.archiveField(f.id, false))} />
            </View>
          </Card>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: colours.text, fontSize: 22, ...display },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14, marginTop: 2 },
  toggle: { minHeight: 44, justifyContent: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
});
