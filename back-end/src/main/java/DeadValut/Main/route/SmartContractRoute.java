package DeadValut.Main.route;

import DeadValut.Main.controller.SmartContractController;
import DeadValut.Main.model.SmartContractRequest;
import DeadValut.Main.model.SmartContractResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/contracts")
public class SmartContractRoute {

    private final SmartContractController smartContractController;

    public SmartContractRoute(SmartContractController smartContractController) {
        this.smartContractController = smartContractController;
    }

    @PostMapping("/generate")
    public ResponseEntity<SmartContractResponse> generateContract(@Valid @RequestBody SmartContractRequest request) {
        SmartContractResponse response = smartContractController.generateContract(request);
        return ResponseEntity.ok(response);
    }
}
