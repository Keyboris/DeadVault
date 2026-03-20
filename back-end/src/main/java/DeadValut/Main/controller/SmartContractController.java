package DeadValut.Main.controller;

import DeadValut.Main.model.SmartContractRequest;
import DeadValut.Main.model.SmartContractResponse;
import DeadValut.Main.service.SmartContractGeneratorService;
import org.springframework.stereotype.Component;

@Component
public class SmartContractController {

    private final SmartContractGeneratorService smartContractGeneratorService;

    public SmartContractController(SmartContractGeneratorService smartContractGeneratorService) {
        this.smartContractGeneratorService = smartContractGeneratorService;
    }

    public SmartContractResponse generateContract(SmartContractRequest request) {
        return smartContractGeneratorService.generateFromPrompt(request.prompt());
    }
}
