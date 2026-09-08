// Copyright (c) 2026 Jacob Repp. SPDX-License-Identifier: MIT
import {createHash} from 'node:crypto';

const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
const MAX_DECLARATION_BYTES = 64 * 1024;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export class TurboOgreError extends Error {
  constructor(reason, {status = 0, detail = ''} = {}) {
    super(`${reason}${status ? ` (HTTP ${status})` : ''}${detail ? `: ${detail}` : ''}`);
    this.name = 'TurboOgreError';
    this.reason = reason;
    this.status = status;
    this.detail = detail;
  }
}

function object(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new TypeError(`${label}: unknown field ${key}`);
}

function artifactName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\\x00-\x1f\x7f]/.test(name)) {
    throw new TypeError('artifact must be a plain file name');
  }
  return name;
}

function channelName(name) {
  if (typeof name !== 'string' || !/^(canary|stable|preview:[1-9][0-9]*)$/.test(name)) {
    throw new TypeError('channel must be canary, stable, or preview:<positive PR number>');
  }
  return name;
}

/** Conservative local validation; backend identity and policy are authoritative. */
export function validateDeclaration(value) {
  object(value, ['version', 'project', 'channels'], 'declaration');
  if (value.version !== 1) throw new TypeError('only declaration version 1 is supported');
  if (typeof value.project !== 'string' || !value.project.trim()) throw new TypeError('project is required');
  if (!value.channels || typeof value.channels !== 'object' || Array.isArray(value.channels) || !Object.keys(value.channels).length) {
    throw new TypeError('channels must be a nonempty object');
  }
  for (const [name, channel] of Object.entries(value.channels)) {
    if (!['canary', 'stable', 'preview'].includes(name)) throw new TypeError(`unsupported declaration channel ${name}`);
    object(channel, ['artifacts', 'retain'], `channel ${name}`);
    if (!Array.isArray(channel.artifacts)) throw new TypeError(`${name}.artifacts must be an array`);
    channel.artifacts.forEach(artifactName);
    if (channel.retain !== undefined && (!Number.isSafeInteger(channel.retain) || channel.retain < 0)) {
      throw new TypeError(`${name}.retain must be a nonnegative safe integer`);
    }
  }
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_DECLARATION_BYTES) throw new TypeError('declaration exceeds 64 KiB');
  return structuredClone(value);
}

export function createDeclaration({project, artifact = 'review-site.tar.gz'}) {
  return validateDeclaration({version: 1, project, channels: {
    canary: {artifacts: [artifact], retain: 2},
    stable: {artifacts: [artifact], retain: 5},
  }});
}

function endpoint(value, allowInsecureLoopback) {
  const url = new URL(value);
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.username || url.password || url.hash || url.search ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && allowInsecureLoopback))) {
    throw new TypeError('endpoint requires HTTPS without credentials, query, or fragment');
  }
  return url;
}

async function limitedBytes(response, maxBytes) {
  const parts = [];
  let length = 0;
  if (!response.body) return Buffer.alloc(0);
  for await (const part of response.body) {
    length += part.length;
    if (length > maxBytes) throw new TurboOgreError('sdk_response_too_large');
    parts.push(part);
  }
  return Buffer.concat(parts, length);
}

function jsonResponse(raw) {
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new TurboOgreError('sdk_invalid_response'); }
}

/** Mint a short-lived Actions identity. No auth backend or stored credential. */
export function githubActionsToken({audience, env = process.env, fetch: fetchImpl = fetch, allowInsecureLoopback = false}) {
  if (typeof audience !== 'string' || !audience.trim()) throw new TypeError('audience is required');
  return async () => {
    const requestURL = env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!requestURL || !requestToken) throw new TurboOgreError('sdk_identity_unavailable', {
      detail: 'Run in a workflow with permissions: id-token: write, or supply a token provider.',
    });
    const requested = new URL(requestURL), query = requested.search;
    requested.search = '';
    const url = endpoint(requested.href, allowInsecureLoopback);
    url.search = query;
    url.searchParams.set('audience', audience);
    let response;
    try {
      response = await fetchImpl(url, {headers: {Authorization: `Bearer ${requestToken}`}, redirect: 'error', signal: AbortSignal.timeout(30_000)});
    } catch { throw new TurboOgreError('sdk_identity_unavailable'); }
    if (!response.ok) throw new TurboOgreError('sdk_identity_unavailable', {status: response.status});
    const body = jsonResponse(await limitedBytes(response, 64 * 1024));
    if (typeof body.value !== 'string' || !body.value) throw new TurboOgreError('sdk_identity_unavailable');
    return body.value;
  };
}

