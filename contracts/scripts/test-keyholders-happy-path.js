#!/usr/bin/env node
// scripts/test-keyholders-happy-path.js
//
// Full happy-path integration test for the secondary-keyholder multisig feature.
//
// What this script tests:
//   1. Owner registers 2 keyholders (Alice, Bob)
//   2. Owner sets threshold = 2
//   3. A check-in config exists and its grace period is simulated as expired
//      (we call the internal debug endpoint or manipulate directly — see notes)
//   4. GracePeriodWatcherJob fires → confirmation round opens (PENDING)
//   5. Alice votes
//   6. Round still PENDING (only 1/2 votes)
//   7. Bob votes
//   8. Round is now APPROVED — vault triggered
//   9. Check-in status shows TRIGGERED
//
// Usage:
//   node scripts/test-keyholders-happy-path.js
//
// Prerequisites:
//   • Backend running on http://localhost:8080 (docker compose up)
//   • Hardhat local node OR Base Sepolia configured in .env
//   • DMSFactory deployed and FACTORY_CONTRACT_ADDRESS set
//
// NOTE on triggering the grace period:
//   The scheduler runs every 15 minutes and checks for rows in check_in_configs
//   where next_due_at < NOW() and status = 'GRACE'. In integration testing we
//   can either:
//     (a) Wait — set intervalDays=0 via direct DB manipulation then wait 15 min
//     (b) Use the /api/debug/expire-checkin endpoint (add to a debug profile)
//     (c) Run the SQL snippet printed by this script against the running Postgres
//   Option (c) is what this script uses — it prints the SQL and pauses.

"use strict";
const { ethers } = require("ethers");
const {
  step, ok, fail, info, warn, dim, C,
  get, post, put, del,
  authenticate, assert, assertStatus, sleep,
} = require("./test-helpers");

// ─── Test wallet configuration ────────────────────────────────────────────────
// These are the well-known Hardhat development accounts.
// NEVER use these on mainnet.
const WALLETS = {
  owner:  new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cf7404965799ec3a1c7da2e6"),
  alice:  new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
  bob:    new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"),
  // Beneficiary — receives funds when vault triggers; doesn't need a JWT
  bene:   new ethers.Wallet("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"),
};

