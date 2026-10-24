// Field editor (docs/field-library.md): find the field, draw its boundary,
// add No-go/Danger areas and labelled points, then save. id "new" creates one.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FieldMap, type FieldMapHandle } from '../../components/FieldMap';
import { Body, Button, Card, Chip, ErrorText, Field, FocusScrollView, Label, Loading, Row } from '../../components/ui';
import { api, friendlyError } from '../../lib/api';
import {
  AREA_LABELS,
  DEFAULT_VIEW,
  POINT_KINDS,
  pointName,
  polygonProblem,
  type AreaKind,
  type Coord,
  type FieldArea,
  type FieldData,
  type FieldPoint,
  type FieldView,
  type PointKind,
  type SavedField,
} from '../../lib/field';
import { supabase } from '../../lib/supabase';
import { colours, fonts, radius, space } from '../../theme';

type Tool = 'boundary' | AreaKind | 'point';

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: 'boundary', label: 'Boundary' },
  { tool: 'nogo', label: 'No-go' },
  { tool: 'danger', label: 'Danger' },
  { tool: 'point', label: 'Point' },
];

const HINTS: Record<Tool, string> = {
  boundary: 'Tap the map to place the corners of the playable area, in order around the edge.',
  nogo: 'Tap the corners of the area players must not enter.',
  danger: 'Tap the corners of the hazard area.',
  point: 'Tap the map to drop a point. Each tap adds one.',
};

