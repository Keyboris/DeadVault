require("dotenv").config();
const hre = require("hardhat");

const TX_HASH = "0xd68aec7cc3a841c43d6f530b743e2fca0b75fda4cbfc6d7392ff025d15420d85";
const FACTORY_ADDRESS = process.env.FACTORY_CONTRACT_ADDRESS;

async function main() {
  const provider = hre.ethers.provider;

  console.log("=== ENVIRONMENT ===");
  console.log("FACTORY_CONTRACT_ADDRESS:", FACTORY_ADDRESS || "NOT SET ❌");
  console.log("HOT_WALLET_PRIVATE_KEY:  ", process.env.HOT_WALLET_PRIVATE_KEY ? "set ✓" : "NOT SET ❌");
  console.log("BASE_RPC_URL:            ", process.env.BASE_RPC_URL || "NOT SET (using hardhat default)");
  console.log();

  // 1. Inspect the failed tx
  console.log("=== TRANSACTION ===");
  const tx = await provider.getTransaction(TX_HASH);
  if (!tx) {
    console.log("Transaction not found on this node. Are you querying the right RPC?");
  } else {
    console.log("tx.to (called address):", tx.to);
    console.log("tx.from:               ", tx.from);
    console.log("tx.data (first 10):    ", tx.data.slice(0, 10), "(function selector)");

    const receipt = await provider.getTransactionReceipt(TX_HASH);
    console.log("status:                ", receipt.status === 1 ? "success ✓" : "REVERTED ❌");
    console.log("logs.length:           ", receipt.logs.length);
    if (receipt.logs.length > 0) {
      receipt.logs.forEach((l, i) => {
        console.log(`  log[${i}] address: ${l.address}`);
        console.log(`  log[${i}] topics:  ${l.topics}`);
      });
    }
  }

  console.log();

  // 2. Check what's actually deployed at the factory address
  console.log("=== FACTORY CONTRACT ===");
  if (!FACTORY_ADDRESS) {
    console.log("FACTORY_CONTRACT_ADDRESS is not set in .env — this is likely the problem!");
    console.log("Run: npx hardhat run scripts/deploy.js --network localhost");
    console.log("Then set FACTORY_CONTRACT_ADDRESS=<address> in your .env");
    return;
  }

  const code = await provider.getCode(FACTORY_ADDRESS);
  if (code === "0x") {
    console.log(`No contract deployed at ${FACTORY_ADDRESS} ❌`);
    console.log("The factory needs to be (re)deployed. Run:");
    console.log("  npx hardhat run scripts/deploy.js --network localhost");
  } else {
    console.log(`Contract exists at ${FACTORY_ADDRESS} ✓ (${code.length / 2 - 1} bytes)`);

    // Try calling getVault on the factory with the hot wallet's address
    const factory = await hre.ethers.getContractAt("DMSFactory", FACTORY_ADDRESS);
    console.log("triggerAuthority:", await factory.triggerAuthority());

    // Derive the hot wallet address
    const hotWallet = new hre.ethers.Wallet(process.env.HOT_WALLET_PRIVATE_KEY);
    console.log("Hot wallet address:", hotWallet.address);
    console.log("triggerAuthority matches hot wallet:",
      (await factory.triggerAuthority()).toLowerCase() === hotWallet.address.toLowerCase() ? "✓" : "❌ MISMATCH");
  }

  console.log();

  // 3. Simulate a createVault call to see what happens
  console.log("=== SIMULATE createVault ===");
  if (FACTORY_ADDRESS && (await provider.getCode(FACTORY_ADDRESS)) !== "0x") {
    try {
      const factory = await hre.ethers.getContractAt("DMSFactory", FACTORY_ADDRESS);
      const hotWallet = new hre.ethers.Wallet(process.env.HOT_WALLET_PRIVATE_KEY, provider);

      const testOwner  = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const wallets    = ["0x1111111111111111111111111111111111111111",
                          "0x2222222222222222222222222222222222222222"];
      const bps        = [6000, 4000];

      const result = await factory.connect(hotWallet).createVault.staticCall(
        testOwner, wallets, bps
      );
      console.log("staticCall succeeded ✓ — would deploy vault at:", result);
    } catch (e) {
      console.log("staticCall FAILED ❌:", e.message);
      if (e.message.includes("vault already exists")) {
        console.log("→ A vault already exists for this owner. The DB may have a stale record.");
        console.log("  Delete the user row from the DB and try again, or use a different wallet.");
      }
    }
  }
}

main().catch(console.error);