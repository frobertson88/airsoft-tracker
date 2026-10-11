// Section leads (0002) on top of Stage 1, in an in-memory Postgres (PGlite).
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
  delta: '00000000-0000-0000-0000-00000000000d',
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

const lead = async (section) =>
  (await db.query('select leader_id from sections where id=$1', [section])).rows[0].leader_id;

let day, blue, alphaSec;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(read('0001_stage1.sql'));
  await db.exec(read('0002_section_leads.sql'));
  for (const id of Object.values(U)) await db.query('insert into auth.users values ($1)', [id]);
  for (const [i, id] of Object.values(U).entries()) await as(id, 'select set_callsign($1)', [`P${i}`]);
  day = (await as(U.alpha, 'select create_game_day($1) as id', ['Sunday']))[0].id;
  blue = (await as(U.alpha, "select id from teams where game_day_id=$1 and colour='blue'", [day]))[0].id;
  for (const u of [U.bravo, U.charlie, U.delta]) await as(u, 'select join_game_day($1)', [day]);
  for (const u of Object.values(U)) await as(u, 'select choose_team($1, $2)', [day, blue]);
});

test('creating a section makes you its lead', async () => {
  alphaSec = (await as(U.bravo, 'select create_section($1, $2) as id', [day, 'Alpha']))[0].id;
  assert.equal(await lead(alphaSec), U.bravo);
  await as(U.charlie, 'select choose_section($1, $2)', [day, alphaSec]);
  await as(U.delta, 'select choose_section($1, $2)', [day, alphaSec]);
});

test('a plain member cannot take the lead while there is one', async () => {
  await rejects(as(U.charlie, 'select set_section_leader($1, $2)', [alphaSec, U.charlie]), 'not_section_lead');
  await rejects(as(U.charlie, 'select set_section_leader($1, $2)', [alphaSec, U.delta]), 'not_section_lead');
});

test('the lead can hand over, only to someone in the section', async () => {
  await rejects(as(U.bravo, 'select set_section_leader($1, $2)', [alphaSec, U.alpha]), 'not_in_section');
  await as(U.bravo, 'select set_section_leader($1, $2)', [alphaSec, U.charlie]);
  assert.equal(await lead(alphaSec), U.charlie);
});

test('an admin outside the section can reassign the lead', async () => {
  await as(U.alpha, 'select set_section_leader($1, $2)', [alphaSec, U.delta]);
  assert.equal(await lead(alphaSec), U.delta);
});

test('leaving the section gives up the lead, then a member can take it', async () => {
  await as(U.delta, 'select choose_section($1, null)', [day]);
  assert.equal(await lead(alphaSec), null);
  await rejects(as(U.bravo, 'select set_section_leader($1, $2)', [alphaSec, U.charlie]), 'not_section_lead');
  await as(U.charlie, 'select set_section_leader($1, $2)', [alphaSec, U.charlie]);
  assert.equal(await lead(alphaSec), U.charlie);
});

test('being removed from the day gives up the lead', async () => {
  await as(U.alpha, 'select remove_member($1, $2)', [day, U.charlie]);
  assert.equal(await lead(alphaSec), null);
});

test('anon cannot call it', async () => {
  await rejects(as(null, 'select set_section_leader($1, $2)', [alphaSec, U.bravo]), 'permission denied');
});
