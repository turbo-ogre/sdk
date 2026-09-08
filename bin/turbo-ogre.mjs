#!/usr/bin/env node
// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {runCli} from '../src/cli.mjs';

try { await runCli(process.argv.slice(2)); }
catch (error) {
  console.error(`turbo-ogre: ${error.message}`);
  process.exitCode = 1;
}
