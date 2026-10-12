// King of the Hill and saved setups (0005, with 0006) on top of 0001–0004, in PGlite.
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

const U = {
  admin: '00000000-0000-0000-0000-00000000000a',
  blue1: '00000000-0000-0000-0000-00000000000b',
  blue2: '00000000-0000-0000-0000-00000000000c',
  red1: '00000000-0000-0000-0000-00000000000d',
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

const game = async (id) => (await db.query('select * from games where id=$1', [id])).rows[0];
const hill = async (id) => (await db.query('select * from koth_state where game_id=$1', [id])).rows[0];
const rewind = (id, secs) =>
  db.query(
    `update games set
       live_since = live_since - make_interval(secs => $2),
       countdown_ends_at = countdown_ends_at - make_interval(secs => $2)
     where id = $1`,
    [id, secs],
  );

// A field about 300 m square near Wellington, with a 60 m No-go square in the middle.
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
const tiny = { ...layout, boundary: sq(0, 0, 0.13, 0.13), areas: [] }; // ~40 m square

// Metres between two lat/lng points (flat, fine at field scale).
const metres = (a, b) =>
  Math.hypot((a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 110540);

let day, blue, red, field, tinyField, g1;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql', '0004_games.sql', '0005_koth.sql', '0006_teams_and_hill.sql']) {
    await db.exec(read(f));
  }
  for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of Object.values(U).entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(U.admin, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  [blue, red] = (await as(U.admin, 'select id from teams where game_day_id=$1 order by sort_order', [day])).map((t) => t.id);
  for (const u of [U.blue1, U.blue2, U.red1]) await as(u, 'select join_game_day($1)', [day]);
  for (const u of [U.blue1, U.blue2]) await as(u, 'select choose_team($1, $2)', [day, blue]);
  await as(U.red1, 'select choose_team($1, $2)', [day, red]);
  field = (await as(U.admin, 'select save_field(null, $1, null, null, $2) as id', ['Field', JSON.stringify(layout)]))[0].id;
  tinyField = (await as(U.admin, 'select save_field(null, $1, null, null, $2) as id', ['Tiny', JSON.stringify(tiny)]))[0].id;
});

test('KOTH settings are validated and filled with defaults', async () => {
  await rejects(as(U.admin, `select create_game($1, 'K', 600, 0, 'koth', '{"radius": 500}')`, [day]), 'game_settings_invalid');
  await rejects(as(U.admin, `select create_game($1, 'K', 600, 0, 'koth', '{"radius": "big"}')`, [day]), 'game_settings_invalid');
  await rejects(as(U.admin, `select create_game($1, 'K', 600, 0, 'tdm', '{}')`, [day]), 'game_settings_invalid');
  const id = (await as(U.admin, `select create_game($1, 'K', 600, 0, 'koth', '{}') as id`, [day]))[0].id;
  const g = await game(id);
  assert.equal(g.mode, 'koth');
  assert.deepEqual(g.settings, { team_count: 2, radius: 25, scoring: true, rate: 1, relocate_minutes: null });
  await as(U.admin, 'select end_game($1)', [id]);
  // Free play ignores settings, and the old 4-argument call still works.
  const f = (await as(U.admin, `select create_game($1, 'F', 600, 0) as id`, [day]))[0].id;
  assert.equal((await game(f)).mode, 'free');
  assert.deepEqual((await game(f)).settings, { team_count: 2 });
  await as(U.admin, 'select end_game($1)', [f]);
});

test('a hill that cannot fit the field is refused', async () => {
  await as(U.admin, 'select select_day_field($1, $2)', [day, tinyField]);
  await rejects(as(U.admin, `select create_game($1, 'K', 600, 0, 'koth', '{}')`, [day]), 'koth_no_space');
  // A smaller hill fits.
  const id = (await as(U.admin, `select create_game($1, 'K', 600, 0, 'koth', '{"radius": 10}') as id`, [day]))[0].id;
  await rejects(as(U.admin, `select update_game($1, 'K', 600, 0, 'koth', '{"radius": 50}')`, [id]), 'koth_no_space');
  await as(U.admin, 'select end_game($1)', [id]);
  await as(U.admin, 'select select_day_field($1, $2)', [day, field]);
});

