// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TurboOgreClient, TurboOgreError, githubActionsToken, createDeclaration, validateDeclaration, digest} from '../src/index.mjs';

async function fixture(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const record = {method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks)};
    requests.push(record);
    try { await handler(record, res); }
    catch { res.writeHead(500); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => {server.closeAllConnections(); server.close();});
  const base = `http://127.0.0.1:${server.address().port}`;
  return {base, requests, client: new TurboOgreClient({baseUrl: base + '/hosting', token: async () => 'test-identity', allowInsecureLoopback: true})};
}
const json = (res, body, status = 200) => {res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body));};

test('declaration refuses policy injection, unknown fields, invalid paths, and oversized input', () => {
  const valid = createDeclaration({project: 'example'});
  assert.deepEqual(validateDeclaration(valid), valid);
  for (const value of [
    {...valid, version: 2}, {...valid, policy: {allow: '*'}}, {...valid, placement: 'host'},
    {...valid, channels: {canary: {artifacts: ['../secret']}}},
    {...valid, channels: {canary: {artifacts: ['x'], retain: -1}}},
    {...valid, channels: {canary: {artifacts: ['x'], group: 'admins'}}},
    {...valid, project: 'x'.repeat(65536)},
  ]) assert.throws(() => validateDeclaration(value));
});

test('registration uses the gateway prefix and sends no client-chosen repository or ref', async t => {
  const f = await fixture(t, (req, res) => json(res, {declaration: req.body.length ? JSON.parse(req.body) : {}}));
  const declaration = createDeclaration({project: 'example'});
  await f.client.register(declaration); await f.client.status();
  assert.equal(f.requests[0].url, '/hosting/v1/config');
  assert.equal(f.requests[0].headers.authorization, 'Bearer test-identity');
  assert.equal(f.requests[0].headers['content-type'], 'application/yaml');
  assert.deepEqual(JSON.parse(f.requests[0].body), declaration);
  assert.equal(f.requests[1].method, 'GET');
});

test('publish hashes owned bytes and verifies the receipt; fetch checks the recorded digest', async t => {
  const bytes = Buffer.from('review sheet');
  const f = await fixture(t, (req, res) => {
    if (req.method === 'POST') {
      const query = new URL(req.url, 'http://test').searchParams;
      json(res, {digest: digest(req.body), size: req.body.length, artifact: query.get('artifact'), channel: query.get('channel')}, 201);
    } else res.end(bytes);
  });
  const receipt = await f.client.publish({channel: 'preview:12', artifact: 'sheet & review.tar.gz', bytes});
  assert.equal(f.requests[0].headers['x-artifact-digest'], digest(bytes));
  assert.equal(receipt.digest, digest(bytes));
  assert.deepEqual(await f.client.fetchArtifact({channel: 'preview:12', artifact: receipt.artifact, expectedDigest: receipt.digest}), bytes);
  assert.equal(f.requests[1].url, '/hosting/v1/artifacts/preview%3A12/sheet%20%26%20review.tar.gz');
  await assert.rejects(f.client.fetchArtifact({channel: 'canary', artifact: 'x', expectedDigest: '0'.repeat(64)}), {reason: 'sdk_download_digest_mismatch'});
});

test('bad publish receipt is a failure, not a deployment success', async t => {
  const f = await fixture(t, (_, res) => json(res, {digest: 'bad'}));
  await assert.rejects(f.client.publish({channel: 'canary', artifact: 'x', bytes: Buffer.from('x')}), {reason: 'sdk_publish_receipt_mismatch'});
});

test('backend denial and issuer outage preserve distinct reasons without response secrets', async t => {
  for (const [status, reason] of [[403, 'environment_mismatch'], [503, 'issuer_unavailable']]) {
    const f = await fixture(t, (_, res) => json(res, {refused: reason, detail: 'Bearer test-identity'}, status));
    await assert.rejects(f.client.status(), error => {
      assert.ok(error instanceof TurboOgreError);
      assert.equal(error.reason, reason); assert.equal(error.status, status);
      assert.ok(!error.message.includes('test-identity')); return true;
    });
  }
});

test('redirects never forward the bearer token to a different endpoint', async t => {
  let received = 0;
  const destination = await fixture(t, (_, res) => {received++; json(res, {});});
  const source = await fixture(t, (_, res) => {res.writeHead(302, {Location: destination.base}); res.end();});
  await assert.rejects(source.client.status(), {reason: 'sdk_transport_unavailable'});
  assert.equal(received, 0);
});

test('Actions identity mint preserves existing query and encodes the configured audience', async t => {
  const f = await fixture(t, (_, res) => json(res, {value: 'minted'}));
  const provider = githubActionsToken({audience: 'https://backend.test/path?a=b&c=d', allowInsecureLoopback: true,
    env: {ACTIONS_ID_TOKEN_REQUEST_URL: f.base + '/token?api-version=2', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-token'}});
  assert.equal(await provider(), 'minted');
  const url = new URL(f.requests[0].url, f.base);
  assert.equal(url.searchParams.get('api-version'), '2');
  assert.equal(url.searchParams.get('audience'), 'https://backend.test/path?a=b&c=d');
  assert.equal(f.requests[0].headers.authorization, 'Bearer runner-token');
  await assert.rejects(githubActionsToken({audience: 'x', env: {}})(), {reason: 'sdk_identity_unavailable'});
});

test('insecure remote endpoints, URL credentials, and invalid intent fail before network I/O', async t => {
  for (const baseUrl of ['http://example.test', 'https://user:password@example.test', 'https://example.test/?token=secret']) {
    assert.throws(() => new TurboOgreClient({baseUrl, token: async () => 'x', allowInsecureLoopback: true}));
  }
  const f = await fixture(t, (_, res) => json(res, {}));
  assert.throws(() => f.client.validate('stable&channel=canary'));
  await assert.rejects(f.client.publish({channel: 'canary', artifact: '../secret', bytes: Buffer.from('x')}));
  assert.equal(f.requests.length, 0);
});

test('CLI initializes and checks the consumer declaration without credentials and refuses overwrite', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'turbo-ogre-test-')); t.after(() => rm(dir, {recursive: true, force: true}));
  const cli = fileURLToPath(new URL('../bin/turbo-ogre.mjs', import.meta.url));
  const run = args => execFileSync(process.execPath, [cli, ...args], {cwd: dir, encoding: 'utf8', stdio: 'pipe'});
  run(['init', '--project', 'example']);
  const first = await readFile(join(dir, 'hosting.json'), 'utf8');
  assert.equal(JSON.parse(run(['check'])).valid, true);
  assert.throws(() => run(['init', '--project', 'overwrite']));
  assert.equal(await readFile(join(dir, 'hosting.json'), 'utf8'), first);
  assert.throws(() => run(['check', '--channel', 'stable']));
});
