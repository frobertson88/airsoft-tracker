// Squad: your assignment, your team (your section open, others folded) and the
// other teams folded below. Admins tap a player to manage them; section leads
// can hand the lead to someone in their section.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AssignmentSetup } from '../../../components/AssignmentSetup';
import { MemberRow } from '../../../components/MemberList';
import { MemberSheet } from '../../../components/MemberSheet';
import {
  Body,
  Button,
  Card,
  ErrorText,
  Field,
  Label,
  Row,
  Screen,
  Title,
} from '../../../components/ui';
import { api } from '../../../lib/api';
import { useCommand, useDay } from '../../../lib/day';
import type { DayMember, Section, Team } from '../../../lib/types';
import { colours, display, fonts, radius, space, TEAM_COLOURS, teamColour, type TeamColour } from '../../../theme';

const label = (c: string) => c[0].toUpperCase() + c.slice(1);

function Fold({
  title,
  subtitle,
  colour,
  open,
  onToggle,
  big,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  colour?: string;
  open: boolean;
  onToggle: () => void;
  big?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.foldHeader}
      >
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={[big ? styles.teamTitle : styles.sectionTitle, colour ? { color: colour } : null]}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colours.textSecondary} />
      </Pressable>
      {open && children}
    </View>
  );
}

function SectionBlock({
  section,
  members,
  initiallyOpen,
  onMember,
}: {
  section: Section;
  members: DayMember[];
  initiallyOpen: boolean;
  onMember?: (m: DayMember) => void;
}) {
  const { me, isAdmin, callsign } = useDay();
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(initiallyOpen);
  if (!me) return null;

  const leadId = section.leader_id;
  const canReassign = isAdmin || leadId === me.user_id;
  const mine = me.section_id === section.id;

  return (
    <View style={[styles.section, mine && styles.sectionMine]}>
      <Fold
        title={`${section.name} · ${members.length}`}
        subtitle={leadId ? `Lead: ${callsign(leadId)}` : 'No lead'}
        open={open}
        onToggle={() => setOpen(!open)}
      >
        {members.map((m) => (
          <MemberRow
            key={m.user_id}
            member={m}
            onPress={onMember && (() => onMember(m))}
            action={
              canReassign && m.user_id !== leadId
                ? { label: 'Make lead', onPress: () => run(() => api.setSectionLeader(section.id, m.user_id)) }
                : undefined
            }
          />
        ))}
        {members.length === 0 && <Body muted>Nobody in this section.</Body>}
        {!leadId && mine && (
          <Button
            title="Take the lead"
            variant="quiet"
            busy={busy}
            onPress={() => run(() => api.setSectionLeader(section.id, me.user_id))}
          />
        )}
        <ErrorText>{error}</ErrorText>
      </Fold>
    </View>
  );
}

function TeamBlock({
  team,
  mine,
  onMember,
}: {
  team: Team;
  mine: boolean;
  onMember?: (m: DayMember) => void;
}) {
  const { data, me, isAdmin } = useDay();
  const { run, busy, error } = useCommand();
  const [open, setOpen] = useState(mine);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [colour, setColour] = useState<TeamColour>(team.colour);
  if (!data || !me) return null;

  // Picking a colour another team has swaps the two.
  const swapWith = colour !== team.colour ? data.allTeams.find((t) => t.colour === colour) : undefined;
  const changed = (name.trim() && name.trim() !== team.name) || colour !== team.colour;
  const startEdit = () => {
    setName(team.name);
    setColour(team.colour);
    setEditing(true);
  };
  const save = async () => {
    const ok = await run(async () => {
      if (colour !== team.colour) await api.setTeamColour(team.id, colour);
      if (name.trim() && name.trim() !== team.name) await api.renameTeam(team.id, name.trim());
    });
    if (ok) setEditing(false);
  };

  const members = data.members.filter((m) => m.status === 'active' && m.team_id === team.id);
  // Your own section first.
  const sections = data.sections
    .filter((s) => s.team_id === team.id)
    .sort((a, b) => Number(b.id === me.section_id) - Number(a.id === me.section_id));
  const unassigned = members.filter((m) => !m.section_id);

  return (
    <Card>
      <Fold
        big
        title={`${team.name} · ${members.length}`}
        subtitle={`${sections.length} ${sections.length === 1 ? 'section' : 'sections'}${mine ? ' · Your team' : ''}`}
        colour={teamColour(team.colour)}
        open={open}
        onToggle={() => setOpen(!open)}
      >
        {isAdmin && !editing && (
          <Pressable onPress={startEdit} accessibilityRole="button" style={styles.rename}>
            <Text style={styles.renameText}>Edit name and colour</Text>
          </Pressable>
        )}
        {editing && (
          <View style={styles.editor}>
            <Field value={name} onChangeText={setName} maxLength={24} placeholder="Team name" />
            <View style={styles.swatches}>
              {TEAM_COLOURS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    // A name that is just the colour follows the colour.
                    if (name.trim() === label(colour)) setName(label(c));
                    setColour(c);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={c}
                  accessibilityState={{ selected: c === colour }}
                  style={[styles.swatch, { backgroundColor: teamColour(c) }, c === colour && styles.swatchOn]}
                >
                  {c === colour && <Ionicons name="checkmark" size={20} color={colours.onAccent} />}
                </Pressable>
              ))}
            </View>
            {swapWith && <Body muted>{`${swapWith.name} will take ${team.name}'s colour.`}</Body>}
            <Row>
              <Button title="Save" busy={busy} disabled={!changed} onPress={save} />
              <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} />
            </Row>
            <ErrorText>{error}</ErrorText>
          </View>
        )}

        {sections.map((s) => (
          <SectionBlock
            key={s.id}
            section={s}
            members={members.filter((m) => m.section_id === s.id)}
            initiallyOpen={s.id === me.section_id}
            onMember={onMember}
          />
        ))}
        {unassigned.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.subtitle}>No section · {unassigned.length}</Text>
            {unassigned.map((m) => (
              <MemberRow key={m.user_id} member={m} onPress={onMember && (() => onMember(m))} />
            ))}
          </View>
        )}
        {members.length === 0 && <Body muted>No players yet.</Body>}
      </Fold>
    </Card>
  );
}

