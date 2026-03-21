const { ethers } = require("hardhat");

async function main() {
  const SECONDS = parseInt(process.env.SECONDS || "15552000"); // default: 180 days
  await ethers.provider.send("evm_increaseTime", [SECONDS]);
  await ethers.provider.send("evm_mine", []);
  const block = await ethers.provider.getBlock("latest");
  console.log(`EVM time advanced by ${SECONDS}s. New timestamp: ${block.timestamp}`);
}

main().catch(err => { console.error(err); process.exit(1); });


//# Fast-forward 180 days on local node to test a TIME_LOCKED vault
//SECONDS=15552000 npx hardhat run scripts/time-travel.js --network localhost