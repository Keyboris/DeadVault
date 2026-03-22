const { ethers } = require("hardhat");
async function main() {
  const factory = await ethers.getContractAt("DMSFactory", "0x5FbDB2315678afecb367f032d93F642f64180aa3");
  try {
    const auth = await factory.triggerAuthority();
    console.log("TRIGGER_AUTHORITY:" + auth);
  } catch (e) {
    console.log("NOT_DMS_FACTORY:" + e.message);
  }
}
main().catch(console.error);
