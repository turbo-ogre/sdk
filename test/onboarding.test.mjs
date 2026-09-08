// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TurboOgreClient, planOnboarding} from '../src/index.mjs';
import {runCli} from '../src/cli.mjs';

const expected = {repository: 'example/project', repositoryId: '123', ref: 'refs/pull/7/merge'};
const declaration = {version: 1, project: 'example', channels: {canary: {artifacts: ['a', 'b'], retain: 0}}};
function fixture(change = () => {}) {
  const requests = [];
  const client = new TurboOgreClient({baseUrl: 'https://fixture.test/hosting', token: async () => 'fixture-token',
    fetch: async (url, options) => {
      requests.push({url, ...options});
      const record = {...expected, declaration: structuredClone(declaration)};
      change(record, options.method);
      return Response.json(record, {status: options.method === 'POST' ? 201 : 200});
    }});
  return {client, requests};
}

test('onboarding verifies both writes and readback, accepting backend omission of retain zero', async () => {
  const {client, requests} = fixture(record => {delete record.declaration.channels.canary.retain; record.declaration.channels.canary.artifacts.reverse();});
  const result = await client.onboard({declaration, expected});
  assert.equal(result.status, 'registered-and-verified');
  assert.equal(result.deployment, 'not-requested');
  assert.deepEqual(result.identity, expected);
  assert.deepEqual(requests.map(r => r.method), ['POST', 'GET']);
  assert.ok(requests.every(r => r.url === 'https://fixture.test/hosting/v1/config'));
});

test('a pull request cannot report successful onboarding under main or another repository', async () => {
  for (const method of ['POST', 'GET']) for (const [field, value] of [
    ['ref', 'refs/heads/main'], ['repository', 'other/project'], ['repositoryId', '999'],
  ]) {
    const {client} = fixture((record, current) => {if (current === method) record[field] = value;});
    await assert.rejects(client.onboard({declaration, expected}), {reason: 'sdk_registration_identity_mismatch'});
  }
});

test('unexpected declaration readback is refused instead of reporting a completed registration', async () => {
  for (const method of ['POST', 'GET']) {
    const {client} = fixture((record, current) => {if (current === method) record.declaration.channels.canary.artifacts = ['*'];});
    await assert.rejects(client.onboard({declaration, expected}), {reason: 'sdk_registration_declaration_mismatch'});
  }
});

test('missing expected identity or invalid declaration is refused before any remote mutation', async () => {
  const {client, requests} = fixture();
  await assert.rejects(client.onboard({declaration, expected: {...expected, repositoryId: undefined}}), {reason: 'sdk_expected_identity_required'});
  await assert.rejects(client.onboard({declaration: {...declaration, policy: {admin: true}}, expected}), /unknown field/);
  assert.equal(requests.length, 0);
});

test('both consumer dry runs use one CLI path without endpoint, identity, or network', async () => {
  for (const consumer of ['content-forge', 'biohazard']) {
    const path = new URL(`../examples/${consumer}/hosting.json`, import.meta.url);
    const {fileURLToPath} = await import('node:url');
    const result = await runCli(['onboard', '--file', fileURLToPath(path), '--dry-run'], {
      env: {}, write: () => {}, createClient: () => {throw new Error('dry run attempted network');},
    });
    assert.equal(result.project, consumer);
    assert.equal(result.status, 'local-preview');
    assert.equal(result.deployment, 'not-requested');
    assert.deepEqual(result, {...planOnboarding(JSON.parse(await readFile(path, 'utf8'))), status: 'local-preview'});
  }
});

test('CLI onboarding preserves the workflow identity expectations', async () => {
  const path = new URL('../examples/biohazard/hosting.json', import.meta.url);
  const {fileURLToPath} = await import('node:url');
  let request;
  await runCli(['onboard', '--file', fileURLToPath(path)], {
    env: {TURBO_OGRE_URL: 'https://fixture.test', TURBO_OGRE_AUDIENCE: 'fixture',
      GITHUB_REPOSITORY: expected.repository, GITHUB_REPOSITORY_ID: expected.repositoryId, GITHUB_REF: expected.ref},
    write: () => {}, createClient: () => ({onboard: async value => {request = value; return {};}}),
  });
  assert.deepEqual(request.expected, expected);
  assert.equal(request.declaration.project, 'biohazard');
});
