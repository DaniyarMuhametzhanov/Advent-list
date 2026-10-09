package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WishService {

    // Входа пока нет (он будет на этапе 6), поэтому «я» — это Анна с id = 1
    private static final Long CURRENT_USER_ID = 1L;

    private final WishRepository wishRepository;
    private final UserRepository userRepository;

    public WishService(WishRepository wishRepository, UserRepository userRepository) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<WishResponse> findAll() {
        return wishRepository.findAllByOwnerIdOrderByDateAsc(CURRENT_USER_ID).stream()
                .map(WishResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public WishResponse findById(Long id) {
        return wishRepository.findByIdAndOwnerId(id, CURRENT_USER_ID)
                .map(WishResponse::from)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    @Transactional
    public WishResponse saveForDate(LocalDate date, WishRequest request) {
        Wish wish = wishRepository.findByOwnerIdAndDate(CURRENT_USER_ID, date)
                .orElseGet(() -> new Wish(userRepository.getReferenceById(CURRENT_USER_ID), date));
        wish.update(request.title(), request.comment());
        return WishResponse.from(wishRepository.save(wish));
    }

    @Transactional
    public void delete(Long id) {
        Wish wish = wishRepository.findByIdAndOwnerId(id, CURRENT_USER_ID)
                .orElseThrow(() -> new WishNotFoundException(id));
        wishRepository.delete(wish);
    }
}