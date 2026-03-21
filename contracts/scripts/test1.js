const { ethers } = require("ethers");

// From your existing sign.js
const WALLET_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const BASE_URL = "http://localhost:8080";

async function main() {
  try {
    // ==========================================
    // 1. AUTHENTICATION & GETTING THE JWT
    // ==========================================
    console.log("1. Fetching nonce...");
    const nonceRes = await fetch(`${BASE_URL}/api/auth/nonce?walletAddress=${WALLET_ADDRESS}`);
    const { nonce } = await nonceRes.json();

    console.log("   Signing message...");
    const message = `Sign in to Dead Man's Switch\nWallet: ${WALLET_ADDRESS}\nNonce: ${nonce}`;
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const signature = await wallet.signMessage(message);

    console.log("   Verifying signature to get JWT...");
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: WALLET_ADDRESS, nonce, signature }),
    });

    if (!verifyRes.ok) {
      throw new Error(`Auth failed: ${verifyRes.status} ${await verifyRes.text()}`);
    }

    const { token } = await verifyRes.json();
    console.log("✅ JWT Successfully Extracted!\n");

    // ==========================================
    // 2. FETCH CONTRACTS
    // ==========================================
    console.log("2. Fetching contracts...");
    const contractsRes = await fetch(`${BASE_URL}/api/contracts`, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${token}` 
      }
    });

    if (!contractsRes.ok) {
      throw new Error(`Contracts fetch failed: ${contractsRes.status}`);
    }
    const contracts = await contractsRes.json();
    console.log(JSON.stringify(contracts, null, 2), "\n");

    // ==========================================
    // 3. FETCH CHECK-IN STATUS
    // ==========================================
    console.log("3. Fetching check-in status...");
    const statusRes = await fetch(`${BASE_URL}/api/check-in/status`, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${token}` 
      }
    });

    if (!statusRes.ok) {
        throw new Error(`Status fetch failed: ${statusRes.status}`);
    }
    const status = await statusRes.json();
    
    // This will print the JSON block exactly like the expected jq output
    console.log(JSON.stringify(status, null, 2));

  } catch (err) {
    console.error("❌ Error running script:", err.message);
  }
}

main();