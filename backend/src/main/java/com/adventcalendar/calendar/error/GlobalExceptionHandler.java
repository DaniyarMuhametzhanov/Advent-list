package com.adventcalendar.calendar.error;

import com.adventcalendar.calendar.access.AccessException;
import com.adventcalendar.calendar.access.AccessRequestNotFoundException;
import com.adventcalendar.calendar.friend.FriendRequestException;
import com.adventcalendar.calendar.friend.FriendRequestNotFoundException;
import com.adventcalendar.calendar.friend.NotFriendsException;
import com.adventcalendar.calendar.image.BadImageException;
import com.adventcalendar.calendar.user.UserNotFoundException;
import com.adventcalendar.calendar.auth.EmailTakenException;
import org.springframework.security.core.AuthenticationException;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(WishNotFoundException.class)
    public ProblemDetail handleNotFound(WishNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }
    @ExceptionHandler(EmailTakenException.class)
    public ProblemDetail handleEmailTaken(EmailTakenException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler({UserNotFoundException.class, FriendRequestNotFoundException.class,
            AccessRequestNotFoundException.class})
    public ProblemDetail handleFriendNotFound(RuntimeException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler({FriendRequestException.class, AccessException.class})
    public ProblemDetail handleConflict(RuntimeException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(NotFriendsException.class)
    public ProblemDetail handleNotFriends(NotFriendsException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    @ExceptionHandler(AuthenticationException.class)
    public ProblemDetail handleBadLogin(AuthenticationException ex) {
        // Не говорим, что именно не так (email или пароль), чтобы нельзя было подбирать email
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Неверный email или пароль");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(error -> errors.put(error.getField(), error.getDefaultMessage()));

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Данные заполнены неверно");
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Неверное значение '" + ex.getValue() + "' для параметра " + ex.getName());
    }

    @ExceptionHandler(BadImageException.class)
    public ProblemDetail handleBadImage(BadImageException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    // Файл больше, чем разрешено в application.properties. До нашего кода такой файл даже не доходит
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ProblemDetail handleTooLarge(MaxUploadSizeExceededException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONTENT_TOO_LARGE, "Картинка больше 5 МБ");
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ProblemDetail handleNoFile(MissingServletRequestPartException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Файл не выбран");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadable(HttpMessageNotReadableException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Не получилось прочитать JSON в теле запроса");
    }
}