const { ethers } = require("ethers");

const WALLET_ADDRESS = "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199";
const PRIVATE_KEY = "0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e";
const BASE_URL = "http://localhost:8080";

async function main() {
  // 1. Fetch a fresh nonce from the server
  const nonceRes = await fetch(`${BASE_URL}/api/auth/nonce?walletAddress=${WALLET_ADDRESS}`);
  const { nonce } = await nonceRes.json();
  console.log("Nonce:", nonce);

  // 2. Build the message exactly as SiweService.buildMessage() does
  const message = `Sign in to Dead Man's Switch\nWallet: ${WALLET_ADDRESS}\nNonce: ${nonce}`;
  console.log("Message:", JSON.stringify(message));

  // 3. Sign it
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signature = await wallet.signMessage(message);
  console.log("Signature:", signature);

  // 4. Call /api/auth/verify
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: WALLET_ADDRESS, nonce, signature }),
  });

  if (!verifyRes.ok) {
    const text = await verifyRes.text();
    console.error("Verify failed:", verifyRes.status, text);
    process.exit(1);
  }

  const { token } = await verifyRes.json();
  console.log("\n✅ JWT token:", token);

  // 5. Deploy the will
  console.log("\nDeploying will...");
  const willRes = await fetch(`${BASE_URL}/api/will`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      willText: "Give 60% of my funds to my wife Alice (0x1111111111111111111111111111111111111111) and 40% to my son Bob (0x2222222222222222222222222222222222222222)",
    }),
  });

  if (!willRes.ok) {
    const text = await willRes.text();
    console.error("Will deployment failed:", willRes.status, text);
    process.exit(1);
  }

  const will = await willRes.json();
  console.log("\n✅ Will deployed:");
  console.log("  Config ID:        ", will.configId);
  console.log("  Template type:    ", will.templateType);
  console.log("  Contract address: ", will.contractAddress);
  console.log("  Deployment tx:    ", will.deploymentTxHash);
  console.log("  Beneficiaries:");
  for (const b of will.beneficiaries) {
    console.log(`    - ${b.name}: ${b.basisPoints / 100}% → ${b.walletAddress} (${b.condition})`);
  }
}

main().catch(console.error);