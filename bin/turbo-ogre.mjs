#!/usr/bin/env node
// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {readFile, writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {createDeclaration, validateDeclaration, TurboOgreClient, githubActionsToken} from '../src/index.mjs';

const usage = `turbo-ogre <command> [options]
  init --project NAME [--artifact review-site.tar.gz] [--file hosting.json]
  check [--file hosting.json]                   validate locally
  register [--file hosting.json]                register for the token's ref
  status                                       show registered declaration
  validate --channel canary                    check identity/channel policy
  publish --channel C --artifact NAME --file PATH
  list --channel C
  fetch --channel C --artifact NAME --sha256 HASH --out PATH

Network commands require TURBO_OGRE_URL and TURBO_OGRE_AUDIENCE.
Identity comes from Actions OIDC or TURBO_OGRE_TOKEN (never a command argument).
Publishing stores an artifact; it does not provision or deploy a website.
`;

try {
  const {values, positionals} = parseArgs({allowPositionals: true, strict: true, options: Object.fromEntries(
    ['project', 'artifact', 'file', 'channel', 'sha256', 'out'].map(name => [name, {type: 'string'}]),
  )});
  const [command] = positionals;
  if (!command || command === 'help') { console.log(usage); }
  else {
    const allowed = {
      init: ['project', 'artifact', 'file'], check: ['file'], register: ['file'],
      status: [], validate: ['channel'], publish: ['channel', 'artifact', 'file'],
      list: ['channel'], fetch: ['channel', 'artifact', 'sha256', 'out'],
    };
    if (!allowed[command] || positionals.length !== 1 || Object.keys(values).some(key => !allowed[command].includes(key))) throw new Error('Unknown command or unsupported argument; run turbo-ogre help.');
    const need = name => { if (!values[name]) throw new Error(`--${name} is required`); return values[name]; };
    let result;
    if (command === 'init') {
      const declaration = createDeclaration({project: need('project'), artifact: values.artifact});
      await writeFile(values.file || 'hosting.json', JSON.stringify(declaration, null, 2) + '\n', {flag: 'wx'});
      result = {created: values.file || 'hosting.json'};
    } else if (command === 'check') {
      result = {valid: true, declaration: validateDeclaration(JSON.parse(await readFile(values.file || 'hosting.json', 'utf8')))};
    } else {
      const baseUrl = process.env.TURBO_OGRE_URL, audience = process.env.TURBO_OGRE_AUDIENCE;
      if (!baseUrl || !audience) throw new Error('TURBO_OGRE_URL and TURBO_OGRE_AUDIENCE are required');
      const token = process.env.TURBO_OGRE_TOKEN ? async () => process.env.TURBO_OGRE_TOKEN : githubActionsToken({audience});
      const client = new TurboOgreClient({baseUrl, token});
      switch (command) {
        case 'register': result = await client.register(JSON.parse(await readFile(values.file || 'hosting.json', 'utf8'))); break;
        case 'status': result = await client.status(); break;
        case 'validate': result = await client.validate(need('channel')); break;
        case 'list': result = await client.list(need('channel')); break;
        case 'publish': result = await client.publish({channel: need('channel'), artifact: need('artifact'), bytes: await readFile(need('file'))}); break;
        case 'fetch': {
          const output = need('out');
          const bytes = await client.fetchArtifact({channel: need('channel'), artifact: need('artifact'), expectedDigest: need('sha256')});
          await writeFile(output, bytes, {flag: 'wx', mode: 0o600});
          result = {downloaded: output, sha256: values.sha256};
          break;
        }
      }
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(`turbo-ogre: ${error.message}`);
  process.exitCode = 1;
}
