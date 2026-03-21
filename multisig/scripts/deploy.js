require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying MultiSigFactory...");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(
    await hre.ethers.provider.getBalance(deployer.address)
  ), "ETH\n");

  const Factory = await hre.ethers.getContractFactory("MultiSigFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  console.log("MultiSigFactory deployed to:", address);
  console.log("\n---------------------------------------------");
  console.log("Copy this line into your ROOT .env file:");
  console.log(`MULTISIG_FACTORY_ADDRESS=${address}`);
  console.log("---------------------------------------------\n");
  console.log("Then run: docker compose up --build");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
