// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {readFile, writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {createDeclaration, validateDeclaration, planOnboarding, TurboOgreClient, githubActionsToken} from './index.mjs';

const usage = `turbo-ogre <command> [options]
  onboard [--file hosting.json] [--dry-run]      register and verify this ref
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
Onboard checks GITHUB_REPOSITORY, GITHUB_REPOSITORY_ID, and GITHUB_REF.
Onboard --dry-run validates locally and needs no credentials or network.
Publishing stores an artifact; it does not provision or deploy a website.
`;

export async function runCli(args, {env = process.env, cwd = process.cwd(), write = value => console.log(value), createClient = options => new TurboOgreClient(options)} = {}) {
  const {values, positionals} = parseArgs({args, allowPositionals: true, strict: true, options: {...Object.fromEntries(
    ['project', 'artifact', 'file', 'channel', 'sha256', 'out'].map(name => [name, {type: 'string'}]),
  ), 'dry-run': {type: 'boolean'}, help: {type: 'boolean', short: 'h'}}});
  const [command] = positionals;
  if (!command || command === 'help' || values.help) { write(usage); }
  else {
    const allowed = {
      init: ['project', 'artifact', 'file'], check: ['file'], register: ['file'],
      status: [], validate: ['channel'], publish: ['channel', 'artifact', 'file'],
      list: ['channel'], fetch: ['channel', 'artifact', 'sha256', 'out'],
      onboard: ['file', 'dry-run'],
    };
    if (!allowed[command] || positionals.length !== 1 || Object.keys(values).some(key => !allowed[command].includes(key))) throw new Error('Unknown command or unsupported argument; run turbo-ogre help.');
    const need = name => { if (!values[name]) throw new Error(`--${name} is required`); return values[name]; };
    const file = name => resolve(cwd, name);
    let result;
    if (command === 'init') {
      const declaration = createDeclaration({project: need('project'), artifact: values.artifact});
      await writeFile(file(values.file || 'hosting.json'), JSON.stringify(declaration, null, 2) + '\n', {flag: 'wx'});
      result = {created: values.file || 'hosting.json'};
    } else if (command === 'check' || (command === 'onboard' && values['dry-run'])) {
      const declaration = validateDeclaration(JSON.parse(await readFile(file(values.file || 'hosting.json'), 'utf8')));
      result = command === 'check' ? {valid: true, declaration} : {...planOnboarding(declaration), status: 'local-preview'};
    } else {
      const declaration = ['register', 'onboard'].includes(command) ? validateDeclaration(JSON.parse(await readFile(file(values.file || 'hosting.json'), 'utf8'))) : undefined;
      const baseUrl = env.TURBO_OGRE_URL, audience = env.TURBO_OGRE_AUDIENCE;
      if (!baseUrl || !audience) throw new Error('TURBO_OGRE_URL and TURBO_OGRE_AUDIENCE are required');
      const token = env.TURBO_OGRE_TOKEN ? async () => env.TURBO_OGRE_TOKEN : githubActionsToken({audience, env});
      const client = createClient({baseUrl, token});
      switch (command) {
        case 'register': result = await client.register(declaration); break;
        case 'onboard': result = await client.onboard({declaration, expected: {
          repository: env.GITHUB_REPOSITORY, repositoryId: env.GITHUB_REPOSITORY_ID, ref: env.GITHUB_REF,
        }}); break;
        case 'status': result = await client.status(); break;
        case 'validate': result = await client.validate(need('channel')); break;
        case 'list': result = await client.list(need('channel')); break;
        case 'publish': result = await client.publish({channel: need('channel'), artifact: need('artifact'), bytes: await readFile(file(need('file')))}); break;
        case 'fetch': {
          const output = need('out');
          const bytes = await client.fetchArtifact({channel: need('channel'), artifact: need('artifact'), expectedDigest: need('sha256')});
          await writeFile(file(output), bytes, {flag: 'wx', mode: 0o600});
          result = {downloaded: output, sha256: values.sha256};
          break;
        }
      }
    }
    write(JSON.stringify(result, null, 2));
    return result;
  }
}