test('random hills sit fully inside the boundary and clear of No-go areas', async () => {
  const pond = { lat: LAT0 + 0.5 * DLAT, lng: LNG0 + 0.5 * DLNG };
  for (let i = 0; i < 40; i++) {
    const [lat, lng] = (await db.query('select _koth_place($1, 25, null, null) as p', [JSON.stringify(layout)])).rows[0].p;
    const x = (lng - LNG0) / DLNG;
    const y = (lat - LAT0) / DLAT;
    // 25 m from the edges is 25/300 of the field.
    const m = 25 / 300;
    assert.ok(x >= m - 1e-6 && x <= 1 - m + 1e-6 && y >= m - 1e-6 && y <= 1 - m + 1e-6, `edge ${x},${y}`);
    // Clear of the pond: outside its square grown by the radius (corner case ignored).
    const inGrownPond = Math.abs(x - 0.5) < 0.1 + m - 1e-6 && Math.abs(y - 0.5) < 0.1 + m - 1e-6;
    const nearCorner = Math.abs(x - 0.5) > 0.1 && Math.abs(y - 0.5) > 0.1;
    assert.ok(!inGrownPond || nearCorner, `pond ${x},${y}`);
    assert.ok(metres({ lat, lng }, pond) > 30 + 25 - 1);
  }
  // Players can't call the placement helper.
  await rejects(as(U.admin, 'select _koth_place($1, 25, null, null)', [JSON.stringify(layout)]), 'permission denied');
});

test('starting places the first hill everyone in the day can see', async () => {
  g1 = (await as(U.admin, `select create_game($1, 'Hill', 600, 0, 'koth', '{"relocate_minutes": 5}') as id`, [day]))[0].id;
  assert.equal(await hill(g1), undefined);
  await as(U.admin, 'select start_game($1)', [g1]);
  const h = await hill(g1);
  assert.equal(h.hill_number, 1);
  assert.equal(h.control, 'empty');
  assert.equal(h.unknown, 3, 'nobody has reported a position yet');
  assert.equal((await as(U.red1, 'select * from koth_state')).length, 1);
  await rejects(as(U.blue1, 'update koth_state set control = $1', ['held']), 'permission denied');
});

const at = async (u, h, { metresEast = 0, accuracy = 5, age = 0 } = {}) => {
  const lng = h.hill_lng + metresEast / (111320 * Math.cos((h.hill_lat * Math.PI) / 180));
  await as(u, `select report_position($1, $2, $3, $4, now() - make_interval(secs => $5))`, [day, h.hill_lat, lng, accuracy, age]);
};

test('the team with most players inside holds the hill; equal counts are contested', async () => {
  let h = await hill(g1);
  await at(U.blue1, h);
  h = await hill(g1);
  assert.equal(h.control, 'held');
  assert.equal(h.holder_team_id, blue);
  assert.deepEqual(h.counts, { [blue]: 1 });
  assert.equal(h.unknown, 2);

  await at(U.red1, h, { metresEast: 20 });
  h = await hill(g1);
  assert.equal(h.control, 'contested');
  assert.equal(h.holder_team_id, null);

  await at(U.blue2, h, { metresEast: -10 });
  h = await hill(g1);
  assert.equal(h.control, 'held');
  assert.equal(h.holder_team_id, blue);
  assert.deepEqual(h.counts, { [blue]: 2, [red]: 1 });
  assert.equal(h.unknown, 0);
});

test('outside the circle, inaccurate or old positions do not count', async () => {
  let h = await hill(g1);
  await at(U.red1, h, { metresEast: 40 }); // outside 25 m
  await at(U.blue2, h, { accuracy: 80 }); // too vague
  h = await hill(g1);
  assert.deepEqual(h.counts, { [blue]: 1 });
  assert.equal(h.unknown, 1, 'blue2 is unknown, not outside');
  // blue1's phone stops reporting: their last fix goes stale.
  await db.query(`update positions set recorded_at = now() - interval '45 seconds' where user_id = $1`, [U.blue1]);
  await as(U.red1, 'select tick_game($1)', [g1]);
  h = await hill(g1);
  assert.equal(h.control, 'empty');
  assert.equal(h.unknown, 2);
});

test('the holder scores over active time only; pause freezes the score', async () => {
  let h = await hill(g1);
  await at(U.blue1, h);
  await at(U.blue2, h);
  await rewind(g1, 30);
  await as(U.red1, 'select tick_game($1)', [g1]);
  await at(U.red1, h); // a control change stores the score: blue 2 v red 1 is still held
  await at(U.blue2, h, { metresEast: 60 }); // now 1 v 1, contested: score is written
  h = await hill(g1);
  assert.equal(h.control, 'contested');
  const blueScore = Number(h.scores[blue]);
  assert.ok(Math.abs(blueScore - 30) < 2, `blue ${blueScore}`);

  await as(U.admin, 'select pause_game($1)', [g1]);
  await at(U.blue2, h); // blue holds again while paused
  h = await hill(g1);
  assert.equal(h.control, 'held');
  await as(U.admin, 'select resume_game($1, 0)', [g1]);
  await as(U.admin, 'select pause_game($1)', [g1]);
  h = await hill(g1);
  const after = Number(h.scores[blue] ?? 0);
  assert.ok(after - blueScore < 2, 'no score while paused');
  await as(U.admin, 'select resume_game($1, 0)', [g1]);
});

