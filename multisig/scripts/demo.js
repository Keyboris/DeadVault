require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const [deployer, owner1, owner2, owner3, beneficiary1, beneficiary2] =
    await hre.ethers.getSigners();

  console.log("==============================================");
  console.log("  DEADMAN SWITCH MULTISIG — FULL DEMO");
  console.log("==============================================\n");

  // ── 1. Deploy Factory ───────────────────────────────────────────────

  console.log("--- Step 1: Deploy MultiSigFactory ---");
  const Factory = await hre.ethers.getContractFactory("MultiSigFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  console.log("Factory deployed at:", await factory.getAddress());

  // ── 2. Create Wallet + DeadmanModule ────────────────────────────────

  console.log("\n--- Step 2: Create MultiSig Wallet + Deadman Module ---");
  console.log("Owners:", owner1.address, owner2.address, owner3.address);
  console.log("Threshold: 2-of-3");
  console.log("Inactivity period: 60 seconds");
  console.log("Grace period: 30 seconds");
  console.log("Beneficiaries: 60% / 40% split");

  const tx = await factory.createWalletWithDeadman(
    [owner1.address, owner2.address, owner3.address],  // owners
    2,                                                   // threshold
    60,                                                  // inactivity: 60s
    30,                                                  // grace: 30s
    [beneficiary1.address, beneficiary2.address],        // beneficiaries
    [6000, 4000]                                         // 60% / 40%
  );
  const receipt = await tx.wait();

  // Extract addresses from event
  const event = receipt.logs.find(
    (l) => l.fragment && l.fragment.name === "WalletCreated"
  );
  const walletAddr = event.args[1];
  const moduleAddr = event.args[2];

  console.log("\nMultiSigWallet:", walletAddr);
  console.log("DeadmanModule: ", moduleAddr);

  const wallet = await hre.ethers.getContractAt("MultiSigWallet", walletAddr);
  const deadman = await hre.ethers.getContractAt("DeadmanModule", moduleAddr);

  // ── 3. Enable the Deadman Module on the Wallet ──────────────────────

  console.log("\n--- Step 3: Enable Deadman Module (requires multisig approval) ---");

  // Owner1 submits tx to enable the module
  const enableData = wallet.interface.encodeFunctionData("enableModule", [moduleAddr]);
  const submitTx = await wallet.connect(owner1).submitTransaction(walletAddr, 0, enableData);
  await submitTx.wait();
  console.log("Owner1 submitted enableModule tx (txIndex=0) — auto-confirmed");

  // Owner2 confirms
  const confirmTx = await wallet.connect(owner2).confirmTransaction(0);
  await confirmTx.wait();
  console.log("Owner2 confirmed tx 0 — threshold met (2/3)");

  // Owner1 executes
  const execTx = await wallet.connect(owner1).executeTransaction(0);
  await execTx.wait();
  console.log("Tx 0 executed — DeadmanModule is now enabled!");

  const mods = await wallet.getModules();
  console.log("Active modules:", mods);

  // ── 4. Fund the Wallet ──────────────────────────────────────────────

  console.log("\n--- Step 4: Fund the wallet with 10 ETH ---");
  await deployer.sendTransaction({
    to: walletAddr,
    value: hre.ethers.parseEther("10"),
  });
  const bal = await hre.ethers.provider.getBalance(walletAddr);
  console.log("Wallet balance:", hre.ethers.formatEther(bal), "ETH");

  // ── 5. Normal multisig tx (send 1 ETH) ─────────────────────────────

  console.log("\n--- Step 5: Normal multisig tx — send 1 ETH to deployer ---");
  const balBefore = await hre.ethers.provider.getBalance(deployer.address);

  const sendTx = await wallet
    .connect(owner1)
    .submitTransaction(deployer.address, hre.ethers.parseEther("1"), "0x");
  await sendTx.wait();
  console.log("Owner1 submitted send tx (txIndex=1)");

  await (await wallet.connect(owner3).confirmTransaction(1)).wait();
  console.log("Owner3 confirmed tx 1 — threshold met");

  await (await wallet.connect(owner1).executeTransaction(1)).wait();
  const balAfter = await hre.ethers.provider.getBalance(deployer.address);
  console.log(
    "Tx 1 executed — deployer received ~1 ETH (delta:",
    hre.ethers.formatEther(balAfter - balBefore),
    "ETH)"
  );

  const walBal = await hre.ethers.provider.getBalance(walletAddr);
  console.log("Wallet balance now:", hre.ethers.formatEther(walBal), "ETH");

  // ── 6. Owners check in ─────────────────────────────────────────────

  console.log("\n--- Step 6: Owners check in ---");
  await (await deadman.connect(owner1).checkIn()).wait();
  console.log("Owner1 checked in");
  await (await deadman.connect(owner2).checkIn()).wait();
  console.log("Owner2 checked in");
  await (await deadman.connect(owner3).checkIn()).wait();
  console.log("Owner3 checked in");

  const deadline = await deadman.getOwnerDeadline(owner1.address);
  console.log("Owner1 next deadline:", new Date(Number(deadline) * 1000).toISOString());

  // ── 7. Simulate inactivity — fast-forward 61 seconds ───────────────

  console.log("\n--- Step 7: Simulate ALL owners going inactive (fast-forward 61s) ---");
  await hre.network.provider.send("evm_increaseTime", [61]);
  await hre.network.provider.send("evm_mine");

  const allInactive = await deadman.allOwnersInactive();
  console.log("All owners inactive?", allInactive);

  // ── 8. Start grace period ──────────────────────────────────────────

  console.log("\n--- Step 8: Start grace period (anyone can call) ---");
  await (await deadman.connect(deployer).startGracePeriod()).wait();
  const graceInfo = await deadman.getGraceInfo();
  console.log("Grace active:", graceInfo[0]);
  console.log("Expires at:", new Date(Number(graceInfo[2]) * 1000).toISOString());

  // ── 9. Show that a check-in cancels grace period ───────────────────

  console.log("\n--- Step 9: Owner2 checks in — cancels grace period ---");
  await (await deadman.connect(owner2).checkIn()).wait();
  const graceInfo2 = await deadman.getGraceInfo();
  console.log("Grace active after check-in:", graceInfo2[0], "(cancelled!)");

  // ── 10. Simulate inactivity again + full grace expiry ──────────────

  console.log("\n--- Step 10: All owners go inactive AGAIN (fast-forward 61s) ---");
  await hre.network.provider.send("evm_increaseTime", [61]);
  await hre.network.provider.send("evm_mine");

  console.log("All owners inactive?", await deadman.allOwnersInactive());

  console.log("\n--- Step 11: Start grace period again ---");
  await (await deadman.connect(deployer).startGracePeriod()).wait();
  console.log("Grace period started");

  console.log("\n--- Step 12: Fast-forward past grace period (31s) ---");
  await hre.network.provider.send("evm_increaseTime", [31]);
  await hre.network.provider.send("evm_mine");

  console.log("Grace expired?", await deadman.isExpired());

  // ── 13. TRIGGER — redistribute funds ───────────────────────────────

  console.log("\n--- Step 13: TRIGGER — redistribute funds to beneficiaries ---");

  const b1Before = await hre.ethers.provider.getBalance(beneficiary1.address);
  const b2Before = await hre.ethers.provider.getBalance(beneficiary2.address);
  const walletBalBefore = await hre.ethers.provider.getBalance(walletAddr);
  console.log("Wallet balance before trigger:", hre.ethers.formatEther(walletBalBefore), "ETH");

  await (await deadman.connect(deployer).trigger()).wait();

  const b1After = await hre.ethers.provider.getBalance(beneficiary1.address);
  const b2After = await hre.ethers.provider.getBalance(beneficiary2.address);
  const walletBalAfter = await hre.ethers.provider.getBalance(walletAddr);

  console.log("\nBeneficiary1 received:", hre.ethers.formatEther(b1After - b1Before), "ETH (60%)");
  console.log("Beneficiary2 received:", hre.ethers.formatEther(b2After - b2Before), "ETH (40%)");
  console.log("Wallet balance after:", hre.ethers.formatEther(walletBalAfter), "ETH");
  console.log("Triggered?", await deadman.triggered());

  console.log("\n==============================================");
  console.log("  DEMO COMPLETE");
  console.log("==============================================");
  console.log("\nFlow recap:");
  console.log("  1. Factory deployed wallet + deadman module");
  console.log("  2. Owners enabled module via 2-of-3 multisig tx");
  console.log("  3. Wallet funded with 10 ETH");
  console.log("  4. Normal multisig tx sent 1 ETH (9 ETH remaining)");
  console.log("  5. Owners checked in — deadman timer reset");
  console.log("  6. All owners went inactive — grace period started");
  console.log("  7. Owner checked in — grace period CANCELLED");
  console.log("  8. All owners went inactive again — grace restarted");
  console.log("  9. Grace period expired — TRIGGER fired");
  console.log(" 10. 9 ETH redistributed: 5.4 ETH (60%) + 3.6 ETH (40%)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
