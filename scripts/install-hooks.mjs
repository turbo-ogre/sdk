// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {execFileSync, spawnSync} from 'node:child_process';
import {accessSync, constants, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

try {
  const configured = spawnSync('git', ['config', '--get', 'core.hooksPath'], {encoding: 'utf8'});
  if (configured.error || ![0, 1].includes(configured.status)) throw new Error('Run this command in an SDK Git checkout.');
  const path = configured.stdout.trim();
  if (configured.status === 0 && path !== '.githooks') {
    throw new Error('Existing core.hooksPath preserved. Integrate .githooks/pre-commit into your hook manager manually.');
  }
  if (configured.status === 1) {
    const defaults = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {encoding: 'utf8'}).trim();
    const active = existsSync(defaults) && readdirSync(defaults).filter(file => !file.endsWith('.sample')).some(file => {
      try { accessSync(join(defaults, file), constants.X_OK); return true; } catch { return false; }
    });
    if (active) throw new Error('Existing Git hooks preserved. Integrate .githooks/pre-commit into your hook manager manually.');
  }
  accessSync('.githooks/pre-commit', constants.X_OK);
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks']);
  console.log('SDK hooks installed for this checkout. Pre-commit validates staged files; npm installs do not install hooks.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
