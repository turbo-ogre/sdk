// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, sep} from 'node:path';

const git = args => execFileSync('git', args, {encoding: 'utf8'});
let temporary;
try {
  execFileSync('git', ['diff', '--cached', '--check'], {stdio: 'inherit'});
  const changed = git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
  const check = changed.some(file => /^(src|bin|schema|examples|test|scripts|\.githooks)\//.test(file)
    || /^package(?:-lock)?\.json$/.test(file));
  const workflows = changed.some(file => /^\.github\/workflows\//.test(file) || file === 'scripts/lint-workflows.mjs');
  if (check || workflows) {
    temporary = mkdtempSync(join(tmpdir(), 'turbo-ogre-index-'));
    git(['checkout-index', '--all', `--prefix=${temporary}${sep}`]);
    // Git exports local variables to hooks, including an alternate index during
    // `git commit --only`. Child tests must be able to create independent repos.
    const env = {...process.env};
    for (const key of git(['rev-parse', '--local-env-vars']).trim().split('\n')) delete env[key];
    console.log('pre-commit: checking staged files in an isolated snapshot');
    for (const script of [check && 'check', workflows && 'lint:workflows'].filter(Boolean)) {
      execFileSync('npm', ['run', script], {cwd: temporary, env, stdio: 'inherit'});
    }
  }
} catch (error) {
  console.error('pre-commit: staged checks failed; the index and working files were left unchanged.');
  process.exitCode = error.status || 1;
} finally {
  if (temporary) rmSync(temporary, {recursive: true, force: true});
}
