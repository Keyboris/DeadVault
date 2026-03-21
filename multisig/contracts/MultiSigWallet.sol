// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MultiSigWallet
 * @notice Safe-style multisig wallet with module support for deadman switch.
 *         Owners submit, confirm, and execute transactions once threshold is met.
 *         Modules (like DeadmanModule) can execute transactions without owner signatures.
 */
contract MultiSigWallet is ReentrancyGuard {

    // ── Types ────────────────────────────────────────────────────────────

    struct Transaction {
        address to;
        uint256 value;
        bytes   data;
        bool    executed;
        uint256 confirmCount;
    }

    // ── State ────────────────────────────────────────────────────────────

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public threshold;

    Transaction[] public transactions;
    // txIndex → owner → confirmed
    mapping(uint256 => mapping(address => bool)) public isConfirmed;

    // Module system: enabled modules can call execTransactionFromModule
    mapping(address => bool) public isModule;
    address[] public modules;

    uint256 public nonce;

    // ── Events ───────────────────────────────────────────────────────────

    event Deposited(address indexed sender, uint256 amount);
    event TransactionSubmitted(uint256 indexed txIndex, address indexed to, uint256 value, bytes data);
    event TransactionConfirmed(uint256 indexed txIndex, address indexed owner);
    event ConfirmationRevoked(uint256 indexed txIndex, address indexed owner);
    event TransactionExecuted(uint256 indexed txIndex);
    event TransactionFailed(uint256 indexed txIndex);

    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event ThresholdChanged(uint256 threshold);

    event ModuleEnabled(address indexed module);
    event ModuleDisabled(address indexed module);
    event ModuleTransactionExecuted(address indexed module, address indexed to, uint256 value);

    // ── Modifiers ────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(isOwner[msg.sender], "not owner");
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "not self");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "tx does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "tx already executed");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────

    constructor(address[] memory _owners, uint256 _threshold) {
        require(_owners.length > 0, "owners required");
        require(
            _threshold > 0 && _threshold <= _owners.length,
            "invalid threshold"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address o = _owners[i];
            require(o != address(0), "zero address owner");
            require(!isOwner[o], "duplicate owner");
            isOwner[o] = true;
            owners.push(o);
        }
        threshold = _threshold;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ── Transaction lifecycle ────────────────────────────────────────────

    /**
     * @notice Submit a new transaction proposal. Automatically confirms from sender.
     */
    function submitTransaction(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external onlyOwner returns (uint256 txIndex) {
        txIndex = transactions.length;
        transactions.push(Transaction({
            to:           _to,
            value:        _value,
            data:         _data,
            executed:     false,
            confirmCount: 0
        }));

        emit TransactionSubmitted(txIndex, _to, _value, _data);

        // auto-confirm from submitter
        _confirm(txIndex, msg.sender);
    }

    /**
     * @notice Confirm a pending transaction.
     */
    function confirmTransaction(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        require(!isConfirmed[_txIndex][msg.sender], "already confirmed");
        _confirm(_txIndex, msg.sender);
    }

    /**
     * @notice Revoke a previous confirmation.
     */
    function revokeConfirmation(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        require(isConfirmed[_txIndex][msg.sender], "not confirmed");
        isConfirmed[_txIndex][msg.sender] = false;
        transactions[_txIndex].confirmCount -= 1;
        emit ConfirmationRevoked(_txIndex, msg.sender);
    }

    /**
     * @notice Execute a transaction once threshold confirmations are met.
     */
    function executeTransaction(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
        nonReentrant
    {
        Transaction storage txn = transactions[_txIndex];
        require(txn.confirmCount >= threshold, "threshold not met");

        txn.executed = true;
        nonce++;

        (bool success, ) = txn.to.call{value: txn.value}(txn.data);
        if (success) {
            emit TransactionExecuted(_txIndex);
        } else {
            txn.executed = false;
            nonce--;
            emit TransactionFailed(_txIndex);
            revert("tx execution failed");
        }
    }

    // ── Module system ────────────────────────────────────────────────────

    /**
     * @notice Enable a module. Can only be called by the wallet itself
     *         (via an owner-approved transaction targeting this function).
     */
    function enableModule(address _module) external onlySelf {
        require(_module != address(0), "zero address module");
        require(!isModule[_module], "module already enabled");
        isModule[_module] = true;
        modules.push(_module);
        emit ModuleEnabled(_module);
    }

    /**
     * @notice Disable a module. Can only be called by the wallet itself.
     */
    function disableModule(address _module) external onlySelf {
        require(isModule[_module], "module not enabled");
        isModule[_module] = false;
        // remove from array
        for (uint256 i = 0; i < modules.length; i++) {
            if (modules[i] == _module) {
                modules[i] = modules[modules.length - 1];
                modules.pop();
                break;
            }
        }
        emit ModuleDisabled(_module);
    }

    /**
     * @notice Execute a transaction from an enabled module — no owner signatures needed.
     *         The module contract contains its own authorization logic.
     */
    function execTransactionFromModule(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) external nonReentrant returns (bool success) {
        require(isModule[msg.sender], "not an enabled module");
        nonce++;
        (success, ) = _to.call{value: _value}(_data);
        require(success, "module tx failed");
        emit ModuleTransactionExecuted(msg.sender, _to, _value);
    }

    // ── Owner management (self-call only) ────────────────────────────────

    /**
     * @notice Add a new owner and optionally update threshold.
     *         Must be called via an approved multisig transaction.
     */
    function addOwner(address _owner, uint256 _newThreshold) external onlySelf {
        require(_owner != address(0), "zero address");
        require(!isOwner[_owner], "already owner");
        require(_newThreshold > 0 && _newThreshold <= owners.length + 1, "bad threshold");

        isOwner[_owner] = true;
        owners.push(_owner);
        threshold = _newThreshold;

        emit OwnerAdded(_owner);
        emit ThresholdChanged(_newThreshold);
    }

    /**
     * @notice Remove an owner and update threshold.
     *         Must be called via an approved multisig transaction.
     */
    function removeOwner(address _owner, uint256 _newThreshold) external onlySelf {
        require(isOwner[_owner], "not owner");
        require(owners.length - 1 > 0, "cannot remove last owner");
        require(_newThreshold > 0 && _newThreshold <= owners.length - 1, "bad threshold");

        isOwner[_owner] = false;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == _owner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }
        threshold = _newThreshold;

        emit OwnerRemoved(_owner);
        emit ThresholdChanged(_newThreshold);
    }

    /**
     * @notice Change the confirmation threshold.
     */
    function changeThreshold(uint256 _newThreshold) external onlySelf {
        require(_newThreshold > 0 && _newThreshold <= owners.length, "bad threshold");
        threshold = _newThreshold;
        emit ThresholdChanged(_newThreshold);
    }

    // ── View helpers ─────────────────────────────────────────────────────

    function _confirm(uint256 _txIndex, address _owner) internal {
        isConfirmed[_txIndex][_owner] = true;
        transactions[_txIndex].confirmCount += 1;
        emit TransactionConfirmed(_txIndex, _owner);
    }

    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function getModules() external view returns (address[] memory) {
        return modules;
    }

    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 _txIndex)
        external
        view
        txExists(_txIndex)
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 confirmCount
        )
    {
        Transaction storage txn = transactions[_txIndex];
        return (txn.to, txn.value, txn.data, txn.executed, txn.confirmCount);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
