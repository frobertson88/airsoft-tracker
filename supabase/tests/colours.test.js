// Team colours and names (0007) on top of 0001–0006, in PGlite.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create publication supabase_realtime;
`;

const admin = '00000000-0000-0000-0000-00000000000a';
const player = '00000000-0000-0000-0000-000000000100';
let db, day;

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
const rejects = (p, key) => assert.rejects(p, (e) => (assert.match(e.message, new RegExp(key)), true));
const teams = async () =>
  (await db.query('select id, name, colour from teams where game_day_id=$1 order by sort_order', [day])).rows;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql', '0004_games.sql',
    '0005_koth.sql', '0006_teams_and_hill.sql', '0007_team_colours.sql']) {
    await db.exec(read(f));
  }
  for (const id of [admin, player]) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of [admin, player].entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(admin, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  await as(player, 'select join_game_day($1)', [day]);
});

test('only admins change colours, and only to a team colour', async () => {
  const [blue] = await teams();
  await rejects(as(player, `select set_team_colour($1, 'teal')`, [blue.id]), 'not_admin');
  await rejects(as(admin, `select set_team_colour($1, 'orange')`, [blue.id]), 'team_colour_invalid');
  await rejects(as(admin, `select set_team_colour($1, 'teal')`, ['00000000-0000-0000-0000-000000000999']), 'team_not_found');
  await as(admin, `select set_team_colour($1, 'teal')`, [blue.id]);
  assert.deepEqual((await teams()).map((t) => [t.name, t.colour]), [['Teal', 'teal'], ['Red', 'red']]);
});

test("taking another team's colour swaps the two, names follow colours", async () => {
  const [a] = await teams();
  await as(admin, `select set_team_colour($1, 'red')`, [a.id]);
  assert.deepEqual((await teams()).map((t) => [t.name, t.colour]), [['Red', 'red'], ['Teal', 'teal']]);
});

test('admins rename teams', async () => {
  const [a] = await teams();
  await as(admin, `select rename_team($1, '  Wolves ')`, [a.id]);
  assert.equal((await teams())[0].name, 'Wolves');
  await rejects(as(player, `select rename_team($1, 'X')`, [a.id]), 'not_admin');
});

test('new teams take colours nobody has', async () => {
  const [a] = await teams();
  await as(admin, `select set_team_colour($1, 'yellow')`, [a.id]); // now yellow, teal
  await as(admin, `select arrange_teams($1, 4, 'keep')`, [day]);
  const ts = await teams();
  assert.deepEqual(ts.map((t) => t.colour), ['yellow', 'teal', 'blue', 'purple']);
  assert.deepEqual(ts.map((t) => t.name), ['Wolves', 'Teal', 'Blue', 'Purple']);
});
