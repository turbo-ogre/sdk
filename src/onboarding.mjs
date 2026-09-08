// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {digest, validateDeclaration, TurboOgreError} from './index.mjs';

function canonicalDeclaration(value) {
  const declaration = validateDeclaration(value);
  return {version: declaration.version, project: declaration.project,
    channels: Object.fromEntries(Object.keys(declaration.channels).sort().map(name => {
      const channel = declaration.channels[name];
      return [name, {artifacts: [...channel.artifacts].sort(), retain: channel.retain || 0}];
    }))};
}

/** Local request preview, not a server-issued deployment or authorization plan. */
export function planOnboarding(declaration) {
  const canonical = canonicalDeclaration(declaration);
  return {
    schema: 1, operation: 'register-declaration', project: canonical.project,
    declarationDigest: digest(Buffer.from(JSON.stringify(canonical))),
    channels: canonical.channels,
    steps: ['register', 'read-back', 'verify-identity-and-declaration'],
    deployment: 'not-requested',
  };
}

function requireIdentity(expected) {
  if (!expected || typeof expected.repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(expected.repository) ||
      typeof expected.repositoryId !== 'string' || !/^[1-9][0-9]*$/.test(expected.repositoryId) ||
      typeof expected.ref !== 'string' || !expected.ref.startsWith('refs/') || /\s/.test(expected.ref)) {
    throw new TurboOgreError('sdk_expected_identity_required', {
      detail: 'Onboarding requires the expected repository, numeric repository ID, and ref.',
    });
  }
}

function verifyRegistration(record, expected, plan) {
  if (record?.repository !== expected.repository || record?.repositoryId !== expected.repositoryId || record?.ref !== expected.ref) {
    throw new TurboOgreError('sdk_registration_identity_mismatch');
  }
  let actual;
  try { actual = planOnboarding(record.declaration); }
  catch { throw new TurboOgreError('sdk_registration_declaration_mismatch'); }
  if (actual.declarationDigest !== plan.declarationDigest) throw new TurboOgreError('sdk_registration_declaration_mismatch');
}

/** Register and verify the caller's declaration without touching any runtime. */
export async function onboard(client, {declaration, expected}) {
  const request = validateDeclaration(declaration);
  const plan = planOnboarding(request);
  requireIdentity(expected);
  const identity = {...expected};
  const registered = await client.register(request);
  verifyRegistration(registered, identity, plan);
  const active = await client.status();
  verifyRegistration(active, identity, plan);
  return {...plan, status: 'registered-and-verified', identity};
}
