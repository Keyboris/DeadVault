package DeadValut.Main.controller;

import DeadValut.Main.model.*;
import DeadValut.Main.service.UpdateWillService;
import DeadValut.Main.service.WillService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WillControllerTest {

    private WillService willService;
    private UpdateWillService updateWillService;
    private WillController willController;

    @BeforeEach
    void setUp() {
        willService       = mock(WillService.class);
        updateWillService = mock(UpdateWillService.class);
        // Fix: WillController now requires both WillService and UpdateWillService
        willController    = new WillController(willService, updateWillService);
    }

    @Test
    void submitWill_delegatesToWillService() {
        UUID userId = UUID.randomUUID();
        WillRequest request = new WillRequest(
                "Give 60% to Alice (0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA) " +
                "and 40% to Bob (0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB)");

        WillResponse expected = new WillResponse(
                UUID.randomUUID(), "PERCENTAGE_SPLIT",
                List.of(
                        new ResolvedBeneficiary("Alice",
                                "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 6000, "ALWAYS", 0),
                        new ResolvedBeneficiary("Bob",
                                "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", 4000, "ALWAYS", 0)),
                "0xContractAddress", "0xDeployTxHash");

        when(willService.submitWill(userId, request.willText())).thenReturn(expected);

        WillResponse actual = willController.submitWill(userId, request);

        assertSame(expected, actual);
        verify(willService).submitWill(userId, request.willText());
        verifyNoInteractions(updateWillService);
    }

    @Test
    void updateWill_delegatesToUpdateWillService() {
        UUID userId = UUID.randomUUID();
        WillRequest request = new WillRequest(
                "Give everything equally to my three kids " +
                "(0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA) " +
                "(0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB) " +
                "(0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC)");

        UpdateWillResponse expected = new UpdateWillResponse(
                UUID.randomUUID(), "EQUAL_SPLIT", List.of(),
                "0xOldContract", "0xRevokeTx",
                "0xNewContract", "0xDeployTx");

        when(updateWillService.updateWill(userId, request.willText())).thenReturn(expected);

        UpdateWillResponse actual = willController.updateWill(userId, request);

        assertSame(expected, actual);
        verify(updateWillService).updateWill(userId, request.willText());
        verifyNoInteractions(willService);
    }

    @Test
    void updateWill_propagatesExceptionFromService() {
        UUID userId = UUID.randomUUID();
        WillRequest request = new WillRequest("Give everything to Alice (0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA)");

        when(updateWillService.updateWill(userId, request.willText()))
                .thenThrow(new IllegalStateException("Vault has already been triggered — will cannot be updated"));

        assertThrows(IllegalStateException.class, () -> willController.updateWill(userId, request));
    }
}