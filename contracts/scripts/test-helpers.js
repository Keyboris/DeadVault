// scripts/test-helpers.js
// Shared utilities used by all keyholder test scripts.
// Requires Node.js >= 18 (native fetch) or 16+ with node-fetch installed.

const { ethers } = require("ethers");

const BASE_URL = process.env.API_URL || "http://localhost:8080";

// ─── Colour helpers ───────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  grey:   "\x1b[90m",
  bold:   "\x1b[1m",
};

function ok(msg)   { console.log(`${C.green}  ✓${C.reset} ${msg}`); }
function fail(msg) { console.log(`${C.red}  ✗${C.reset} ${msg}`); }
function info(msg) { console.log(`${C.cyan}  →${C.reset} ${msg}`); }
function warn(msg) { console.log(`${C.yellow}  ⚠${C.reset} ${msg}`); }
function step(msg) { console.log(`\n${C.bold}${C.cyan}── ${msg}${C.reset}`); }
function dim(msg)  { console.log(`${C.grey}    ${msg}${C.reset}`); }

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function request(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  return { status: res.status, ok: res.ok, body: json };
}

const get    = (path, token)        => request("GET",    path, null,  token);
const post   = (path, body, token)  => request("POST",   path, body,  token);
const put    = (path, body, token)  => request("PUT",    path, body,  token);
const del    = (path, token)        => request("DELETE", path, null,  token);

// ─── SIWE authentication ──────────────────────────────────────────────────────

/**
 * Full SIWE flow: fetch nonce → sign message → verify → return JWT.
 * @param {ethers.Wallet} wallet
 * @returns {Promise<string>} JWT token
 */
async function authenticate(wallet) {
  const address = wallet.address;

  // 1. Fetch nonce
  const nonceRes = await get(`/api/auth/nonce?walletAddress=${address}`);
  if (!nonceRes.ok) {
    throw new Error(`Nonce fetch failed (${nonceRes.status}): ${JSON.stringify(nonceRes.body)}`);
  }
  const { nonce } = nonceRes.body;

  // 2. Sign SIWE message (matches SiweService.buildMessage exactly)
  const message = `Sign in to Dead Man's Switch\nWallet: ${address}\nNonce: ${nonce}`;
  const signature = await wallet.signMessage(message);

  // 3. Verify and get JWT
  const verifyRes = await post("/api/auth/verify", {
    walletAddress: address,
    nonce,
    signature,
  });
  if (!verifyRes.ok) {
    throw new Error(`Auth verify failed (${verifyRes.status}): ${JSON.stringify(verifyRes.body)}`);
  }

  return verifyRes.body.token;
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    fail(`ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  ok(message);
}

function assertStatus(res, expected, label) {
  if (res.status !== expected) {
    fail(`${label}: expected HTTP ${expected}, got ${res.status} — ${JSON.stringify(res.body)}`);
    throw new Error(`HTTP ${res.status} for ${label}`);
  }
  ok(`${label}: HTTP ${res.status}`);
  return res.body;
}

// ─── Will submission helper ───────────────────────────────────────────────────

/**
 * Submits a simple will for the authenticated user.
 * Uses a pre-built will text with both beneficiary wallet addresses inline
 * so no LLM wallet-resolution errors occur.
 */
async function submitWill(token, beneficiaryAddress) {
  const willText =
    `Give 100% of my assets to my trusted beneficiary at address ${beneficiaryAddress}`;
  const res = await post("/api/will", { willText }, token);
  return res;
}

// ─── Wait helper ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  BASE_URL,
  C, ok, fail, info, warn, step, dim,
  get, post, put, del,
  authenticate,
  assert, assertStatus,
  submitWill,
  sleep,
};