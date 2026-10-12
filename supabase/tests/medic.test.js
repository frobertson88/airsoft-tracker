// Hits and medic rules (0009) on top of 0001–0008, in PGlite.
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
const medic = '00000000-0000-0000-0000-000000000103'; // Blue, role Medic
const enemy = '00000000-0000-0000-0000-000000000104'; // Red, role Medic
let db, day, blue, red, game;

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
const status = (u) => one(u, 'select my_medic_status($1)', [game]);
const hit = (u) => one(u, 'select report_hit($1)', [game]);
const scan = (u, who, code) => one(u, 'select scan_player($1, $2, $3)', [game, who, code]);
const treat = (u, who, code) => one(u, 'select treat_player($1, $2, $3)', [game, who, code]);

const RULES = {
  expiry: 'dead',
  hits: [
    { name: 'Leg wound', instruction: 'Bandage', helpers: ['medic', 'teammate'] },
    { name: 'Arm wound', instruction: 'Bandage arm', helpers: ['medic'] },
    { name: 'Dead', instruction: 'Respawn', helpers: ['admin'] },
  ],
};

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql', '0004_games.sql', '0005_koth.sql',
    '0006_teams_and_hill.sql', '0007_team_colours.sql', '0008_map_objects.sql', '0009_medic.sql']) {
    await db.exec(read(f));
  }
  const all = [admin, pat, mate, medic, enemy];
  for (const id of all) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of all.entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(admin, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  [blue, red] = (await db.query('select id from teams where game_day_id=$1 order by sort_order', [day])).rows.map((t) => t.id);
  for (const u of [pat, mate, medic, enemy]) await as(u, 'select join_game_day($1)', [day]);
  for (const u of [pat, mate, medic]) await as(u, 'select choose_team($1, $2)', [day, blue]);
  await as(enemy, 'select choose_team($1, $2)', [day, red]);
  for (const u of [medic, enemy]) await as(u, `select set_day_role($1, 'Medic')`, [day]);
  const sq = [[-41, 174], [-41, 174.01], [-40.99, 174.01], [-40.99, 174]].map(([lat, lng]) => ({ lat, lng }));
  const layout = { view: { lat: -41, lng: 174, latDelta: 0.01, lngDelta: 0.01 }, boundary: sq, areas: [], points: [] };
  const field = (await as(admin, 'select save_field(null, $1, null, null, $2) as id', ['F', JSON.stringify(layout)]))[0].id;
  await as(admin, 'select select_day_field($1, $2)', [day, field]);
});

test('built-in sets are readable; your own sets are saved, copied and deleted', async () => {
  const built = await as(pat, 'select name from medic_rulesets where owner_id is null order by sort_order');
  assert.deepEqual(built.map((r) => r.name), ['Standard', 'Medic only', 'Buddy aid']);
  const id = await one(admin, 'select save_medic_ruleset(null, $1, $2)', ['Mine', JSON.stringify(RULES)]);
  await as(admin, 'select save_medic_ruleset($1, $2, $3)', [id, 'Renamed', JSON.stringify(RULES)]);
  assert.equal((await as(admin, 'select name from medic_rulesets where id=$1', [id]))[0].name, 'Renamed');
  assert.equal((await as(pat, 'select * from medic_rulesets where id=$1', [id])).length, 0, 'others cannot see it');
  await rejects(as(pat, 'select save_medic_ruleset($1, $2, $3)', [id, 'X', JSON.stringify(RULES)]), 'ruleset_not_found');
  const builtinId = (await as(pat, `select id from medic_rulesets where name='Standard'`))[0].id;
  await rejects(as(admin, 'select save_medic_ruleset($1, $2, $3)', [builtinId, 'X', JSON.stringify(RULES)]), 'ruleset_not_found');
  await rejects(as(admin, 'select save_medic_ruleset(null, $1, $2)', ['Bad', JSON.stringify({ ...RULES, expiry: 'x' })]), 'medic_rules_invalid');
  await rejects(as(admin, 'select save_medic_ruleset(null, $1, $2)', ['Bad', JSON.stringify({ ...RULES, hits: RULES.hits.slice(0, 2) })]), 'medic_rules_invalid');
  await rejects(as(admin, 'select save_medic_ruleset(null, $1, $2)', ['Bad', JSON.stringify({ ...RULES, hits: [RULES.hits[0], RULES.hits[1], { name: 'D', instruction: '', helpers: ['god'] }] })]), 'medic_rules_invalid');
  await as(admin, 'select set_default_medic_ruleset($1)', [builtinId]);
  await rejects(as(pat, 'select set_default_medic_ruleset($1)', [id]), 'ruleset_not_found');
  await as(admin, 'select delete_medic_ruleset($1)', [id]);
});

test('a game copies the medic rules and bleed-out time', async () => {
  const settings = { medic: { name: 'Std', ...RULES, bleed_minutes: 1 } };
  game = await one(admin, `select create_game($1, 'G', null, 0, 'free', $2)`, [day, JSON.stringify(settings)]);
  const s = (await db.query('select settings from games where id=$1', [game])).rows[0].settings;
  assert.equal(s.medic.bleed_minutes, 1);
  assert.equal(s.medic.hits[1].name, 'Arm wound');
  await rejects(as(admin, `select update_game($1, 'G', null, 0, 'free', $2)`, [game, JSON.stringify({ medic: { ...settings.medic, bleed_minutes: 99 } })]), 'game_settings_invalid');
  await rejects(hit(pat), 'game_not_live');
  await as(admin, 'select start_game($1)', [game]);
});