export default function TeamTab() {
  const { id, data, me, isAdmin, teamById, sectionById } = useDay();
  const { run, busy, error } = useCommand();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<DayMember | null>(null);
  if (!data || !me) return null;

  const team = teamById(me.team_id);
  const section = sectionById(me.section_id);
  const iLead = !!section && section.leader_id === me.user_id;
  const myTeam = data.teams.find((t) => t.id === me.team_id);
  const otherTeams = data.teams.filter((t) => t.id !== me.team_id);
  const noTeam = data.members.filter((m) => m.status === 'active' && !m.team_id);
  const removed = data.members.filter((m) => m.status === 'removed');
  const onMember = isAdmin ? setSelected : undefined;

  return (
    <Screen>
      <Card>
        <Text style={styles.assignment}>
          {team ? <Text style={{ color: teamColour(team.colour) }}>{team.name}</Text> : 'No team'}
          {team ? ` · ${section?.name ?? 'No section'}` : ''}
        </Text>
        <Body muted>
          {me.day_role ?? 'No role'}
          {iLead ? ' · Section lead' : ''}
          {me.is_admin ? ' · Admin' : ''}
        </Body>
        <Button title="Change" variant="secondary" onPress={() => setEditing(true)} />
      </Card>

      {myTeam && <TeamBlock key={myTeam.id} team={myTeam} mine onMember={onMember} />}

      {otherTeams.length > 0 && <Label>{myTeam ? 'Other teams' : 'Teams'}</Label>}
      {otherTeams.map((t) => (
        <TeamBlock key={t.id} team={t} mine={false} onMember={onMember} />
      ))}

      {noTeam.length > 0 && (
        <Card>
          <Body muted>No team yet</Body>
          {noTeam.map((m) => (
            <MemberRow key={m.user_id} member={m} onPress={onMember && (() => onMember(m))} />
          ))}
        </Card>
      )}

      {isAdmin && removed.length > 0 && (
        <>
          <Label>Removed</Label>
          <Card>
            {removed.map((m) => (
              <Row key={m.user_id} style={{ justifyContent: 'space-between' }}>
                <MemberRow member={m} />
                <Button
                  title="Readmit"
                  variant="secondary"
                  busy={busy}
                  onPress={() => run(() => api.readmitMember(id, m.user_id))}
                />
              </Row>
            ))}
            <ErrorText>{error}</ErrorText>
          </Card>
        </>
      )}
      {isAdmin && <Body muted>Tap a player to change their assignment, section lead or admin access.</Body>}

      <Modal
        visible={editing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditing(false)}
      >
        <Screen edges={['top', 'bottom']}>
          <Title>Your assignment</Title>
          <AssignmentSetup onDone={() => setEditing(false)} />
        </Screen>
      </Modal>

      {selected && (
        <MemberSheet key={selected.user_id} member={selected} onClose={() => setSelected(null)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  assignment: { color: colours.text, fontSize: 24, ...display },
  foldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    gap: space.sm,
  },
  teamTitle: { color: colours.text, fontSize: 24, ...display },
  sectionTitle: { color: colours.text, fontSize: 18, fontFamily: fonts.displaySemi, textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  section: {
    backgroundColor: colours.background,
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  sectionMine: { borderColor: colours.accent },
  rename: { minHeight: 36, justifyContent: 'center' },
  renameText: { color: colours.accent, fontFamily: fonts.medium, fontSize: 15 },
  editor: { gap: space.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: { borderColor: colours.text },
});
