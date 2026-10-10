package com.adventcalendar.calendar.friend;

public record FriendRequestResponse(Long id, FriendResponse from) {

    public static FriendRequestResponse from(FriendRequest request) {
        return new FriendRequestResponse(request.getId(), FriendResponse.from(request.getFromUser()));
    }
}