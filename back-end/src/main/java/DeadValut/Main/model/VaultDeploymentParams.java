// model/VaultDeploymentParams.java
package DeadValut.Main.model;

import java.util.List;

/**
 * Typed parameter record produced by VaultTypeRouter and consumed by ContractDeploymentService.
 * The sealed interface enforces that callers handle every vault type — the compiler will flag
 * missing cases in switch expressions.
 */
public sealed interface VaultDeploymentParams
        permits VaultDeploymentParams.Standard,
                VaultDeploymentParams.TimeLocked,
                VaultDeploymentParams.Conditional {

    List<String>  wallets();
    List<Integer> basisPoints();

    /** EQUAL_SPLIT or PERCENTAGE_SPLIT — deploys DMSVault via DMSFactory.createVault() */
    record Standard(
            List<String>  wallets,
            List<Integer> basisPoints
    ) implements VaultDeploymentParams {}

    /** TIME_LOCKED — deploys DMSTimeLockVault via DMSFactory.createTimeLockVault() */
    record TimeLocked(
            List<String>  wallets,
            List<Integer> basisPoints,
            int           timeLockDays    // converted to unlockTime Unix timestamp at deploy
    ) implements VaultDeploymentParams {}

    /** CONDITIONAL_SURVIVAL — deploys DMSConditionalVault via DMSFactory.createConditionalVault() */
    record Conditional(
            List<String>   wallets,
            List<Integer>  basisPoints,
            List<Boolean>  mustSurviveOwner   // parallel to wallets — true = confirmation required
    ) implements VaultDeploymentParams {}
}