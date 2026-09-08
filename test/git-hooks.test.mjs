// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {devNull, tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const env = {...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull};
// These tests run from real hooks as well as CI. Never inherit the caller's index.
for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], {encoding: 'utf8'}).trim().split('\n')) delete env[key];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'turbo-ogre-hook-test-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const cwd = join(directory, 'repo');
  mkdirSync(cwd);
  const run = (command, args, options = {}) => spawnSync(command, args, {cwd, env, encoding: 'utf8', ...options});
  const git = (...args) => run('git', ['-c', 'user.name=SDK hook test', '-c', 'user.email=sdk-test@example.invalid',
    '-c', 'commit.gpgsign=false', ...args]);
  const write = (file, value) => {
    mkdirSync(dirname(join(cwd, file)), {recursive: true});
    writeFileSync(join(cwd, file), value);
  };
  pass(git('init', '--initial-branch=main'));
  for (const file of ['.githooks/pre-commit', 'scripts/pre-commit.mjs', 'scripts/install-hooks.mjs']) {
    write(file, '');
    copyFileSync(join(source, file), join(cwd, file));
  }
  chmodSync(join(cwd, '.githooks/pre-commit'), 0o755);
  write('package.json', JSON.stringify({private: true, scripts: {
    check: 'node check.mjs', 'lint:workflows': 'node lint.mjs',
  }}));
  // A tiny check keeps hook integration independent of the SDK test runner.
  write('check.mjs', "import {readFileSync} from 'node:fs';\nif (!['good\\n', 'better\\n'].includes(readFileSync('src/value', 'utf8'))) process.exit(1);\n");
  write('lint.mjs', "import {readFileSync} from 'node:fs';\nif (readFileSync('.github/workflows/check.yml', 'utf8') !== 'good\\n') process.exit(1);\n");
  write('src/value', 'good\n');
  write('.github/workflows/check.yml', 'good\n');
  write('README.md', 'original\n');
  pass(git('add', '.'));
  pass(git('commit', '-m', 'fixture baseline'));
  const install = () => run(process.execPath, ['scripts/install-hooks.mjs']);
  const state = () => ({index: git('write-tree').stdout, status: git('status', '--porcelain=v1').stdout,
    value: readFileSync(join(cwd, 'src/value'), 'utf8')});
  return {directory, cwd, run, git, write, install, state};
}

function pass(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }
function fail(result, message) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  if (message) assert.match(result.stdout + result.stderr, message);
}

test('hook installer is explicit and idempotent', t => {
  const f = fixture(t);
  assert.equal(f.git('config', '--get', 'core.hooksPath').status, 1);
  pass(f.install());
  pass(f.install());
  assert.equal(f.git('config', '--local', '--get', 'core.hooksPath').stdout.trim(), '.githooks');
});

test('hook installer preserves custom paths and active default hooks', t => {
  const f = fixture(t);
  pass(f.git('config', '--local', 'core.hooksPath', 'custom-hooks'));
  fail(f.install(), /Existing core.hooksPath preserved/);
  assert.equal(f.git('config', '--get', 'core.hooksPath').stdout.trim(), 'custom-hooks');
  pass(f.git('config', '--unset', 'core.hooksPath'));
  // Changing hooksPath would hide every existing hook, even one for another event.
  f.write('.git/hooks/pre-push', '#!/bin/sh\nexit 0\n');
  chmodSync(join(f.cwd, '.git/hooks/pre-push'), 0o755);
  fail(f.install(), /Existing Git hooks preserved/);
  assert.equal(f.git('config', '--get', 'core.hooksPath').status, 1);
});

test('invalid staged content blocks a commit even when the working file is fixed', t => {
  const f = fixture(t);
  pass(f.install());
  f.write('src/value', 'bad\n');
  pass(f.git('add', 'src/value'));
  f.write('src/value', 'good\n');
  const before = f.state();
  fail(f.git('commit', '-m', 'must fail'), /staged checks failed/);
  assert.deepEqual(f.state(), before);
});

test('valid staged content commits while preserving invalid unstaged content and untracked files', t => {
  const f = fixture(t);
  pass(f.install());
  f.write('src/value', 'better\n');
  pass(f.git('add', 'src/value'));
  f.write('src/value', 'bad\n');
  f.write('untracked', 'keep me\n');
  pass(f.git('commit', '-m', 'valid staged snapshot'));
  assert.equal(f.git('show', 'HEAD:src/value').stdout, 'better\n');
  assert.equal(readFileSync(join(f.cwd, 'src/value'), 'utf8'), 'bad\n');
  assert.equal(readFileSync(join(f.cwd, 'untracked'), 'utf8'), 'keep me\n');
});

test('workflow checks use staged bytes and reject invalid workflows', t => {
  const f = fixture(t);
  pass(f.install());
  f.write('.github/workflows/check.yml', 'bad\n');
  pass(f.git('add', '.github/workflows/check.yml'));
  f.write('.github/workflows/check.yml', 'good\n');
  const before = f.state();
  fail(f.git('commit', '-m', 'must fail'), /lint:workflows/);
  assert.deepEqual(f.state(), before);
});

test('documentation commits skip SDK checks but still reject staged whitespace errors', t => {
  const f = fixture(t);
  pass(f.install());
  f.write('src/value', 'bad\n');
  f.write('README.md', 'trailing space \n');
  pass(f.git('add', 'README.md'));
  fail(f.git('commit', '-m', 'must fail'), /trailing whitespace/);
  f.write('README.md', 'clean documentation\n');
  pass(f.git('add', 'README.md'));
  pass(f.git('commit', '-m', 'docs only'));
});

test('commit --only checks its temporary index and preserves unrelated staged work', t => {
  const f = fixture(t);
  pass(f.install());
  f.write('src/value', 'bad\n');
  pass(f.git('add', 'src/value'));
  f.write('src/another', 'new\n');
  pass(f.git('add', 'src/another'));
  pass(f.git('commit', '--only', 'src/another', '-m', 'select one file'));
  assert.equal(f.git('show', 'HEAD:src/value').stdout, 'good\n');
  assert.equal(f.git('show', ':src/value').stdout, 'bad\n');
  assert.equal(readFileSync(join(f.cwd, 'src/value'), 'utf8'), 'bad\n');
});

test('the hook also runs from linked worktrees', t => {
  const f = fixture(t);
  pass(f.install());
  const worktree = join(f.directory, 'linked');
  pass(f.git('worktree', 'add', '--detach', worktree, 'HEAD'));
  writeFileSync(join(worktree, 'src/value'), 'bad\n');
  pass(f.run('git', ['add', 'src/value'], {cwd: worktree}));
  fail(f.run('git', ['-c', 'user.name=SDK hook test', '-c', 'user.email=sdk-test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'must fail'], {cwd: worktree}), /staged checks failed/);
});
