// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DMSVault.sol";

contract DMSFactory {

    address public immutable triggerAuthority;
    mapping(address => address) public vaults;

    event VaultCreated(address indexed owner, address vault);

    constructor(address _triggerAuthority) {
        triggerAuthority = _triggerAuthority;
    }

    function createVault(
        address payable[] calldata wallets,
        uint16[] calldata basisPoints
    ) external returns (address) {
        require(vaults[msg.sender] == address(0), "vault exists");
        DMSVault vault = new DMSVault(
            msg.sender,
            triggerAuthority,
            wallets,
            basisPoints
        );
        vaults[msg.sender] = address(vault);
        emit VaultCreated(msg.sender, address(vault));
        return address(vault);
    }

    function getVault(address owner) external view returns (address) {
        return vaults[owner];
    }
}