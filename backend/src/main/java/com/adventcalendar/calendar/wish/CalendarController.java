package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.security.CurrentUser;
import java.time.YearMonth;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/calendars")
public class CalendarController {

    private final WishService service;

    public CalendarController(WishService service) {
        this.service = service;
    }

    // GET /api/calendars/2?month=2026-10 — занятые дни человека с id 2 за октябрь 2026
    @GetMapping("/{userId}")
    public List<CalendarDayResponse> month(@AuthenticationPrincipal CurrentUser me,
                                           @PathVariable Long userId, @RequestParam YearMonth month) {
        return service.calendar(me.id(), userId, month);
    }
}