package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WishService {

    private final WishRepository wishRepository;
    private final UserRepository userRepository;

    public WishService(WishRepository wishRepository, UserRepository userRepository) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<WishResponse> findAll(Long ownerId) {
        return wishRepository.findAllByOwnerIdOrderByDateAsc(ownerId).stream()
                .map(WishResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public WishResponse findById(Long ownerId, Long id) {
        return wishRepository.findByIdAndOwnerId(id, ownerId)
                .map(WishResponse::from)
                .orElseThrow(() -> new WishNotFoundException(id));
    }

    @Transactional
    public WishResponse saveForDate(Long ownerId, LocalDate date, WishRequest request) {
        Wish wish = wishRepository.findByOwnerIdAndDate(ownerId, date)
                .orElseGet(() -> new Wish(userRepository.getReferenceById(ownerId), date));
        wish.update(request.title(), request.comment());
        return WishResponse.from(wishRepository.save(wish));
    }

    @Transactional
    public void delete(Long ownerId, Long id) {
        Wish wish = wishRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new WishNotFoundException(id));
        wishRepository.delete(wish);
    }
}