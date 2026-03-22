const { ethers } = require("hardhat");
async function main() {
  const balance = await ethers.provider.getBalance("0xbcd4042de499d14e55001ccbb24a551f3b954096");
  console.log("BALANCE_START:" + ethers.formatEther(balance) + ":BALANCE_END");
}
main().catch(console.error);
