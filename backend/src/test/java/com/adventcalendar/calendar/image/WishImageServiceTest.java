package com.adventcalendar.calendar.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.cache.CalendarCaches;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import com.adventcalendar.calendar.wish.WishRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class WishImageServiceTest {

    private static final Long OWNER_ID = 1L;
    private static final Long FRIEND_ID = 2L;
    private static final Long WISH_ID = 5L;

    @Mock WishRepository wishRepository;
    @Mock WishAccessRepository accessRepository;
    @Mock ImageProcessor processor;
    @Mock ImageStorage storage;
    @Mock CalendarCaches caches;

    @InjectMocks WishImageService service;

    Wish wish;
    MockMultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", new byte[]{1, 2, 3});

    @BeforeEach
    void setUp() {
        User owner = new User("Хозяин", "owner@test.local", "x");
        ReflectionTestUtils.setField(owner, "id", OWNER_ID);
        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.setImageKey("old");
        ReflectionTestUtils.setField(wish, "id", WISH_ID);
    }

    @Test
    void friendWithoutAccessGets404AndStorageIsNotTouched() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));
        when(accessRepository.existsByWishIdAndViewerId(WISH_ID, FRIEND_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.download(FRIEND_ID, WISH_ID, true))
                .isInstanceOf(WishNotFoundException.class);
        verifyNoInteractions(storage); // файл из MinIO даже не читали
    }

    @Test
    void friendWithAccessGetsThumb() {
        when(wishRepository.findById(WISH_ID)).thenReturn(Optional.of(wish));
        when(accessRepository.existsByWishIdAndViewerId(WISH_ID, FRIEND_ID)).thenReturn(true);
        when(storage.load("old", true)).thenReturn(new byte[]{42});

        assertThat(service.download(FRIEND_ID, WISH_ID, true)).containsExactly(42);
    }

    @Test
    void newImageReplacesOldOne() {
        when(wishRepository.findByIdAndOwnerId(WISH_ID, OWNER_ID)).thenReturn(Optional.of(wish));
        when(processor.process(file)).thenReturn(new ProcessedImage(new byte[]{1}, new byte[]{2}));

        service.upload(OWNER_ID, WISH_ID, file);

        assertThat(wish.getImageKey()).isNotEqualTo("old"); // новое случайное имя
        verify(storage).save(anyString(), any(ProcessedImage.class));
        verify(storage).delete("old");                       // старые файлы удалены
    }

    @Test
    void cannotUploadToSomeoneElsesWish() {
        when(wishRepository.findByIdAndOwnerId(WISH_ID, FRIEND_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.upload(FRIEND_ID, WISH_ID, file))
                .isInstanceOf(WishNotFoundException.class);
        verifyNoInteractions(processor, storage);
    }
}
