package com.adventcalendar.calendar.holiday;

import com.adventcalendar.calendar.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/holidays")
public class HolidayController {

    private final HolidayService service;

    public HolidayController(HolidayService service) {
        this.service = service;
    }

    // GET /api/holidays — все мои праздники
    @GetMapping
    public List<HolidayResponse> findAll(@AuthenticationPrincipal CurrentUser me) {
        return service.findAll(me.id());
    }

    // POST /api/holidays/3/15 {"title": "День рождения мамы"} — новый праздник на 15 марта
    @PostMapping("/{month}/{day}")
    @ResponseStatus(HttpStatus.CREATED)
    public HolidayResponse create(@AuthenticationPrincipal CurrentUser me, @PathVariable int month,
                                  @PathVariable int day, @Valid @RequestBody HolidayRequest request) {
        return service.create(me.id(), month, day, request);
    }

    // PUT /api/holidays/7 {"title": "..."} — переименовать праздник с id 7
    @PutMapping("/{id}")
    public HolidayResponse rename(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id,
                                  @Valid @RequestBody HolidayRequest request) {
        return service.rename(me.id(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.delete(me.id(), id);
    }
}
