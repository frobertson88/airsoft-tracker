// Team count per game and moving the hill (0006) on top of 0001–0005, in PGlite.
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
const players = Array.from({ length: 9 }, (_, i) => `00000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}`);
const late = '00000000-0000-0000-0000-0000000002ff';

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

const LAT0 = -41.0;
const LNG0 = 174.0;
const DLAT = 300 / 110540;
const DLNG = 300 / (111320 * Math.cos((LAT0 * Math.PI) / 180));
const sq = (x0, y0, x1, y1) => [
  { lat: LAT0 + y0 * DLAT, lng: LNG0 + x0 * DLNG },
  { lat: LAT0 + y0 * DLAT, lng: LNG0 + x1 * DLNG },
  { lat: LAT0 + y1 * DLAT, lng: LNG0 + x1 * DLNG },
  { lat: LAT0 + y1 * DLAT, lng: LNG0 + x0 * DLNG },
];
const layout = {
  view: { lat: LAT0, lng: LNG0, latDelta: 0.01, lngDelta: 0.01 },
  boundary: sq(0, 0, 1, 1),
  areas: [{ kind: 'nogo', name: 'Pond', note: '', points: sq(0.4, 0.4, 0.6, 0.6) }],
  points: [],
};
const spot = (x, y) => ({ lat: LAT0 + y * DLAT, lng: LNG0 + x * DLNG });

let day;
const teams = async () => (await db.query('select * from teams where game_day_id=$1 order by sort_order', [day])).rows;
const members = async () =>
  (await db.query(`select * from day_members where game_day_id=$1 and status='active' and not is_admin`, [day])).rows;
const sizes = (ms) => {
  const out = {};
  for (const m of ms) if (m.team_id) out[m.team_id] = (out[m.team_id] ?? 0) + 1;
  return Object.values(out).sort();
};

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql', '0004_games.sql', '0005_koth.sql', '0006_teams_and_hill.sql']) {
    await db.exec(read(f));
  }
  for (const id of [admin, ...players, late]) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of [admin, ...players, late].entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(admin, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  const [blue, red] = (await teams()).map((t) => t.id);
  for (const [i, u] of players.entries()) {
    await as(u, 'select join_game_day($1)', [day]);
    await as(u, 'select choose_team($1, $2)', [day, i < 6 ? blue : red]);
  }
  await as(players[0], 'select create_section($1, $2)', [day, 'Alpha']);
  const field = (await as(admin, 'select save_field(null, $1, null, null, $2) as id', ['F', JSON.stringify(layout)]))[0].id;
  await as(admin, 'select select_day_field($1, $2)', [day, field]);
});

test('only admins arrange teams, with a valid count and fill', async () => {
  await rejects(as(players[0], `select arrange_teams($1, 3, 'shuffle')`, [day]), 'not_admin');
  await rejects(as(admin, `select arrange_teams($1, 5, 'keep')`, [day]), 'team_count_invalid');
  await rejects(as(admin, `select arrange_teams($1, 3, 'random')`, [day]), 'team_fill_invalid');
});

test('keep with more teams adds empty ones and leaves players alone', async () => {
  const before = await members();
  await as(admin, `select arrange_teams($1, 3, 'keep')`, [day]);
  const ts = await teams();
  assert.deepEqual(ts.map((t) => [t.name, t.colour, t.active]), [['Blue', 'blue', true], ['Red', 'red', true], ['Yellow', 'yellow', true]]);
  assert.equal((await db.query('select team_count from game_days where id=$1', [day])).rows[0].team_count, 3);
  const after = await members();
  assert.deepEqual(after.map((m) => m.team_id), before.map((m) => m.team_id));
  assert.ok(after.some((m) => m.section_id), 'sections kept');
});

test('shuffle deals everyone onto balanced teams', async () => {
  await as(admin, `select arrange_teams($1, 4, 'shuffle')`, [day]);
  const ms = await members();
  assert.ok(ms.every((m) => m.team_id), 'everyone who played has a team');
  assert.deepEqual(sizes(ms), [2, 2, 2, 3]);
  assert.equal((await teams()).filter((t) => t.active).length, 4);
});

test('fewer teams: players on a dropped team must pick again (keep)', async () => {
  const purple = (await teams())[3].id;
  const onPurple = (await members()).filter((m) => m.team_id === purple).map((m) => m.user_id);
  await as(admin, `select arrange_teams($1, 2, 'keep')`, [day]);
  const ms = await members();
  for (const m of ms) {
    if (onPurple.includes(m.user_id)) assert.equal(m.team_id, null);
  }
  assert.deepEqual((await teams()).map((t) => t.active), [true, true, false, false]);
  // A dropped team can't be chosen or assigned.
  await rejects(as(onPurple[0], 'select choose_team($1, $2)', [day, purple]), 'team_not_found');
  await rejects(as(admin, 'select admin_set_assignment($1, $2, null, $3, null)', [day, onPurple[0], purple]), 'team_not_found');
});

