// Field Library and Game Day field (0003) on top of 0001/0002, in PGlite.
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

const save = (user, id, name, data) =>
  as(user, 'select save_field($1, $2, $3, $4, $5) as id', [id, name, 'Somewhere', 'Notes', JSON.stringify(data)]);

let day, field;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of ['0001_stage1.sql', '0002_section_leads.sql', '0003_fields.sql']) await db.exec(read(f));
  for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of Object.values(U).entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(U.alpha, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  await as(U.bravo, 'select join_game_day($1)', [day]);
});

test('saves a valid field and only the owner can read it', async () => {
  field = (await save(U.alpha, null, 'Pine Ridge', layout()))[0].id;
  assert.equal((await as(U.alpha, 'select name, revision from fields'))[0].name, 'Pine Ridge');
  assert.equal((await as(U.bravo, 'select * from fields')).length, 0);
});

test('rejects unfinished or self-crossing shapes and bad parts', async () => {
  await rejects(save(U.alpha, null, 'X', layout({ boundary: square.slice(0, 2) })), 'field_boundary_invalid');
  await rejects(save(U.alpha, null, 'X', layout({ boundary: bowtie })), 'field_boundary_invalid');
  await rejects(save(U.alpha, null, 'X', layout({ boundary: [c(0, 0), c(0, 200), c(1, 1)] })), 'field_boundary_invalid');
  await rejects(save(U.alpha, null, 'X', layout({ areas: [{ kind: 'nogo', name: '', points: square }] })), 'field_area_invalid');
  await rejects(save(U.alpha, null, 'X', layout({ areas: [{ kind: 'lava', name: 'A', points: square }] })), 'field_area_invalid');
  await rejects(save(U.alpha, null, 'X', layout({ points: [{ kind: 'base', label: 'B' }] })), 'field_point_invalid');
  await rejects(save(U.alpha, null, 'X', layout({ view: null })), 'field_view_invalid');
  await rejects(save(U.alpha, null, ' ', layout()), 'check');
});

test('editing bumps the revision; others cannot edit, duplicate or archive', async () => {
  await save(U.alpha, field, 'Pine Ridge', layout({ points: [] }));
  assert.equal((await as(U.alpha, 'select revision from fields where id=$1', [field]))[0].revision, 2);
  await rejects(save(U.bravo, field, 'Mine now', layout()), 'not_field_owner');
  await rejects(as(U.bravo, 'select duplicate_field($1)', [field]), 'not_field_owner');
  await rejects(as(U.bravo, 'select archive_field($1, true)', [field]), 'not_field_owner');
});

test('duplicate and archive', async () => {
  const copy = (await as(U.alpha, 'select duplicate_field($1) as id', [field]))[0].id;
  const rows = await as(U.alpha, 'select name, revision from fields where id=$1', [copy]);
  assert.deepEqual(rows[0], { name: 'Pine Ridge (copy)', revision: 1 });
  await as(U.alpha, 'select archive_field($1, true)', [copy]);
  await rejects(as(U.alpha, 'select select_day_field($1, $2)', [day, copy]), 'field_archived');
});

test('only a day admin can pick a field, and only their own', async () => {
  await rejects(as(U.bravo, 'select select_day_field($1, $2)', [day, field]), 'not_admin');
  const theirs = (await save(U.bravo, null, 'Bravo field', layout()))[0].id;
  await as(U.alpha, 'select set_admin($1, $2, true)', [day, U.bravo]);
  await as(U.bravo, 'select select_day_field($1, $2)', [day, theirs]);
  await rejects(as(U.alpha, 'select select_day_field($1, $2)', [day, theirs]), 'not_field_owner');
});

test('picking copies the field; later edits do not change the day', async () => {
  await as(U.alpha, 'select select_day_field($1, $2)', [day, field]);
  const before = (await as(U.bravo, 'select name, field_revision, data from day_fields where game_day_id=$1', [day]))[0];
  assert.equal(before.name, 'Pine Ridge');
  assert.equal(before.field_revision, 2);
  await save(U.alpha, field, 'Pine Ridge v3', layout({ boundary: [c(0, 0), c(0, 2), c(2, 2), c(2, 0)] }));
  const after = (await as(U.bravo, 'select name, data from day_fields where game_day_id=$1', [day]))[0];
  assert.equal(after.name, 'Pine Ridge');
  assert.deepEqual(after.data.boundary, square);
});

test('non-members cannot see the day field; tables are read-only', async () => {
  assert.equal((await as(U.charlie, 'select * from day_fields')).length, 0);
  await rejects(as(U.alpha, 'insert into day_fields (game_day_id, field_revision, name, data, selected_by) values ($1, 1, $2, $3, $4)', [day, 'x', '{}', U.alpha]), 'permission denied');
  await rejects(as(U.alpha, "update fields set name='x'"), 'permission denied');
  await rejects(as(null, 'select save_field(null, $1, null, null, $2)', ['x', JSON.stringify(layout())]), 'permission denied');
});

test('closed days reject picking a field', async () => {
  await as(U.alpha, 'select close_game_day($1)', [day]);
  await rejects(as(U.alpha, 'select select_day_field($1, $2)', [day, field]), 'day_closed');
});
