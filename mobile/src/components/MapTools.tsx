// Map tools: the left rail (Map, F/E, audience, Icons, Draw, Delete, Host view),
// its palettes and the compact strip above the bottom (docs/map-toolbar.md).
// useMapTools owns the tool state; the Map tab passes its map events here.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { MapDrawing, ToolDraft } from './FieldMap';
import { api, friendlyError } from '../lib/api';
import { useDay } from '../lib/day';
import type { Coord } from '../lib/field';
import {
  DRAW_TOOLS,
  drawTool,
  insidePolygon,
  markersFor,
  markerType,
  objectName,
  SIGHTING_MS,
  sightingAge,
  type Affiliation,
  type DrawKind,
  type MapObject,
  type Target,
} from '../lib/mapTools';
import { colours, fonts, radius, space, teamColour } from '../theme';

type Tool = { type: 'cursor' } | { type: 'marker'; id: string } | { type: 'draw'; kind: DrawKind } | { type: 'delete' };
type Palette = 'icons' | 'draw' | 'target' | null;

const sameTarget = (a: Target, b: Target) =>
  a.audience === b.audience && a.team_id === b.team_id && a.section_id === b.section_id;

export function useMapTools({
  objects,
  setObjects,
  reload,
  now,
}: {
  objects: MapObject[];
  setObjects: (f: (prev: MapObject[]) => MapObject[]) => void;
  reload: () => void;
  now: number;
}) {
  const { id: dayId, data, me, isAdmin, callsign, teamById, sectionById } = useDay();
  const [tool, setTool] = useState<Tool>({ type: 'cursor' });
  const [palette, setPalette] = useState<Palette>(null);
  const [affiliation, setAffiliation] = useState<Affiliation>('friendly');
  const [friendly, setFriendly] = useState<Target | null>(null);
  const [enemyTeam, setEnemyTeam] = useState<string | null>(null);
  const [draft, setDraft] = useState<Coord[]>([]);
  const [linked, setLinked] = useState(true);
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const hostView = !!(isAdmin && me?.map_host_view);
  const myTeam = me?.team_id ?? null;
  const mySection = me?.section_id ?? null;

  // Audiences you may pick. Players: their section and team. Host view: any team or section, or admins only.
  const choices = useMemo<Target[]>(() => {
    if (!data) return [];
    if (!hostView) {
      const out: Target[] = [];
      if (mySection && myTeam) out.push({ audience: 'section', team_id: myTeam, section_id: mySection });
      if (myTeam) out.push({ audience: 'team', team_id: myTeam, section_id: null });
      return out;
    }
    const out: Target[] = [];
    for (const t of data.teams) {
      out.push({ audience: 'team', team_id: t.id, section_id: null });
      for (const s of data.sections.filter((x) => x.team_id === t.id)) {
        out.push({ audience: 'section', team_id: t.id, section_id: s.id });
      }
    }
    out.push({ audience: 'admin', team_id: null, section_id: null });
    return out;
  }, [data, hostView, myTeam, mySection]);

  // The selected Friendly audience if still allowed, else your section (or team).
  const friendlyTarget: Target | null =
    (friendly && choices.find((c) => sameTarget(c, friendly))) ||
    (hostView ? choices.find((c) => c.team_id === myTeam && c.audience === 'team') ?? null : choices[0] ?? null);
  // Enemy always goes to a whole team: yours, or (Host view) the one picked.
  const enemyTarget: Target | null = hostView
    ? (() => {
        const team = enemyTeam ?? friendlyTarget?.team_id ?? null;
        return team && data?.teams.some((t) => t.id === team) ? { audience: 'team', team_id: team, section_id: null } : null;
      })()
    : myTeam
      ? { audience: 'team', team_id: myTeam, section_id: null }
      : null;
  const target = affiliation === 'friendly' ? friendlyTarget : enemyTarget;

  const targetName = (t: Target | null) => {
    if (!t) return affiliation === 'enemy' && hostView ? 'Pick a team' : 'No team';
    if (t.audience === 'admin') return 'Admin only';
    const team = teamById(t.team_id);
    if (t.audience === 'section') {
      const s = sectionById(t.section_id)?.name ?? 'Section';
      return hostView ? `${team?.name ?? ''} ${s}`.trim() : s;
    }
    return team?.name ?? 'Team';
  };
  const targetShort = (t: Target | null) =>
    !t ? '—' : t.audience === 'admin' ? 'ADM' : t.audience === 'section' && !hostView ? 'SEC' : hostView ? targetName(t).slice(0, 4).toUpperCase() : 'TEAM';

  // The colour new drawings get: the audience's team in Host view, else your team.
  const draftColour = (() => {
    const teamId = hostView ? target?.team_id : myTeam;
    const team = teamById(teamId ?? null);
    return team ? teamColour(team.colour) : colours.text;
  })();

  const canChange = (o: MapObject) => o.created_by === me?.user_id || hostView;

  const drawings = useMemo<MapDrawing[]>(
    () =>
      objects
        .filter((o) => o.affiliation === 'friendly' || now - Date.parse(o.created_at) < SIGHTING_MS)
        .map((o) => {
          const team = teamById(o.colour_team_id);
          return {
            id: o.id,
            kind: o.kind,
            icon: o.kind === 'marker' ? markerType(o.marker_type).icon : undefined,
            label: o.label,
            points: o.points,
            colour: team ? teamColour(team.colour) : colours.text,
            enemy: o.affiliation === 'enemy',
            age: o.affiliation === 'enemy' ? sightingAge(now - Date.parse(o.created_at)) : undefined,
            linked: o.linked,
            movable: tool.type === 'cursor' && canChange(o),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objects, now, teamById, tool.type, hostView, me?.user_id],
  );

  const reset = (next: Tool) => {
    setTool(next);
    setPalette(null);
    setDraft([]);
    setMessage('');
    setSelectedId(null);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      return true;
    } catch (e) {
      setMessage(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const place = async (kind: MapObject['kind'], points: Coord[], extra: { marker_type?: string; label?: string } = {}) => {
    if (!target) {
      setMessage(myTeam || hostView ? 'Pick who sees it first.' : 'Pick a team on the Squad tab before drawing.');
      return false;
    }
    return run(() =>
      api.placeMapObject(dayId, {
        kind,
        marker_type: extra.marker_type,
        affiliation,
        target,
        label: extra.label ?? null,
        points,
        linked,
      }),
    );
  };

  // Which markers a Delete boundary covers (only ones you may delete count).
  const inBoundary = useMemo(() => {
    if (tool.type !== 'delete' || draft.length < 3) return { mine: [] as string[], others: 0 };
    const hit = drawings.filter((d) => d.kind === 'marker' && insidePolygon(d.points[0], draft));
    const mine = hit.filter((d) => {
      const o = objects.find((x) => x.id === d.id);
      return o && canChange(o);
    });
    return { mine: mine.map((d) => d.id), others: hit.length - mine.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.type, draft, drawings, objects, hostView]);

  const onMapPress = (c: Coord) => {
    setPalette(null);
    if (tool.type === 'cursor') {
      setSelectedId(null);
      return;
    }
    if (tool.type === 'marker') {
      place('marker', [c], { marker_type: tool.id, label: text.trim() || undefined });
      return;
    }
    if (tool.type === 'delete') {
      setDraft((d) => [...d, c]);
      return;
    }
    const t = drawTool(tool.kind);
    if (draft.length >= t.max && t.kind !== 'label') return;
    const next = t.kind === 'label' ? [c] : [...draft, c];
    setDraft(next);
    if (t.kind === 'arrow' && next.length === 2) {
      place('arrow', next, { label: text.trim() || undefined }).then((ok) => ok && setDraft([]));
    }
  };

  const finish = async () => {
    if (tool.type !== 'draw') return;
    const t = drawTool(tool.kind);
    if (draft.length < t.min) return;
    if (t.kind === 'label' && !text.trim()) {
      setMessage('Type the label first.');
      return;
    }
    if (await place(t.kind, draft, { label: text.trim() || undefined })) {
      setDraft([]);
      if (t.kind === 'label') setText('');
    }
  };

  const deleteInside = async () => {
    const ids = inBoundary.mine;
    if (!ids.length) return;
    let n = 0;
    if (await run(async () => (n = await api.deleteMapObjects(dayId, ids)))) {
      setObjects((prev) => prev.filter((o) => !ids.includes(o.id)));
      setDraft([]);
      if (n < ids.length) setMessage(`${ids.length - n} had already gone or aren't yours to delete.`);
      reload();
    }
  };

  const onDrawingPress = (id: string) => {
    if (tool.type !== 'cursor') return;
    setPalette(null);
    setSelectedId(id === selectedId ? null : id);
  };

  const onDrawingMove = async (id: string, points: Coord[]) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, points } : o)));
    if (!(await run(() => api.moveMapObject(id, points)))) reload();
  };

  const selected = objects.find((o) => o.id === selectedId) ?? null;

  const toolDraft: ToolDraft | null =
    tool.type === 'draw' || tool.type === 'delete'
      ? {
          points: draft,
          colour: tool.type === 'delete' ? colours.danger : draftColour,
          closed: tool.type === 'delete' || (tool.type === 'draw' && tool.kind === 'area'),
          numbered: tool.type === 'draw' && tool.kind === 'waypoints',
        }
      : null;

  // ---------------------------------------------------------------------------
  // The rail, palettes, strip and selected-drawing card.

  const toolName =
    tool.type === 'marker'
      ? markerType(tool.id).name
      : tool.type === 'draw'
        ? drawTool(tool.kind).name
        : tool.type === 'delete'
          ? 'Delete'
          : null;
  const hint = (() => {
    if (tool.type === 'marker') return 'Tap the map to place. Tap again for another.';
    if (tool.type === 'delete')
      return draft.length < 3 ? 'Tap corners around the markers to delete' : 'Check the highlighted count, then delete';
    if (tool.type === 'draw') {
      const t = drawTool(tool.kind);
      if (t.kind === 'label') return draft.length ? 'Type the label, then Place' : t.hint;
      return draft.length >= t.min && t.max > 2 ? `${draft.length} points · Finish when done` : t.hint;
    }
    return '';
  })();

  const toggleAffiliation = () => {
    const next: Affiliation = affiliation === 'friendly' ? 'enemy' : 'friendly';
    // Enemy goes to the whole team the Friendly audience belonged to.
    if (next === 'enemy' && hostView && friendlyTarget?.team_id) setEnemyTeam(friendlyTarget.team_id);
    if (next === 'enemy' && hostView && friendlyTarget?.audience === 'admin') setEnemyTeam(null);
    setAffiliation(next);
    // A marker type that doesn't exist for the new side falls back to Infantry.
    if (tool.type === 'marker' && !markerType(tool.id).affiliations.includes(next)) setTool({ type: 'marker', id: 'infantry' });
    setPalette(null);
  };

  const onTargetPress = () => {
    if (hostView) {
      setPalette(palette === 'target' ? null : 'target');
      return;
    }
    if (affiliation === 'enemy') {
      setMessage('Enemy reports always go to your whole team.');
      return;
    }
    // Players: one tap toggles SEC ↔ TEAM.
    if (choices.length > 1 && friendlyTarget) {
      const other = choices.find((c) => !sameTarget(c, friendlyTarget));
      if (other) setFriendly(other);
    } else if (!mySection) setMessage('Join a section on the Squad tab to share with just your section.');
  };

  const toggleHostView = (on: boolean) => {
    reset({ type: 'cursor' });
    run(() => api.setMapHostView(dayId, on));
  };

  const affColour = affiliation === 'enemy' ? colours.danger : colours.accent;

  const rail = (
    <View style={styles.rail}>
      {isAdmin && (
        <RailButton
          label={hostView ? 'Host view on' : 'Host view off'}
          icon="shield-crown"
          active={hostView}
          onPress={() => toggleHostView(!hostView)}
        />
      )}
      <RailButton label="Map" icon="cursor-default-outline" active={tool.type === 'cursor'} onPress={() => reset({ type: 'cursor' })} />
      <RailButton label={affiliation === 'friendly' ? 'Friendly' : 'Enemy'} onPress={toggleAffiliation} colour={affColour}>
        <Text style={[styles.railLetter, { color: affColour }]}>{affiliation === 'friendly' ? 'F' : 'E'}</Text>
      </RailButton>
      <RailButton label={`Audience: ${targetName(target)}`} onPress={onTargetPress} active={palette === 'target'}>
        <Text style={styles.railSmall} numberOfLines={1}>
          {targetShort(target)}
        </Text>
      </RailButton>
      <RailButton
        label="Icons"
        icon="map-marker-plus"
        active={tool.type === 'marker' || palette === 'icons'}
        onPress={() => setPalette(palette === 'icons' ? null : 'icons')}
      />
      <RailButton
        label="Draw"
        icon="draw"
        active={tool.type === 'draw' || palette === 'draw'}
        onPress={() => setPalette(palette === 'draw' ? null : 'draw')}
      />
      <RailButton label="Delete" icon="eraser" active={tool.type === 'delete'} onPress={() => reset({ type: 'delete' })} />
    </View>
  );

  const paletteView =
    palette === 'icons' ? (
      <View style={styles.palette}>
        {markersFor(affiliation).map((m) => (
          <PaletteButton
            key={m.id}
            label={m.name}
            icon={m.icon}
            colour={affColour}
            active={tool.type === 'marker' && tool.id === m.id}
            onPress={() => reset({ type: 'marker', id: m.id })}
          />
        ))}
      </View>
    ) : palette === 'draw' ? (
      <View style={styles.palette}>
        {DRAW_TOOLS.map((t) => (
          <PaletteButton
            key={t.kind}
            label={t.name}
            icon={t.icon}
            colour={affColour}
            active={tool.type === 'draw' && tool.kind === t.kind}
            onPress={() => {
              reset({ type: 'draw', kind: t.kind });
              setText('');
            }}
          />
        ))}
      </View>
    ) : palette === 'target' ? (
      <ScrollView style={styles.targetMenu} contentContainerStyle={{ gap: 2 }}>
        {choices
          .filter((c) => affiliation === 'friendly' || c.audience === 'team')
          .map((c) => {
            const on = !!target && sameTarget(c, target);
            const team = teamById(c.team_id);
            return (
              <Pressable
                key={`${c.audience}-${c.team_id}-${c.section_id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  if (affiliation === 'friendly') setFriendly(c);
                  else setEnemyTeam(c.team_id);
                  setPalette(null);
                }}
                style={[styles.targetRow, on && styles.targetRowOn, c.audience === 'section' && { paddingLeft: space.lg }]}
              >
                <View style={[styles.dot, { backgroundColor: team ? teamColour(team.colour) : colours.text }]} />
                <Text style={styles.targetText}>
                  {c.audience === 'admin' ? 'Admin only' : c.audience === 'team' ? `${team?.name ?? 'Team'} (whole team)` : sectionById(c.section_id)?.name}
                </Text>
              </Pressable>
            );
          })}
      </ScrollView>
    ) : null;

  const needsText = tool.type === 'draw' && drawTool(tool.kind).kind === 'label' && draft.length > 0;
  const optionalNote = tool.type === 'marker' || (tool.type === 'draw' && tool.kind !== 'label' && tool.kind !== 'waypoints');

  const strip = toolName ? (
    <View style={styles.strip}>
      <Text style={styles.stripTitle} numberOfLines={1}>
        {toolName}
        {tool.type !== 'delete' ? ` · ${affiliation === 'friendly' ? 'Friendly' : 'Enemy'} · ${targetName(target)}` : ''}
      </Text>
      <Text style={styles.stripHint}>{hint}</Text>
      {(needsText || optionalNote) && (
        <TextInput
          value={text}
          onChangeText={setText}
          maxLength={40}
          placeholder={needsText ? 'Label text' : 'Note (optional), e.g. Rally here'}
          placeholderTextColor={colours.textSecondary}
          style={styles.input}
          autoFocus={needsText}
        />
      )}
      {tool.type === 'draw' && tool.kind === 'waypoints' && (
        <View style={styles.stripRow}>
          <Text style={styles.stripHint}>Link points</Text>
          <Switch value={linked} onValueChange={setLinked} />
        </View>
      )}
      {!!message && <Text style={styles.stripError}>{message}</Text>}
      <View style={styles.stripRow}>
        {tool.type === 'draw' && drawTool(tool.kind).max > 2 && (
          <StripButton title="Finish" onPress={finish} disabled={busy || draft.length < drawTool(tool.kind).min} primary />
        )}
        {needsText && <StripButton title="Place" onPress={finish} disabled={busy || !text.trim()} primary />}
        {tool.type === 'delete' && draft.length >= 3 && (
          <StripButton
            title={`Delete ${inBoundary.mine.length}`}
            onPress={deleteInside}
            disabled={busy || !inBoundary.mine.length}
            danger
          />
        )}
        {(tool.type === 'draw' || tool.type === 'delete') && draft.length > 0 && (
          <StripButton title="Undo" onPress={() => setDraft((d) => d.slice(0, -1))} />
        )}
        <StripButton title={draft.length ? 'Cancel' : 'Done'} onPress={() => (draft.length ? setDraft([]) : reset({ type: 'cursor' }))} />
      </View>
      {tool.type === 'delete' && inBoundary.others > 0 && (
        <Text style={styles.stripHint}>{inBoundary.others} inside aren&apos;t yours to delete.</Text>
      )}
    </View>
  ) : selected ? (
    <View style={styles.strip}>
      <Text style={styles.stripTitle} numberOfLines={1}>
        {objectName(selected)}
        {selected.label && selected.kind !== 'label' ? ` · ${selected.label}` : ''}
      </Text>
      <Text style={styles.stripHint}>
        {selected.affiliation === 'enemy' ? 'Enemy' : 'Friendly'} ·{' '}
        {selected.audience === 'admin'
          ? 'Admin only'
          : selected.audience === 'section'
            ? sectionById(selected.section_id)?.name ?? 'Section'
            : teamById(selected.team_id)?.name ?? 'Team'}{' '}
        · by {callsign(selected.created_by)}
        {selected.affiliation === 'enemy' ? ` · seen ${sightingAge(now - Date.parse(selected.created_at))} ago` : ''}
      </Text>
      {canChange(selected) && (
        <Text style={styles.stripHint}>
          {selected.kind === 'marker' || selected.kind === 'label' ? 'Hold and drag it to move.' : 'Drag the white corners to reshape.'}
        </Text>
      )}
      {!!message && <Text style={styles.stripError}>{message}</Text>}
      <View style={styles.stripRow}>
        {canChange(selected) && (
          <StripButton
            title="Delete"
            danger
            disabled={busy}
            onPress={async () => {
              const id = selected.id;
              if (await run(() => api.deleteMapObjects(dayId, [id]))) {
                setObjects((prev) => prev.filter((o) => o.id !== id));
                setSelectedId(null);
              }
            }}
          />
        )}
        <StripButton title="Close" onPress={() => setSelectedId(null)} />
      </View>
    </View>
  ) : message ? (
    <Pressable style={styles.strip} onPress={() => setMessage('')}>
      <Text style={styles.stripError}>{message}</Text>
    </Pressable>
  ) : null;

  return {
    drawings,
    toolDraft,
    selectedId,
    onMapPress,
    onDrawingPress,
    onDrawingMove,
    /** True while a tool is active or a drawing is selected (the strip is showing). */
    busyStrip: !!strip,
    rail,
    palette: paletteView,
    strip,
  };
}

function RailButton({
  label,
  icon,
  active,
  colour,
  onPress,
  children,
}: {
  label: string;
  icon?: string;
  active?: boolean;
  colour?: string;
  onPress: () => void;
  children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={[styles.railButton, active && styles.railButtonOn]}
    >
      {children ?? <MaterialCommunityIcons name={icon as never} size={20} color={colour ?? (active ? colours.onAccent : colours.text)} />}
    </Pressable>
  );
}

function PaletteButton({
  label,
  icon,
  colour,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  colour: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.paletteButton, active && { borderColor: colour }]}
    >
      <MaterialCommunityIcons name={icon as never} size={20} color={colour} />
      <Text style={styles.paletteLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function StripButton({
  title,
  onPress,
  disabled,
  primary,
  danger,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.stripButton,
        primary && { backgroundColor: colours.accent, borderColor: colours.accent },
        danger && { borderColor: colours.danger },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.stripButtonText, primary && { color: colours.onAccent }, danger && { color: colours.danger }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const panel = {
  backgroundColor: 'rgba(11,16,12,0.92)',
  borderColor: colours.border,
  borderWidth: 1,
  borderRadius: radius,
};

const styles = StyleSheet.create({
  rail: { ...panel, padding: 2, gap: 2, alignItems: 'center' },
  railButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  railButtonOn: { backgroundColor: colours.accent },
  railLetter: { fontFamily: fonts.display, fontSize: 20 },
  railSmall: { color: colours.text, fontFamily: fonts.semibold, fontSize: 10 },
  palette: { ...panel, flexDirection: 'row', flexWrap: 'wrap', padding: space.xs, gap: space.xs, width: 236 },
  paletteButton: {
    width: 54,
    height: 54,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  paletteLabel: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 10, maxWidth: 52 },
  targetMenu: { ...panel, maxHeight: 300, width: 220, padding: space.xs },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40, paddingHorizontal: space.sm, borderRadius: 8 },
  targetRowOn: { backgroundColor: colours.selection },
  targetText: { color: colours.text, fontFamily: fonts.medium, fontSize: 14, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  strip: { ...panel, padding: space.sm, gap: space.xs },
  stripTitle: { color: colours.text, fontFamily: fonts.semibold, fontSize: 13 },
  stripHint: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 12 },
  stripError: { color: colours.danger, fontFamily: fonts.medium, fontSize: 12 },
  stripRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  stripButton: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colours.border,
    justifyContent: 'center',
  },
  stripButtonText: { color: colours.text, fontFamily: fonts.semibold, fontSize: 14 },
  input: {
    color: colours.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: space.sm,
    minHeight: 40,
  },
});
