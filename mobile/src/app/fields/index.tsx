// Field Library: your saved fields (docs/field-library.md#library-and-editor-screens).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Label, List, ListRow, Row, Screen, useOpenRow } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { SavedField } from '../../lib/field';
import { supabase } from '../../lib/supabase';
import { colours, fonts } from '../../theme';

type FieldRow = Pick<SavedField, 'id' | 'name' | 'location' | 'archived' | 'updated_at' | 'data' | 'preview'>;

export default function FieldLibrary() {
  const { session } = useAuth();
  const [fields, setFields] = useState<FieldRow[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useOpenRow<string>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('fields')
      .select('id, name, location, archived, updated_at, data, preview')
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
      {active.length > 0 && (
        <List>
          {active.map((f) => (
            <ListRow
              key={f.id}
              title={f.name}
              detail={[f.location, `${f.data.areas?.length ?? 0} areas · ${f.data.points?.length ?? 0} points`]
                .filter(Boolean)
                .join('\n')}
              left={
                f.preview ? (
                  <Image source={{ uri: f.preview }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.noThumb]} />
                )
              }
              open={rows.isOpen(f.id)}
              onPress={() => rows.toggle(f.id)}
            >
              {f.preview ? (
                <Image source={{ uri: f.preview }} style={styles.preview} resizeMode="cover" />
              ) : (
                <Text style={styles.meta}>Save the field on a phone to add its picture.</Text>
              )}
              <Row>
                <Button title="Edit" variant="secondary" onPress={() => router.push(`/fields/${f.id}`)} />
                {(f.data.points?.length ?? 0) > 0 && (
                  <Button title="QR codes" variant="secondary" onPress={() => router.push(`/tags/${f.id}`)} />
                )}
                <Button title="Duplicate" variant="secondary" busy={busy === f.id} onPress={() => act(f.id, () => api.duplicateField(f.id))} />
                <Button title="Archive" variant="secondary" busy={busy === f.id} onPress={() => act(f.id, () => api.archiveField(f.id, true))} />
              </Row>
            </ListRow>
          ))}
        </List>
      )}

      {archived.length > 0 && (
        <Pressable onPress={() => setShowArchived(!showArchived)} accessibilityRole="button" style={styles.toggle}>
          <Label>
            Archived · {archived.length} {showArchived ? '▲' : '▼'}
          </Label>
        </Pressable>
      )}
      {showArchived && (
        <List>
          {archived.map((f) => (
            <ListRow
              key={f.id}
              title={f.name}
              right={
                <Button title="Restore" variant="secondary" busy={busy === f.id} onPress={() => act(f.id, () => api.archiveField(f.id, false))} />
              }
            />
          ))}
        </List>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 1.6, borderRadius: 8, backgroundColor: colours.background },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: colours.background },
  noThumb: { borderWidth: 1, borderColor: colours.border },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
  toggle: { minHeight: 44, justifyContent: 'center' },
});
