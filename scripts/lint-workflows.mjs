// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';

const files = (existsSync('.github/workflows') ? readdirSync('.github/workflows') : []).filter(file => /\.ya?ml$/.test(file)).sort()
  .map(file => `.github/workflows/${file}`);
if (files.length) {
  // Explicit paths also work in the pre-commit snapshot, which has no .git directory.
  const result = spawnSync('actionlint', ['-color', '-shellcheck=', '-pyflakes=', ...files], {stdio: 'inherit'});
  if (result.error) console.error('Workflow lint requires actionlint. See CONTRIBUTING.md for installation.');
  process.exitCode = result.status ?? 1;
}
