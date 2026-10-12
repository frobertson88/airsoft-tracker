// Map drawings (0008) on top of 0001–0007, in PGlite.
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
const a1 = '00000000-0000-0000-0000-000000000101'; // Blue, Alpha
const a2 = '00000000-0000-0000-0000-000000000102'; // Blue, Alpha
const b1 = '00000000-0000-0000-0000-000000000103'; // Blue, no section
const r1 = '00000000-0000-0000-0000-000000000104'; // Red
const loner = '00000000-0000-0000-0000-000000000105'; // no team
let db, day, blue, red, alpha;

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
const pt = (x = 0) => JSON.stringify([{ lat: -41 + x, lng: 174 + x }]);
const pts = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ lat: -41 + i * 1e-4, lng: 174 })));
const place = (u, kind, type, aff, aud, team, section, label, points, linked = true) =>
  as(u, 'select place_map_object($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as id',
    [day, kind, type, aff, aud, team, section, label, points, linked]).then((r) => r[0].id);
const seen = async (u) => (await as(u, 'select id from map_objects')).map((r) => r.id).sort();

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql', '0004_games.sql',
    '0005_koth.sql', '0006_teams_and_hill.sql', '0007_team_colours.sql', '0008_map_objects.sql']) {
    await db.exec(read(f));
  }
  const all = [admin, a1, a2, b1, r1, loner];
  for (const id of all) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of all.entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(admin, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  [blue, red] = (await db.query('select id from teams where game_day_id=$1 order by sort_order', [day])).rows.map((t) => t.id);
  for (const u of [a1, a2, b1, r1, loner]) await as(u, 'select join_game_day($1)', [day]);
  for (const u of [a1, a2, b1]) await as(u, 'select choose_team($1, $2)', [day, blue]);
  await as(r1, 'select choose_team($1, $2)', [day, red]);
  alpha = (await as(a1, 'select create_section($1, $2) as id', [day, 'Alpha']))[0].id;
  await as(a2, 'select choose_section($1, $2)', [day, alpha]);
  const sq = [[-41, 174], [-41, 174.01], [-40.99, 174.01], [-40.99, 174]].map(([lat, lng]) => ({ lat, lng }));
  const layout = { view: { lat: -41, lng: 174, latDelta: 0.01, lngDelta: 0.01 }, boundary: sq, areas: [], points: [] };
  const field = (await as(admin, 'select save_field(null, $1, null, null, $2) as id', ['F', JSON.stringify(layout)]))[0].id;
  await as(admin, 'select select_day_field($1, $2)', [day, field]);
});

let secMarker, teamMarker, enemy;
test('players place to their section or team, and only they see it', async () => {
  secMarker = await place(a1, 'marker', 'mg', 'friendly', 'section', null, alpha, null, pt());
  teamMarker = await place(b1, 'marker', 'rally', 'friendly', 'team', null, null, 'Rally here', pt(0.001));
  enemy = await place(r1, 'marker', 'drone', 'enemy', 'team', null, null, null, pt(0.002));
  assert.deepEqual(await seen(a2), [secMarker, teamMarker].sort());
  assert.deepEqual(await seen(b1), [teamMarker]);
  assert.deepEqual(await seen(r1), [enemy]);
  assert.deepEqual(await seen(loner), []);
  // An admin outside Host view sees nothing of other teams.
  assert.deepEqual(await seen(admin), []);
  const row = (await db.query('select * from map_objects where id=$1', [teamMarker])).rows[0];
  assert.equal(row.colour_team_id, blue);
  assert.equal(row.label, 'Rally here');
});