async function main() {
  console.log(`\n${C.bold}${C.cyan}═══════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.cyan}  Dead Man's Switch — Keyholder Happy Path Test${C.reset}`);
  console.log(`${C.bold}${C.cyan}═══════════════════════════════════════════════════${C.reset}\n`);

  let ownerToken, aliceToken, bobToken;
  let keyholderAliceId, keyholderBobId;
  let roundId;

  // ── Step 1: Authenticate all parties ──────────────────────────────────────
  step("1. Authenticating all parties");

  ownerToken = await authenticate(WALLETS.owner);
  ok(`Owner authenticated  (${WALLETS.owner.address})`);

  aliceToken = await authenticate(WALLETS.alice);
  ok(`Alice authenticated  (${WALLETS.alice.address})`);

  bobToken = await authenticate(WALLETS.bob);
  ok(`Bob authenticated    (${WALLETS.bob.address})`);

  // ── Step 2: Owner submits a will (creates vault + check-in config) ─────────
  step("2. Submitting will (deploys vault)");
  const willRes = await post(
    "/api/will",
    { willText: `Give 100% to my beneficiary at ${WALLETS.bene.address}` },
    ownerToken
  );

  if (willRes.status === 409) {
    warn("Will already exists for this owner — continuing with existing vault");
  } else {
    assertStatus(willRes, 200, "POST /api/will");
    dim(`Contract: ${willRes.body.contractAddress}`);
    dim(`Template: ${willRes.body.templateType}`);
  }

  // ── Step 3: Register Alice and Bob as keyholders ───────────────────────────
  step("3. Registering keyholders");

  // Alice
  const addAliceRes = await post(
    "/api/keyholders",
    { walletAddress: WALLETS.alice.address, label: "Alice (trusted friend)" },
    ownerToken
  );
  if (addAliceRes.status === 409) {
    warn("Alice already registered — fetching existing record");
    const listRes = await get("/api/keyholders", ownerToken);
    const alice = listRes.body.find(
      (k) => k.walletAddress.toLowerCase() === WALLETS.alice.address.toLowerCase()
    );
    keyholderAliceId = alice.id;
    ok(`Alice keyholder ID: ${keyholderAliceId}`);
  } else {
    assertStatus(addAliceRes, 201, "POST /api/keyholders (Alice)");
    keyholderAliceId = addAliceRes.body.id;
    dim(`Alice keyholder ID: ${keyholderAliceId}`);
  }

  // Bob
  const addBobRes = await post(
    "/api/keyholders",
    { walletAddress: WALLETS.bob.address, label: "Bob (brother)", email: "bob@example.com" },
    ownerToken
  );
  if (addBobRes.status === 409) {
    warn("Bob already registered — fetching existing record");
    const listRes = await get("/api/keyholders", ownerToken);
    const bob = listRes.body.find(
      (k) => k.walletAddress.toLowerCase() === WALLETS.bob.address.toLowerCase()
    );
    keyholderBobId = bob.id;
    ok(`Bob keyholder ID: ${keyholderBobId}`);
  } else {
    assertStatus(addBobRes, 201, "POST /api/keyholders (Bob)");
    keyholderBobId = addBobRes.body.id;
    dim(`Bob keyholder ID: ${keyholderBobId}`);
  }

  // ── Step 4: Verify keyholder list ─────────────────────────────────────────
  step("4. Verifying keyholder list");
  const listRes = await get("/api/keyholders", ownerToken);
  assertStatus(listRes, 200, "GET /api/keyholders");
  assert(listRes.body.length >= 2, `At least 2 keyholders registered (got ${listRes.body.length})`);
  listRes.body.forEach((kh) => dim(`  ${kh.label || kh.walletAddress} — ${kh.id}`));

  // ── Step 5: Set threshold = 2 ─────────────────────────────────────────────
  step("5. Setting approval threshold to 2");
  const threshRes = await put(
    "/api/keyholders/threshold",
    { threshold: 2 },
    ownerToken
  );
  assertStatus(threshRes, 204, "PUT /api/keyholders/threshold");

  // ── Step 6: Simulate grace period expiry ──────────────────────────────────
  step("6. Simulating grace period expiry");
  warn("The scheduler checks the DB every 15 minutes.");
  warn("To fast-forward, run this SQL against your running Postgres instance:\n");
  console.log(`${C.yellow}  psql postgresql://dms:dms@localhost:5432/dms -c \\`);
  console.log(`    "UPDATE check_in_configs`);
  console.log(`     SET status = 'GRACE',`);
  console.log(`         next_due_at = NOW() - INTERVAL '1 hour',`);
  console.log(`         grace_expires_at = NOW() - INTERVAL '1 minute'`);
  console.log(`     WHERE user_id = (SELECT id FROM users WHERE wallet_address = '${WALLETS.owner.address.toLowerCase()}');"${C.reset}\n`);

  info("Waiting 20 seconds for you to run the SQL above, then the scheduler to fire...");
  info("(Press Ctrl+C to abort if you want to run the SQL manually first)\n");
  await sleep(20_000);

  // ── Step 7: Poll for the confirmation round ────────────────────────────────
  step("7. Polling for open confirmation round");

  // The scheduler runs every 15 min; in tests we rely on the SQL above having
  // been run AND the scheduler having fired at least once.
  // We poll for up to 5 minutes with 10-second intervals.
  let round = null;
  const ownerId = parseJwtPayload(ownerToken).sub;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const roundRes = await get(
      `/api/keyholders/confirmation-round?userId=${ownerId}`,
      aliceToken  // keyholders use their own token
    );
    if (roundRes.status === 200) {
      round = roundRes.body;
      ok(`Confirmation round found: ${round.roundId}`);
      dim(`  Status:    ${round.status}`);
      dim(`  Threshold: ${round.thresholdRequired}`);
      dim(`  Votes:     ${round.confirmationsReceived}/${round.thresholdRequired}`);
      dim(`  Expires:   ${round.expiresAt}`);
      break;
    }
    if (attempt === 1) info("No round yet — waiting for scheduler...");
    process.stdout.write(`\r${C.grey}    Attempt ${attempt}/30 — retrying in 10 s...${C.reset}`);
    await sleep(10_000);
  }

  if (!round) {
    fail("Confirmation round never appeared. Ensure:\n" +
         "    1. The SQL above was run\n" +
         "    2. The scheduler fired (check Docker logs: docker compose logs backend)\n" +
         "    3. The owner's vault status is TRIGGERING in the contracts table");
    process.exit(1);
  }

  roundId = round.roundId;
  assert(round.status === "PENDING", `Round status is PENDING (got ${round.status})`);
  assert(round.thresholdRequired === 2, `Threshold is 2 (got ${round.thresholdRequired})`);
  assert(round.confirmationsReceived === 0, `No votes cast yet`);

  // ── Step 8: Alice votes ────────────────────────────────────────────────────
  step("8. Alice casts her vote");
  const aliceVoteRes = await postWithAuth(
    `/api/keyholders/confirm?roundId=${roundId}`,
    aliceToken
  );
  assertStatus(aliceVoteRes, 200, "POST /api/keyholders/confirm (Alice)");
  assert(
    aliceVoteRes.body.confirmationsReceived === 1,
    `Vote count is now 1 (got ${aliceVoteRes.body.confirmationsReceived})`
  );
  assert(
    aliceVoteRes.body.status === "PENDING",
    `Round still PENDING after 1/2 votes (got ${aliceVoteRes.body.status})`
  );
  dim(`  Votes: ${aliceVoteRes.body.confirmationsReceived}/${aliceVoteRes.body.thresholdRequired}`);

  // ── Step 9: Alice tries to vote again (should 409) ─────────────────────────
  step("9. Alice tries to vote twice (should be rejected)");
  const aliceDupRes = await postWithAuth(
    `/api/keyholders/confirm?roundId=${roundId}`,
    aliceToken
  );
  assert(aliceDupRes.status === 409, `Double-vote correctly rejected with HTTP 409`);
  dim(`  Response: ${JSON.stringify(aliceDupRes.body)}`);

  // ── Step 10: Bob votes (threshold met → vault triggers) ────────────────────
  step("10. Bob casts the deciding vote");
  const bobVoteRes = await postWithAuth(
    `/api/keyholders/confirm?roundId=${roundId}`,
    bobToken
  );
  assertStatus(bobVoteRes, 200, "POST /api/keyholders/confirm (Bob)");
  assert(
    bobVoteRes.body.confirmationsReceived === 2,
    `Vote count is now 2 (got ${bobVoteRes.body.confirmationsReceived})`
  );
  assert(
    bobVoteRes.body.status === "APPROVED",
    `Round is APPROVED after 2/2 votes (got ${bobVoteRes.body.status})`
  );
  ok(`🎉 Round APPROVED — vault trigger dispatched`);
  dim(`  Round ID: ${roundId}`);

  // ── Step 11: Verify check-in status is TRIGGERED ──────────────────────────
  step("11. Verifying owner check-in status is TRIGGERED");
  await sleep(3_000); // give the trigger transaction a moment to confirm
  const statusRes = await get("/api/check-in/status", ownerToken);
  assertStatus(statusRes, 200, "GET /api/check-in/status");
  assert(
    statusRes.body.status === "TRIGGERED",
    `Check-in status is TRIGGERED (got ${statusRes.body.status})`
  );

  // ── Step 12: Verify contract status ───────────────────────────────────────
  step("12. Verifying contract status is TRIGGERED");
  const contractsRes = await get("/api/contracts", ownerToken);
  assertStatus(contractsRes, 200, "GET /api/contracts");
  const triggered = contractsRes.body.find((c) => c.status === "TRIGGERED");
  assert(triggered !== undefined, "At least one contract has status TRIGGERED");
  dim(`  Contract: ${triggered.contractAddress}`);
  dim(`  Triggered at: ${triggered.triggeredAt || "(see chain)"}`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.green}═══════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.green}  ALL TESTS PASSED ✓${C.reset}`);
  console.log(`${C.bold}${C.green}═══════════════════════════════════════════════════${C.reset}\n`);
}

// ─── Helpers local to this script ─────────────────────────────────────────────

/** POST with only Authorization header and no body (used for /confirm). */
async function postWithAuth(path, token) {
  const res = await fetch(`${require("./test-helpers").BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, ok: res.ok, body };
}

/** Decode the JWT payload (no verification — test-only). */
function parseJwtPayload(token) {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

main().catch((err) => {
  console.error(`\n${C.red}FATAL ERROR:${C.reset}`, err.message);
  process.exit(1);
});