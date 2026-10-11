// Game tab: your assignment, the current game and clock, and your squad (docs/design-direction.md).
import { StyleSheet, Text, View } from 'react-native';
import { MemberRow } from '../../../components/MemberList';
import { GameClock } from '../../../components/GameClock';
import { Body, Card, Display, Label, Screen } from '../../../components/ui';
import { useDay } from '../../../lib/day';
import { colours, space, teamColour, fonts } from '../../../theme';

export default function GameTab() {
  const { data, me, teamById, sectionById } = useDay();
  if (!data || !me) return null;

  const team = teamById(me.team_id);
  const section = sectionById(me.section_id);
  const active = data.members.filter((m) => m.status === 'active');
  // Show your section if you have one, otherwise your team.
  const squad = section
    ? active.filter((m) => m.section_id === section.id)
    : active.filter((m) => team && m.team_id === team.id);

  return (
    <Screen>
      {team ? (
        <View style={[styles.assignment, { borderColor: teamColour(team.colour) }]}>
          <Text style={[styles.assignmentText, { color: teamColour(team.colour) }]}>
            {team.name}
            {section ? ` · ${section.name}` : ''}
          </Text>
          <Text style={styles.role}>{me.day_role}</Text>
        </View>
      ) : (
        <Body muted>Hosting, not playing</Body>
      )}

      {data.game ? (
        <GameClock game={data.game} />
      ) : (
        <Card style={{ padding: space.lg, gap: space.md }}>
          <Text style={styles.kicker}>Next up</Text>
          <Display size={32}>No game yet</Display>
          <View style={styles.waiting}>
            <View style={styles.dot} />
            <Body>Waiting for the host to set up a game</Body>
          </View>
        </Card>
      )}

      {team && (
        <>
          <Label>{section ? `${section.name} section` : `${team.name} team`}</Label>
          <Card>
            {squad.map((m) => (
              <MemberRow key={m.user_id} member={m} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  assignment: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.lg,
    minHeight: 44,
    backgroundColor: colours.surface,
  },
  assignmentText: { fontFamily: fonts.semibold, fontSize: 15 },
  role: { color: colours.textSecondary, fontFamily: fonts.regular, fontSize: 14 },
  kicker: {
    color: colours.accent,
    fontFamily: fonts.semibold, fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: 10,
    backgroundColor: colours.background,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colours.accent },
});