test('audience rules are enforced on the server', async () => {
  await rejects(place(b1, 'marker', 'mg', 'friendly', 'section', null, alpha, null, pt()), 'map_audience_invalid');
  await rejects(place(a1, 'marker', 'mg', 'friendly', 'team', red, null, null, pt()), 'map_audience_invalid');
  await rejects(place(a1, 'marker', 'drone', 'enemy', 'section', null, alpha, null, pt()), 'map_audience_invalid');
  await rejects(place(a1, 'marker', 'mg', 'friendly', 'admin', null, null, null, pt()), 'map_audience_invalid');
  await rejects(place(loner, 'marker', 'mg', 'friendly', 'team', null, null, null, pt()), 'map_no_team');
  await rejects(place(a1, 'marker', 'drone', 'friendly', 'team', null, null, null, pt()), 'map_kind_invalid');
  await rejects(place(a1, 'marker', 'recon', 'enemy', 'team', null, null, null, pt()), 'map_kind_invalid');
  await rejects(place(a1, 'label', null, 'friendly', 'team', null, null, '  ', pt()), 'map_label_required');
  await rejects(place(a1, 'area', null, 'friendly', 'team', null, null, null, pts(2)), 'map_points_invalid');
  await rejects(place(a1, 'arrow', null, 'friendly', 'team', null, null, null, pts(3)), 'map_points_invalid');
  await rejects(place(a1, 'line', null, 'friendly', 'team', null, null, null, '[{"lat": 95, "lng": 0}, {"lat": 0, "lng": 0}]'), 'map_points_invalid');
  await rejects(place(a1, 'line', null, 'friendly', 'team', null, null, null, '[{"lat": "x"}, {}]'), 'map_points_invalid');
});

test('drawings of every kind', async () => {
  for (const [kind, n] of [['label', 1], ['waypoints', 4], ['arrow', 2], ['line', 3], ['area', 5], ['defence', 2], ['attack', 2]]) {
    await place(a1, kind, null, 'friendly', 'team', null, null, kind === 'label' ? 'Hold' : null, pts(n), kind !== 'waypoints');
  }
  assert.equal((await seen(b1)).length, 8);
});

test('creators move and delete their own; others cannot', async () => {
  await rejects(as(a2, 'select move_map_object($1, $2)', [teamMarker, pt(0.01)]), 'map_not_allowed');
  await as(b1, 'select move_map_object($1, $2)', [teamMarker, pt(0.01)]);
  await rejects(as(b1, 'select move_map_object($1, $2)', [teamMarker, pts(2)]), 'map_points_invalid');
  const n = (await as(a2, 'select delete_map_objects($1, $2) as n', [day, [teamMarker, secMarker]]))[0].n;
  assert.equal(n, 0);
  assert.equal((await as(a1, 'select delete_map_objects($1, $2) as n', [day, [teamMarker, secMarker]]))[0].n, 1);
});

test('Host view: admins see everything, place anywhere, change anything', async () => {
  await rejects(as(a1, 'select set_map_host_view($1, true)', [day]), 'not_admin');
  await as(admin, 'select set_map_host_view($1, true)', [day]);
  assert.ok((await seen(admin)).includes(enemy));
  const secret = await place(admin, 'marker', 'fob', 'friendly', 'admin', null, null, null, pt());
  const forRed = await place(admin, 'marker', 'infantry', 'enemy', 'team', red, null, null, pt());
  assert.ok((await seen(r1)).includes(forRed));
  assert.ok(!(await seen(r1)).includes(secret));
  assert.equal((await db.query('select colour_team_id from map_objects where id=$1', [forRed])).rows[0].colour_team_id, red);
  await as(admin, 'select move_map_object($1, $2)', [teamMarker, pt(0.02)]);
  await as(admin, 'select set_map_host_view($1, false)', [day]);
  assert.deepEqual(await seen(admin), [secret, forRed].sort()); // only their own
  await rejects(as(admin, 'select move_map_object($1, $2)', [enemy, pt()]), 'map_not_allowed');
});

test('enemy sightings expire after 30 minutes', async () => {
  await db.query(`update map_objects set created_at = now() - interval '31 minutes' where id=$1`, [enemy]);
  assert.ok(!(await seen(r1)).includes(enemy));
  await place(r1, 'marker', 'mg', 'enemy', 'team', null, null, null, pt());
  assert.equal((await db.query('select count(*)::int as n from map_objects where id=$1', [enemy])).rows[0].n, 0);
});

test('a game ending clears the drawings; briefing drawings carry into the game', async () => {
  const g = (await as(admin, `select create_game($1, 'G', null, 0, 'free', '{}') as id`, [day]))[0].id;
  const brief = await place(a1, 'arrow', null, 'friendly', 'team', null, null, null, pts(2));
  await as(admin, 'select start_game($1)', [g]);
  assert.ok((await seen(b1)).includes(brief));
  await as(admin, 'select end_game($1)', [g]);
  assert.equal((await db.query('select count(*)::int as n from map_objects where game_day_id=$1', [day])).rows[0].n, 0);
});
