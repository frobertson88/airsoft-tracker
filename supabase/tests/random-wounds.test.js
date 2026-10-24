// Random wounds (0011) on top of 0001–0010, in PGlite.
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
    '0006_teams_and_hill.sql', '0007_team_colours.sql', '0008_map_objects.sql', '0009_medic.sql',
    '0010_field_preview.sql', '0011_random_wounds.sql']) {
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


const WOUNDS = [
  { name: 'Leg wound', instruction: 'Bandage', helpers: ['teammate'], chance: 1, fatal: false },
  { name: 'Head shot', instruction: 'Respawn', helpers: [], chance: 1, fatal: true },
];
const RANDOM = { ...RULES, wounds: WOUNDS, dead_on: 3 };
const setGame = async (rules) => {
  game = await one(admin, `select create_game($1, 'G', null, 0, 'free', $2)`,
    [day, JSON.stringify({ medic: { name: 'R', ...rules, bleed_minutes: 5 } })]);
  await as(admin, 'select start_game($1)', [game]);
};
const endGame = () => as(admin, 'select end_game($1)', [game]);
const only = (name) => ({ ...RANDOM, wounds: WOUNDS.map((w) => ({ ...w, chance: w.name === name ? 100 : 1 })) });

test('random sets are checked and saved; the built-in Random wounds set is there', async () => {
  const built = await as(pat, 'select name, rules from medic_rulesets where owner_id is null order by sort_order');
  assert.deepEqual(built.map((r) => r.name), ['Standard', 'Medic only', 'Buddy aid', 'Random wounds']);
  assert.equal(built[3].rules.wounds.length, 4);
  const id = await one(admin, 'select save_medic_ruleset(null, $1, $2)', ['Rnd', JSON.stringify(RANDOM)]);
  const saved = (await as(admin, 'select rules from medic_rulesets where id=$1', [id]))[0].rules;
  assert.equal(saved.dead_on, 3);
  assert.deepEqual(saved.wounds[1], { ...WOUNDS[1], helpers: [] });
  const bad = (r) => rejects(as(admin, 'select save_medic_ruleset(null, $1, $2)', ['Bad', JSON.stringify(r)]), 'medic_rules_invalid');
  await bad({ ...RANDOM, dead_on: 9 });
  await bad({ ...RANDOM, wounds: [] });
  await bad({ ...RANDOM, wounds: [{ ...WOUNDS[0], chance: 0 }] });
  await bad({ ...RANDOM, wounds: [{ ...WOUNDS[0], chance: 'lots' }] });
  await bad({ ...RANDOM, wounds: [{ ...WOUNDS[0], helpers: [] }] }); // only fatal wounds may have no helpers
  // In-order sets still save without the extra fields.
  const plain = await one(admin, 'select save_medic_ruleset(null, $1, $2)', ['Plain', JSON.stringify(RULES)]);
  assert.equal((await as(admin, 'select rules from medic_rulesets where id=$1', [plain]))[0].rules.wounds, undefined);
});

test('a random wound is picked at the hit, hidden until scanned, and not re-rolled', async () => {
  await setGame(only('Leg wound'));
  const s = await hit(pat);
  assert.equal(s.status, 'awaiting');
  assert.equal(s.wound, null, 'hidden from the player');
  const ev = await as(pat, 'select note from medic_events where game_id=$1 and user_id=$2', [game, pat]);
  assert.equal(ev[0].note, null, 'not in their history either');
  const r1 = await scan(mate, pat, s.code);
  assert.equal(r1.wound.name, 'Leg wound');
  const r2 = await scan(medic, pat, s.code);
  assert.equal(r2.wound.name, 'Leg wound');
  const me = await status(pat);
  assert.equal(me.wound.name, 'Leg wound');
  assert.equal((await as(mate, 'select shown_wound from medic_status where user_id=$1 and game_id=$2', [pat, game]))[0].shown_wound, 'Leg wound');
  await treat(mate, pat, s.code);
  assert.equal((await status(pat)).wound, null);
  await endGame();
});

test('a fatal wound is dead at once; the Dead hit decides who brings them back', async () => {
  await setGame(only('Head shot'));
  const s = await hit(pat);
  const r = await scan(mate, pat, s.code);
  assert.equal(r.state, 'dead');
  assert.equal(r.wound.name, 'Head shot');
  assert.equal(r.allowed, false, 'only an admin brings them back');
  await rejects(treat(mate, pat, s.code), 'medic_not_allowed');
  await treat(admin, pat, s.code);
  const me = await status(pat);
  assert.equal(me.life, 2);
  assert.equal(me.status, 'in_play');
  await endGame();
});

test('the dead-on hit is dead without a roll; undo clears the wound', async () => {
  await setGame({ ...only('Leg wound'), dead_on: 2 });
  let s = await hit(pat);
  await treat(mate, pat, s.code);
  s = await hit(pat);
  const r = await scan(mate, pat, s.code);
  assert.equal(r.state, 'dead');
  assert.equal(r.wound.name, 'Dead');
  await as(admin, `select undo_hit($1, $2, 'Missed')`, [game, pat]);
  const me = await status(pat);
  assert.equal(me.status, 'in_play');
  assert.equal(me.wound, null);
  await endGame();
});

test('chances weigh the pick', async () => {
  const counts = {};
  const md = { ...RANDOM, wounds: [{ ...WOUNDS[0], chance: 90 }, { ...WOUNDS[1], chance: 10 }] };
  for (let i = 0; i < 400; i++) {
    const w = (await db.query('select _medic_pick($1::jsonb) w', [JSON.stringify(md)])).rows[0].w;
    counts[w.name] = (counts[w.name] ?? 0) + 1;
  }
  assert.ok(counts['Leg wound'] > 300 && counts['Head shot'] > 10, JSON.stringify(counts));
});

test('in-order games work as before', async () => {
  await setGame(RULES);
  let s = await hit(pat);
  assert.equal((await scan(mate, pat, s.code)).wound.name, 'Leg wound');
  await treat(mate, pat, s.code);
  s = await hit(pat);
  assert.equal((await scan(medic, pat, s.code)).wound.name, 'Arm wound');
  await treat(medic, pat, s.code);
  s = await hit(pat);
  assert.equal((await scan(mate, pat, s.code)).state, 'dead');
  await endGame();
});