export default function FieldEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const mapRef = useRef<FieldMapHandle>(null);

  const [loaded, setLoaded] = useState(isNew);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [data, setData] = useState<FieldData>({ view: DEFAULT_VIEW, boundary: [], areas: [], points: [] });
  const view = useRef<FieldView>(DEFAULT_VIEW);
  const mapSize = useRef({ width: 0, height: 0 });

  const [tool, setTool] = useState<Tool | null>(null);
  const [draft, setDraft] = useState<Coord[]>([]);
  const [pendingArea, setPendingArea] = useState<{ kind: AreaKind; points: Coord[] } | null>(null);
  const [areaName, setAreaName] = useState('');
  const [areaNote, setAreaNote] = useState('');
  // How many points this run of the point tool added, so Undo only takes those back.
  const [pointsAdded, setPointsAdded] = useState(0);
  // A point tapped on the map, to rename, change, move or delete.
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [pointLabel, setPointLabel] = useState('');
  const [pointKind, setPointKind] = useState<PointKind>('staging');

  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  // Load an existing field, or start a new one near the phone's last known position.
  useEffect(() => {
    if (!isNew) {
      supabase
        .from('fields')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data: row, error: e }) => {
          if (e || !row) {
            setError(e?.message ?? 'Field not found.');
          } else {
            const f = row as SavedField;
            setName(f.name);
            setLocation(f.location ?? '');
            setNotes(f.notes ?? '');
            setData({ ...f.data, areas: f.data.areas ?? [], points: f.data.points ?? [] });
            view.current = f.data.view;
          }
          setLoaded(true);
        });
      return;
    }
    if (Platform.OS === 'web') return;
    Location.getLastKnownPositionAsync()
      .then((pos) => {
        if (!pos) return;
        const near = { lat: pos.coords.latitude, lng: pos.coords.longitude, latDelta: 0.01, lngDelta: 0.01 };
        mapRef.current?.goTo(near);
      })
      .catch(() => {});
  }, [id, isNew]);

  const startTool = (t: Tool) => {
    setTool(t);
    setDraft([]);
    setPendingArea(null);
    setSelectedPoint(null);
    setPointsAdded(0);
    setPointLabel('');
    setError('');
  };

  const stopTool = () => {
    setTool(null);
    setDraft([]);
    setError('');
  };

  const onMapPress = (c: Coord) => {
    // A tap close to a point picks it rather than dropping a new one beside it.
    const near = nearestPoint(c);
    if (near !== null && !((tool && tool !== 'point') || pendingArea)) {
      setSelectedPoint(near);
      return;
    }
    if (selectedPoint !== null) {
      setSelectedPoint(null);
      return;
    }
    if (!tool || pendingArea) return;
    if (tool === 'point') {
      addPoint(c);
      return;
    }
    setDraft((d) => [...d, c]);
  };

  const finishShape = () => {
    const problem = polygonProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    if (tool === 'boundary') {
      setData((d) => ({ ...d, boundary: draft }));
      stopTool();
    } else if (tool === 'nogo' || tool === 'danger') {
      setPendingArea({ kind: tool, points: draft });
      setAreaName('');
      setAreaNote('');
      setDraft([]);
      setError('');
    }
  };

  const addArea = () => {
    if (!pendingArea) return;
    const area: FieldArea = { ...pendingArea, name: areaName.trim(), note: areaNote.trim() };
    setData((d) => ({ ...d, areas: [...d.areas, area] }));
    setPendingArea(null);
    setTool(null);
  };

  // Each tap drops a point of the chosen kind. The label is optional: left blank,
  // the point is named after its kind. The label clears for the next one.
  const addPoint = (c: Coord) => {
    const kindLabel = POINT_KINDS.find((k) => k.kind === pointKind)?.label ?? 'Point';
    const point: FieldPoint = { ...c, kind: pointKind, label: pointLabel.trim() || kindLabel };
    setData((d) => ({ ...d, points: [...d.points, point] }));
    setPointsAdded((n) => n + 1);
    setPointLabel('');
  };

  const changePoint = (i: number, change: Partial<FieldPoint>) =>
    setData((d) => ({ ...d, points: d.points.map((p, j) => (j === i ? { ...p, ...change } : p)) }));

  const onPointPress = (i: number) => {
    // Not while drawing a shape or naming an area.
    if ((tool && tool !== 'point') || pendingArea) return;
    setSelectedPoint(i);
  };

  // The point within about a fingertip (32 points on screen) of a tap, if any.
  const nearestPoint = (c: Coord) => {
    const { width, height } = mapSize.current;
    const v = view.current;
    if (!width || !height || !v) return null;
    let best: number | null = null;
    let bestDist = 32;
    data.points.forEach((p, i) => {
      const dx = ((p.lng - c.lng) / v.lngDelta) * width;
      const dy = ((p.lat - c.lat) / v.latDelta) * height;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    return best;
  };

  const undoPoint = () => {
    setData((d) => ({ ...d, points: d.points.slice(0, -1) }));
    setPointsAdded((n) => n - 1);
  };

  const findPlace = async () => {
    setError('');
    try {
      const [hit] = await Location.geocodeAsync(search.trim());
      if (!hit) setError('Couldn’t find that place. Try a town or road name.');
      else mapRef.current?.goTo({ lat: hit.latitude, lng: hit.longitude, latDelta: 0.01, lngDelta: 0.01 });
    } catch {
      setError('Search isn’t available here. Move the map by hand instead.');
    }
  };

  const goToMe = async () => {
    setError('');
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude, latDelta: 0.005, lngDelta: 0.005 });
    } catch {
      setError('Couldn’t get your location.');
    }
  };

  const save = async () => {
    setError('');
    if (!name.trim()) return setError('Give the field a name.');
    const problem = polygonProblem(data.boundary);
    if (problem) return setError(`Boundary: ${problem}`);
    setBusy(true);
    try {
      // The map opens on whatever view you leave it on when you save.
      const fieldId = await api.saveField(isNew ? null : id, name.trim(), location.trim(), notes.trim(), {
        ...data,
        // A label cleared while editing falls back to the point's kind.
        points: data.points.map((p) => ({
          ...p,
          label: p.label.trim() || (POINT_KINDS.find((k) => k.kind === p.kind)?.label ?? 'Point'),
        })),
        view: view.current,
      });
      // A picture for the field lists. The field is already saved, so a failure here doesn't matter.
      setSaving('Saving a picture of the field…');
      const picture = await mapRef.current?.snapshot().catch(() => null);
      if (picture) await api.setFieldPreview(fieldId, picture).catch(() => {});
      router.back();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  if (!loaded) return <Loading />;

  const drawing = tool && tool !== 'point' && !pendingArea;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen options={{ title: isNew ? 'New field' : 'Edit field' }} />
      <View
        style={styles.mapWrap}
        onLayout={(e) => {
          mapSize.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
      >
        <FieldMap
          ref={mapRef}
          data={data}
          draft={drawing ? { kind: tool, points: draft } : pendingArea}
          onPress={onMapPress}
          onViewChange={(v) => {
            view.current = v;
          }}
          showsUserLocation={Platform.OS !== 'web'}
          selectedPoint={selectedPoint}
          onPointPress={onPointPress}
          onPointMove={(i, c) => changePoint(i, { lat: c.lat, lng: c.lng })}
        />
        <Pressable onPress={goToMe} accessibilityRole="button" accessibilityLabel="Go to my location" style={styles.fab}>
          <Ionicons name="locate" size={22} color={colours.text} />
        </Pressable>
        {tool && <Text style={styles.hint}>{HINTS[tool]}</Text>}
      </View>

      <FocusScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {drawing ? (
          <>
            <Body>
              {tool === 'boundary' ? 'Boundary' : AREA_LABELS[tool as AreaKind]} · {draft.length}{' '}
              {draft.length === 1 ? 'corner' : 'corners'}
            </Body>
            <Row>
              <Button title="Finish shape" onPress={finishShape} disabled={draft.length < 3} />
              <Button
                title="Undo"
                variant="secondary"
                disabled={draft.length === 0}
                onPress={() => setDraft((d) => d.slice(0, -1))}
              />
              <Button title="Cancel" variant="secondary" onPress={stopTool} />
            </Row>
          </>
        ) : pendingArea ? (
          <Card>
            <Label>{AREA_LABELS[pendingArea.kind]} area</Label>
            <Field value={areaName} onChangeText={setAreaName} placeholder="Name, e.g. Quarry" maxLength={40} />
            <Field
              value={areaNote}
              onChangeText={setAreaNote}
              placeholder={pendingArea.kind === 'nogo' ? 'Instruction, e.g. Closed, do not enter' : 'Hazard, e.g. Steep slippery bank'}
              maxLength={200}
            />
            <Row>
              <Button title="Add area" onPress={addArea} disabled={!areaName.trim()} />
              <Button title="Discard" variant="secondary" onPress={() => { setPendingArea(null); setTool(null); }} />
            </Row>
          </Card>
        ) : selectedPoint !== null && data.points[selectedPoint] ? (
          <Card>
            <Label>Point</Label>
            <Row>
              {POINT_KINDS.map((k) => (
                <Chip
                  key={k.kind}
                  label={k.label}
                  selected={data.points[selectedPoint].kind === k.kind}
                  onPress={() => {
                    const p = data.points[selectedPoint];
                    const old = POINT_KINDS.find((x) => x.kind === p.kind)?.label;
                    // A label that was just the old kind's name follows the new kind.
                    changePoint(selectedPoint, { kind: k.kind, ...(p.label === old ? { label: k.label } : {}) });
                  }}
                />
              ))}
            </Row>
            <Field
              value={data.points[selectedPoint].label}
              onChangeText={(t) => changePoint(selectedPoint, { label: t })}
              placeholder="Label"
              maxLength={40}
            />
            <Body muted>Hold and drag it to move.</Body>
            <Row>
              <Button title="Done" onPress={() => setSelectedPoint(null)} />
              <Button
                title="Delete"
                variant="secondary"
                onPress={() => {
                  setData((d) => ({ ...d, points: d.points.filter((_, j) => j !== selectedPoint) }));
                  setSelectedPoint(null);
                  setPointsAdded(0);
                }}
              />
            </Row>
          </Card>
        ) : tool === 'point' ? (
          <Card>
            <Label>Points · {pointsAdded} added</Label>
            <Row>
              {POINT_KINDS.map((k) => (
                <Chip key={k.kind} label={k.label} selected={pointKind === k.kind} onPress={() => setPointKind(k.kind)} />
              ))}
            </Row>
            <Field value={pointLabel} onChangeText={setPointLabel} placeholder="Label for the next point (optional)" maxLength={40} />
            <Row>
              <Button title="Done" onPress={stopTool} />
              <Button title="Undo" variant="secondary" disabled={pointsAdded === 0} onPress={undoPoint} />
            </Row>
          </Card>
        ) : (
          <>
            {!tool && (
              <>
                <Label>Add to the map</Label>
                <Row>
                  {TOOLS.map((t) => (
                    <Chip
                      key={t.tool}
                      label={t.tool === 'boundary' && data.boundary.length ? 'Redraw boundary' : t.label}
                      onPress={() => startTool(t.tool)}
                    />
                  ))}
                </Row>
              </>
            )}
          </>
        )}

        <ErrorText>{error}</ErrorText>

        {!tool && !pendingArea && selectedPoint === null && (
          <>
            <Label>Find the field</Label>
            <Row style={{ flexWrap: 'nowrap' }}>
              <View style={{ flex: 1 }}>
                <Field value={search} onChangeText={setSearch} placeholder="Town, road or place" returnKeyType="search" onSubmitEditing={findPlace} />
              </View>
              <Button title="Go" variant="quiet" disabled={!search.trim()} onPress={findPlace} />
            </Row>

            <Label>Details</Label>
            <Field value={name} onChangeText={setName} placeholder="Field name, e.g. Pine Ridge" maxLength={60} />
            <Field value={location} onChangeText={setLocation} placeholder="Location (optional)" maxLength={120} />
            <Field value={notes} onChangeText={setNotes} placeholder="Notes for organisers (optional)" maxLength={500} multiline />

            <Label>On this field</Label>
            <Card>
              <ItemRow
                title="Boundary"
                detail={data.boundary.length ? `${data.boundary.length} corners` : 'Not drawn yet (required)'}
                warn={!data.boundary.length}
              />
              {data.areas.map((a, i) => (
                <ItemRow
                  key={`a${i}`}
                  title={`${AREA_LABELS[a.kind]}: ${a.name}`}
                  detail={a.note || undefined}
                  onRemove={() => setData((d) => ({ ...d, areas: d.areas.filter((_, j) => j !== i) }))}
                />
              ))}
              {data.points.map((p, i) => (
                <ItemRow
                  key={`p${i}`}
                  title={pointName(p)}
                  detail={POINT_KINDS.find((k) => k.kind === p.kind)?.label}
                  onRemove={() => setData((d) => ({ ...d, points: d.points.filter((_, j) => j !== i) }))}
                />
              ))}
            </Card>

            {!isNew && data.points.some((p) => p.id) && (
              <Button title="QR codes for points" variant="secondary" onPress={() => router.push(`/tags/${id}`)} />
            )}
            <Body muted>The map opens where you leave it when you save. New points get a number and QR code once saved.</Body>
            <Button title="Save field" onPress={save} busy={busy} />
            {!!saving && <Body muted>{saving}</Body>}
            <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
          </>
        )}
      </FocusScrollView>
    </SafeAreaView>
  );
}

function ItemRow({ title, detail, warn, onRemove }: { title: string; detail?: string; warn?: boolean; onRemove?: () => void }) {
  return (
    <View style={styles.item}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        {detail ? <Text style={[styles.itemDetail, warn && { color: colours.danger }]}>{detail}</Text> : null}
      </View>
      {onRemove && (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${title}`} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color={colours.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background },
  mapWrap: { flex: 1.2 },
  fab: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colours.surface,
    borderColor: colours.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    right: space.sm,
    color: colours.text,
    fontFamily: fonts.medium,
    fontSize: 14,
    backgroundColor: 'rgba(11,16,12,0.85)',
    borderRadius: radius,
    padding: space.sm,
  },
  panel: { flex: 1 },
  panelContent: { padding: space.lg, gap: space.md },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colours.border,
  },
  itemTitle: { color: colours.text, fontFamily: fonts.medium, fontSize: 15 },
  itemDetail: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
});
