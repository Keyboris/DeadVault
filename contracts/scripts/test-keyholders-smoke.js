#!/usr/bin/env node
// scripts/test-keyholders-smoke.js
//
// Fast smoke test — verifies that all keyholder endpoints are reachable,
// properly secured, and return the expected shapes.
// Runs in about 5 seconds with no scheduler involvement.
//
// Usage:
//   node scripts/test-keyholders-smoke.js

"use strict";
const { ethers } = require("ethers");
const {
  step, ok, fail, info, dim, C,
  get, post, put, del,
  authenticate, assert, assertStatus,
  BASE_URL,
} = require("./test-helpers");

const OWNER   = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cf7404965799ec3a1c7da2e6");
const ALICE   = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const BENE    = new ethers.Wallet("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");

async function main() {
  console.log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.cyan}  Keyholder API — Smoke Test${C.reset}`);
  console.log(`${C.bold}${C.cyan}═══════════════════════════════════════════════════${C.reset}\n`);

  // ── 1. Backend health check ───────────────────────────────────────────────
  step("1. Backend health");
  const health = await get("/actuator/health");
  assertStatus(health, 200, "GET /actuator/health");
  assert(health.body.status === "UP", `Health status is UP (got ${health.body.status})`);

  // ── 2. Auth ───────────────────────────────────────────────────────────────
  step("2. Authentication");
  const ownerToken = await authenticate(OWNER);
  ok(`Owner JWT obtained`);

  // ── 3. Unauthenticated access blocked ─────────────────────────────────────
  step("3. Unauthenticated requests are blocked");
  const unauthed = await get("/api/keyholders");
  assert(unauthed.status === 403 || unauthed.status === 401,
    `GET /api/keyholders without token → ${unauthed.status}`);

  const unauthedThreshold = await put("/api/keyholders/threshold", { threshold: 1 });
  assert(unauthedThreshold.status === 403 || unauthedThreshold.status === 401,
    `PUT /api/keyholders/threshold without token → ${unauthedThreshold.status}`);

  // ── 4. Will exists (required for keyholder management) ───────────────────
  step("4. Ensuring will / vault exists");
  const willRes = await post(
    "/api/will",
    { willText: `Give 100% to ${BENE.address}` },
    ownerToken
  );
  if (willRes.status === 200) {
    ok("Will created");
    dim(`  Contract: ${willRes.body.contractAddress}`);
  } else if (willRes.status === 409) {
    ok("Will already exists — continuing");
  } else {
    fail(`Unexpected response: ${willRes.status} ${JSON.stringify(willRes.body)}`);
    process.exit(1);
  }

  // ── 5. GET /api/keyholders (empty list) ───────────────────────────────────
  step("5. GET /api/keyholders");
  const list = await get("/api/keyholders", ownerToken);
  assertStatus(list, 200, "GET /api/keyholders");
  assert(Array.isArray(list.body), "Response is an array");
  dim(`  Current keyholder count: ${list.body.length}`);

  // ── 6. POST /api/keyholders ───────────────────────────────────────────────
  step("6. POST /api/keyholders");
  // Clean up Alice if already there
  const existing = list.body.find(
    (k) => k.walletAddress.toLowerCase() === ALICE.address.toLowerCase()
  );
  if (existing) {
    await del(`/api/keyholders/${existing.id}`, ownerToken);
    ok("Removed pre-existing Alice keyholder");
  }

  const addRes = await post(
    "/api/keyholders",
    { walletAddress: ALICE.address, label: "Alice", email: "alice@example.com" },
    ownerToken
  );
  assertStatus(addRes, 201, "POST /api/keyholders");
  assert(typeof addRes.body.id === "string", "Response has id");
  assert(addRes.body.walletAddress === ALICE.address.toLowerCase(), "walletAddress matches");
  assert(addRes.body.label === "Alice", "label matches");
  const keyholderID = addRes.body.id;
  dim(`  Keyholder ID: ${keyholderID}`);

  // ── 7. GET /api/keyholders (now 1 item) ───────────────────────────────────
  step("7. GET /api/keyholders after add");
  const list2 = await get("/api/keyholders", ownerToken);
  assertStatus(list2, 200, "GET /api/keyholders (after add)");
  const found = list2.body.find((k) => k.id === keyholderID);
  assert(found !== undefined, "Added keyholder appears in list");

  // ── 8. PUT /api/keyholders/threshold ──────────────────────────────────────
  step("8. PUT /api/keyholders/threshold");
  const thresh1 = await put("/api/keyholders/threshold", { threshold: 1 }, ownerToken);
  assertStatus(thresh1, 204, "PUT /api/keyholders/threshold (1)");

  const thresh0 = await put("/api/keyholders/threshold", { threshold: 0 }, ownerToken);
  assertStatus(thresh0, 204, "PUT /api/keyholders/threshold (0 — disable)");

  // ── 9. GET /api/keyholders/confirmation-round (no round → 404) ────────────
  step("9. GET /api/keyholders/confirmation-round (no active round)");
  const ownerId = parseJwtPayload(ownerToken).sub;
  const aliceToken = await authenticate(ALICE);
  const roundRes = await get(
    `/api/keyholders/confirmation-round?userId=${ownerId}`,
    aliceToken
  );
  assert(roundRes.status === 404, `404 when no round exists (got ${roundRes.status})`);

  // ── 10. DELETE /api/keyholders/{id} ──────────────────────────────────────
  step("10. DELETE /api/keyholders/{id}");
  const delRes = await del(`/api/keyholders/${keyholderID}`, ownerToken);
  assertStatus(delRes, 204, "DELETE /api/keyholders/{id}");

  const list3 = await get("/api/keyholders", ownerToken);
  const stillThere = list3.body.find((k) => k.id === keyholderID);
  assert(stillThere === undefined, "Deleted keyholder no longer in list");

  // ── 11. Wrong owner cannot delete another user's keyholder ───────────────
  step("11. Authorization — wrong owner cannot delete");
  // Re-add Alice
  const reAdd = await post(
    "/api/keyholders",
    { walletAddress: ALICE.address, label: "Alice" },
    ownerToken
  );
  assertStatus(reAdd, 201, "Re-add Alice");
  const aliceKhId = reAdd.body.id;

  // Alice tries to delete her own keyholder record (she is not the vault owner)
  const wrongDel = await del(`/api/keyholders/${aliceKhId}`, aliceToken);
  assert(
    wrongDel.status === 404 || wrongDel.status === 403,
    `Alice cannot delete owner's keyholder (got ${wrongDel.status})`
  );

  // Cleanup
  await del(`/api/keyholders/${aliceKhId}`, ownerToken);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.green}═══════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.green}  Smoke test PASSED ✓  (all ${11} checks)${C.reset}`);
  console.log(`${C.bold}${C.green}═══════════════════════════════════════════════════${C.reset}\n`);
}

function parseJwtPayload(token) {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

main().catch((err) => {
  console.error(`\n${C.red}FATAL ERROR:${C.reset}`, err.message);
  process.exit(1);
});