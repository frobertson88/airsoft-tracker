// A field's QR codes (plans: Patrol and tag library, phase 1): one code per
// point to print and fix on site, a sheet to print, a walk-test scan, and a
// way to put an existing tag on a different point.
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { TagScanner } from '../../components/TagScanner';
import { Body, Button, ErrorText, List, ListRow, Loading, Row, Screen, useOpenRow } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import { POINT_KINDS, pointName, type FieldPoint, type SavedField } from '../../lib/field';
import { supabase } from '../../lib/supabase';
import { parseTag, type PointTag } from '../../lib/tags';
import { colours, fonts, radius, space } from '../../theme';

type Scan = { mode: 'test' } | { mode: 'move'; point: FieldPoint };

export default function FieldTags() {
  const { field } = useLocalSearchParams<{ field: string }>();
  const [name, setName] = useState('');
  const [points, setPoints] = useState<FieldPoint[] | null>(null);
  const [tags, setTags] = useState<PointTag[]>([]);
  const [sheet, setSheet] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [message, setMessage] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const rows = useOpenRow<string>();
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error: e } = await supabase.from('fields').select('name, data').eq('id', field).single();
    if (e || !data) {
      setError(e?.message ?? 'Field not found.');
      setPoints([]);
      return;
    }
    const f = data as Pick<SavedField, 'name' | 'data'>;
    setName(f.name);
    try {
      setTags(await api.pointTags(field));
    } catch (err) {
      setError(friendlyError(err));
    }
    setPoints([...(f.data.points ?? [])].filter((p) => p.id).sort((a, b) => (a.num ?? 0) - (b.num ?? 0)));
  }, [field]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const codesFor = (p: FieldPoint) => tags.filter((t) => t.point_id === p.id).map((t) => t.code);

  const onCode = async (text: string) => {
    const code = parseTag(text);
    if (!code) {
      setMessage('That isn’t one of our QR codes.');
      return;
    }
    try {
      if (scan?.mode === 'move') {
        if (codesFor(scan.point).includes(code)) {
          setMessage(`${code} is already on ${pointName(scan.point)}.`);
          return;
        }
        await api.bindTag(code, field, scan.point.id!);
        await load();
        setMessage(`${code} now stands for ${pointName(scan.point)}.`);
        return;
      }
      const found = tags.find((t) => t.code === code);
      const point = found && points?.find((p) => p.id === found.point_id);
      if (point) {
        setChecked((s) => new Set(s).add(point.id!));
        setMessage(`${code} · Point ${pointName(point)} ✓`);
        return;
      }
      const look = await api.lookupTag(code, null);
      setMessage(
        look.known && look.field
          ? `${code} is for ${look.field}${look.point ? `, ${pointName(look.point)}` : ''}, not this field.`
          : `${code} isn’t on any point yet.`,
      );
    } catch (e) {
      setMessage(friendlyError(e));
    }
  };

  if (!points) return <Loading />;

  if (sheet) {
    return (
      <Screen>
        <Stack.Screen options={{ title: `${name} QR codes` }} />
        <Row>
          {Platform.OS === 'web' && <Button title="Print" onPress={() => window.print()} />}
          <Button title="Back to the list" variant="secondary" onPress={() => setSheet(false)} />
        </Row>
        {Platform.OS !== 'web' && <Body muted>To print, open Fields on a computer, or take a screenshot.</Body>}
        <View style={styles.sheet}>
          {points.flatMap((p) =>
            codesFor(p).slice(0, 1).map((code) => (
              <View key={code} style={styles.label}>
                <Text style={styles.labelNum}>{p.num}</Text>
                <Text style={styles.labelName} numberOfLines={1}>
                  {p.label}
                </Text>
                <QRCode value={code} size={140} backgroundColor="#FFFFFF" color="#000000" />
                <Text style={styles.labelCode}>{code}</Text>
              </View>
            )),
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: name || 'QR codes' }} />
      <Body muted>
        Each point has its own QR code. Print them, fix each one at its point, and they work in every game at this field.
      </Body>
      <Row>
        <Button title="Print sheet" disabled={points.length === 0} onPress={() => setSheet(true)} />
        {Platform.OS !== 'web' && (
          <Button
            title="Test scan"
            variant="secondary"
            disabled={points.length === 0}
            onPress={() => {
              setMessage('');
              setScan({ mode: 'test' });
            }}
          />
        )}
      </Row>
      <ErrorText>{error}</ErrorText>

      {points.length === 0 ? (
        <Body muted>This field has no points yet. Add points in the field editor and save it.</Body>
      ) : (
        <List>
          {points.map((p) => {
            const codes = codesFor(p);
            const kind = POINT_KINDS.find((k) => k.kind === p.kind)?.label ?? 'Point';
            return (
              <ListRow
                key={p.id}
                title={p.label}
                detail={[kind, codes.join(', '), checked.has(p.id!) ? 'Checked' : ''].filter(Boolean).join(' · ')}
                value={String(p.num ?? '')}
                big
                valueColour={checked.has(p.id!) ? colours.accent : undefined}
                open={rows.isOpen(p.id!)}
                onPress={() => rows.toggle(p.id!)}
              >
                {codes[0] && (
                  <View style={styles.qr}>
                    <QRCode value={codes[0]} size={200} backgroundColor="#FFFFFF" color="#000000" />
                    <Text style={styles.qrCode}>{codes[0]}</Text>
                  </View>
                )}
                {codes.length > 1 && <Body muted>Also: {codes.slice(1).join(', ')}</Body>}
                {Platform.OS !== 'web' && (
                  <Button
                    title="Use another tag for this point"
                    variant="secondary"
                    onPress={() => {
                      setMessage('');
                      setScan({ mode: 'move', point: p });
                    }}
                  />
                )}
              </ListRow>
            );
          })}
        </List>
      )}

      {scan && (
        <TagScanner
          title={scan.mode === 'test' ? 'Scan each point’s code to check it' : `Scan the tag to use for ${pointName(scan.point)}`}
          message={message}
          onCode={onCode}
          onClose={() => setScan(null)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { alignSelf: 'center', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: '#FFFFFF', borderRadius: radius },
  qrCode: { color: '#000000', fontFamily: fonts.semibold, fontSize: 18, letterSpacing: 2 },
  sheet: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  label: {
    width: 180,
    alignItems: 'center',
    gap: 4,
    padding: space.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radius,
    borderWidth: 1,
    borderColor: '#000000',
  },
  labelNum: { color: '#000000', fontFamily: fonts.display, fontSize: 44, lineHeight: 48 },
  labelName: { color: '#000000', fontFamily: fonts.medium, fontSize: 15, maxWidth: 160 },
  labelCode: { color: '#000000', fontFamily: fonts.semibold, fontSize: 14, letterSpacing: 2 },
});