test('shuffle includes only players who had a team; clear empties every team', async () => {
  const withTeam = (await members()).filter((m) => m.team_id).length;
  await as(admin, `select arrange_teams($1, 2, 'shuffle')`, [day]);
  const ms = await members();
  assert.equal(ms.filter((m) => m.team_id).length, withTeam);
  await as(admin, `select arrange_teams($1, 2, 'clear')`, [day]);
  assert.ok((await members()).every((m) => m.team_id === null && m.section_id === null));
});

test('team_count is part of game settings for every mode', async () => {
  const id = (await as(admin, `select create_game($1, 'F', 600, 0, 'free', '{"team_count": 3}') as id`, [day]))[0].id;
  assert.deepEqual((await db.query('select settings from games where id=$1', [id])).rows[0].settings, { team_count: 3 });
  await rejects(as(admin, `select update_game($1, 'F', 600, 0, 'free', '{"team_count": 7}')`, [id]), 'game_settings_invalid');
  await as(admin, 'select end_game($1)', [id]);
  await rejects(as(admin, `select save_game_setup(null, 'X', 'koth', 600, 0, '{"team_count": 1}')`), 'game_settings_invalid');
});

let g;
test('during a game players can pick a team but not switch; admins still can', async () => {
  const [blue, red] = (await teams()).map((t) => t.id);
  for (const [i, u] of players.entries()) await as(u, 'select choose_team($1, $2)', [day, i % 2 ? red : blue]);
  g = (await as(admin, `select create_game($1, 'Hill', null, 0, 'koth', '{}') as id`, [day]))[0].id;
  await as(admin, 'select start_game($1)', [g]);
  await rejects(as(players[0], 'select choose_team($1, $2)', [day, red]), 'team_locked');
  await as(players[0], 'select choose_team($1, $2)', [day, blue]); // same team is fine
  await as(late, 'select join_game_day($1)', [day]);
  await as(late, 'select choose_team($1, $2)', [day, red]); // no team yet: allowed
  await as(admin, 'select admin_set_assignment($1, $2, null, $3, null)', [day, players[0], red]);
  await rejects(as(admin, `select arrange_teams($1, 3, 'shuffle')`, [day]), 'game_running');
});

test('admins move the hill to a random spot or a valid spot they pick', async () => {
  const hill = async () => (await db.query('select * from koth_state where game_id=$1', [g])).rows[0];
  const h1 = await hill();
  await rejects(as(players[1], 'select move_hill($1, null, null)', [g]), 'not_admin');
  await as(admin, 'select move_hill($1, null, null)', [g]);
  const h2 = await hill();
  assert.equal(h2.hill_number, h1.hill_number + 1);

  const ok = spot(0.2, 0.2);
  await as(admin, 'select move_hill($1, $2, $3)', [g, ok.lat, ok.lng]);
  const h3 = await hill();
  assert.equal(h3.hill_number, h2.hill_number + 1);
  assert.ok(Math.abs(h3.hill_lat - ok.lat) < 1e-9 && Math.abs(h3.hill_lng - ok.lng) < 1e-9);

  for (const [x, y] of [[0.5, 0.5], [0.02, 0.5], [0.5, 0.65], [1.5, 0.5]]) {
    const bad = spot(x, y);
    await rejects(as(admin, 'select move_hill($1, $2, $3)', [g, bad.lat, bad.lng]), 'hill_spot_invalid');
  }
  // Players standing on the new spot are counted straight away.
  await as(players[2], `select report_position($1, $2, $3, 5, now())`, [day, ok.lat, ok.lng]);
  assert.equal((await hill()).control, 'held');
});

test('moving the hill restarts the relocation timer and is refused after the game', async () => {
  const id = (await db.query('select id from games where id=$1', [g])).rows[0].id;
  await db.query(`update games set settings = settings || '{"relocate_minutes": 5}' where id=$1`, [id]);
  await db.query(`update games set live_since = live_since - interval '200 seconds' where id=$1`, [id]);
  await as(admin, 'select move_hill($1, null, null)', [id]);
  const k = (await db.query('select * from koth_state where game_id=$1', [id])).rows[0];
  assert.ok(Number(k.placed_active) >= 199, `placed ${k.placed_active}`);
  await as(admin, 'select end_game($1)', [id]);
  await rejects(as(admin, 'select move_hill($1, null, null)', [id]), 'game_not_running');
  // Between games teams can be arranged again.
  await as(admin, `select arrange_teams($1, 3, 'shuffle')`, [day]);
});
