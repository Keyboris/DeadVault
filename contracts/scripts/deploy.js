require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying DMSFactory...");
  console.log("Deployer (triggerAuthority):", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(
    await hre.ethers.provider.getBalance(deployer.address)
  ), "ETH\n");

  const Factory = await hre.ethers.getContractFactory("DMSFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  console.log("✅ DMSFactory deployed to:", address);
  console.log(`\nFACTORY_CONTRACT_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});