test('the hill moves at the relocation interval of active play', async () => {
  let h = await hill(g1);
  const before = { lat: h.hill_lat, lng: h.hill_lng };
  await rewind(g1, 5 * 60);
  await as(U.blue1, 'select tick_game($1)', [g1]);
  h = await hill(g1);
  assert.equal(h.hill_number, 2);
  assert.ok(metres(before, { lat: h.hill_lat, lng: h.hill_lng }) > 1, 'moved');
  assert.ok(Number(h.placed_active) === 300, `placed ${h.placed_active}`);
  // Scoring stopped at the move: blue held for at most the rest of the first hill's time.
  assert.ok(Number(h.scores[blue]) <= 300 + 2);
});

test('ending decides the winner; equal scores draw; no scoring means no winner', async () => {
  await db.query(`update koth_state set scores = $2, last_active = 0, control = 'empty', holder_team_id = null where game_id = $1`, [
    g1,
    JSON.stringify({ [blue]: 120, [red]: 80 }),
  ]);
  await db.query(`update games set active_seconds = 0, live_since = now() where id = $1`, [g1]);
  await as(U.admin, 'select end_game($1)', [g1]);
  let h = await hill(g1);
  assert.equal(h.result, 'win');
  assert.equal(h.winner_team_id, blue);

  // Play again keeps the mode and settings.
  const g2 = (await as(U.admin, 'select play_again($1) as id', [g1]))[0].id;
  assert.equal((await game(g2)).mode, 'koth');
  assert.equal((await game(g2)).settings.relocate_minutes, 5);
  // Nobody on the field, so no one scores before the end (the random hill could land on them).
  await db.query('delete from positions');
  await as(U.admin, 'select start_game($1)', [g2]);
  await db.query(`update koth_state set scores = $2 where game_id = $1`, [g2, JSON.stringify({ [blue]: 50, [red]: 50 })]);
  await as(U.admin, 'select end_game($1)', [g2]);
  assert.equal((await hill(g2)).result, 'draw');

  const g3 = (await as(U.admin, `select create_game($1, 'Fun', null, 0, 'koth', '{"scoring": false}') as id`, [day]))[0].id;
  await as(U.admin, 'select start_game($1)', [g3]);
  h = await hill(g3);
  await at(U.blue1, h);
  await rewind(g3, 60);
  await as(U.admin, 'select end_game($1)', [g3]);
  h = await hill(g3);
  assert.equal(h.result, 'none');
  assert.deepEqual(h.scores, {});
});

test('a timed KOTH game that runs out settles its result', async () => {
  const g = (await as(U.admin, `select create_game($1, 'Short', 60, 0, 'koth', '{}') as id`, [day]))[0].id;
  await as(U.admin, 'select start_game($1)', [g]);
  const h = await hill(g);
  await at(U.red1, h);
  await rewind(g, 90);
  await as(U.blue1, 'select tick_game($1)', [g]);
  assert.equal((await game(g)).state, 'complete');
  const done = await hill(g);
  assert.equal(done.result, 'win');
  assert.equal(done.winner_team_id, red);
  assert.ok(Math.abs(Number(done.scores[red]) - 60) < 2, `red ${done.scores[red]}`);
});

test('saved setups belong to their owner', async () => {
  const id = (await as(U.admin, `select save_game_setup(null, 'Sunday KOTH', 'koth', 1800, 30, '{"radius": 40, "relocate_minutes": 10}') as id`))[0].id;
  let rows = await as(U.admin, 'select * from game_setups');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].settings.radius, 40);
  assert.equal(rows[0].settings.rate, 1);
  assert.equal((await as(U.blue1, 'select * from game_setups')).length, 0);
  await rejects(as(U.blue1, `select save_game_setup($1, 'Mine', 'free', 600, 0, '{}')`, [id]), 'setup_not_found');
  await rejects(as(U.blue1, 'select delete_game_setup($1)', [id]), 'setup_not_found');
  await rejects(as(U.admin, `select save_game_setup(null, 'Bad', 'koth', 600, 0, '{"rate": 99}')`), 'game_settings_invalid');
  await as(U.admin, `select save_game_setup($1, 'Sunday KOTH 2', 'koth', 1800, 30, '{"radius": 30}')`, [id]);
  rows = await as(U.admin, 'select * from game_setups');
  assert.equal(rows[0].name, 'Sunday KOTH 2');
  assert.equal(rows[0].settings.relocate_minutes, null);
  await as(U.admin, 'select delete_game_setup($1)', [id]);
  assert.equal((await as(U.admin, 'select * from game_setups')).length, 0);
});

test('closing the day settles an unfinished KOTH game', async () => {
  const g = (await as(U.admin, `select create_game($1, 'Last', null, 0, 'koth', '{}') as id`, [day]))[0].id;
  await as(U.admin, 'select start_game($1)', [g]);
  await as(U.admin, 'select close_game_day($1)', [day]);
  assert.equal((await game(g)).state, 'complete');
  assert.ok((await hill(g)).result);
});
