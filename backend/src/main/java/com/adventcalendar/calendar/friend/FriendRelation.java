package com.adventcalendar.calendar.friend;

// Кем мне приходится найденный человек
public enum FriendRelation {
    FRIEND,           // уже в друзьях
    REQUEST_SENT,     // я отправил ему заявку
    REQUEST_RECEIVED, // он прислал заявку мне
    NONE              // никак не связаны
}