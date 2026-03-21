// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DMSTimeLockVault
 * @notice Dead-man's-switch vault that enforces a time-lock before distribution.
 *         The trigger authority may only call trigger() once block.timestamp >= unlockTime.
 *         Suitable for wills that say "release funds no sooner than X months/years after my death".
 */
contract DMSTimeLockVault is ReentrancyGuard {

    struct Beneficiary {
        address payable wallet;
        uint16 basisPoints;   // out of 10_000
    }

    address public immutable owner;
    address public immutable triggerAuthority;
    uint256 public immutable unlockTime;        // Unix timestamp — trigger reverts before this
    Beneficiary[] public beneficiaries;
    bool public triggered;

    event Triggered(address indexed authority, uint256 timestamp);
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

    /**
     * @param _unlockTime  Unix timestamp before which trigger() is blocked.
     *                     Back-end sets this to: block.timestamp + timeLockDays * 1 days
     *                     at deploy time, so the time-lock is immutably enforced on-chain.
     */
    constructor(
        address _owner,
        address _triggerAuthority,
        uint256 _unlockTime,
        address payable[] memory _wallets,
        uint16[] memory _basisPoints
    ) {
        require(_wallets.length == _basisPoints.length, "length mismatch");
        require(_unlockTime > block.timestamp, "unlock must be in the future");
        uint256 total;
        for (uint256 i = 0; i < _wallets.length; i++) {
            total += _basisPoints[i];
            beneficiaries.push(Beneficiary(_wallets[i], _basisPoints[i]));
        }
        require(total == 10_000, "basis points must sum to 10000");
        owner             = _owner;
        triggerAuthority  = _triggerAuthority;
        unlockTime        = _unlockTime;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function trigger() external onlyAuthority nonReentrant {
        require(!triggered, "already triggered");
        require(block.timestamp >= unlockTime, "time lock not expired");   // ← the actual logic
        triggered = true;
        uint256 balance = address(this).balance;
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            uint256 share = (balance * beneficiaries[i].basisPoints) / 10_000;
            if (share > 0) {
                (bool ok, ) = beneficiaries[i].wallet.call{value: share}("");
                require(ok, "transfer failed");
            }
        }
        emit Triggered(msg.sender, block.timestamp);
    }

    function triggerERC20(address token) external onlyAuthority nonReentrant {
        require(!triggered, "already triggered");
        require(block.timestamp >= unlockTime, "time lock not expired");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "no tokens");
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            uint256 share = (balance * beneficiaries[i].basisPoints) / 10_000;
            if (share > 0) IERC20(token).transfer(beneficiaries[i].wallet, share);
        }
    }

    function revoke() external onlyOwner nonReentrant {
        require(!triggered, "already triggered");
        triggered = true;
        uint256 balance = address(this).balance;
        (bool ok, ) = payable(owner).call{value: balance}("");
        require(ok, "revoke failed");
        emit Revoked(owner, balance);
    }

    function revokeAsAuthority() external onlyAuthority nonReentrant {
        require(!triggered, "already triggered");
        triggered = true;
        uint256 balance = address(this).balance;
        (bool ok, ) = payable(owner).call{value: balance}("");
        require(ok, "revoke failed");
        emit Revoked(owner, balance);
    }

    function getUnlockTime() external view returns (uint256) { return unlockTime; }
    function getBeneficiaries() external view returns (Beneficiary[] memory) { return beneficiaries; }
    function getBalance() external view returns (uint256) { return address(this).balance; }
}