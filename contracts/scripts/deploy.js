// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Network: ${network} (chain ${hre.network.config.chainId})`);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(
    await hre.ethers.provider.getBalance(deployer.address)
  ), "ETH");

  const Factory = await hre.ethers.getContractFactory("DMSFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("\nDMSFactory deployed to:", factoryAddress);

  if (network === "baseSepolia" || network === "base") {
    console.log("Verifying on Basescan...");
    try {
      await hre.run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [deployer.address],
      });
      console.log("Verified.");
    } catch (e) {
      console.warn("Verification skipped:", e.message);
    }
  }

  console.log(`\nAdd to .env:\nFACTORY_CONTRACT_ADDRESS=${factoryAddress}`);
}

main().catch((err) => { console.error(err); process.exit(1); });