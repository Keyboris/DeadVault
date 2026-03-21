// controller/ContractQueryController.java
package DeadValut.Main.controller;

import DeadValut.Main.model.ContractSummaryResponse;
import DeadValut.Main.service.ContractQueryService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
public class ContractQueryController {

    private final ContractQueryService contractQueryService;

    public ContractQueryController(ContractQueryService contractQueryService) {
        this.contractQueryService = contractQueryService;
    }

    public List<ContractSummaryResponse> getContracts(UUID userId) {
        return contractQueryService.getContracts(userId);
    }
}