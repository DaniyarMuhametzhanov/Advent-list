package com.adventcalendar.calendar.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.adventcalendar.calendar.TestcontainersConfiguration;
import com.adventcalendar.calendar.access.WishAccess;
import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.friend.Friendship;
import com.adventcalendar.calendar.friend.FriendshipRepository;
import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.user.User;
import com.adventcalendar.calendar.user.UserRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishRepository;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

// Правила для картинок: кто может загрузить, кто может посмотреть, какие файлы не принимаем.
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@Transactional
class ImageRulesTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository userRepository;
    @Autowired FriendshipRepository friendshipRepository;
    @Autowired WishRepository wishRepository;
    @Autowired WishAccessRepository accessRepository;

    User owner;    // хозяин календаря
    User friend;   // его друг
    User stranger; // чужой человек
    Wish wish;     // желание хозяина на 10 января 2030

    @BeforeEach
    void setUp() {
        owner = userRepository.save(new User("Хозяин", "owner@test.local", "x"));
        friend = userRepository.save(new User("Друг", "friend@test.local", "x"));
        stranger = userRepository.save(new User("Чужой", "stranger@test.local", "x"));
        friendshipRepository.save(Friendship.between(owner.getId(), friend.getId()));

        wish = new Wish(owner, LocalDate.of(2030, 1, 10));
        wish.update("Подарок", null);
        wish = wishRepository.save(wish);
    }

    private RequestPostProcessor as(User u) {
        return user(CurrentUser.from(u));
    }

    // Нарисовать картинку прямо в тесте: оранжевый прямоугольник width × height в формате PNG
    private static byte[] png(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.ORANGE);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    // Файл в поле "file", как его отправляет браузер
    private static MockMultipartFile file(byte[] bytes) {
        return new MockMultipartFile("file", "photo.png", "image/png", bytes);
    }

    // Хозяин загружает картинку к своему желанию
    private void upload(byte[] bytes) throws Exception {
        mvc.perform(multipart("/api/wishes/{id}/image", wish.getId()).file(file(bytes)).with(as(owner)).with(csrf()))
                .andExpect(status().isOk());
    }

    private String imageUrl(String size) {
        return "/api/wishes/" + wish.getId() + "/image?size=" + size;
    }

    private String calendarOfOwner() {
        return "/api/calendars/" + owner.getId() + "?month=2030-01";
    }

    // Скачать картинку как человек u и прочитать её, чтобы узнать размер
    private BufferedImage downloadAs(User u, String size) throws Exception {
        byte[] body = mvc.perform(get(imageUrl(size)).with(as(u)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG))
                .andReturn().getResponse().getContentAsByteArray();
        return ImageIO.read(new ByteArrayInputStream(body));
    }

    @Test
    void ownerUploadsAndGetsImageUrls() throws Exception {
        mvc.perform(multipart("/api/wishes/{id}/image", wish.getId()).file(file(png(800, 600)))
                        .with(as(owner)).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl").value(containsString("size=full")))
                .andExpect(jsonPath("$.thumbUrl").value(containsString("size=thumb")));

        assertThat(downloadAs(owner, "full").getWidth()).isEqualTo(800); // маленькую картинку не увеличиваем
    }

    @Test
    void bigImageIsResizedAndThumbIsSmall() throws Exception {
        upload(png(3200, 1600));

        BufferedImage full = downloadAs(owner, "full");
        assertThat(full.getWidth()).isEqualTo(1600);
        assertThat(full.getHeight()).isEqualTo(800);

        BufferedImage thumb = downloadAs(owner, "thumb");
        assertThat(thumb.getWidth()).isEqualTo(300);
        assertThat(thumb.getHeight()).isEqualTo(150);
    }

    @Test
    void friendWithoutAccessCannotGetImage() throws Exception {
        upload(png(400, 300));

        // По прямой ссылке — 404
        mvc.perform(get(imageUrl("full")).with(as(friend))).andExpect(status().isNotFound());
        mvc.perform(get(imageUrl("thumb")).with(as(friend))).andExpect(status().isNotFound());
        // И в календаре у закрытого дня нет даже адреса картинки
        mvc.perform(get(calendarOfOwner()).with(as(friend)))
                .andExpect(jsonPath("$[0].open").value(false))
                .andExpect(jsonPath("$[0].thumbUrl").doesNotExist())
                .andExpect(content().string(not(containsString("/image"))));
    }

    @Test
    void friendWithAccessGetsImage() throws Exception {
        upload(png(400, 300));
        accessRepository.save(new WishAccess(wish.getId(), friend.getId()));

        mvc.perform(get(calendarOfOwner()).with(as(friend)))
                .andExpect(jsonPath("$[0].thumbUrl").value(containsString("size=thumb")));
        assertThat(downloadAs(friend, "thumb").getWidth()).isEqualTo(300);
    }

    @Test
    void strangerCannotGetImage() throws Exception {
        upload(png(400, 300));
        mvc.perform(get(imageUrl("full")).with(as(stranger))).andExpect(status().isNotFound());
    }

    @Test
    void onlyOwnerCanUpload() throws Exception {
        mvc.perform(multipart("/api/wishes/{id}/image", wish.getId()).file(file(png(400, 300)))
                        .with(as(friend)).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void textFileIsRejected() throws Exception {
        // Назвали файл photo.png и сказали «это image/png», но внутри обычный текст
        MockMultipartFile fake = new MockMultipartFile("file", "photo.png", "image/png", "привет".getBytes());
        mvc.perform(multipart("/api/wishes/{id}/image", wish.getId()).file(fake).with(as(owner)).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("не картинка")));
    }

    @Test
    void tooBigFileIsRejected() throws Exception {
        byte[] sixMegabytes = new byte[6 * 1024 * 1024];
        mvc.perform(multipart("/api/wishes/{id}/image", wish.getId()).file(file(sixMegabytes))
                        .with(as(owner)).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Картинка больше 5 МБ"));
    }
}
