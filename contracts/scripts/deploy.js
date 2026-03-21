const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  const SAFE_ADDRESS = process.env.GNOSIS_SAFE_ADDRESS;
  if (!SAFE_ADDRESS) throw new Error("GNOSIS_SAFE_ADDRESS not set in environment");

  console.log(`Network: ${network} (chain ${hre.network.config.chainId})`);
  console.log("Deployer:         ", deployer.address);
  console.log("Trigger authority:", SAFE_ADDRESS, "(Gnosis Safe)");
  console.log("Balance:", hre.ethers.formatEther(
    await hre.ethers.provider.getBalance(deployer.address)
  ), "ETH");

  const Factory = await hre.ethers.getContractFactory("DMSFactory");
  const factory = await Factory.deploy(SAFE_ADDRESS);   // Safe is triggerAuthority, not deployer
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("\nDMSFactory deployed to:", factoryAddress);

  if (network === "baseSepolia" || network === "base") {
    console.log("Verifying on Basescan...");
    try {
      await hre.run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [SAFE_ADDRESS],           // must match constructor arg exactly
      });
      console.log("Verified.");
    } catch (e) {
      console.warn("Verification skipped:", e.message);
    }
  }

  console.log(`\nAdd to .env:\nFACTORY_CONTRACT_ADDRESS=${factoryAddress}`);
}

main().catch((err) => { console.error(err); process.exit(1); });