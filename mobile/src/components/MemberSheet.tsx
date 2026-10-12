// Admins: correct one player's assignment, section lead, admin access or membership.
import { useState } from 'react';
import { Modal } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCommand, useDay } from '../lib/day';
import { medicOf } from '../lib/medic';
import { ROLE_CHOICES, type DayMember, type DayRole } from '../lib/types';
import { teamColour } from '../theme';
import { Body, Button, Chip, ConfirmButton, ErrorText, Field, Label, Row, Screen, Title } from './ui';

// Render with key={member.user_id} so the form resets per player.
export function MemberSheet({ member, onClose }: { member: DayMember; onClose: () => void }) {
  const { id, data, callsign, sectionById } = useDay();
  const { session } = useAuth();
  const { run, busy, error } = useCommand();
  const [role, setRole] = useState<DayRole | null>(member.day_role);
  const [team, setTeam] = useState<string | null>(member.team_id);
  const [section, setSection] = useState<string | null>(member.section_id);
  const [reason, setReason] = useState('');

  if (!data) return null;
  const memberSection = sectionById(member.section_id);
  const leadsSection = !!memberSection && memberSection.leader_id === member.user_id;
  const isSelf = member.user_id === session?.user.id;
  const changed =
    role !== member.day_role || team !== member.team_id || section !== member.section_id;
  const close = async (fn: () => Promise<unknown>) => {
    if (await run(fn)) onClose();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <Screen edges={['top', 'bottom']}>
        <Title>{callsign(member.user_id)}</Title>

        <Label>Role</Label>
        <Row>
          {ROLE_CHOICES.map((r) => (
            <Chip key={r} label={r} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </Row>

        <Label>Team</Label>
        <Row>
          <Chip
            label="No team"
            selected={!team}
            onPress={() => {
              setTeam(null);
              setSection(null);
            }}
          />
          {data.teams.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              colour={teamColour(t.colour)}
              selected={team === t.id}
              onPress={() => {
                if (team !== t.id) setSection(null);
                setTeam(t.id);
              }}
            />
          ))}
        </Row>

        {team && (
          <>
            <Label>Section</Label>
            <Row>
              <Chip label="Unassigned" selected={!section} onPress={() => setSection(null)} />
              {data.sections
                .filter((s) => s.team_id === team)
                .map((s) => (
                  <Chip key={s.id} label={s.name} selected={section === s.id} onPress={() => setSection(s.id)} />
                ))}
            </Row>
          </>
        )}

        <Button
          title="Save assignment"
          busy={busy}
          disabled={!changed}
          onPress={() => close(() => api.setAssignment(id, member.user_id, role, team, section))}
        />

        {memberSection && !leadsSection && (
          <Button
            title={`Make lead of ${memberSection.name}`}
            variant="secondary"
            busy={busy}
            onPress={() => close(() => api.setSectionLeader(memberSection.id, member.user_id))}
          />
        )}

        {data.game && medicOf(data.game) && data.game.state !== 'complete' && (
          <>
            <Label>Undo a hit</Label>
            <Body muted>Takes back their last hit this life, for a mistake. The history keeps both.</Body>
            <Field value={reason} onChangeText={setReason} placeholder="Reason, e.g. pressed by mistake" maxLength={200} />
            <Button
              title="Undo last hit"
              variant="secondary"
              busy={busy}
              onPress={() => close(() => api.undoHit(data.game!.id, member.user_id, reason.trim()))}
            />
          </>
        )}

        <Label>Access</Label>
        <Body muted>Admins can manage players and teams, and end the Game Day.</Body>
        <Button
          title={member.is_admin ? 'Remove admin' : 'Make admin'}
          variant="secondary"
          busy={busy}
          onPress={() => close(() => api.setAdmin(id, member.user_id, !member.is_admin))}
        />
        {!isSelf && (
          <ConfirmButton
            title="Remove from Game Day"
            confirmTitle="Tap again to remove"
            busy={busy}
            onConfirm={() => close(() => api.removeMember(id, member.user_id))}
          />
        )}

        <ErrorText>{error}</ErrorText>
        <Button title="Close" variant="secondary" onPress={onClose} />
      </Screen>
    </Modal>
  );
}
