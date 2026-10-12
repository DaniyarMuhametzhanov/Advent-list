package com.adventcalendar.calendar.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

// Самый простой юнит-тест: ни заглушек, ни Spring. Создали объект, вызвали метод, проверили результат
class ImageProcessorTest {

    private final ImageProcessor processor = new ImageProcessor();

    private static MockMultipartFile png(int width, int height) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
        return new MockMultipartFile("file", "photo.png", "image/png", out.toByteArray());
    }

    private static BufferedImage read(byte[] jpeg) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(jpeg));
    }

    @Test
    void bigImageIsShrunkAndKeepsProportions() throws IOException {
        ProcessedImage result = processor.process(png(3200, 1600));

        BufferedImage full = read(result.full());
        BufferedImage thumb = read(result.thumb());
        assertThat(full.getWidth()).isEqualTo(1600);
        assertThat(full.getHeight()).isEqualTo(800);
        assertThat(thumb.getWidth()).isEqualTo(300);
        assertThat(thumb.getHeight()).isEqualTo(150);
    }

    @Test
    void smallImageIsNotEnlarged() throws IOException {
        ProcessedImage result = processor.process(png(200, 100));

        assertThat(read(result.full()).getWidth()).isEqualTo(200);
        assertThat(read(result.thumb()).getWidth()).isEqualTo(200);
    }

    @Test
    void textFileIsRejected() {
        MockMultipartFile fake = new MockMultipartFile("file", "photo.png", "image/png", "привет".getBytes());

        assertThatThrownBy(() -> processor.process(fake))
                .isInstanceOf(BadImageException.class)
                .hasMessageContaining("не картинка");
    }

    @Test
    void emptyFileIsRejected() {
        MockMultipartFile empty = new MockMultipartFile("file", "photo.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> processor.process(empty)).hasMessage("Файл пустой");
    }

    @Test
    void tooWideImageIsRejected() {
        assertThatThrownBy(() -> processor.process(png(6000, 10)))
                .isInstanceOf(BadImageException.class)
                .hasMessageContaining("слишком большая");
    }
}
