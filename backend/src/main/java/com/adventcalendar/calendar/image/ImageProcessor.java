package com.adventcalendar.calendar.image;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

// Проверяет, что файл — настоящая картинка, и готовит две копии: большую и превью
@Component
public class ImageProcessor {

    static final long MAX_BYTES = 5 * 1024 * 1024; // 5 МБ
    static final int MAX_SIDE = 5000;              // больше 5000 точек по стороне не принимаем
    static final int FULL_SIDE = 1600;             // большая картинка для окна дня
    static final int THUMB_SIDE = 300;             // превью для клетки календаря

    public ProcessedImage process(MultipartFile file) {
        if (file.isEmpty()) {
            throw new BadImageException("Файл пустой");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadImageException("Картинка больше 5 МБ");
        }
        BufferedImage source = read(file);
        return new ProcessedImage(toJpeg(resize(source, FULL_SIDE)), toJpeg(resize(source, THUMB_SIDE)));
    }

    // Читаем файл как картинку. Не получилось — значит, это не картинка (что бы ни было написано в названии)
    private BufferedImage read(MultipartFile file) {
        try (ImageInputStream in = ImageIO.createImageInputStream(file.getInputStream())) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new BadImageException("Это не картинка. Подойдут JPG, PNG или GIF");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                // Сначала узнаём размер, и только потом читаем все точки
                if (reader.getWidth(0) > MAX_SIDE || reader.getHeight(0) > MAX_SIDE) {
                    throw new BadImageException("Картинка слишком большая: больше " + MAX_SIDE + " точек по стороне");
                }
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (BadImageException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw new BadImageException("Не получилось прочитать картинку");
        }
    }

    // Уменьшить так, чтобы длинная сторона была не больше maxSide. Маленькие картинки не увеличиваем
    private BufferedImage resize(BufferedImage source, int maxSide) {
        double scale = Math.min(1.0, (double) maxSide / Math.max(source.getWidth(), source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));

        BufferedImage result = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = result.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, width, height); // прозрачные места PNG станут белыми
            g.drawImage(source, 0, 0, width, height, null);
        } finally {
            g.dispose();
        }
        return result;
    }

    private byte[] toJpeg(BufferedImage image) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "jpg", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }
}
