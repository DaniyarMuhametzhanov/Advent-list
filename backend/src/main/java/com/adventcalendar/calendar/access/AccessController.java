package com.adventcalendar.calendar.access;

import com.adventcalendar.calendar.security.CurrentUser;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AccessController {

    private final AccessService service;

    public AccessController(AccessService service) {
        this.service = service;
    }

    // PUT /api/wishes/7/access/2 — открыть желание 7 человеку 2
    @PutMapping("/wishes/{wishId}/access/{friendId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void grant(@AuthenticationPrincipal CurrentUser me, @PathVariable Long wishId, @PathVariable Long friendId) {
        service.grant(me.id(), wishId, friendId);
    }

    // DELETE /api/wishes/7/access/2 — закрыть желание 7 от человека 2
    @DeleteMapping("/wishes/{wishId}/access/{friendId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@AuthenticationPrincipal CurrentUser me, @PathVariable Long wishId, @PathVariable Long friendId) {
        service.revoke(me.id(), wishId, friendId);
    }

    @PostMapping("/wishes/{wishId}/access-requests")
    @ResponseStatus(HttpStatus.CREATED)
    public void request(@AuthenticationPrincipal CurrentUser me, @PathVariable Long wishId) {
        service.request(me.id(), wishId);
    }

    @GetMapping("/access-requests/incoming")
    public List<AccessRequestResponse> incoming(@AuthenticationPrincipal CurrentUser me) {
        return service.incoming(me.id());
    }

    @PostMapping("/access-requests/{id}/grant")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void grantRequest(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.grantRequest(me.id(), id);
    }

    @PostMapping("/access-requests/{id}/deny")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void denyRequest(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.denyRequest(me.id(), id);
    }
}
