require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Network: ${network} (chain ${hre.network.config.chainId})`);
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // On local networks use the deployer as triggerAuthority.
  // On live networks, require a Gnosis Safe address for security.
  let triggerAuthority;
  if (network === "localhost" || network === "hardhat") {
    triggerAuthority = deployer.address;
    console.log("Local mode — deployer is triggerAuthority (no multisig)");
  } else {
    triggerAuthority = process.env.GNOSIS_SAFE_ADDRESS;
    if (!triggerAuthority) {
      throw new Error("GNOSIS_SAFE_ADDRESS must be set in .env for non-local deployments");
    }
  }

  console.log("Trigger authority:", triggerAuthority);

  const Factory = await hre.ethers.getContractFactory("DMSFactory");
  const factory = await Factory.deploy(triggerAuthority);
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("\n✅ DMSFactory deployed to:", factoryAddress);
  console.log(`\nAdd to .env:\nFACTORY_CONTRACT_ADDRESS=${factoryAddress}`);

  // Verify on Basescan when deploying to live networks
  if (network === "baseSepolia" || network === "base") {
    console.log("\nVerifying on Basescan...");
    try {
      await hre.run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [triggerAuthority],
      });
      console.log("Verified.");
    } catch (e) {
      console.warn("Verification skipped:", e.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});