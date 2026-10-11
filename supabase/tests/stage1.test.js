// Runs the Stage 1 migration in an in-memory Postgres (PGlite) with a minimal
// Supabase stub (auth.uid(), anon/authenticated roles, realtime publication).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../migrations/0001_stage1.sql', import.meta.url), 'utf8');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- Supabase's default privileges for new objects
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create publication supabase_realtime;
`;

const U = {
  alpha: '00000000-0000-0000-0000-00000000000a',
  bravo: '00000000-0000-0000-0000-00000000000b',
  charlie: '00000000-0000-0000-0000-00000000000c',
  delta: '00000000-0000-0000-0000-00000000000d',
};

let db;

async function as(user, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

async function rejects(promise, key) {
  await assert.rejects(promise, (e) => {
    assert.match(e.message, new RegExp(key));
    return true;
  });
}

const member = async (day, user) =>
  (await db.query('select * from day_members where game_day_id=$1 and user_id=$2', [day, user])).rows[0];

let day;
let blue;
let red;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(migration);
  for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);
});

test('create day requires a callsign, then makes two teams and creator admin', async () => {
  await rejects(as(U.alpha, 'select create_game_day($1)', ['Sunday']), 'profile_required');
  await as(U.alpha, 'select set_callsign($1)', ['Ranger']);
  day = (await as(U.alpha, 'select create_game_day($1) as id', ['Sunday Ops']))[0].id;
  const teams = await as(U.alpha, 'select * from teams where game_day_id=$1 order by sort_order', [day]);
  assert.deepEqual(teams.map((t) => t.name), ['Blue', 'Red']);
  [blue, red] = teams.map((t) => t.id);
  assert.equal((await member(day, U.alpha)).is_admin, true);
});

test('public list shows open day with host and count', async () => {
  const rows = await as(U.bravo, 'select * from list_open_days()');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].host_callsign, 'Ranger');
  assert.equal(rows[0].player_count, 1);
  assert.equal(rows[0].my_status, null);
});

test('anon cannot use commands or read tables', async () => {
  await rejects(as(null, 'select * from list_open_days()'), 'permission denied');
  await rejects(as(null, 'select * from game_days'), 'permission denied');
});

test('join requires callsign, is idempotent', async () => {
  await rejects(as(U.bravo, 'select join_game_day($1)', [day]), 'profile_required');
  await as(U.bravo, 'select set_callsign($1)', ['Ghost']);
  await as(U.bravo, 'select join_game_day($1)', [day]);
  await as(U.bravo, 'select join_game_day($1)', [day]);
  const m = await member(day, U.bravo);
  assert.equal(m.status, 'active');
  assert.equal(m.is_admin, false);
});

test('direct table writes are denied', async () => {
  await rejects(as(U.bravo, `update day_members set is_admin = true where user_id = $1`, [U.bravo]), 'permission denied');
  await rejects(as(U.bravo, `insert into game_days (name, created_by) values ('x', $1)`, [U.bravo]), 'permission denied');
  await rejects(as(U.bravo, `update teams set name = 'x'`), 'permission denied');
  await rejects(as(U.bravo, `select _require_user()`), 'permission denied');
});

test('role, team and section setup', async () => {
  await rejects(as(U.bravo, 'select set_day_role($1,$2)', [day, 'Wizard']), 'check constraint');
  await as(U.bravo, 'select set_day_role($1,$2)', [day, 'Machine Gunner']);
  await rejects(as(U.bravo, 'select create_section($1,$2)', [day, 'Alpha']), 'team_required');
  await as(U.bravo, 'select choose_team($1,$2)', [day, blue]);
  const alpha = (await as(U.bravo, 'select create_section($1,$2) as id', [day, 'Alpha']))[0].id;
  let m = await member(day, U.bravo);
  assert.equal(m.section_id, alpha);
  assert.equal(m.day_role, 'Machine Gunner');

  await rejects(as(U.bravo, 'select create_section($1,$2)', [day, ' alpha ']), 'section_name_taken');

  // Section from another team is rejected
  await as(U.alpha, 'select choose_team($1,$2)', [day, red]);
  const redSec = (await as(U.alpha, 'select create_section($1,$2) as id', [day, 'Hammer']))[0].id;
  await rejects(as(U.bravo, 'select choose_section($1,$2)', [day, redSec]), 'section_not_found');

  // Changing team clears section, keeps role
  await as(U.bravo, 'select choose_team($1,$2)', [day, red]);
  m = await member(day, U.bravo);
  assert.equal(m.team_id, red);
  assert.equal(m.section_id, null);
  assert.equal(m.day_role, 'Machine Gunner');

  // Unassigned
  await as(U.bravo, 'select choose_section($1,$2)', [day, redSec]);
  await as(U.bravo, 'select choose_section($1,null)', [day]);
  assert.equal((await member(day, U.bravo)).section_id, null);
});

test('non-admins cannot run admin commands', async () => {
  await rejects(as(U.bravo, 'select set_admin($1,$2,true)', [day, U.bravo]), 'not_admin');
  await rejects(as(U.bravo, 'select rename_team($1,$2)', [blue, 'Cobalt']), 'not_admin');
  await rejects(as(U.bravo, 'select remove_member($1,$2)', [day, U.alpha]), 'not_admin');
  await rejects(as(U.bravo, 'select close_game_day($1)', [day]), 'not_admin');
  await rejects(as(U.bravo, 'select admin_set_assignment($1,$2,null,null,null)', [day, U.alpha]), 'not_admin');
});

test('last admin cannot leave, be demoted or removed', async () => {
  await rejects(as(U.alpha, 'select leave_game_day($1)', [day]), 'last_admin');
  await rejects(as(U.alpha, 'select set_admin($1,$2,false)', [day, U.alpha]), 'last_admin');
  await rejects(as(U.alpha, 'select remove_member($1,$2)', [day, U.alpha]), 'last_admin');

  await as(U.alpha, 'select set_admin($1,$2,true)', [day, U.bravo]);
  await as(U.alpha, 'select leave_game_day($1)', [day]);
  const a = await member(day, U.alpha);
  assert.equal(a.status, 'left');
  assert.equal(a.is_admin, false);
  await rejects(as(U.bravo, 'select leave_game_day($1)', [day]), 'last_admin');

  // Rejoining after leaving is allowed and does not restore admin
  await as(U.alpha, 'select join_game_day($1)', [day]);
  assert.equal((await member(day, U.alpha)).is_admin, false);
});

test('admin rename and assignment correction', async () => {
  await as(U.bravo, 'select rename_team($1,$2)', [blue, 'Cobalt']);
  assert.equal((await db.query('select name from teams where id=$1', [blue])).rows[0].name, 'Cobalt');
  await as(U.bravo, 'select admin_set_assignment($1,$2,$3,$4,null)', [day, U.alpha, 'Sniper', blue]);
  const a = await member(day, U.alpha);
  assert.equal(a.team_id, blue);
  assert.equal(a.day_role, 'Sniper');
  const redSec = (await db.query(`select id from sections where team_id=$1`, [red])).rows[0].id;
  await rejects(as(U.bravo, 'select admin_set_assignment($1,$2,null,$3,$4)', [day, U.alpha, blue, redSec]), 'section_not_found');
});

test('removed player cannot rejoin until readmitted', async () => {
  await as(U.charlie, 'select set_callsign($1)', ['Patch']);
  await as(U.charlie, 'select join_game_day($1)', [day]);
  await as(U.charlie, 'select choose_team($1,$2)', [day, blue]);
  await as(U.bravo, 'select remove_member($1,$2)', [day, U.charlie]);
  const c = await member(day, U.charlie);
  assert.equal(c.status, 'removed');
  assert.equal(c.team_id, null);
  await rejects(as(U.charlie, 'select join_game_day($1)', [day]), 'removed');
  await rejects(as(U.charlie, 'select set_day_role($1,$2)', [day, 'Medic']), 'not_member');
  const listed = await as(U.charlie, 'select my_status from list_open_days()');
  assert.equal(listed[0].my_status, 'removed');

  await as(U.bravo, 'select readmit_member($1,$2)', [day, U.charlie]);
  assert.equal((await member(day, U.charlie)).status, 'active');
  await rejects(as(U.bravo, 'select readmit_member($1,$2)', [day, U.charlie]), 'not_removed');
});

test('member list visible to members only', async () => {
  await as(U.delta, 'select set_callsign($1)', ['Nomad']);
  assert.equal((await as(U.delta, 'select * from day_members')).length, 0);
  assert.ok((await as(U.charlie, 'select * from day_members where game_day_id=$1', [day])).length >= 3);
  // Removed player still sees own row only
  await as(U.bravo, 'select remove_member($1,$2)', [day, U.charlie]);
  const own = await as(U.charlie, 'select user_id from day_members');
  assert.deepEqual(own.map((r) => r.user_id), [U.charlie]);
});

test('closed day leaves the list and rejects commands', async () => {
  await as(U.bravo, 'select close_game_day($1)', [day]);
  assert.equal((await as(U.delta, 'select * from list_open_days()')).length, 0);
  await rejects(as(U.delta, 'select join_game_day($1)', [day]), 'day_closed');
  await rejects(as(U.bravo, 'select choose_team($1,$2)', [day, blue]), 'day_closed');
  // Members still see it in their own day list
  const mine = await as(U.bravo, `select d.status from day_members m join game_days d on d.id = m.game_day_id where m.user_id = $1`, [U.bravo]);
  assert.equal(mine[0].status, 'closed');
});
