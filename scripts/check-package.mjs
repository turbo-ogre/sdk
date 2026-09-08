// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const temporary = mkdtempSync(join(tmpdir(), 'turbo-ogre-package-'));
const root = process.cwd();
try {
  const [packed] = JSON.parse(execFileSync('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', temporary,
  ], {encoding: 'utf8'}));
  const consumer = join(temporary, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}));
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', join(temporary, 'cache'), join(temporary, packed.filename)], {cwd: consumer, stdio: 'inherit'});

  const installed = join(consumer, 'node_modules/@turbo-ogre/sdk');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.private, true, 'SDK must remain unpublished until a release is prepared');
  assert.ok(readFileSync(resolve(installed, manifest.exports['.'].types), 'utf8').includes('TurboOgreClient'));
  // Import by package name, outside the checkout, to exercise the exports map.
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {TurboOgreClient, createDeclaration, planOnboarding} from '@turbo-ogre/sdk';
    assert.equal(typeof TurboOgreClient.prototype.onboard, 'function');
    assert.ok(planOnboarding(createDeclaration({project: 'package-smoke'})));
  `], {cwd: consumer, stdio: 'inherit'});

  const cli = join(consumer, 'node_modules/.bin/turbo-ogre');
  for (const project of ['content-forge', 'biohazard']) {
    const result = JSON.parse(execFileSync(cli, ['onboard', '--dry-run', '--file',
      join(root, 'examples', project, 'hosting.json')], {cwd: consumer, encoding: 'utf8'}));
    assert.equal(result.status, 'local-preview');
  }
  console.log('Packed SDK: package import, type entry, and both consumer CLI previews passed.');
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