export class TurboOgreClient {
  #base; #token; #fetch; #timeout;
  constructor({baseUrl, token, fetch: fetchImpl = fetch, timeoutMs = 120_000, allowInsecureLoopback = false}) {
    this.#base = endpoint(baseUrl, allowInsecureLoopback).href.replace(/\/$/, '');
    if (typeof token !== 'function') throw new TypeError('token must be an async token provider');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive integer');
    this.#token = token;
    this.#fetch = fetchImpl;
    this.#timeout = timeoutMs;
  }

  async #request(method, path, {body, headers = {}, binary = false} = {}) {
    const token = await this.#token();
    if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw new TurboOgreError('sdk_identity_unavailable');
    let response;
    try {
      response = await this.#fetch(this.#base + path, {
        method, body, headers: {...headers, Authorization: `Bearer ${token}`},
        redirect: 'error', signal: AbortSignal.timeout(this.#timeout),
      });
    } catch { throw new TurboOgreError('sdk_transport_unavailable'); }
    const raw = await limitedBytes(response, response.ok && binary ? MAX_ARTIFACT_BYTES : 8 * 1024 * 1024);
    if (!response.ok) {
      let refusal;
      try { refusal = JSON.parse(raw); } catch { /* Proxy errors need not be JSON. */ }
      // Never echo a proxy response or a server detail that might contain a credential.
      const reason = typeof refusal?.refused === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(refusal.refused) ? refusal.refused : 'sdk_http_error';
      throw new TurboOgreError(reason, {status: response.status});
    }
    return binary ? raw : jsonResponse(raw);
  }

  validate(channel) {
    return this.#request('POST', '/v1/validate', {body: JSON.stringify({channel: channelName(channel)}), headers: {'Content-Type': 'application/json'}});
  }
  register(declaration) {
    return this.#request('POST', '/v1/config', {body: JSON.stringify(validateDeclaration(declaration)), headers: {'Content-Type': 'application/yaml'}});
  }
  status() { return this.#request('GET', '/v1/config'); }
  list(channel) { return this.#request('GET', `/v1/artifacts/${encodeURIComponent(channelName(channel))}`); }
  async publish({channel, artifact, bytes}) {
    channelName(channel); artifactName(artifact);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_ARTIFACT_BYTES) throw new TypeError('artifact must be bytes of at most 512 MiB');
    // Own a copy while minting/uploading, so caller mutations cannot change the digest.
    const body = Buffer.from(bytes), expected = digest(body);
    const query = new URLSearchParams({channel, artifact});
    const record = await this.#request('POST', `/v1/publish?${query}`, {body, headers: {
      'Content-Type': 'application/octet-stream', 'X-Artifact-Digest': expected,
    }});
    if (record?.digest !== expected || record?.size !== body.byteLength || record?.artifact !== artifact || record?.channel !== channel) {
      throw new TurboOgreError('sdk_publish_receipt_mismatch');
    }
    return record;
  }
  async fetchArtifact({channel, artifact, expectedDigest}) {
    channelName(channel); artifactName(artifact);
    if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('expectedDigest must be the recorded SHA-256');
    const bytes = await this.#request('GET', `/v1/artifacts/${encodeURIComponent(channel)}/${encodeURIComponent(artifact)}`, {binary: true});
    if (digest(bytes) !== expectedDigest) throw new TurboOgreError('sdk_download_digest_mismatch');
    return bytes;
  }
}
