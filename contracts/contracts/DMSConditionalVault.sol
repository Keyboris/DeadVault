// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DMSConditionalVault
 * @notice Dead-man's-switch vault where each beneficiary may require a survival proof
 *         before their share is released.
 *
 *         mustSurviveOwner = false  → share released like a normal vault (ALWAYS condition)
 *         mustSurviveOwner = true   → authority must call confirmSurvival(index) first,
 *                                     then releaseTo(index) releases only that beneficiary's share.
 *
 *         This means the contract stores a per-beneficiary `confirmed` flag instead of a global
 *         `triggered` flag, enabling partial and staged distributions.
 */
contract DMSConditionalVault is ReentrancyGuard {

    struct Beneficiary {
        address payable wallet;
        uint16  basisPoints;
        bool    mustSurviveOwner;   // true = confirmation required before release
        bool    confirmed;          // set by authority once survival is verified
        bool    released;           // set after funds are sent — prevents double-release
    }

    address public immutable owner;
    address public immutable triggerAuthority;
    Beneficiary[] public beneficiaries;
    bool public triggered;          // set to true when trigger() is first called

    event Triggered(address indexed authority, uint256 timestamp);
    event SurvivalConfirmed(uint256 indexed index, address wallet);
    event ShareReleased(uint256 indexed index, address wallet, uint256 amount);
    event Deposited(address indexed sender, uint256 amount);
    event Revoked(address indexed owner, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAuthority() {
        require(msg.sender == triggerAuthority, "not authority");
        _;
    }

    constructor(
        address _owner,
        address _triggerAuthority,
        address payable[] memory _wallets,
        uint16[] memory _basisPoints,
        bool[]   memory _mustSurvive
    ) {
        require(_wallets.length == _basisPoints.length, "length mismatch");
        require(_wallets.length == _mustSurvive.length, "survive length mismatch");
        uint256 total;
        for (uint256 i = 0; i < _wallets.length; i++) {
            total += _basisPoints[i];
            beneficiaries.push(Beneficiary({
                wallet:            _wallets[i],
                basisPoints:       _basisPoints[i],
                mustSurviveOwner:  _mustSurvive[i],
                confirmed:         !_mustSurvive[i],   // unconditional beneficiaries pre-confirmed
                released:          false
            }));
        }
        require(total == 10_000, "basis points must sum to 10000");
        owner            = _owner;
        triggerAuthority = _triggerAuthority;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice First call from the authority after the grace period expires.
     *         Marks the vault as triggered and immediately releases all unconditional shares.
     *         Conditional shares remain locked until confirmSurvival() + releaseTo() are called.
     */
    function trigger() external onlyAuthority nonReentrant {
        require(!triggered, "already triggered");
        triggered = true;
        emit Triggered(msg.sender, block.timestamp);
        uint256 balance = address(this).balance;
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            if (!beneficiaries[i].mustSurviveOwner) {
                _release(i, balance);
            }
        }
    }

    /**
     * @notice Authority attests that beneficiary[index] is alive and can receive their share.
     *         Only meaningful for mustSurviveOwner = true beneficiaries.
     */
    function confirmSurvival(uint256 index) external onlyAuthority {
        require(triggered, "not triggered yet");
        require(index < beneficiaries.length, "out of range");
        require(beneficiaries[index].mustSurviveOwner, "no condition set");
        require(!beneficiaries[index].confirmed, "already confirmed");
        beneficiaries[index].confirmed = true;
        emit SurvivalConfirmed(index, beneficiaries[index].wallet);
    }

    /**
     * @notice Releases a confirmed beneficiary's share. Can be called by anyone
     *         (e.g. the beneficiary themselves) once confirmed.
     */
    function releaseTo(uint256 index) external nonReentrant {
        require(triggered, "not triggered yet");
        require(index < beneficiaries.length, "out of range");
        require(beneficiaries[index].confirmed, "not confirmed");
        require(!beneficiaries[index].released, "already released");
        uint256 snapshot = address(this).balance;
        _release(index, snapshot);
    }

    function _release(uint256 index, uint256 totalBalance) internal {
        Beneficiary storage b = beneficiaries[index];
        require(!b.released, "already released");
        b.released = true;
        uint256 share = (totalBalance * b.basisPoints) / 10_000;
        if (share > 0) {
            (bool ok, ) = b.wallet.call{value: share}("");
            require(ok, "transfer failed");
        }
        emit ShareReleased(index, b.wallet, share);
    }

    function revoke() external onlyOwner nonReentrant {
        require(!triggered, "already triggered");
        uint256 balance = address(this).balance;
        (bool ok, ) = payable(owner).call{value: balance}("");
        require(ok, "revoke failed");
        emit Revoked(owner, balance);
    }

    function getBeneficiaries() external view returns (Beneficiary[] memory) { return beneficiaries; }
    function getBalance() external view returns (uint256) { return address(this).balance; }
}