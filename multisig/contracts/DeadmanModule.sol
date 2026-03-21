// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DeadmanModule
 * @notice Dead-man's-switch module for MultiSigWallet.
 *
 *         How it works:
 *         1. Owners must check in before their deadline (lastCheckIn + inactivityPeriod).
 *         2. If ALL owners miss their check-in, anyone can call `startGracePeriod()`.
 *         3. After the grace period expires without any owner checking in,
 *            anyone can call `trigger()` to redistribute funds to beneficiaries.
 *         4. Any single owner checking in at any point resets the deadman switch.
 *
 *         The module calls `execTransactionFromModule()` on the MultiSigWallet
 *         to send funds — no owner signatures needed at trigger time.
 */
contract DeadmanModule is ReentrancyGuard {

    struct Beneficiary {
        address payable wallet;
        uint16 basisPoints;   // out of 10_000
    }

    // ── Immutables ───────────────────────────────────────────────────────

    address public immutable multiSigWallet;
    uint256 public immutable inactivityPeriod;    // seconds before an owner is considered inactive
    uint256 public immutable gracePeriod;          // seconds after grace starts before trigger is allowed

    // ── State ────────────────────────────────────────────────────────────

    Beneficiary[] public beneficiaries;
    bool public triggered;

    // Per-owner last check-in timestamp
    mapping(address => uint256) public lastCheckIn;
    address[] public trackedOwners;
    mapping(address => bool) public isTrackedOwner;

    // Grace period state
    bool    public graceActive;
    uint256 public graceStartedAt;

    // ── Events ───────────────────────────────────────────────────────────

    event CheckedIn(address indexed owner, uint256 timestamp);
    event GracePeriodStarted(uint256 timestamp, uint256 expiresAt);
    event GracePeriodCancelled(address indexed owner, uint256 timestamp);
    event Triggered(uint256 timestamp, uint256 amountDistributed);
    event BeneficiariesUpdated(uint256 count);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);

    // ── Modifiers ────────────────────────────────────────────────────────

    modifier onlyTrackedOwner() {
        require(isTrackedOwner[msg.sender], "not tracked owner");
        _;
    }

    modifier onlyWallet() {
        require(msg.sender == multiSigWallet, "not wallet");
        _;
    }

    modifier notTriggered() {
        require(!triggered, "already triggered");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────

    /**
     * @param _wallet            The MultiSigWallet this module controls
     * @param _owners            Initial owners to track (should match wallet owners)
     * @param _inactivityPeriod  Seconds of inactivity before grace period can start
     * @param _gracePeriod       Seconds of grace period before trigger is allowed
     * @param _wallets           Beneficiary wallet addresses
     * @param _basisPoints       Beneficiary shares (must sum to 10_000)
     */
    constructor(
        address _wallet,
        address[] memory _owners,
        uint256 _inactivityPeriod,
        uint256 _gracePeriod,
        address payable[] memory _wallets,
        uint16[] memory _basisPoints
    ) {
        require(_wallet != address(0), "zero wallet");
        require(_owners.length > 0, "no owners");
        require(_inactivityPeriod > 0, "zero inactivity period");
        require(_gracePeriod > 0, "zero grace period");
        require(_wallets.length == _basisPoints.length, "length mismatch");

        uint256 total;
        for (uint256 i = 0; i < _wallets.length; i++) {
            require(_wallets[i] != address(0), "zero beneficiary");
            total += _basisPoints[i];
            beneficiaries.push(Beneficiary(_wallets[i], _basisPoints[i]));
        }
        require(total == 10_000, "basis points must sum to 10000");

        multiSigWallet   = _wallet;
        inactivityPeriod = _inactivityPeriod;
        gracePeriod      = _gracePeriod;

        for (uint256 i = 0; i < _owners.length; i++) {
            require(_owners[i] != address(0), "zero owner");
            require(!isTrackedOwner[_owners[i]], "duplicate owner");
            isTrackedOwner[_owners[i]] = true;
            trackedOwners.push(_owners[i]);
            lastCheckIn[_owners[i]] = block.timestamp;
        }
    }

    // ── Check-in ─────────────────────────────────────────────────────────

    /**
     * @notice Owner checks in to prove they are alive. Resets their timer
     *         and cancels any active grace period.
     */
    function checkIn() external onlyTrackedOwner notTriggered {
        lastCheckIn[msg.sender] = block.timestamp;
        emit CheckedIn(msg.sender, block.timestamp);

        // any check-in cancels the grace period
        if (graceActive) {
            graceActive    = false;
            graceStartedAt = 0;
            emit GracePeriodCancelled(msg.sender, block.timestamp);
        }
    }

    // ── Grace period ─────────────────────────────────────────────────────

    /**
     * @notice Start the grace period. Can be called by anyone once ALL tracked
     *         owners have missed their check-in deadline.
     */
    function startGracePeriod() external notTriggered {
        require(!graceActive, "grace already active");
        require(_allOwnersInactive(), "not all owners inactive");

        graceActive    = true;
        graceStartedAt = block.timestamp;
        emit GracePeriodStarted(block.timestamp, block.timestamp + gracePeriod);
    }

    // ── Trigger ──────────────────────────────────────────────────────────

    /**
     * @notice Trigger fund redistribution. Can be called by anyone after
     *         the grace period has expired without any owner checking in.
     *         Sends ETH from the MultiSigWallet to each beneficiary via
     *         the module execution path (no owner signatures needed).
     */
    function trigger() external notTriggered nonReentrant {
        require(graceActive, "grace period not active");
        require(
            block.timestamp >= graceStartedAt + gracePeriod,
            "grace period not expired"
        );

        triggered = true;

        uint256 balance = multiSigWallet.balance;
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            uint256 share = (balance * beneficiaries[i].basisPoints) / 10_000;
            if (share > 0) {
                // call the wallet's module execution path
                (bool ok, ) = multiSigWallet.call(
                    abi.encodeWithSignature(
                        "execTransactionFromModule(address,uint256,bytes)",
                        beneficiaries[i].wallet,
                        share,
                        ""
                    )
                );
                require(ok, "module tx failed");
            }
        }
        emit Triggered(block.timestamp, balance);
    }

    /**
     * @notice Trigger ERC-20 token redistribution from the wallet.
     */
    function triggerERC20(address token) external notTriggered nonReentrant {
        require(graceActive, "grace period not active");
        require(
            block.timestamp >= graceStartedAt + gracePeriod,
            "grace period not expired"
        );

        uint256 balance = IERC20(token).balanceOf(multiSigWallet);
        require(balance > 0, "no tokens");

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            uint256 share = (balance * beneficiaries[i].basisPoints) / 10_000;
            if (share > 0) {
                bytes memory transferData = abi.encodeWithSignature(
                    "transfer(address,uint256)",
                    beneficiaries[i].wallet,
                    share
                );
                (bool ok, ) = multiSigWallet.call(
                    abi.encodeWithSignature(
                        "execTransactionFromModule(address,uint256,bytes)",
                        token,
                        uint256(0),
                        transferData
                    )
                );
                require(ok, "module erc20 tx failed");
            }
        }
    }

    // ── Owner management (wallet-only) ───────────────────────────────────

    /**
     * @notice Add a new tracked owner. Must be called by the wallet (via multisig tx).
     */
    function addTrackedOwner(address _owner) external onlyWallet notTriggered {
        require(_owner != address(0), "zero address");
        require(!isTrackedOwner[_owner], "already tracked");
        isTrackedOwner[_owner] = true;
        trackedOwners.push(_owner);
        lastCheckIn[_owner] = block.timestamp;
        emit OwnerAdded(_owner);
    }

    /**
     * @notice Remove a tracked owner. Must be called by the wallet (via multisig tx).
     */
    function removeTrackedOwner(address _owner) external onlyWallet notTriggered {
        require(isTrackedOwner[_owner], "not tracked");
        require(trackedOwners.length > 1, "cannot remove last owner");
        isTrackedOwner[_owner] = false;
        for (uint256 i = 0; i < trackedOwners.length; i++) {
            if (trackedOwners[i] == _owner) {
                trackedOwners[i] = trackedOwners[trackedOwners.length - 1];
                trackedOwners.pop();
                break;
            }
        }
        emit OwnerRemoved(_owner);
    }

    /**
     * @notice Update beneficiary list. Must be called by the wallet (via multisig tx).
     */
    function updateBeneficiaries(
        address payable[] calldata _wallets,
        uint16[] calldata _basisPoints
    ) external onlyWallet notTriggered {
        require(_wallets.length == _basisPoints.length, "length mismatch");

        // clear old
        delete beneficiaries;

        uint256 total;
        for (uint256 i = 0; i < _wallets.length; i++) {
            require(_wallets[i] != address(0), "zero beneficiary");
            total += _basisPoints[i];
            beneficiaries.push(Beneficiary(_wallets[i], _basisPoints[i]));
        }
        require(total == 10_000, "basis points must sum to 10000");
        emit BeneficiariesUpdated(_wallets.length);
    }

    // ── View helpers ─────────────────────────────────────────────────────

    function _allOwnersInactive() internal view returns (bool) {
        uint256 deadline = block.timestamp - inactivityPeriod;
        for (uint256 i = 0; i < trackedOwners.length; i++) {
            if (lastCheckIn[trackedOwners[i]] > deadline) {
                return false;   // at least one owner is still active
            }
        }
        return true;
    }

    function allOwnersInactive() external view returns (bool) {
        return _allOwnersInactive();
    }

    function getTrackedOwners() external view returns (address[] memory) {
        return trackedOwners;
    }

    function getBeneficiaries() external view returns (Beneficiary[] memory) {
        return beneficiaries;
    }

    function getGraceInfo()
        external
        view
        returns (bool active, uint256 startedAt, uint256 expiresAt)
    {
        return (
            graceActive,
            graceStartedAt,
            graceActive ? graceStartedAt + gracePeriod : 0
        );
    }

    function getOwnerDeadline(address _owner) external view returns (uint256) {
        require(isTrackedOwner[_owner], "not tracked");
        return lastCheckIn[_owner] + inactivityPeriod;
    }

    function isExpired() external view returns (bool) {
        if (triggered) return true;
        if (!graceActive) return false;
        return block.timestamp >= graceStartedAt + gracePeriod;
    }
}
