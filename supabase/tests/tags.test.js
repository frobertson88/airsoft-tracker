// Tag library phase 1 (0012): point ids and numbers, tags, lookup. PGlite.
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
  alpha: '00000000-0000-0000-0000-00000000000a',
  bravo: '00000000-0000-0000-0000-00000000000b',
  charlie: '00000000-0000-0000-0000-00000000000c',
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

const c = (lat, lng) => ({ lat, lng });
const square = [c(0, 0), c(0, 1), c(1, 1), c(1, 0)];
const bowtie = [c(0, 0), c(1, 1), c(0, 1), c(1, 0)];
const layout = (over = {}) => ({
  view: { lat: 0.5, lng: 0.5, latDelta: 0.01, lngDelta: 0.01 },
  boundary: square,
  areas: [{ kind: 'nogo', name: 'Quarry', note: 'Closed', points: [c(0.1, 0.1), c(0.1, 0.2), c(0.2, 0.2)] }],
  points: [{ kind: 'staging', label: 'Car park', lat: 0.5, lng: 0.5 }],
  ...over,
});

const save = (user, id, data) =>
  as(user, 'select save_field($1, $2, $3, $4, $5) as id', [id, 'Pine Ridge', '', '', JSON.stringify(data)]);
const pointsOf = async (user, id) => (await as(user, 'select data from fields where id=$1', [id]))[0].data.points;

let day, field;
const old = layout({ points: [{ kind: 'base', label: 'Hill', lat: 0.5, lng: 0.5 }, { kind: 'other', label: 'Hut', lat: 0.6, lng: 0.6 }] });

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql', '0010_field_preview.sql']) await db.exec(read(f));
  for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of Object.values(U).entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(U.alpha, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  await as(U.bravo, 'select join_game_day($1)', [day]);
  // A field and its day copy saved before 0012, without point ids.
  field = (await save(U.alpha, null, old))[0].id;
  await as(U.alpha, 'select select_day_field($1, $2)', [day, field]);
  await db.exec(read('0012_tags.sql'));
});

test('opening QR codes numbers an older field\'s points and gives the day copy the same ids', async () => {
  assert.equal((await pointsOf(U.alpha, field))[0].id, undefined);
  await as(U.alpha, 'select * from point_tags($1)', [field]);
  const pts = await pointsOf(U.alpha, field);
  assert.deepEqual(pts.map((p) => p.num), [1, 2]);
  assert.ok(pts.every((p) => typeof p.id === 'string' && p.id.length > 10));
  const dayPts = (await as(U.bravo, 'select data from day_fields where game_day_id=$1', [day]))[0].data.points;
  assert.deepEqual(dayPts.map((p) => p.id), pts.map((p) => p.id));
});

test('saving keeps ids and numbers, numbers new points from the lowest free', async () => {
  const pts = await pointsOf(U.alpha, field);
  // Drop point 1, add two new ones.
  await save(U.alpha, field, layout({ points: [pts[1], { kind: 'other', label: 'A', lat: 0.2, lng: 0.2 }, { kind: 'other', label: 'B', lat: 0.3, lng: 0.3 }] }));
  const now = await pointsOf(U.alpha, field);
  assert.equal(now[0].id, pts[1].id);
  assert.deepEqual(now.map((p) => p.num), [2, 1, 3]);
});

test('a point sent back without its id on the same spot keeps it; duplicates are fixed', async () => {
  const pts = await pointsOf(U.alpha, field);
  const stripped = pts.map(({ id, num, ...rest }) => rest);
  await save(U.alpha, field, layout({ points: stripped }));
  assert.deepEqual(await pointsOf(U.alpha, field), pts);
  await save(U.alpha, field, layout({ points: [pts[0], { ...pts[1], id: pts[0].id, num: pts[0].num }] }));
  const fixed = await pointsOf(U.alpha, field);
  assert.notEqual(fixed[0].id, fixed[1].id);
  assert.notEqual(fixed[0].num, fixed[1].num);
});

test('point_tags makes one tag per point, once, for the owner only', async () => {
  const first = await as(U.alpha, 'select * from point_tags($1)', [field]);
  assert.equal(first.length, (await pointsOf(U.alpha, field)).length);
  assert.ok(first.every((t) => /^AT-[0-9A-HJKMNP-TV-Z]{5}$/.test(t.code)));
  const again = await as(U.alpha, 'select * from point_tags($1)', [field]);
  assert.deepEqual(again, first);
  await rejects(as(U.bravo, 'select * from point_tags($1)', [field]), 'not_field_owner');
  assert.equal((await as(U.bravo, 'select * from tags')).length, 0);
});

test('bind_tag adds a spare tag and refuses bad codes, points and other people\'s tags', async () => {
  const pts = await pointsOf(U.alpha, field);
  await as(U.alpha, 'select bind_tag($1, $2, $3)', ['at-23456', field, pts[0].id]);
  const tags = await as(U.alpha, 'select code from tags where point_id=$1 order by code', [pts[0].id]);
  assert.ok(tags.some((t) => t.code === 'AT-23456'));
  await rejects(as(U.alpha, 'select bind_tag($1, $2, $3)', ['AT-ILOU1', field, pts[0].id]), 'tag_invalid');
  await rejects(as(U.alpha, 'select bind_tag($1, $2, $3)', ['AT-23457', field, 'nope']), 'point_not_found');
  const theirs = (await save(U.bravo, null, layout()))[0].id;
  const theirPt = (await pointsOf(U.bravo, theirs))[0].id;
  await rejects(as(U.bravo, 'select bind_tag($1, $2, $3)', ['AT-23456', theirs, theirPt]), 'tag_taken');
  // Moving your own tag to another point is fine.
  await as(U.alpha, 'select bind_tag($1, $2, $3)', ['AT-23456', field, pts[1].id]);
  assert.equal((await as(U.alpha, 'select point_id from tags where code=$1', ['AT-23456']))[0].point_id, pts[1].id);
});

test('lookup_tag: owner reads the field, day members the day copy, others nothing', async () => {
  const look = async (user, code, d = null) => (await as(user, 'select lookup_tag($1, $2) as r', [code, d]))[0].r;
  const pts = await pointsOf(U.alpha, field);
  const mine = await look(U.alpha, 'AT-23456');
  assert.equal(mine.known, true);
  assert.equal(mine.mine, true);
  assert.equal(mine.point.id, pts[1].id);
  assert.equal((await look(U.bravo, 'AT-23456')).known, false);
  // The day copy was taken before the edits, so point 2 there is still the Hut.
  const inDay = await look(U.bravo, 'AT-23456', day);
  assert.equal(inDay.known, true);
  assert.equal(inDay.mine, false);
  assert.equal(inDay.field, 'Pine Ridge');
  assert.equal((await look(U.charlie, 'AT-23456', day)).known, false);
  assert.deepEqual(await look(U.alpha, ' at-zzzzz '), { code: 'AT-ZZZZZ', known: false, mine: false });
  await rejects(look(U.alpha, 'hello'), 'tag_invalid');
});
