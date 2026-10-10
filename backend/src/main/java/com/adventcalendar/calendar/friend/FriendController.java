package com.adventcalendar.calendar.friend;

import com.adventcalendar.calendar.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class FriendController {

    private final FriendService service;

    public FriendController(FriendService service) {
        this.service = service;
    }

    @GetMapping("/users/search")
    public List<UserSearchResponse> search(@AuthenticationPrincipal CurrentUser me,
                                           @RequestParam(defaultValue = "") String q) {
        return service.search(me.id(), q);
    }

    @GetMapping("/friends")
    public List<FriendResponse> friends(@AuthenticationPrincipal CurrentUser me) {
        return service.friendsOf(me.id());
    }

    @DeleteMapping("/friends/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFriend(@AuthenticationPrincipal CurrentUser me, @PathVariable Long userId) {
        service.removeFriend(me.id(), userId);
    }

    @PostMapping("/friend-requests")
    @ResponseStatus(HttpStatus.CREATED)
    public void sendRequest(@AuthenticationPrincipal CurrentUser me, @Valid @RequestBody NewFriendRequest body) {
        service.sendRequest(me.id(), body.toUserId());
    }

    @GetMapping("/friend-requests/incoming")
    public List<FriendRequestResponse> incoming(@AuthenticationPrincipal CurrentUser me) {
        return service.incoming(me.id());
    }

    @PostMapping("/friend-requests/{id}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void accept(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.accept(me.id(), id);
    }

    @PostMapping("/friend-requests/{id}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decline(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.decline(me.id(), id);
    }
}