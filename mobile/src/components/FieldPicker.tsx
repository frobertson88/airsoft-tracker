// Host tab: choose one of your saved fields, review it, then use it for the day.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCommand, useDay } from '../lib/day';
import type { SavedField } from '../lib/field';
import { supabase } from '../lib/supabase';
import { colours, display, fonts, space } from '../theme';
import { FieldMap } from './FieldMap';
import { Body, Button, Card, ErrorText, Screen, Title } from './ui';

export function FieldPicker({ onClose }: { onClose: () => void }) {
  const { id } = useDay();
  const { session } = useAuth();
  const { run, busy, error } = useCommand();
  const [fields, setFields] = useState<SavedField[] | null>(null);
  const [chosen, setChosen] = useState<SavedField | null>(null);

  useEffect(() => {
    supabase
      .from('fields')
      .select('*')
      .eq('owner_id', session!.user.id)
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .then(({ data }) => setFields((data ?? []) as SavedField[]));
  }, [session]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {chosen ? (
        <View style={styles.review}>
          <View style={styles.reviewMap}>
            <FieldMap data={chosen.data} />
          </View>
          <Screen scroll={false} edges={['bottom']}>
            <Text style={styles.name}>{chosen.name}</Text>
            <Body muted>
              {[chosen.location, `${chosen.data.areas.length} No-go/Danger areas`, `${chosen.data.points.length} points`]
                .filter(Boolean)
                .join(' · ')}
            </Body>
            <Body muted>Everyone in the day sees this field. Later edits to the saved field won’t change this day.</Body>
            <ErrorText>{error}</ErrorText>
            <Button
              title="Use this field"
              busy={busy}
              onPress={async () => {
                if (await run(() => api.selectDayField(id, chosen.id))) onClose();
              }}
            />
            <Button title="Back" variant="secondary" onPress={() => setChosen(null)} />
          </Screen>
        </View>
      ) : (
        <Screen edges={['top', 'bottom']}>
          <Title>Choose field</Title>
          {fields && fields.length === 0 && <Body muted>You haven’t saved any fields yet.</Body>}
          {fields?.map((f) => (
            <Pressable key={f.id} onPress={() => setChosen(f)} accessibilityRole="button">
              <Card style={styles.row}>
                {f.preview && <Image source={{ uri: f.preview }} style={styles.thumb} resizeMode="cover" />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{f.name}</Text>
                  {f.location ? <Body muted>{f.location}</Body> : null}
                </View>
              </Card>
            </Pressable>
          ))}
          <Button
            title="Create a field"
            variant="quiet"
            onPress={() => {
              onClose();
              router.push('/fields/new');
            }}
          />
          <Button title="Close" variant="secondary" onPress={onClose} />
        </Screen>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 88, height: 56, borderRadius: 6 },
  review: { flex: 1, backgroundColor: colours.background },
  reviewMap: { flex: 1, minHeight: 240 },
  name: { color: colours.text, fontSize: 24, ...display, marginBottom: space.xs },
  meta: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
});
