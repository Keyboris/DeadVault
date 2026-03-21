// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DMSVault.sol";
import "./DMSTimeLockVault.sol";
import "./DMSConditionalVault.sol";

contract DMSFactory {

    address public immutable triggerAuthority;

    // owner wallet → vault address
    mapping(address => address) public vaults;

    // Mirrors VaultType enum in the Java back-end
    uint8 public constant TYPE_STANDARD    = 0;  // EQUAL_SPLIT / PERCENTAGE_SPLIT
    uint8 public constant TYPE_TIME_LOCKED = 1;  // TIME_LOCKED
    uint8 public constant TYPE_CONDITIONAL = 2;  // CONDITIONAL_SURVIVAL

    event VaultCreated(address indexed owner, address vault, uint8 vaultType);

    constructor(address _triggerAuthority) {
        triggerAuthority = _triggerAuthority;
    }

    /**
     * @notice Deploy a standard percentage-split vault (EQUAL_SPLIT or PERCENTAGE_SPLIT).
     */
    function createVault(
        address owner,
        address payable[] calldata wallets,
        uint16[] calldata basisPoints
    ) external returns (address) {
        _requireNoExistingVault(owner);
        DMSVault vault = new DMSVault(owner, triggerAuthority, wallets, basisPoints);
        return _register(owner, address(vault), TYPE_STANDARD);
    }

    /**
     * @notice Deploy a time-locked vault (TIME_LOCKED).
     * @param unlockTime  Unix timestamp. trigger() will revert on-chain before this time.
     *                    Back-end computes: block.timestamp + timeLockDays * 1 days.
     */
    function createTimeLockVault(
        address owner,
        uint256 unlockTime,
        address payable[] calldata wallets,
        uint16[] calldata basisPoints
    ) external returns (address) {
        _requireNoExistingVault(owner);
        DMSTimeLockVault vault = new DMSTimeLockVault(
            owner, triggerAuthority, unlockTime, wallets, basisPoints
        );
        return _register(owner, address(vault), TYPE_TIME_LOCKED);
    }

    /**
     * @notice Deploy a conditional-survival vault (CONDITIONAL_SURVIVAL).
     * @param mustSurvive  Per-beneficiary flag: true = survival confirmation required.
     */
    function createConditionalVault(
        address owner,
        address payable[] calldata wallets,
        uint16[] calldata basisPoints,
        bool[]   calldata mustSurvive
    ) external returns (address) {
        _requireNoExistingVault(owner);
        DMSConditionalVault vault = new DMSConditionalVault(
            owner, triggerAuthority, wallets, basisPoints, mustSurvive
        );
        return _register(owner, address(vault), TYPE_CONDITIONAL);
    }

    function clearVault(address owner) external {
        require(msg.sender == triggerAuthority, "not authority");
        require(vaults[owner] != address(0), "no vault to clear");
        delete vaults[owner];
    }

    function getVault(address owner) external view returns (address) {
        return vaults[owner];
    }

    function _requireNoExistingVault(address owner) internal view {
        require(owner != address(0), "owner is zero address");
        require(vaults[owner] == address(0), "vault already exists for this owner");
    }

    function _register(address owner, address vault, uint8 vaultType) internal returns (address) {
        vaults[owner] = vault;
        emit VaultCreated(owner, vault, vaultType);
        return vault;
    }
}