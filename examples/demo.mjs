// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
// An in-memory HTTP fixture for ergonomics review. It is not an auth emulator.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {TurboOgreClient, planOnboarding} from '../src/index.mjs';

async function exercise(project, repositoryId) {
  const declaration = JSON.parse(await readFile(new URL(`./${project}/hosting.json`, import.meta.url), 'utf8'));
  const expected = {repository: `example/${project}`, repositoryId, ref: 'refs/pull/7/merge'};
  let stored, wrongRef = false;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer fixture-only') {res.writeHead(401); res.end(JSON.stringify({refused: 'token_invalid'})); return;}
    if (req.url !== '/hosting/v1/config') {res.writeHead(404); res.end('{}'); return;}
    if (req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      stored = JSON.parse(Buffer.concat(chunks)); res.statusCode = 201;
    }
    res.end(JSON.stringify({...expected, ref: wrongRef ? 'refs/heads/main' : expected.ref, declaration: stored}));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const client = new TurboOgreClient({baseUrl: `http://127.0.0.1:${server.address().port}/hosting`,
      token: async () => 'fixture-only', allowInsecureLoopback: true});
    const local = planOnboarding(declaration);
    const registered = await client.onboard({declaration, expected});
    assert.equal(local.declarationDigest, registered.declarationDigest);
    wrongRef = true;
    await assert.rejects(client.onboard({declaration, expected}), {reason: 'sdk_registration_identity_mismatch'});
    return {project, local: 'valid', fixtureRegistration: registered.status, wrongRef: 'refused', deployment: registered.deployment};
  } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
}

const results = [];
for (const [index, project] of ['content-forge', 'biohazard'].entries()) results.push(await exercise(project, String(index + 1)));
console.log(JSON.stringify({mode: 'local-http-fixture', realIdentityVerified: false, results}, null, 2));
