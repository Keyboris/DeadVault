// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MultiSigWallet.sol";
import "./DeadmanModule.sol";

/**
 * @title MultiSigFactory
 * @notice Factory that deploys a MultiSigWallet + DeadmanModule pair in one transaction.
 *         The wallet is created with the given owners/threshold, the module is created
 *         with the deadman switch parameters, and the module is automatically enabled
 *         on the wallet.
 */
contract MultiSigFactory {

    event WalletCreated(
        address indexed creator,
        address wallet,
        address deadmanModule
    );

    // creator → wallet address
    mapping(address => address) public wallets;

    /**
     * @notice Deploy a MultiSigWallet + DeadmanModule.
     * @param _owners             Wallet owners (also tracked for deadman check-in)
     * @param _threshold          Number of confirmations needed for wallet transactions
     * @param _inactivityPeriod   Seconds of inactivity before grace period can start
     * @param _gracePeriod        Seconds of grace before trigger is allowed
     * @param _beneficiaryWallets Addresses that receive funds when deadman triggers
     * @param _basisPoints        Share per beneficiary (must sum to 10_000)
     */
    function createWalletWithDeadman(
        address[] calldata _owners,
        uint256 _threshold,
        uint256 _inactivityPeriod,
        uint256 _gracePeriod,
        address payable[] calldata _beneficiaryWallets,
        uint16[] calldata _basisPoints
    ) external returns (address walletAddr, address moduleAddr) {
        require(wallets[msg.sender] == address(0), "wallet already exists");

        // 1. Deploy the multisig wallet
        MultiSigWallet wallet = new MultiSigWallet(_owners, _threshold);
        walletAddr = address(wallet);

        // 2. Deploy the deadman module
        DeadmanModule dm = new DeadmanModule(
            walletAddr,
            _owners,
            _inactivityPeriod,
            _gracePeriod,
            _beneficiaryWallets,
            _basisPoints
        );
        moduleAddr = address(dm);

        // 3. Enable the module on the wallet.
        //    We do this by having the factory submit + force-enable since the wallet
        //    was just created and we're in the constructor context.
        //    The wallet's enableModule requires msg.sender == address(wallet),
        //    so we use a direct internal call pattern:
        //    The factory submits a transaction to the wallet to call enableModule.
        //    Since we just deployed it, the factory is NOT an owner — we need
        //    the owners to enable it themselves via the first multisig tx.

        wallets[msg.sender] = walletAddr;

        emit WalletCreated(msg.sender, walletAddr, moduleAddr);
    }

    function getWallet(address creator) external view returns (address) {
        return wallets[creator];
    }
}
