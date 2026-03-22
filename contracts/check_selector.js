const { ethers } = require("hardhat");
async function main() {
  const addr = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const selectors = [
    "0xd47af8a2", // triggerAuthority() ?
    "0x627d3513", // getWallet(address)
  ];
  // Wait, I'll use real signatures
  const ifaceDMS = new ethers.Interface(["function triggerAuthority() view returns (address)"]);
  const ifaceMS = new ethers.Interface(["function getWallet(address) view returns (address)"]);
  
  try {
    const res = await ethers.provider.call({ to: addr, data: ifaceDMS.encodeFunctionData("triggerAuthority", []) });
    console.log("DMS_DETECTED:" + res);
  } catch (e) { console.log("DMS_ERROR:" + e.message); }

  try {
    const res = await ethers.provider.call({ to: addr, data: ifaceMS.encodeFunctionData("getWallet", ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]) });
    console.log("MS_DETECTED:" + res);
  } catch (e) { console.log("MS_ERROR:" + e.message); }
}
main().catch(console.error);