let code;
test('I\'m hit: awaiting medic, wound hidden; a second hit is ignored', async () => {
  const s = await hit(pat);
  assert.equal(s.status, 'awaiting');
  assert.equal(s.shown_hit, null);
  assert.ok(s.code);
  code = s.code;
  const again = await hit(pat);
  assert.equal(again.code, code);
  assert.equal((await db.query(`select count(*)::int n from medic_events where kind='hit'`)).rows[0].n, 1);
  // Teammates see the status but not the code; nobody reads the secret table.
  const seen = await as(mate, 'select * from medic_status where user_id=$1', [pat]);
  assert.equal(seen[0].status, 'awaiting');
  assert.equal(seen[0].code, undefined);
  await rejects(as(mate, 'select * from medic_lives'), 'permission denied');
  assert.equal((await as(enemy, 'select * from medic_status')).length, 0);
});

test('scanning: wrong code, self-scan and other team are refused without revealing', async () => {
  await rejects(scan(mate, pat, 'nope'), 'medic_code_invalid');
  await rejects(scan(pat, pat, code), 'medic_self');
  const r = await scan(enemy, pat, code);
  assert.equal(r.revealed, false);
  assert.equal(r.wound, null);
  assert.equal((await status(pat)).status, 'awaiting');
});

test('a teammate may treat a leg wound; progress carries on', async () => {
  const r = await scan(mate, pat, code);
  assert.equal(r.allowed, true);
  assert.equal(r.wound.name, 'Leg wound');
  assert.equal((await status(pat)).status, 'wounded');
  assert.equal((await status(pat)).shown_hit, 1);
  await treat(mate, pat, code);
  const s = await status(pat);
  assert.equal(s.status, 'in_play');
  assert.equal(s.shown_hit, 1);
  await rejects(treat(mate, pat, code), 'medic_code_invalid');
});

test('an arm wound needs the team medic; the teammate is told who can', async () => {
  code = (await hit(pat)).code;
  const r = await scan(mate, pat, code);
  assert.equal(r.allowed, false);
  assert.equal(r.revealed, false);
  assert.deepEqual(r.helpers, ['medic']);
  await rejects(treat(mate, pat, code), 'medic_not_allowed');
  await rejects(treat(enemy, pat, code), 'medic_not_allowed'); // a medic, but on the other team
  await treat(medic, pat, code);
});

test('third hit is death: teammates can reveal it, only an admin brings them back (new life)', async () => {
  code = (await hit(pat)).code;
  const r = await scan(mate, pat, code);
  assert.equal(r.revealed, true);
  assert.equal(r.state, 'dead');
  assert.equal(r.allowed, false);
  await rejects(treat(medic, pat, code), 'medic_not_allowed');
  await treat(admin, pat, code);
  const s = await status(pat);
  assert.equal(s.status, 'in_play');
  assert.equal(s.life, 2);
  // New life starts at a leg wound again.
  code = (await hit(pat)).code;
  assert.equal((await scan(mate, pat, code)).wound.name, 'Leg wound');
});

test('bleed-out freezes while paused and kills at zero without revealing', async () => {
  await as(admin, 'select pause_game($1)', [game]);
  await rejects(hit(mate), 'game_not_live');
  const before = (await status(pat)).bleed_until;
  await db.query(`update games set active_seconds = active_seconds + 0 where id=$1`, [game]);
  await as(admin, 'select resume_game($1, 0)', [game]);
  await as(admin, 'select tick_game($1)', [game]);
  // Jump game time past the bleed-out.
  await db.query(`update games set live_since = live_since - interval '70 seconds' where id=$1`, [game]);
  await as(pat, 'select medic_tick($1)', [game]);
  const s = await status(pat);
  assert.equal(s.bleed_until, before);
  assert.equal(s.expired, true);
  assert.equal(s.status, 'dead', 'the revealed leg wound became death');
  const died = (await db.query(`select count(*)::int n from medic_events where kind='died'`)).rows[0].n;
  assert.equal(died, 1);
  // Hidden case: a fresh hit that bleeds out stays "awaiting" for the player.
  const c2 = (await hit(mate)).code;
  await db.query(`update games set live_since = live_since - interval '70 seconds' where id=$1`, [game]);
  await as(mate, 'select medic_tick($1)', [game]);
  const m = await status(mate);
  assert.equal(m.status, 'awaiting');
  assert.equal(m.expired, true);
  assert.equal((await scan(medic, mate, c2)).state, 'dead');
});

test('admins undo an accidental hit with a reason', async () => {
  await rejects(as(mate, `select undo_hit($1, $2, 'oops')`, [game, pat]), 'not_admin');
  await rejects(as(admin, `select undo_hit($1, $2, ' ')`, [game, pat]), 'medic_reason_required');
  await as(admin, `select undo_hit($1, $2, 'Fell over')`, [game, pat]);
  const s = await status(pat);
  assert.equal(s.status, 'in_play');
  const ev = (await db.query(`select kind, note from medic_events where user_id=$1 order by id desc limit 1`, [pat])).rows[0];
  assert.deepEqual(ev, { kind: 'undo', note: 'Fell over' });
  // Players see their own history; admins see everyone's.
  assert.ok((await as(pat, 'select * from medic_events')).every((e) => e.user_id === pat));
  assert.ok((await as(admin, 'select * from medic_events')).length > 5);
});

test('games without medic rules refuse hits', async () => {
  await as(admin, 'select end_game($1)', [game]);
  const g2 = await one(admin, `select create_game($1, 'G2', null, 0, 'free', '{}')`, [day]);
  await as(admin, 'select start_game($1)', [g2]);
  await rejects(as(pat, 'select report_hit($1)', [g2]), 'medic_off');
});
