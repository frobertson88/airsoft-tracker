// Game tab: your assignment, the current game and clock, and your squad (docs/design-direction.md).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MemberRow } from '../../../components/MemberList';
import { GameClock } from '../../../components/GameClock';
import { PatrolCard } from '../../../components/PatrolPlay';
import { Body, Button, Card, Display, Label, Screen } from '../../../components/ui';
import { useDay } from '../../../lib/day';
import { clockFor, useServerNow } from '../../../lib/game';
import { chancePercents, EXPIRY_LABEL, helperText, medicOf, ORDINAL } from '../../../lib/medic';
import { colours, space, teamColour, fonts } from '../../../theme';

// The team each player last acknowledged, per day, so a shuffle shows once.
const seenTeam = new Map<string, string | null>();

export default function GameTab() {
  const { id, data, me, teamById, sectionById } = useDay();
  const [, refresh] = useState(0);
  const now = useServerNow(1000);
  if (!data || !me) return null;

  // Picking a team yourself after having none isn't news.
  if (!seenTeam.has(id) || seenTeam.get(id) === null) seenTeam.set(id, me.team_id);
  const movedTo = me.team_id && seenTeam.get(id) !== me.team_id ? teamById(me.team_id) : undefined;

  const medic = medicOf(data.game);
  const team = teamById(me.team_id);
  const section = sectionById(me.section_id);
  const active = data.members.filter((m) => m.status === 'active');
  // Show your section if you have one, otherwise your team.
  const squad = section
    ? active.filter((m) => m.section_id === section.id)
    : active.filter((m) => team && m.team_id === team.id);

  return (
    <Screen>
      {movedTo && (
        <Card style={{ borderColor: teamColour(movedTo.colour), padding: space.lg, gap: space.md }}>
          <Text style={styles.kicker}>Teams changed</Text>
          <Display size={30} colour={teamColour(movedTo.colour)}>
            You’re on {movedTo.name}
          </Display>
          <Body muted>{section ? `Section: ${section.name}` : 'Your section was reset. Pick one on the Squad tab if you use them.'}</Body>
          <Button
            title="Got it"
            onPress={() => {
              seenTeam.set(id, me.team_id);
              refresh((n) => n + 1);
            }}
          />
        </Card>
      )}
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
        <>
          <GameClock game={data.game} />
          {data.game.mode === 'patrol' && <PatrolCard game={data.game} clock={clockFor(data.game, now)} />}
        </>
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

      {medic && (
        <>
          <Label>Medic rules · {medic.name}</Label>
          <Card>
            {medic.wounds?.length ? (
              <>
                <Text style={styles.role}>Each hit is a random wound:</Text>
                {medic.wounds.map((w, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <Text style={styles.wound}>
                      {w.name} · {chancePercents(medic.wounds!)[i]}%
                    </Text>
                    {!!w.instruction && <Text style={styles.role}>{w.instruction}</Text>}
                    <Text style={styles.role}>
                      {w.fatal ? 'Dead at once' : `Treated by ${helperText(w.helpers).toLowerCase()}`}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
            {medic.hits.map((h, i) =>
              medic.wounds?.length && i < medic.hits.length - 1 ? null : (
                <View key={i} style={{ gap: 2 }}>
                  <Text style={styles.wound}>
                    {h.name}
                    {medic.wounds?.length ? ` · ${ORDINAL[medic.dead_on ?? 3]} hit` : ''}
                  </Text>
                  {!!h.instruction && <Text style={styles.role}>{h.instruction}</Text>}
                  <Text style={styles.role}>
                    {i === medic.hits.length - 1 ? 'Brought back by' : 'Treated by'} {helperText(h.helpers).toLowerCase()}
                  </Text>
                </View>
              ),
            )}
            <Text style={styles.role}>
              Bleed-out {medic.bleed_minutes} min · {EXPIRY_LABEL[medic.expiry].toLowerCase()}. Tap I’m hit on the Map
              when you’re hit.
            </Text>
          </Card>
        </>
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
  wound: { color: colours.text, fontFamily: fonts.semibold, fontSize: 15 },
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
