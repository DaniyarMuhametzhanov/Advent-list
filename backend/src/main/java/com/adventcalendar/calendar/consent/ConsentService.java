package com.adventcalendar.calendar.consent;

import com.adventcalendar.calendar.user.User;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConsentService {

    private final ConsentRepository consentRepository;
    // Версии документов задаются в application.properties. Поменяли текст политики — поменяйте версию
    private final String privacyVersion;
    private final String termsVersion;

    public ConsentService(ConsentRepository consentRepository,
                          @Value("${legal.privacy-version}") String privacyVersion,
                          @Value("${legal.terms-version}") String termsVersion) {
        this.consentRepository = consentRepository;
        this.privacyVersion = privacyVersion;
        this.termsVersion = termsVersion;
    }

    // Версию берём с сервера, а не из запроса: так её нельзя подменить
    @Transactional
    public void recordSignUpConsents(User user) {
        Instant now = Instant.now();
        consentRepository.save(new Consent(user, ConsentType.PRIVACY_POLICY, privacyVersion, now));
        consentRepository.save(new Consent(user, ConsentType.TERMS, termsVersion, now));
    }
}
