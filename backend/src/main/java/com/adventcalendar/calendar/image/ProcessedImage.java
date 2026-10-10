package com.adventcalendar.calendar.image;

// Готовая к сохранению картинка: большая и маленькая, обе в формате JPEG
public record ProcessedImage(byte[] full, byte[] thumb) {
}
