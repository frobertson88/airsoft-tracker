// Check in / change assignment (docs/app-flow.md §3), laid out like Squad:
// each team is a card; the chosen team opens to show its sections with their
// lead and players. Choices are local until you press the button, which saves
// them in one go.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useCommand, useDay } from '../lib/day';
import { ROLE_CHOICES, type DayRole } from '../lib/types';
import { colours, display, fonts, radius, space, teamColour } from '../theme';
import { Body, Button, Card, Chip, ErrorText, Field, Label, Row } from './ui';

// New sections are named in order by default; the player can change it.
const PHONETIC = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'];

// '' = no section; 'new' = start a new one with the typed name.
type SectionChoice = string | '' | 'new';

export function AssignmentSetup({ onDone, doneTitle = 'Save' }: { onDone: () => void; doneTitle?: string }) {
  const { id, data, me, callsign } = useDay();
  const { run, busy, error, setError } = useCommand();
  const [role, setRole] = useState<DayRole | null>(me?.day_role ?? null);
  const [team, setTeam] = useState<string | null>(me?.team_id ?? null);
  const [section, setSection] = useState<SectionChoice>(me?.section_id ?? '');
  const [newName, setNewName] = useState('');
  if (!data || !me) return null;

  const active = data.members.filter((m) => m.status === 'active');
  const chosenTeam = data.teams.find((t) => t.id === team);
  const chosenSection = data.sections.find((s) => s.id === section);
  const ready = !!role && !!team && (section !== 'new' || !!newName.trim());
  const summary = [
    role,
    chosenTeam?.name,
    section === 'new' ? newName.trim() || 'New section' : chosenSection?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  const taken = new Set(data.sections.filter((s) => s.team_id === team).map((s) => s.name.toLowerCase()));
  const nextName = PHONETIC.find((n) => !taken.has(n.toLowerCase())) ?? '';

  const pickTeam = (t: string) => {
    if (t !== team) setSection('');
    setTeam(t);
  };

  const save = async () => {
    if (!role || !team) return;
    const ok = await run(async () => {
      if (team !== me.team_id) await api.chooseTeam(id, team);
      if (role !== me.day_role) await api.setDayRole(id, role);
      if (section === 'new') await api.createSection(id, newName.trim());
      // Changing team clears the old section, so re-apply whenever the team changed.
      else if (section !== (me.section_id ?? '') || team !== me.team_id) {
        await api.chooseSection(id, section || null);
      }
    });
    if (ok) onDone();
  };

  return (
    <>
      <Label>Today’s role</Label>
      <Row>
        {ROLE_CHOICES.map((r) => (
          <Chip key={r} label={r} selected={role === r} onPress={() => setRole(r)} />
        ))}
      </Row>

      <Label>Team and section</Label>
      {data.teams.map((t) => {
        const members = active.filter((m) => m.team_id === t.id && m.user_id !== me.user_id);
        const sections = data.sections.filter((s) => s.team_id === t.id);
        const open = team === t.id;
        const colour = teamColour(t.colour);
        return (
          <Card key={t.id} style={open ? { borderColor: colour } : undefined}>
            <Pressable
              onPress={() => pickTeam(t.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: open }}
              style={styles.header}
            >
              <View style={{ flexShrink: 1, gap: 2 }}>
                <Text style={[styles.teamTitle, { color: colour }]}>
                  {t.name} · {members.length + (open ? 1 : 0)}
                </Text>
                <Text style={styles.subtitle}>
                  {sections.length} {sections.length === 1 ? 'section' : 'sections'}
                </Text>
              </View>
              <Ionicons
                name={open ? 'radio-button-on' : 'radio-button-off'}
                size={24}
                color={open ? colour : colours.textSecondary}
              />
            </Pressable>

            {open && (
              <>
                {sections.map((s) => {
                  const inIt = members.filter((m) => m.section_id === s.id);
                  const selected = section === s.id;
                  return (
                    <SectionRow
                      key={s.id}
                      title={`${s.name} · ${inIt.length + (selected ? 1 : 0)}`}
                      subtitle={[
                        s.leader_id ? `Lead: ${callsign(s.leader_id)}` : 'No lead',
                        inIt
                          .filter((m) => m.user_id !== s.leader_id)
                          .map((m) => callsign(m.user_id))
                          .join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      selected={selected}
                      onPress={() => setSection(s.id)}
                    />
                  );
                })}
                <SectionRow
                  title="No section"
                  subtitle="Join one later"
                  selected={section === ''}
                  onPress={() => setSection('')}
                />
                {section === 'new' ? (
                  <View style={styles.newBox}>
                    <Field
                      value={newName}
                      onChangeText={(v) => {
                        setNewName(v);
                        setError('');
                      }}
                      placeholder="Section name"
                      maxLength={24}
                      autoFocus
                    />
                    <Text style={styles.subtitle}>You’ll lead it. You can hand the lead on later.</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setNewName(nextName);
                      setSection('new');
                    }}
                    accessibilityRole="button"
                    style={styles.newLink}
                  >
                    <Text style={styles.newLinkText}>+ Start {nextName ? `${nextName} section` : 'a new section'}</Text>
                  </Pressable>
                )}
              </>
            )}
          </Card>
        );
      })}

      <ErrorText>{error}</ErrorText>
      <Body muted>Your team sees your position while you’re in this Game Day.</Body>
      <Button
        title={ready ? `${doneTitle} · ${summary}` : role ? 'Pick a team' : 'Pick a role'}
        onPress={save}
        busy={busy}
        disabled={!ready}
      />
    </>
  );
}

function SectionRow({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.section, selected && styles.sectionSelected]}
    >
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colours.accent : colours.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, gap: space.sm },
  teamTitle: { fontSize: 24, ...display },
  sectionTitle: {
    color: colours.text,
    fontSize: 18,
    fontFamily: fonts.displaySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    backgroundColor: colours.background,
    borderColor: colours.border,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sectionSelected: { borderColor: colours.accent, backgroundColor: colours.selection },
  newBox: {
    gap: space.sm,
    borderColor: colours.accent,
    borderWidth: 1,
    borderRadius: radius,
    backgroundColor: colours.selection,
    padding: space.md,
  },
  newLink: { minHeight: 44, justifyContent: 'center' },
  newLinkText: { color: colours.accent, fontFamily: fonts.medium, fontSize: 15 },
});
