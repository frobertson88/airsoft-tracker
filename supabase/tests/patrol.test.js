// Patrol (0013) on top of 0001–0012, in PGlite: settings, team lists,
// scanning steps in order, locked missions, timers and endings.
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
const pat = '00000000-0000-0000-0000-000000000101'; // Blue
const mate = '00000000-0000-0000-0000-000000000102'; // Blue
const enemy = '00000000-0000-0000-0000-000000000104'; // Red

let db, day, blue, red, field, other, game;
let P = []; // point ids, 1–4
let T = {}; // point id -> tag code

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
const one = async (u, sql, params) => Object.values((await as(u, sql, params))[0])[0];
const scan = (u, point) => one(u, 'select patrol_scan($1, $2)', [game, T[P[point]]]);
const team = async (t) => (await db.query('select * from patrol_teams where game_id=$1 and team_id=$2', [game, t])).rows[0];

const c = (lat, lng) => ({ lat, lng });
const sq = [c(-41, 174), c(-41, 174.01), c(-40.99, 174.01), c(-40.99, 174)];
const pt = (label, lat, lng) => ({ kind: 'other', label, lat, lng });
const layout = { view: { lat: -41, lng: 174, latDelta: 0.01, lngDelta: 0.01 }, boundary: sq, areas: [],
  points: [pt('A', -40.999, 174.001), pt('B', -40.998, 174.002), pt('C', -40.997, 174.003), pt('D', -40.996, 174.004)] };

const mission = (id, steps, more = {}) => ({ id, name: id, steps, in_order: true, reward: 10, ...more });
const patrol = (missions, more = {}) => ({ patrol: { field, order: 'list', ending: 'time', missions, ...more } });
const create = (settings) => one(admin, `select create_game($1, 'Patrol', null, 0, 'patrol', $2)`, [day, JSON.stringify(settings)]);

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql', '0004_games.sql', '0005_koth.sql',
    '0006_teams_and_hill.sql', '0007_team_colours.sql', '0008_map_objects.sql', '0009_medic.sql',
    '0010_field_preview.sql', '0011_random_wounds.sql', '0012_tags.sql', '0013_patrol.sql']) {
    await db.exec(read(f));
  }
  const all = [admin, pat, mate, enemy];
  for (const id of all) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of all.entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(admin, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  [blue, red] = (await db.query('select id from teams where game_day_id=$1 order by sort_order', [day])).rows.map((t) => t.id);
  for (const u of [pat, mate, enemy]) await as(u, 'select join_game_day($1)', [day]);
  for (const u of [pat, mate]) await as(u, 'select choose_team($1, $2)', [day, blue]);
  await as(enemy, 'select choose_team($1, $2)', [day, red]);
  field = await one(admin, 'select save_field(null, $1, null, null, $2)', ['Pine Ridge', JSON.stringify(layout)]);
  other = await one(admin, 'select save_field(null, $1, null, null, $2)', ['Other', JSON.stringify(layout)]);
  await as(admin, 'select select_day_field($1, $2)', [day, field]);
  const pts = (await as(admin, 'select data from fields where id=$1', [field]))[0].data.points;
  P = [null, ...pts.map((p) => p.id)];
  for (const t of await as(admin, 'select * from point_tags($1)', [field])) T[t.point_id] = t.code;
});

test('patrol settings are checked', async () => {
  await rejects(create(patrol([])), 'patrol_missions_required');
  await rejects(create({ patrol: { order: 'list', missions: [mission('m', [P[1]])] } }), 'patrol_field_required');
  await rejects(create(patrol([mission('m', [])])), 'patrol_mission_invalid');
  await rejects(create(patrol([mission('m', [P[1], P[1]])])), 'patrol_mission_invalid');
  await rejects(create(patrol([mission('m', [P[1]]), mission('m', [P[2]])])), 'patrol_mission_invalid');
  await rejects(create(patrol([mission('m', [P[1]], { minutes: 0 })])), 'patrol_mission_invalid');
  await rejects(create(patrol([mission('m', [P[1]], { teams: [5] })])), 'patrol_mission_invalid');
  await rejects(create(patrol([mission('m', [P[1]])], { order: 'search' })), 'patrol_search_needs_start');
  await rejects(create(patrol([mission('m', [P[1]])], { ending: 'never' })), 'patrol_invalid');
  // Saved setups take Patrol too.
  const id = await one(admin, `select save_game_setup(null, 'Patrol A', 'patrol', 1800, 0, $1)`,
    [JSON.stringify(patrol([mission('m', [P[1]])]))]);
  const s = (await as(admin, 'select settings from game_setups where id=$1', [id]))[0].settings;
  assert.equal(s.patrol.missions[0].reward, 10);
  assert.equal(s.patrol.scoring, true);
});

test('a game built on another field, or a removed point, will not start', async () => {
  game = await create({ patrol: { field: other, missions: [mission('m', [P[1]])] } });
  await rejects(as(admin, 'select start_game($1)', [game]), 'patrol_field_mismatch');
  await as(admin, `select update_game($1, 'Patrol', null, 0, 'patrol', $2)`,
    [game, JSON.stringify(patrol([mission('m', ['gone'])]))]);
  await rejects(as(admin, 'select start_game($1)', [game]), 'patrol_point_missing');
  await db.exec(`delete from games where id = '${game}'`);
});

