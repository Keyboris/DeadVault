const { ethers } = require("hardhat");
async function main() {
  const code = await ethers.provider.getCode("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  console.log("CODE_LENGTH_START:" + code.length + ":CODE_LENGTH_END");
  if (code === "0x") {
    console.log("NO_CODE_FOUND");
  }
}
main().catch(console.error);
