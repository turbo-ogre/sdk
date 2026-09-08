// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';

// This is also run against the Git index by pre-commit. No installs or credentials.
for (const directory of ['src', 'bin', 'scripts', 'test', 'examples']) {
  for (const file of readdirSync(directory, {recursive: true})) {
    if (file.endsWith('.mjs')) execFileSync(process.execPath, ['--check', `${directory}/${file}`], {stdio: 'inherit'});
  }
}
for (const script of ['test', 'demo', 'check:package']) {
  execFileSync('npm', ['run', script], {stdio: 'inherit'});
}
