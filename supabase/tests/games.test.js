// Games lifecycle/clock and positions (0004) on top of 0001–0003, in PGlite.
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
  host: '00000000-0000-0000-0000-00000000000e',
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
// Move a game's timestamps into the past to simulate time passing.
const rewind = (id, secs) =>
  db.query(
    `update games set
       live_since = live_since - make_interval(secs => $2),
       countdown_ends_at = countdown_ends_at - make_interval(secs => $2)
     where id = $1`,
    [id, secs],
  );

const layout = {
  view: { lat: 0.5, lng: 0.5, latDelta: 0.01, lngDelta: 0.01 },
  boundary: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }],
  areas: [],
  points: [],
};

let day, g1;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql', '0004_games.sql']) {
    await db.exec(read(f));
  }
  for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of Object.values(U).entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(U.admin, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  const [blue, red] = (await as(U.admin, 'select id from teams where game_day_id=$1 order by sort_order', [day])).map((t) => t.id);
  for (const u of [U.blue1, U.blue2, U.red1, U.host]) await as(u, 'select join_game_day($1)', [day]);
  for (const u of [U.admin, U.blue1, U.blue2]) await as(u, 'select choose_team($1, $2)', [day, blue]);
  await as(U.red1, 'select choose_team($1, $2)', [day, red]);
  await as(U.admin, 'select set_admin($1, $2, true)', [day, U.host]);
});

test('only admins create games; one unfinished game at a time', async () => {
  await rejects(as(U.blue1, 'select create_game($1, $2, 600, 5)', [day, 'Skirmish']), 'not_admin');
  g1 = (await as(U.admin, 'select create_game($1, $2, 600, 5) as id', [day, 'Skirmish']))[0].id;
  assert.equal((await game(g1)).state, 'ready');
  await rejects(as(U.admin, 'select create_game($1, $2, null, 0)', [day, 'Another']), 'game_in_progress');
  assert.equal((await as(U.red1, 'select * from games')).length, 1);
});

test('starting needs a picked field', async () => {
  await rejects(as(U.admin, 'select start_game($1)', [g1]), 'field_required');
  const field = (await as(U.admin, 'select save_field(null, $1, null, null, $2) as id', ['F', JSON.stringify(layout)]))[0].id;
  await as(U.admin, 'select select_day_field($1, $2)', [day, field]);
});

test('countdown, cancel back to ready, then countdown goes live by itself', async () => {
  await rejects(as(U.blue1, 'select start_game($1)', [g1]), 'not_admin');
  await as(U.admin, 'select start_game($1)', [g1]);
  assert.equal((await game(g1)).state, 'countdown');
  await as(U.admin, 'select cancel_countdown($1)', [g1]);
  assert.equal((await game(g1)).state, 'ready');
  await as(U.admin, 'select start_game($1)', [g1]);
  await as(U.blue1, 'select tick_game($1)', [g1]);
  assert.equal((await game(g1)).state, 'countdown', 'not yet');
  await rewind(g1, 6);
  await as(U.blue1, 'select tick_game($1)', [g1]);
  const g = await game(g1);
  assert.equal(g.state, 'live');
  assert.ok(g.started_at);
});

test('pause freezes the clock; resume counts down then goes live', async () => {
  await rewind(g1, 100);
  await as(U.admin, 'select pause_game($1)', [g1]);
  let g = await game(g1);
  assert.equal(g.state, 'paused');
  assert.ok(Math.abs(Number(g.active_seconds) - 100) < 2, `active ${g.active_seconds}`);
  await rejects(as(U.blue1, 'select pause_game($1)', [g1]), 'not_admin');
  await as(U.admin, 'select resume_game($1, 10)', [g1]);
  assert.equal((await game(g1)).state, 'resuming');
  await as(U.admin, 'select cancel_countdown($1)', [g1]);
  assert.equal((await game(g1)).state, 'paused');
  await as(U.admin, 'select resume_game($1, 10)', [g1]);
  await rewind(g1, 11);
  await as(U.red1, 'select tick_game($1)', [g1]);
  g = await game(g1);
  assert.equal(g.state, 'live');
  assert.ok(Math.abs(Number(g.active_seconds) - 100) < 2, 'resume countdown did not count as play');
});

