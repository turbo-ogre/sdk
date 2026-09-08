// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
export interface Channel { artifacts: string[]; retain?: number }
export interface Declaration { version: 1; project: string; channels: Partial<Record<'canary' | 'stable' | 'preview', Channel>> }
export interface Registration { repository: string; repositoryId: string; ref: string; declaration: Declaration }
export interface ArtifactRecord { repository: string; repositoryId: string; channel: string; artifact: string; size: number; storedAt: string }
export interface PublishReceipt extends ArtifactRecord { digest: string }
export type TokenProvider = () => Promise<string>;
export interface ExpectedIdentity {repository: string; repositoryId: string; ref: string}
export interface OnboardingPlan {
  schema: 1;
  operation: 'register-declaration';
  project: string;
  declarationDigest: string;
  channels: Declaration['channels'];
  steps: string[];
  deployment: 'not-requested';
}
export interface OnboardingResult extends OnboardingPlan {status: 'registered-and-verified'; identity: ExpectedIdentity}
export function planOnboarding(declaration: Declaration): OnboardingPlan;
export interface ClientOptions {
  baseUrl: string;
  token: TokenProvider;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  allowInsecureLoopback?: boolean;
}
export class TurboOgreError extends Error {
  constructor(reason: string, options?: {status?: number; detail?: string});
  reason: string;
  status: number;
  detail: string;
}
export function digest(bytes: Uint8Array): string;
export function validateDeclaration(value: unknown): Declaration;
export function createDeclaration(options: {project: string; artifact?: string}): Declaration;
export function githubActionsToken(options: {
  audience: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  allowInsecureLoopback?: boolean;
}): TokenProvider;
export class TurboOgreClient {
  constructor(options: ClientOptions);
  validate(channel: string): Promise<{repository: string; channel: string; subject: string; environment?: string; ref?: string}>;
  register(declaration: Declaration): Promise<Registration>;
  status(): Promise<Registration>;
  onboard(request: {declaration: Declaration; expected: ExpectedIdentity}): Promise<OnboardingResult>;
  list(channel: string): Promise<{repository: string; channel: string; artifacts: ArtifactRecord[]}>;
  publish(options: {channel: string; artifact: string; bytes: Uint8Array}): Promise<PublishReceipt>;
  fetchArtifact(options: {channel: string; artifact: string; expectedDigest: string}): Promise<Uint8Array>;
}