test('start gives each team its list; steps go in order; a mission pays once', async () => {
  game = await create(patrol([
    mission('route', [P[1], P[2]], { reward: 50 }),
    mission('sweep', [P[3], P[4]], { in_order: false, reward: 30, minutes: 1 }),
    mission('locked', [P[1]], { start: P[2], reward: 20 }),
    mission('red only', [P[4]], { teams: [2] }),
  ], { ending: 'first' }));
  await rejects(scan(pat, 1), 'game_not_live');
  await as(admin, 'select start_game($1)', [game]);
  const b = await team(blue);
  assert.deepEqual(b.queue, ['route', 'sweep']);
  assert.equal(b.total, 3);
  assert.equal(b.current, 'route');
  assert.deepEqual((await team(red)).queue, ['route', 'sweep', 'red only']);

  assert.deepEqual(await scan(pat, 2), { result: 'wrong', mission: 'route', need: P[1] });
  assert.equal((await scan(pat, 1)).result, 'step');
  assert.equal((await scan(mate, 1)).result, 'already');
  assert.deepEqual(await scan(mate, 2), { result: 'complete', mission: 'route', point: P[2], reward: 50 });
  const after = await team(blue);
  assert.equal(after.score, 50);
  assert.equal(after.current, 'sweep');
  // Red's progress is its own.
  assert.equal((await team(red)).current, 'route');
});

test('a locked mission jumps ahead, then the list carries on', async () => {
  assert.equal((await scan(pat, 3)).result, 'step'); // sweep, any order
  const got = await scan(pat, 2); // route is done; point 2 hands out the locked mission
  assert.equal(got.result, 'new');
  assert.equal((await team(blue)).current, 'locked');
  assert.equal((await scan(pat, 4)).result, 'wrong');
  assert.equal((await scan(pat, 1)).result, 'complete');
  const b = await team(blue);
  assert.equal(b.score, 70);
  assert.equal(b.current, 'sweep');
  assert.deepEqual(b.progress.sweep, [0]); // kept while the locked mission ran
  assert.equal((await scan(pat, 2)).result, 'wrong'); // locked mission already played
});

test('points from another field, wounded players and players without a team are refused', async () => {
  const [stray] = await as(admin, 'select * from point_tags($1)', [other]);
  assert.deepEqual(await one(pat, 'select patrol_scan($1, $2)', [game, stray.code]), { result: 'not_here' });
  await db.query(`insert into medic_lives (game_id, user_id, state) values ($1, $2, 'wounded')`, [game, mate]);
  await rejects(scan(mate, 4), 'patrol_not_in_play');
  await rejects(scan(admin, 4), 'team_required');
});

test('a mission that runs out of time fails; the first team to finish ends the game', async () => {
  await db.query(`update games set live_since = live_since - interval '2 minutes' where id = $1`, [game]);
  await as(admin, 'select tick_game($1)', [game]);
  const b = await team(blue);
  assert.equal(b.outcome.sweep, 'failed');
  assert.equal(b.current, null);
  assert.equal(b.score, 70);
  const g = (await db.query('select state from games where id=$1', [game])).rows[0];
  assert.equal(g.state, 'complete');
  await rejects(scan(enemy, 1), 'game_not_live');
});

test('a team with no missions neither plays nor ends a first-to-finish game', async () => {
  game = await create(patrol([mission('blue', [P[1]], { teams: [1] })], { ending: 'first' }));
  await as(admin, 'select start_game($1)', [game]);
  assert.equal((await team(red)).total, 0);
  await rejects(scan(enemy, 1), 'patrol_team_out');
  await as(admin, 'select tick_game($1)', [game]);
  assert.equal((await db.query('select state from games where id=$1', [game])).rows[0].state, 'live');
  await db.exec(`delete from games where id = '${game}'`);
});

test('search games have no list; each locked point hands out its mission', async () => {
  game = await create(patrol([
    mission('one', [P[2]], { start: P[1] }),
    mission('two', [P[4]], { start: P[3] }),
  ], { order: 'search', ending: 'all' }));
  await as(admin, 'select start_game($1)', [game]);
  const b = await team(blue);
  assert.deepEqual(b.queue, []);
  assert.equal(b.current, null);
  assert.equal(b.total, 2);
  assert.equal((await scan(pat, 2)).result, 'nothing');
  assert.equal((await scan(pat, 1)).result, 'new');
  assert.equal((await scan(pat, 3)).result, 'busy');
  assert.equal((await scan(pat, 2)).result, 'complete');
  assert.equal((await team(blue)).current, null);
  assert.equal((await scan(pat, 3)).result, 'new');
  assert.equal((await scan(pat, 4)).result, 'complete');
  // Blue is done but Red isn't, so the game goes on.
  assert.equal((await db.query('select state from games where id=$1', [game])).rows[0].state, 'live');
  await scan(enemy, 1);
  await scan(enemy, 2);
  await scan(enemy, 3);
  await scan(enemy, 4);
  assert.equal((await db.query('select state from games where id=$1', [game])).rows[0].state, 'complete');
});

test('players read team progress but cannot write it', async () => {
  assert.equal((await as(enemy, 'select * from patrol_teams where game_id=$1', [game])).length, 2);
  await as(enemy, 'update patrol_teams set score = 999 where game_id=$1', [game]).catch(() => {});
  assert.notEqual((await team(red)).score, 999);
});