test('a timed game ends by itself; add time extends it', async () => {
  await as(U.admin, 'select add_time($1, 120)', [g1]);
  // 100s played; 600 + 120 = 720 total; rewind 615s so 715 played: still live.
  await rewind(g1, 615);
  await as(U.blue1, 'select tick_game($1)', [g1]);
  assert.equal((await game(g1)).state, 'live');
  await rewind(g1, 10);
  await as(U.blue1, 'select tick_game($1)', [g1]);
  const g = await game(g1);
  assert.equal(g.state, 'complete');
  assert.equal(g.end_reason, 'time');
  assert.equal(Number(g.active_seconds), 720);
});

test('play again makes a fresh ready game with the same settings', async () => {
  await rejects(as(U.blue1, 'select play_again($1)', [g1]), 'not_admin');
  const g2 = (await as(U.admin, 'select play_again($1) as id', [g1]))[0].id;
  const g = await game(g2);
  assert.deepEqual([g.state, g.name, g.length_seconds, g.countdown_seconds, Number(g.active_seconds)], ['ready', 'Skirmish', 600, 5, 0]);
  // Force start skips the countdown; end game ends early.
  await as(U.admin, 'select start_game($1)', [g2]);
  await as(U.admin, 'select force_start($1)', [g2]);
  assert.equal((await game(g2)).state, 'live');
  await as(U.admin, 'select end_game($1)', [g2]);
  const done = await game(g2);
  assert.equal(done.state, 'complete');
  assert.equal(done.end_reason, 'ended');
});

test('unlimited games cannot get extra time and never time out', async () => {
  const g3 = (await as(U.admin, 'select create_game($1, $2, null, 0) as id', [day, 'Open play']))[0].id;
  await as(U.admin, 'select start_game($1)', [g3]);
  assert.equal((await game(g3)).state, 'live');
  await rejects(as(U.admin, 'select add_time($1, 60)', [g3]), 'game_unlimited');
  await rewind(g3, 100000);
  await as(U.blue1, 'select tick_game($1)', [g3]);
  assert.equal((await game(g3)).state, 'live');
});

test('positions: own team only; hosting admins see everyone', async () => {
  const report = (u, lat) => as(u, 'select report_position($1, $2, 0.5, 5, now())', [day, lat]);
  for (const [u, lat] of [[U.blue1, 0.1], [U.blue2, 0.2], [U.red1, 0.3], [U.admin, 0.4]]) await report(u, lat);
  const seen = async (u) => (await as(u, 'select user_id from positions order by lat')).map((r) => r.user_id);
  assert.deepEqual(await seen(U.blue1), [U.blue1, U.blue2, U.admin]);
  assert.deepEqual(await seen(U.red1), [U.red1]);
  assert.deepEqual(await seen(U.host), [U.blue1, U.blue2, U.red1, U.admin]);
  await rejects(as(U.blue1, 'insert into positions (game_day_id, user_id, lat, lng, recorded_at) values ($1, $2, 0, 0, now())', [day, U.red1]), 'permission denied');
  await rejects(as(null, 'select report_position($1, 0, 0, 1, now())', [day]), 'permission denied');
});

test('an older reading never overwrites a newer one', async () => {
  await as(U.blue1, "select report_position($1, 0.9, 0.5, 5, now() - interval '1 minute')", [day]);
  assert.equal((await as(U.blue1, 'select lat from positions where user_id=$1', [U.blue1]))[0].lat, 0.1);
});

test('leaving or being removed drops your position and blocks reporting', async () => {
  await as(U.blue2, 'select leave_game_day($1)', [day]);
  assert.equal((await db.query('select * from positions where user_id=$1', [U.blue2])).rows.length, 0);
  await rejects(as(U.blue2, 'select report_position($1, 0, 0, 1, now())', [day]), 'not_member');
  await as(U.admin, 'select remove_member($1, $2)', [day, U.red1]);
  assert.equal((await db.query('select * from positions where user_id=$1', [U.red1])).rows.length, 0);
});

test('closing the day drops positions and ends the open game', async () => {
  await as(U.admin, 'select close_game_day($1)', [day]);
  assert.equal((await db.query('select * from positions where game_day_id=$1', [day])).rows.length, 0);
  assert.equal((await db.query("select * from games where game_day_id=$1 and state <> 'complete'", [day])).rows.length, 0);
  await rejects(as(U.blue1, 'select report_position($1, 0, 0, 1, now())', [day]), 'day_closed');
});
