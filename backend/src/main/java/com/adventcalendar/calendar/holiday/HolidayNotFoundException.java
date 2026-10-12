package com.adventcalendar.calendar.holiday;

// Праздника с таким id нет — или он чужой. Чужие праздники для нас «не существуют»
public class HolidayNotFoundException extends RuntimeException {

    public HolidayNotFoundException(Long id) {
        super("Праздник с id " + id + " не найден");
    }
}
