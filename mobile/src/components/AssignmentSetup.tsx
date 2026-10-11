// One-screen check in: team, today's role, optional section (docs/app-flow.md §3).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useCommand, useDay } from '../lib/day';
import { ROLE_CHOICES } from '../lib/types';
import { colours, display, radius, space, teamColour, fonts } from '../theme';
import { Body, Button, Card, Chip, ErrorText, Field, Label, Row } from './ui';

export function AssignmentSetup({ onDone, doneTitle = 'Done' }: { onDone: () => void; doneTitle?: string }) {
  const { id, data, me, sectionById, teamById } = useDay();
  const { run, busy, error } = useCommand();
  const [newSection, setNewSection] = useState('');
  const [creating, setCreating] = useState(false);
  if (!data || !me) return null;

  const activeMembers = data.members.filter((m) => m.status === 'active');
  const teamSections = data.sections.filter((s) => s.team_id === me.team_id);
  const ready = !!me.day_role && !!me.team_id;
  const team = teamById(me.team_id);
  const section = sectionById(me.section_id);
  const summary = ready ? [me.day_role, team?.name, section?.name].filter(Boolean).join(' · ') : '';

  return (
    <>
      <Label>Team</Label>
      <View style={styles.teams}>
        {data.teams.map((t) => {
          const count = activeMembers.filter((m) => m.team_id === t.id).length;
          const selected = me.team_id === t.id;
          const colour = teamColour(t.colour);
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => run(() => api.chooseTeam(id, t.id))}
              style={[styles.team, selected && { borderColor: colour, backgroundColor: colours.selection }]}
            >
              <Text style={[styles.teamName, { color: colour }]}>{t.name}</Text>
              <Text style={styles.count}>
                {count} {count === 1 ? 'player' : 'players'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Label>Today’s role</Label>
      <Row>
        {ROLE_CHOICES.map((role) => (
          <Chip
            key={role}
            label={role}
            selected={me.day_role === role}
            onPress={() => run(() => api.setDayRole(id, role))}
          />
        ))}
      </Row>

      {me.team_id && (
        <>
          <Label>Section (optional)</Label>
          <Row>
            {teamSections.map((s) => {
              const count = activeMembers.filter((m) => m.section_id === s.id).length;
              return (
                <Chip
                  key={s.id}
                  label={`${s.name} · ${count}`}
                  selected={me.section_id === s.id}
                  onPress={() => run(() => api.chooseSection(id, s.id))}
                />
              );
            })}
            <Chip label="None" selected={!me.section_id} onPress={() => run(() => api.chooseSection(id, null))} />
          </Row>
          {teamSections.length === 0 && <Body muted>No sections in your team yet.</Body>}
          {!creating ? (
            <Pressable onPress={() => setCreating(true)} accessibilityRole="button" style={styles.newLink}>
              <Text style={styles.newLinkText}>+ Start a new section</Text>
            </Pressable>
          ) : (
            <Card>
              <Body muted>You’ll lead the new section. You can hand the lead to someone else later.</Body>
              <Field
                value={newSection}
                onChangeText={setNewSection}
                placeholder="Section name, e.g. Alpha"
                maxLength={24}
                autoFocus
              />
              <Row>
                <Button
                  title="Create & join"
                  variant="quiet"
                  disabled={!newSection.trim()}
                  busy={busy}
                  onPress={async () => {
                    if (await run(() => api.createSection(id, newSection.trim()))) {
                      setNewSection('');
                      setCreating(false);
                    }
                  }}
                />
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setNewSection('');
                    setCreating(false);
                  }}
                />
              </Row>
            </Card>
          )}
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <Body muted>Your team sees your position while you’re in this Game Day.</Body>
      <Button title={ready ? `${doneTitle} · ${summary}` : doneTitle} onPress={onDone} disabled={!ready} />
    </>
  );
}

const styles = StyleSheet.create({
  teams: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  team: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius + 2,
    borderWidth: 2,
    borderColor: colours.border,
    backgroundColor: colours.surface,
  },
  teamName: { fontSize: 26, ...display },
  newLink: { minHeight: 44, justifyContent: 'center' },
  newLinkText: { color: colours.accent, fontFamily: fonts.medium, fontSize: 15 },
  count: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 13 },
});
