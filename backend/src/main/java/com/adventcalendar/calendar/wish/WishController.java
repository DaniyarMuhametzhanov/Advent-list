package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.security.CurrentUser;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/wishes")
public class WishController {

    private final WishService service;

    public WishController(WishService service) {
        this.service = service;
    }

    @GetMapping
    public List<WishResponse> findAll(@AuthenticationPrincipal CurrentUser me) {
        return service.findAll(me.id());
    }

    @GetMapping("/{id}")
    public WishResponse findById(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        return service.findById(me.id(), id);
    }

    @PutMapping("/{date}")
    public WishResponse save(@AuthenticationPrincipal CurrentUser me,
                             @PathVariable LocalDate date, @Valid @RequestBody WishRequest request) {
        return service.saveForDate(me.id(), date, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id) {
        service.delete(me.id(), id);
    }
}