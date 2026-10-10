# Этап 9. Картинки

## 🔹 Что делаем и зачем

Сейчас картинка желания живёт только в браузере (`useFakeStore`). Обновил страницу, и картинки нет. Друг её вообще никогда не видит.

На этом этапе картинки переезжают на сервер:

1. **Хранилище файлов.** Запускаем в Docker программу MinIO. Это отдельный «склад» для файлов рядом с базой.
2. **Загрузка.** Браузер отправляет файл на наш сервер. Сервер проверяет, что это настоящая картинка не больше 5 МБ, делает большую копию и маленькое превью и кладёт обе в MinIO.
3. **Защищённая отдача.** Картинку получает только тот, кто имеет право видеть день: владелец или друг с доступом. Остальным `404`, даже если они знают точный адрес.
4. **Тесты.** Автотесты доказывают, что закрытую картинку не получить ни из календаря, ни по прямой ссылке.

Аналогия 🏦: база данных — это журнал на стойке банка, а MinIO — хранилище с ячейками.
В журнале записано «у желания 5 картинка в ячейке № abc». Ключ от хранилища есть только у сервера.
Клиент не ходит в хранилище сам: он просит кассира (сервер), а кассир сначала проверяет, имеет ли клиент право на эту ячейку.

## 🔹 Новые слова

| Термин | Простыми словами |
|---|---|
| **Объектное хранилище** (object storage) | склад для файлов. Каждый файл лежит под своим именем (**ключом**, key). Папок по-настоящему нет, `wishes/abc.jpg` — это просто имя |
| **S3** | способ общения с таким складом, который придумал Amazon. Его понимают и Amazon, и MinIO, и многие другие. Пишем код один раз, а склад потом можно поменять |
| **MinIO** | бесплатная программа-склад, которая говорит на языке S3. Работает у тебя в Docker |
| **Корзина** (bucket) | один отдельный склад внутри MinIO. У нас одна корзина: `wish-images` |
| **multipart/form-data** | формат запроса, в котором можно отправить файл. Обычный JSON для файлов не подходит |
| **Превью** (thumbnail) | маленькая копия картинки. Клетке календаря не нужна фотография на 5 МБ, хватит 300 точек |
| **Перекодирование** (re-encoding) | прочитать картинку и сохранить её заново в нашем формате (JPEG). Заодно пропадает всё лишнее, что было в файле |
| **EXIF** | скрытые данные внутри фото: модель телефона, дата и часто **координаты места съёмки**. После перекодирования их нет |
| **Кэш браузера** (browser cache) | браузер запоминает скачанную картинку и в следующий раз не скачивает её заново |

## 🔹 Как будет устроено

### Путь картинки

```
Загрузка:
Браузер ──POST файл──▶ Сервер ──проверка, уменьшение──▶ MinIO
                          │                            wishes/abc.jpg        (большая, до 1600 точек)
                          │                            wishes/abc-thumb.jpg  (превью, до 300 точек)
                          └──▶ PostgreSQL: wishes.image_key = 'abc'

Просмотр:
Браузер ──GET /api/wishes/5/image──▶ Сервер ──есть право?──нет──▶ 404
                                               │
                                               да
                                               ▼
                                    берёт файл из MinIO и отдаёт браузеру
```

Почему так, а не проще:

- **Почему не в базе?** Можно сохранить картинку прямо в PostgreSQL, но база для этого не создана: она станет огромной, а резервные копии — медленными.
  Файлам — склад, записям — база.
- **Почему браузер не берёт картинку из MinIO сам?** Тогда MinIO должен быть открыт для всех, и любой, кто узнал адрес, увидит картинку закрытого дня.
  У нас MinIO знает только сервер, а сервер проверяет права **при каждом запросе**.
- **Почему имя файла случайное** (`UUID`)? Его нельзя угадать. И у каждой новой картинки новое имя, поэтому браузер не покажет старую из кэша.

### Адреса (эндпоинты)

| Запрос | Кто может | Что делает | Ответ |
|---|---|---|---|
| `POST /api/wishes/{id}/image` | владелец | загрузить или заменить картинку | желание с адресами картинки |
| `GET /api/wishes/{id}/image?size=full` | владелец или друг с доступом | большая картинка | байты JPEG |
| `GET /api/wishes/{id}/image?size=thumb` | владелец или друг с доступом | превью | байты JPEG |

И старые ответы получают два новых поля, `imageUrl` и `thumbUrl`:

- `GET /api/wishes` — у каждого моего желания;
- `GET /api/calendars/{userId}?month=...` — у **открытого** дня друга. У закрытого там `null`, как у названия.

### Правила, которые проверяет сервер

- загрузить картинку может **только владелец**. Чужому желанию — `404`;
- принимаем только настоящие картинки JPG, PNG или GIF. Сервер **читает содержимое файла**, а не верит названию `photo.png`. Не картинка — `400`;
- файл не больше 5 МБ (`400` или `413`), сторона не больше 5000 точек (`400`);
- посмотреть картинку может только владелец или друг, которому открыт день. Остальным `404`;
- удалили желание — удаляются и его файлы в MinIO. Заменили картинку — старые файлы удаляются.

## 🔹 Шаг 1. MinIO в Docker

### 1.1. `docker-compose.yml`

Замени файл в корне `advent-list` целиком:

```yaml
services:
  postgres:
    image: postgres:17
    container_name: advent-postgres
    environment:
      POSTGRES_DB: advent
      POSTGRES_USER: advent
      POSTGRES_PASSWORD: advent
    ports:
      - "5434:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

  minio:
    image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z
    container_name: advent-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: advent
      MINIO_ROOT_PASSWORD: advent-secret
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

volumes:
  postgres-data:
  minio-data:
```

Разберём новое:

- `image: pgsty/minio:...` — готовая программа MinIO. Сама компания MinIO в 2025 году перестала выкладывать бесплатные образы для Docker,
  поэтому берём сборку того же MinIO от сообщества (проект Pigsty). Номер версии написан полностью, чтобы у всех запускалось одно и то же.
- `command: server /data --console-address ":9001"` — «работай как сервер, файлы храни в папке `/data`, а сайт-пульт открой на порту 9001».
- `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` — логин и пароль от MinIO. Пароль не короче 8 символов, иначе MinIO не запустится.
  Это пароль только для твоего компьютера. Для настоящего сайта на этапе 14 вынесем секреты в переменные окружения.
- Порт `9000` — сюда стучится наш сервер (язык S3). Порт `9001` — сайт-пульт для тебя.
- `minio-data` — том (**volume**): файлы переживут перезапуск контейнера, как данные PostgreSQL.

### 1.2. Запусти и посмотри

В корне `advent-list`:

```
docker compose up -d
docker compose ps
```

Должно быть два контейнера: `advent-postgres` и `advent-minio`, у обоих статус `Up` (или `running`).

Открой в браузере **http://localhost:9001**, войди: `advent` / `advent-secret`. Пока там пусто.
Корзину `wish-images` руками не создавай: её создаст наш сервер при запуске (шаг 4.2).

## 🔹 Шаг 2. `backend/pom.xml`: библиотека для S3

Найди зависимость `spring-boot-starter-webmvc-test` и **сразу над ней** добавь:

```xml
		<dependency>
			<groupId>software.amazon.awssdk</groupId>
			<artifactId>s3</artifactId>
			<version>2.55.0</version>
		</dependency>
```

- Это официальная библиотека Amazon для языка S3. С MinIO она тоже работает: язык один.
- `<version>` пишем сами. Версии библиотек Spring подбирает автоматически, а эта библиотека не из Spring.

Нажми в IntelliJ **Load Maven Changes** (буква «m» со стрелкой справа вверху). Первый раз скачивание займёт минуту.

Уменьшать картинки будем без новых библиотек: в Java для этого уже есть встроенные `ImageIO` и `BufferedImage`.

## 🔹 Шаг 3. `application.properties`

Добавь в конец `backend/src/main/resources/application.properties`:

```properties
# Загрузка файлов: картинка до 5 МБ (весь запрос чуть больше — там ещё служебные строки)
spring.servlet.multipart.max-file-size=5MB
spring.servlet.multipart.max-request-size=6MB
# Слишком большой файл Tomcat дочитает до конца и ответит 413, а не оборвёт соединение
server.tomcat.max-swallow-size=10MB

# Хранилище картинок (MinIO из docker-compose.yml)
storage.endpoint=http://localhost:9000
storage.region=us-east-1
storage.access-key=advent
storage.secret-key=advent-secret
storage.bucket=wish-images
```

- `max-file-size=5MB` — Spring сам не пропустит файл больше 5 МБ. Без этой строки предел всего **1 МБ**, и обычное фото с телефона не загрузится.
- `max-swallow-size` — техническая настройка Tomcat (это веб-сервер внутри Spring Boot). Без неё на слишком большой файл браузер иногда получает
  «соединение оборвано» вместо понятной ошибки `413`.
- `storage.*` — наши собственные настройки: где MinIO, логин, пароль, имя корзины. Логин и пароль те же, что в `docker-compose.yml`.
  `region` для MinIO ни на что не влияет, но библиотека Amazon без него не работает.

## 🔹 Шаг 4. База и сущность

### 4.1. Миграция `V5__wish_images.sql`

Создай `backend/src/main/resources/db/migration/V5__wish_images.sql`:

```sql
-- Имя картинки желания в хранилище MinIO. NULL = картинки нет
ALTER TABLE wishes ADD COLUMN image_key VARCHAR(100);
```

В базе храним **не картинку**, а только её имя на складе. У старых желаний картинки нет, у них будет `NULL`.

### 4.2. `wish/Wish.java`

Под полем `updatedAt` добавь новое поле:

```java
    // Имя картинки в хранилище MinIO. null = картинки нет
    @Column(name = "image_key", length = 100)
    private String imageKey;
```

И в конец класса, после `getUpdatedAt()`, два метода:

```java
    public String getImageKey() {
        return imageKey;
    }

    public void setImageKey(String imageKey) {
        this.imageKey = imageKey;
    }
```

## 🔹 Шаг 5. Пакет `image`: подключаемся к MinIO

Создай пакет `com.adventcalendar.calendar.image`. Все файлы шагов 5–8 кладём в него.

### 5.1. `StorageProperties.java` — настройки `storage.*`

```java
package com.adventcalendar.calendar.image;

import org.springframework.boot.context.properties.ConfigurationProperties;

// Настройки из application.properties, которые начинаются со storage.
// storage.access-key → accessKey и т. д.
@ConfigurationProperties(prefix = "storage")
public record StorageProperties(String endpoint, String region, String accessKey, String secretKey, String bucket) {
}
```

`@ConfigurationProperties` — Spring сам прочитает из `application.properties` все строки `storage.что-то` и положит их в эту запись (**record**).
`storage.access-key` превращается в поле `accessKey`: дефисы Spring понимает сам.
Так настройки собраны в одном месте, а не раскиданы по коду строками `"http://localhost:9000"`.

### 5.2. `StorageConfig.java` — клиент S3 и корзина

```java
package com.adventcalendar.calendar.image;

import java.net.URI;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;

@Configuration
@EnableConfigurationProperties(StorageProperties.class)
public class StorageConfig {

    // Клиент S3: через него сервер кладёт и достаёт файлы из MinIO
    @Bean
    public S3Client s3Client(StorageProperties props) {
        return S3Client.builder()
                .endpointOverride(URI.create(props.endpoint()))  // не Amazon, а наш MinIO
                .region(Region.of(props.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(props.accessKey(), props.secretKey())))
                .forcePathStyle(true) // адрес вида localhost:9000/корзина/файл — так понимает MinIO
                // Контрольные суммы считаем только там, где их требует сам протокол S3.
                // Так клиент от Amazon точно дружит с другими S3-хранилищами
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .build();
    }

    // При старте сервера: если «корзины» для картинок ещё нет, создаём её
    @Bean
    public ApplicationRunner createBucket(S3Client s3, StorageProperties props) {
        return args -> {
            try {
                s3.headBucket(b -> b.bucket(props.bucket()));
            } catch (NoSuchBucketException e) {
                s3.createBucket(b -> b.bucket(props.bucket()));
            }
        };
    }
}
```

Разберём:

- `@Configuration` + `@Bean` — «Spring, вот как создать объект `S3Client`. Создай его один раз и отдавай всем, кому нужен» (это **бин**, как репозитории и сервисы с этапа 2).
- `@EnableConfigurationProperties(StorageProperties.class)` — включает чтение настроек из шага 5.1.
- `endpointOverride` — без этой строки библиотека пошла бы на серверы Amazon. Мы говорим: «иди на `localhost:9000`».
- `forcePathStyle(true)` — адрес файла вида `localhost:9000/wish-images/файл`. Amazon по умолчанию ставит корзину в начало адреса (`wish-images.localhost`), а MinIO у нас так не настроен.
- `ApplicationRunner` — код, который Spring выполнит **один раз сразу после запуска**. `headBucket` — «есть такая корзина?».
  Нет (`NoSuchBucketException`) → `createBucket`. Так не нужно ничего создавать руками.

## 🔹 Шаг 6. `ImageStorage.java` — склад

```java
package com.adventcalendar.calendar.image;

import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;

// Всё общение с хранилищем картинок — в одном месте.
// У каждой картинки два файла: большой (full) и маленькое превью (thumb)
@Component
public class ImageStorage {

    private final S3Client s3;
    private final String bucket;

    public ImageStorage(S3Client s3, StorageProperties props) {
        this.s3 = s3;
        this.bucket = props.bucket();
    }

    public void save(String imageKey, ProcessedImage image) {
        put(fullKey(imageKey), image.full());
        put(thumbKey(imageKey), image.thumb());
    }

    public byte[] load(String imageKey, boolean thumb) {
        String key = thumb ? thumbKey(imageKey) : fullKey(imageKey);
        return s3.getObjectAsBytes(b -> b.bucket(bucket).key(key)).asByteArray();
    }

    public void delete(String imageKey) {
        s3.deleteObject(b -> b.bucket(bucket).key(fullKey(imageKey)));
        s3.deleteObject(b -> b.bucket(bucket).key(thumbKey(imageKey)));
    }

    private void put(String key, byte[] bytes) {
        s3.putObject(b -> b.bucket(bucket).key(key).contentType("image/jpeg"), RequestBody.fromBytes(bytes));
    }

    private static String fullKey(String imageKey) {
        return "wishes/" + imageKey + ".jpg";
    }

    private static String thumbKey(String imageKey) {
        return "wishes/" + imageKey + "-thumb.jpg";
    }
}
```

И рядом маленькая запись `ProcessedImage.java`:

```java
package com.adventcalendar.calendar.image;

// Готовая к сохранению картинка: большая и маленькая, обе в формате JPEG
public record ProcessedImage(byte[] full, byte[] thumb) {
}
```

Разберём:

- Всё, что касается MinIO, — **только в этом классе**. Остальной код просто говорит «сохрани», «дай», «удали» и не знает про S3.
  Если когда-нибудь склад сменится, менять придётся один файл.
- `save` кладёт два файла: `wishes/abc.jpg` и `wishes/abc-thumb.jpg`. `abc` — это `imageKey` из базы.
- `b -> b.bucket(bucket).key(key)` — короткая запись запроса (**лямбда**): «в корзине такой-то, файл такой-то».
- `RequestBody.fromBytes(bytes)` — «вот содержимое файла, байт за байтом».
- `getObjectAsBytes(...).asByteArray()` — скачать файл целиком в память. Для наших картинок (сотни килобайт) это нормально.

## 🔹 Шаг 7. `ImageProcessor.java` — проверка и уменьшение 🔍

Сначала маленькая ошибка «файл не подходит», `BadImageException.java`:

```java
package com.adventcalendar.calendar.image;

// Файл не подходит: не картинка, слишком большой, пустой. Ответ 400
public class BadImageException extends RuntimeException {

    public BadImageException(String message) {
        super(message);
    }
}
```

Теперь сам обработчик:

```java
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
```

Разберём по шагам:

1. `file.isEmpty()` и `file.getSize() > MAX_BYTES` — самое дешёвое сначала: пустой или большой файл даже не читаем.
2. `read(file)` — главная проверка. Мы **не смотрим** на имя `photo.png` и на тип `image/png`, который прислал браузер: их легко подделать.
   `ImageIO.getImageReaders(in)` смотрит на первые байты файла и ищет, кто умеет такое читать.
   Никто не умеет → это не картинка (или формат, который Java не знает, например WebP) → `400`.
3. `reader.getWidth(0)` до `reader.read(0)` — сначала узнаём размер, читая только заголовок файла, и лишь потом все точки.
   Зачем: PNG на 1 МБ может описывать картинку 30 000 × 30 000. В памяти это 3,6 ГБ, сервер упадёт.
   Такой файл называют **«бомбой»** (decompression bomb). Проверка размера заранее защищает от неё.
4. `catch (BadImageException e) { throw e; }` — наше сообщение пропускаем дальше как есть. А любую другую ошибку чтения (битый файл)
   превращаем в понятное «Не получилось прочитать картинку». Порядок `catch` важен: сначала частный случай, потом общий.
5. `resize` — уменьшаем так, чтобы длинная сторона стала не больше 1600 (или 300). `Math.min(1.0, ...)` — маленькие картинки **не увеличиваем**.
   Рисуем на новом холсте `TYPE_INT_RGB` (без прозрачности), поэтому прозрачные места PNG сначала заливаем белым.
6. `toJpeg` — сохраняем результат заново в JPEG (**перекодирование**). Отсюда два бонуса:
   - в файле остаются только точки картинки. Скрытые данные (**EXIF**: модель телефона, координаты, где сделано фото) пропадают;
   - если в файл что-то подмешали, это тоже не переживёт перекодирование: на склад попадает картинка, которую нарисовал **наш** код.

💡 Минус перекодирования: GIF теряет анимацию (остаётся первый кадр). Для превью подарка это не страшно.

## 🔹 Шаг 8. Загрузка и отдача

### 8.1. `ImageUrls.java` — адреса картинки

```java
package com.adventcalendar.calendar.image;

import com.adventcalendar.calendar.wish.Wish;

// Адреса картинки желания для фронтенда. Если картинки нет — null
public final class ImageUrls {

    private ImageUrls() {
    }

    public static String full(Wish wish) {
        return url(wish, "full");
    }

    public static String thumb(Wish wish) {
        return url(wish, "thumb");
    }

    private static String url(Wish wish, String size) {
        if (wish.getImageKey() == null) {
            return null;
        }
        // v=... меняется с каждой новой картинкой. Так браузер не покажет старую картинку из своего кэша
        return "/api/wishes/" + wish.getId() + "/image?size=" + size + "&v=" + wish.getImageKey();
    }
}
```

- Адрес строит **сервер**, а фронтенд просто подставляет его в `<img src=...>`. Если завтра адрес поменяется, фронтенд трогать не придётся.
- `&v=abc...` сервер не читает. Это метка для браузера: новая картинка → новое имя → новый адрес, и браузер точно скачает её заново, а не покажет старую из кэша.
- `private ImageUrls() {}` — запрещаем создавать объекты этого класса: в нём только статические методы-помощники.

### 8.2. `WishImageService.java` — правила

```java
package com.adventcalendar.calendar.image;

import com.adventcalendar.calendar.access.WishAccessRepository;
import com.adventcalendar.calendar.wish.Wish;
import com.adventcalendar.calendar.wish.WishNotFoundException;
import com.adventcalendar.calendar.wish.WishRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class WishImageService {

    private final WishRepository wishRepository;
    private final WishAccessRepository accessRepository;
    private final ImageProcessor processor;
    private final ImageStorage storage;

    public WishImageService(WishRepository wishRepository, WishAccessRepository accessRepository,
                            ImageProcessor processor, ImageStorage storage) {
        this.wishRepository = wishRepository;
        this.accessRepository = accessRepository;
        this.processor = processor;
        this.storage = storage;
    }

    // Загрузить картинку к своему желанию. Старая картинка (если была) удаляется
    @Transactional
    public void upload(Long me, Long wishId, MultipartFile file) {
        Wish wish = wishRepository.findByIdAndOwnerId(wishId, me)
                .orElseThrow(() -> new WishNotFoundException(wishId));
        ProcessedImage image = processor.process(file);

        String oldKey = wish.getImageKey();
        String newKey = UUID.randomUUID().toString(); // случайное имя: его нельзя угадать
        storage.save(newKey, image);
        wish.setImageKey(newKey);
        if (oldKey != null) {
            storage.delete(oldKey);
        }
    }

    // Отдать картинку. Главное правило этапа: только владельцу или другу, которому открыт день
    @Transactional(readOnly = true)
    public byte[] download(Long viewerId, Long wishId, boolean thumb) {
        Wish wish = wishRepository.findById(wishId)
                .orElseThrow(() -> new WishNotFoundException(wishId));
        boolean isOwner = wish.getOwner().getId().equals(viewerId);
        // Нет доступа — отвечаем 404, как будто картинки нет вовсе. Не подсказываем, что она существует
        if (!isOwner && !accessRepository.existsByWishIdAndViewerId(wishId, viewerId)) {
            throw new WishNotFoundException(wishId);
        }
        if (wish.getImageKey() == null) {
            throw new WishNotFoundException(wishId);
        }
        return storage.load(wish.getImageKey(), thumb);
    }
}
```

Разберём:

- `upload`. `findByIdAndOwnerId` — тот же приём, что на этапе 8: чужое желание просто «не находится» → `404`.
  Потом проверка файла, сохранение на склад, запись нового имени в желание. `@Transactional` сохранит `imageKey` в базу сам,
  `save` вызывать не нужно (Hibernate замечает изменения в загруженном объекте — **dirty checking**, было на этапе 7).
- Порядок «сначала новые файлы, потом старые удалить» выбран специально: если что-то сломается посередине, у желания всё равно останется рабочая картинка.
- `download` — **главное правило этапа**. Владелец смотрит всегда. Остальные — только если в `wish_access` есть строка «этому человеку открыт этот день».
  Нет строки → `404`, будто картинки нет. Тот же ответ, что для несуществующей картинки: по ответу нельзя понять, есть ли там что-то.
- Отдельно проверять «друг ли это» не нужно: доступ можно выдать только другу, а при удалении из друзей доступы стираются (этап 8).

### 8.3. `WishImageController.java` — адреса

```java
package com.adventcalendar.calendar.image;

import com.adventcalendar.calendar.security.CurrentUser;
import com.adventcalendar.calendar.wish.WishResponse;
import com.adventcalendar.calendar.wish.WishService;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/wishes/{id}/image")
public class WishImageController {

    private final WishImageService imageService;
    private final WishService wishService;

    public WishImageController(WishImageService imageService, WishService wishService) {
        this.imageService = imageService;
        this.wishService = wishService;
    }

    // POST /api/wishes/5/image — тело запроса: форма с файлом в поле "file"
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public WishResponse upload(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id,
                               @RequestParam("file") MultipartFile file) {
        imageService.upload(me.id(), id, file);
        return wishService.findById(me.id(), id); // желание уже с адресами новой картинки
    }

    // GET /api/wishes/5/image?size=thumb — сама картинка (байты JPEG)
    @GetMapping
    public ResponseEntity<byte[]> download(@AuthenticationPrincipal CurrentUser me, @PathVariable Long id,
                                           @RequestParam(defaultValue = "full") String size) {
        byte[] bytes = imageService.download(me.id(), id, "thumb".equals(size));
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                // Браузер может 10 минут держать картинку у себя, но только для этого человека (private)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePrivate())
                .body(bytes);
    }
}
```

- `consumes = MediaType.MULTIPART_FORM_DATA_VALUE` — этот адрес принимает только формы с файлами.
- `@RequestParam("file") MultipartFile file` — Spring сам достаёт из формы поле `file`. **`MultipartFile`** — «файл, который пришёл в запросе»: имя, размер, содержимое.
- После загрузки возвращаем желание целиком (`wishService.findById`): фронтенд сразу получит новые `imageUrl` и `thumbUrl`.
- `ResponseEntity<byte[]>` — ответ, где мы сами задаём всё: тело (байты картинки), тип `image/jpeg` и заголовки.
- `CacheControl...cachePrivate()` — «браузер, можешь 10 минут не скачивать эту картинку заново, но только для этого человека».
  `private` важно: промежуточные серверы (например, прокси в офисе) не должны сохранять у себя чужую закрытую картинку.

💡 Spring Security сам добавляет к ответу заголовок `X-Content-Type-Options: nosniff`: браузер обязан считать ответ картинкой, раз так сказал сервер,
и не «угадывать», что внутри может быть страница со скриптом.

## 🔹 Шаг 9. Ответы с адресами картинок

### 9.1. `wish/WishResponse.java`

Замени целиком:

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.image.ImageUrls;
import java.time.LocalDate;
import java.util.List;

public record WishResponse(
        Long id,
        LocalDate date,
        String title,
        String comment,
        List<Long> access, // id друзей, которым открыт этот день. Это видит только владелец
        String imageUrl,   // большая картинка или null
        String thumbUrl    // превью или null
) {

    public static WishResponse from(Wish wish, List<Long> access) {
        return new WishResponse(wish.getId(), wish.getDate(), wish.getTitle(), wish.getComment(), access,
                ImageUrls.full(wish), ImageUrls.thumb(wish));
    }
}
```

### 9.2. `wish/CalendarDayResponse.java`

Замени целиком:

```java
package com.adventcalendar.calendar.wish;

import com.adventcalendar.calendar.image.ImageUrls;
import java.time.LocalDate;

// Один занятый день в календаре. Если open = false, название, комментарий и адреса картинки не отдаём (null).
// requested = true: я уже попросил доступ к этому дню и жду ответа
public record CalendarDayResponse(Long wishId, LocalDate date, boolean open, boolean requested,
                                  String title, String comment, String imageUrl, String thumbUrl) {

    public static CalendarDayResponse open(Wish wish) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), true, false, wish.getTitle(), wish.getComment(),
                ImageUrls.full(wish), ImageUrls.thumb(wish));
    }

    public static CalendarDayResponse closed(Wish wish, boolean requested) {
        return new CalendarDayResponse(wish.getId(), wish.getDate(), false, requested, null, null, null, null);
    }
}
```

У закрытого дня (`closed`) адреса картинок — `null`, как название и комментарий. Друг без доступа даже не узнает, есть ли у дня картинка.

## 🔹 Шаг 10. `wish/WishService.java`: удалить файлы вместе с желанием

Доступы и запросы при удалении желания стирает сама база (`ON DELETE CASCADE`). А про файлы в MinIO база ничего не знает: их удаляем сами.

1. В импорты добавь:

```java
import com.adventcalendar.calendar.image.ImageStorage;
```

2. Добавь поле и параметр в конструктор. Начало класса станет таким:

```java
    private final WishRepository wishRepository;
    private final UserRepository userRepository;
    private final FriendService friendService;
    private final WishAccessRepository accessRepository;
    private final AccessRequestRepository requestRepository;
    private final ImageStorage imageStorage;

    public WishService(WishRepository wishRepository, UserRepository userRepository, FriendService friendService,
                       WishAccessRepository accessRepository, AccessRequestRepository requestRepository,
                       ImageStorage imageStorage) {
        this.wishRepository = wishRepository;
        this.userRepository = userRepository;
        this.friendService = friendService;
        this.accessRepository = accessRepository;
        this.requestRepository = requestRepository;
        this.imageStorage = imageStorage;
    }
```

3. Замени метод `delete`:

```java
    // Доступы и запросы доступа к желанию удалит сама база: ON DELETE CASCADE в V4__access.sql.
    // А файлы картинки в MinIO база не видит — их удаляем сами
    @Transactional
    public void delete(Long ownerId, Long id) {
        Wish wish = wishRepository.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new WishNotFoundException(id));
        wishRepository.delete(wish);
        if (wish.getImageKey() != null) {
            imageStorage.delete(wish.getImageKey());
        }
    }
```

## 🔹 Шаг 11. `error/GlobalExceptionHandler.java` — новые ошибки

В импорты добавь:

```java
import com.adventcalendar.calendar.image.BadImageException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
```

И три обработчика (например, перед `handleUnreadable`):

```java
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
```

- `BadImageException` → `400` с нашим текстом («Это не картинка...», «Картинка больше 5 МБ»).
- `MaxUploadSizeExceededException` → `413` (**Content Too Large**, «слишком большое тело запроса»). Это Spring сам отказался принимать файл больше 5 МБ, до нашего кода дело не дошло.
- `MissingServletRequestPartException` → `400`: в форме нет поля `file`.

## 🔹 Шаг 12. Автотесты на картинки 🧪

Создай пакет `com.adventcalendar.calendar.image` **в папке тестов** (`backend/src/test/java/...`, как `access` на этапе 8) и в нём `ImageRulesTest.java`:

```java
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
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

// Правила для картинок: кто может загрузить, кто может посмотреть, какие файлы не принимаем.
// Нужны запущенные PostgreSQL и MinIO: docker compose up -d
@SpringBootTest
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
```

Разберём новое (остальное как в `AccessRulesTest`):

- `png(width, height)` — картинку для теста **рисуем прямо в коде**: создаём холст, заливаем оранжевым, сохраняем как PNG в память.
  Так тесту не нужны файлы на диске, а размер мы знаем точно.
- `MockMultipartFile("file", "photo.png", "image/png", bytes)` — поддельный файл в поле `file`, как будто его выбрали в браузере.
- `multipart(...)` вместо `post(...)` — запрос в формате формы с файлом.
- `downloadAs` — скачиваем картинку как определённый человек и снова читаем её через `ImageIO`, чтобы проверить ширину и высоту.
- Что доказываем:
  - `bigImageIsResizedAndThumbIsSmall` — 3200 × 1600 превращается в 1600 × 800 и превью 300 × 150;
  - `friendWithoutAccessCannotGetImage` — друг без доступа получает `404` по прямой ссылке, а в календаре у закрытого дня нет даже строки `/image`;
  - `textFileIsRejected` — файл называется `photo.png`, но внутри текст «привет». Сервер не верит названию → `400`;
  - `tooBigFileIsRejected` — 6 МБ → `400` «Картинка больше 5 МБ».

⚠️ Этому тесту нужен работающий MinIO: он по-настоящему кладёт файлы на склад. Перед запуском `docker compose up -d`.
База после теста откатывается, а файлы в MinIO остаются. Это просто мусор в тестовой корзине, он ни на что не влияет.
На этапе 10 перенесём тесты на временные контейнеры (Testcontainers), и мусора не будет.

### Запусти тесты

IntelliJ: зелёный ▶ рядом с `class ImageRulesTest` → **Run**. Или в папке `backend`:

```
.\mvnw test
```

Ожидаемый результат: **20 тестов зелёные** (8 новых, 11 из этапа 8 и `contextLoads`). В терминале: `Tests run: 20, Failures: 0, Errors: 0`.

🔎 Попробуй сломать специально: в `WishImageService.download` удали условие `if (!isOwner && ...) { throw ... }` и запусти тесты.
Упадут `friendWithoutAccessCannotGetImage` и `strangerCannotGetImage`. Потом верни как было.

## 🔹 Шаг 13. Проверь сервер в Postman 📮

Перезапусти `BackendApplication`. В логе: `Migrating schema "public" to version "5 - wish images"`.
Открой http://localhost:9001: появилась корзина `wish-images`.

Как раньше: `GET /api/me` за токеном, заголовок `X-XSRF-TOKEN` для `POST` и `DELETE`. Номера желаний смотри в `GET /api/wishes`.

**Как Анна** (`anna@example.com` / `password123`):

1. `POST http://localhost:8080/api/wishes/{id дня 5 октября}/image`.
   Вкладка **Body** → **form-data** → в колонке Key напиши `file`, справа от него в выпадающем списке выбери **File** (вместо Text) →
   в Value нажми **Select Files** и выбери любую картинку JPG или PNG. → `200`, в ответе `imageUrl` и `thumbUrl`.
2. Открой `GET` по адресу из `thumbUrl` (допиши `http://localhost:8080` в начало). Postman покажет саму картинку, маленькую.
3. Загрузи тем же способом **текстовый файл** → `400` «Это не картинка...». Файл больше 5 МБ → `413`.
4. Загрузи картинку и к дню **24 октября** (он закрыт для Бориса). Запомни его `imageUrl`.
5. В MinIO (http://localhost:9001 → корзина `wish-images` → папка `wishes`) видно по два файла на картинку: обычный и `-thumb`.

**Как Борис:**

1. `GET /api/calendars/1?month=2026-10` → у 5 октября есть `thumbUrl`, у 24 октября `"thumbUrl": null`.
2. `GET` по `imageUrl` дня 24 октября, который ты запомнил за Анну → `404`. Знать адрес недостаточно: нужен доступ.
3. `GET` по `imageUrl` дня 5 октября → `200`, картинка.

## 🔹 Шаг 14. Фронтенд: отправка файла и новые поля

### 14.1. `src/api/http.ts`: файлы без JSON-заголовка

Найди строку

```ts
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
```

и замени её на

```ts
    // Файл (FormData) отправляем без своего Content-Type: браузер сам поставит
    // multipart/form-data и границу между частями формы. Всё остальное — JSON
    const isForm = init?.body instanceof FormData;
    const headers: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' };
```

- **`FormData`** — «форма» в JavaScript: набор полей, в том числе файлов. Её отправляют как `multipart/form-data`.
- Почему нельзя написать `Content-Type: multipart/form-data` руками: в этом заголовке должна быть ещё **граница** (boundary) — строка,
  которая разделяет части формы. Её придумывает браузер. Если поставить заголовок самому, границы не будет, и сервер не разберёт файл.
- CSRF-токен по-прежнему добавляется ниже: загрузка файла — это тоже `POST`.

### 14.2. `src/api/wishes.ts`

В тип `WishDto` добавь два поля:

```ts
    imageUrl: string | null; // адрес большой картинки (или null, если картинки нет)
    thumbUrl: string | null; // адрес превью для клетки календаря
```

И новую функцию (например, перед `deleteWish`):

```ts
// Картинку отправляем как форму с файлом, а не как JSON
export function uploadWishImage(id: number, file: File) {
    const form = new FormData();
    form.append('file', file); // 'file' — то же имя, что в @RequestParam("file") на сервере
    return request<WishDto>(`/api/wishes/${id}/image`, { method: 'POST', body: form });
}
```

### 14.3. `src/api/friends.ts`

В тип `CalendarDayDto` добавь те же два поля:

```ts
    imageUrl: string | null; // у закрытого дня сервер не присылает и адреса картинки
    thumbUrl: string | null;
```

### 14.4. `src/types.ts`

В типе `Wish` замени строку `img: WishImage;` на две:

```ts
    img: WishImage;   // большая картинка для окна дня
    thumb: WishImage; // маленькая картинка для клетки календаря
```

`WishImage` остаётся прежним: `{ src }` — настоящая картинка, `{ emoji, bg }` — подарок-заглушка, когда картинки нет.

## 🔹 Шаг 15. `src/api/useMyWishes.ts`: сохранить вместе с картинкой

Замени файл целиком:

```ts
// Хуки TanStack Query: загрузить мои желания, сохранить, удалить.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteWish, fetchMyWishes, saveWish, uploadWishImage, type WishInput } from './wishes';

// «Имя» этих данных в хранилище TanStack Query
const MY_WISHES = ['wishes', 'mine'];

export function useMyWishes() {
    return useQuery({
        queryKey: MY_WISHES,
        queryFn: fetchMyWishes,
    });
}

type SaveArgs = { date: string; input: WishInput; file: File | null };

export function useSaveWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ date, input, file }: SaveArgs) => {
            const saved = await saveWish(date, input);
            // Картинка — вторым запросом: ей нужен id желания, а он есть только после сохранения
            return file ? uploadWishImage(saved.id, file) : saved;
        },
        // onSettled — после ответа, удачного или нет. Даже если картинку не приняли,
        // название уже сохранилось, и список надо обновить
        onSettled: () => queryClient.invalidateQueries({ queryKey: MY_WISHES }),
    });
}

export function useDeleteWish() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteWish(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_WISHES }),
    });
}
```

- Сохранение — теперь **два запроса подряд**: сначала название (`PUT`), потом файл (`POST`). Файлу нужен номер желания,
  а у нового желания номер появляется только после первого запроса.
- `async` / `await` — «дождись ответа на первый запрос, потом делай второй».
- `onSettled` вместо `onSuccess`. Представь: название сохранилось, а картинку сервер не принял (не тот формат). Желание на сервере уже есть,
  значит список всё равно надо обновить. `onSettled` срабатывает и при успехе, и при ошибке.

## 🔹 Шаг 16. `src/api/toWishesByDate.ts`: картинки с сервера

Замени файл целиком:

```ts
// Превращаем список с сервера в тот вид, который ждут наши компоненты.
import type { UserId, WishesByDate, WishImage } from '../types';
import type { WishDto } from './wishes';
import type { CalendarDayDto } from './friends';
import { idForServerId } from '../data/fakeData';

// Картинки нет — показываем подарок на розовом фоне
const NO_IMAGE: WishImage = { emoji: '🎁', bg: '#FBE4EC' };

// Адрес картинки с сервера → то, что понимает WishThumb
function image(url: string | null): WishImage {
    return url ? { src: url } : NO_IMAGE;
}

// Всё — с сервера: название, комментарий, доступ и адреса картинок.
export function toWishesByDate(list: WishDto[]): WishesByDate {
    const result: WishesByDate = {};
    for (const dto of list) {
        result[dto.date] = {
            id: dto.id,
            title: dto.title,
            comment: dto.comment ?? '',
            img: image(dto.imageUrl),
            thumb: image(dto.thumbUrl),
            access: dto.access.map(idForServerId),
        };
    }
    return result;
}

// Календарь друга. access: [me] значит «мне этот день открыт».
// У закрытого дня сервер не присылает ни названия, ни картинки.
export function toFriendWishes(days: CalendarDayDto[], me: UserId): WishesByDate {
    const result: WishesByDate = {};
    for (const day of days) {
        result[day.date] = {
            id: day.wishId,
            title: day.title ?? '',
            comment: day.comment ?? '',
            img: image(day.imageUrl),
            thumb: image(day.thumbUrl),
            access: day.open ? [me] : [],
            requested: day.requested,
        };
    }
    return result;
}
```

- У `toWishesByDate` больше нет второго параметра `local`: картинки из памяти браузера не нужны.
- `image(url)` — если сервер прислал адрес, это `{ src: адрес }`. Браузер сам скачает картинку по нему и приложит cookie сессии:
  адрес начинается с `/api`, Vite передаст запрос серверу, а сервер проверит права.
- У закрытого дня друга адресов нет (`null`), поэтому там заглушка. Но `DayCell` у закрытого дня картинку и так не рисует.

## 🔹 Шаг 17. Компоненты

### 17.1. `src/components/DayCell.tsx`: в клетке — превью

Найди `<WishThumb img={wish.img} />` и замени на

```tsx
<WishThumb img={wish.thumb} />
```

Клетке хватит картинки на 300 точек. Большую (до 1600) браузер скачает, только когда откроешь окно дня.

### 17.2. `src/components/DayModal.tsx`: запоминаем выбранный файл

1. В типе `Props` замени строку с `onSave`:

```ts
    onSave: (date: string, wish: Wish, file: File | null) => void; // file — новая картинка, если выбрали
```

2. **Над** строкой `/* ---------- Свой день: форма ---------- */` добавь:

```ts
// Те же правила, что на сервере: проверяем заранее, чтобы не гонять большой файл зря
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 МБ
const NO_IMAGE: WishImage = { emoji: '🎁', bg: '#FBE4EC' };
```

3. В `OwnDay` под строкой `const [draftImg, ...]` добавь состояние для самого файла:

```ts
    const [draftFile, setDraftFile] = useState<File | null>(null);      // сам файл: уйдёт на сервер при «Сохранить»
```

4. Замени функцию `readFile` целиком:

```ts
    function readFile(file: File | undefined) {
        if (!file) return;
        if (!IMAGE_TYPES.includes(file.type)) { onToast('Подойдут картинки JPG, PNG или GIF'); return; }
        if (file.size > MAX_IMAGE_SIZE) { onToast('Картинка больше 5 МБ'); return; }
        setDraftFile(file);
        // Временный адрес файла внутри браузера: чтобы показать картинку до отправки на сервер
        setDraftImg({ src: URL.createObjectURL(file) });
    }
```

5. В функции `save` замени вызов `onSave(...)`:

```ts
        onSave(date, {
            title: title.trim(),
            comment: comment.trim(),
            img: img ?? NO_IMAGE,
            thumb: img ?? NO_IMAGE,
            access,
        }, draftFile);
```

6. Обнови подсказку и список разрешённых файлов у кнопки «Загрузить»:

```tsx
                    <span className="hint">или перетащите файл в рамку. JPG, PNG или GIF, до 5 МБ</span>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif" hidden onChange={e => readFile(e.target.files?.[0])} />
```

Разберём:

- Проверка в браузере — **для удобства**: человек сразу видит «больше 5 МБ» и не ждёт, пока 20 МБ уйдут на сервер.
  **Защита** — только на сервере: проверку в браузере легко обойти (тот же Postman). Поэтому правила записаны в двух местах.
- `URL.createObjectURL(file)` — браузер выдаёт временный адрес вида `blob:http://localhost:5173/...`, по которому можно показать файл,
  пока он ещё у тебя на компьютере. Раньше здесь был `FileReader` и длинная строка `data:image/...`: временный адрес проще и не раздувает память строкой.
- `draftImg` — что показать, `draftFile` — что отправить. Это разные вещи: показываем картинку, а отправляем файл.
- `accept="..."` — в окне выбора файла видны только подходящие файлы. Это тоже только удобство.

## 🔹 Шаг 18. `src/App.tsx` и уборка фейков

### 18.1. `src/App.tsx`

1. Удали импорт `import { useFakeStore } from './data/useFakeStore';` и строку `const store = useFakeStore(me);`.
2. Строка с `myWishes` станет такой:

```tsx
  const myWishes = toWishesByDate(myWishesQuery.data ?? []);
```

3. Замени начало функции `saveDay` (до `// У нового желания доступ...`):

```tsx
  function saveDay(date: string, wish: Wish, file: File | null) {
    const isNew = myWishes[date] === undefined;
    saveMutation.mutate({ date, input: { title: wish.title, comment: wish.comment }, file }, {
      onSuccess: async saved => {
```

   Строка `store.saveWish(date, wish);  // картинку пока помнит браузер` исчезла: картинку теперь помнит сервер.
   Остальное в `saveDay` без изменений.

4. Замени функцию `deleteDay` целиком:

```tsx
  function deleteDay(date: string) {
    const id = myWishes[date]?.id;
    if (id === undefined) return;
    deleteMutation.mutate(id, {
      onSuccess: () => done('Удалено'),
      onError: error => toast.showToast(error.message),
    });
  }
```

### 18.2. Удали `src/data/useFakeStore.ts`

Последнее, что в нём жило, — картинки. Больше он не нужен. В IntelliJ: правой кнопкой по файлу → **Delete** → **OK**.

### 18.3. `src/data/fakeData.ts`: убрать фейковые желания

`INITIAL_WISHES` теперь никто не использует. Удали из файла всё **от** строки `// Дата в текущем месяце: day(8) → '2026-10-08'`
**до** строки `// Человек с сервера → его UserId в наших компонентах.` (не включая её): константы `now`, `day`, функцию `wish` и `INITIAL_WISHES`.

Начало файла станет таким:

```ts
// Анна, Борис и Вика: цвета аватарок и родительный падеж («календарь Анны»).
// Всё остальное (желания, друзья, доступ, картинки) приходит с сервера.
import type { User, UserId } from '../types';

export const USERS: Record<UserId, User> = {
    anna:  { id: 'anna',  serverId: 1, name: 'Анна',  gen: 'Анны',   color: '#C7356E' },
    boris: { id: 'boris', serverId: 2, name: 'Борис', gen: 'Бориса', color: '#2C6FD1' },
    vika:  { id: 'vika',  serverId: 3, name: 'Вика',  gen: 'Вики',   color: '#1F8F74' },
};
```

Импорты `Wish`, `WishesByDate` и `dateKey` тоже ушли: без `INITIAL_WISHES` они не нужны. Ниже остаются `fakeIdFor` и `idForServerId` без изменений.

## 🔹 Шаг 19. Проверь всё руками

Нужны два человека одновременно: обычное окно и окно **инкогнито** (Ctrl+Shift+N).

1. `docker compose up -d`, запусти `BackendApplication`, в папке `frontend` — `npm run dev`.
2. **Окно 1: Анна.** У старых желаний вместо картинок подарок 🎁: их картинки жили только в браузере. Так и должно быть.
3. Открой **5 октября** → «Загрузить» → выбери фото → «Сохранить». В клетке появилась картинка.
4. **Обнови страницу** (F5). Картинка на месте: она на сервере, а не в памяти браузера. Это главное отличие от этапа 8.
5. Создай желание на свободный день вместе с картинкой (перетащи файл в рамку) и сохрани. Тоже на месте после F5.
6. Попробуй выбрать текстовый файл или фото больше 5 МБ → подсказка внизу, файл не принят.
7. Загрузи картинку и к **24 октября** (закрыт для Бориса).
8. **Окно 2 (инкогнито): Борис.** «Календарь Анны»: у 5 октября картинка видна (зелёная рамка), у 24 октября — замок, картинки нет.
9. **F12 → Network** у Бориса. В ответе `calendars/1?month=...` у 24 октября `"thumbUrl": null`.
10. **Окно 1 (Анна):** открой 24 октября, нажми **правой кнопкой по картинке → «Копировать адрес изображения»**.
    **Окно 2 (Борис):** вставь этот адрес в адресную строку → ошибка `404`. Прямая ссылка без доступа не работает. ✅
11. **Анна:** открой Борису 24 октября. **Борис:** обнови → картинка появилась. Та же прямая ссылка теперь открывается.
12. **Анна:** удали 24 октября. В MinIO (http://localhost:9001) файлы этой картинки исчезли.

## 🔹 Шаг 20. Проверка сборки и линтера

В папке `frontend`:

```
npm run build
npm run lint
```

## 🔹 Шаг 21. Сохрани в Git

В корне `advent-list`:

```
git add .
git status
git commit -m "Этап 9: картинки в MinIO, проверка файлов, защищённая отдача"
```

## 🔹 Частые проблемы

| Что видишь | Почему | Что сделать |
|---|---|---|
| `docker compose up` пишет `pull access denied` или `not found` для MinIO | образ не скачался | проверь, что имя образа в `docker-compose.yml` написано точно. Если не помогает, замени `image:` на `chainguard/minio:latest` (другая сборка того же MinIO) |
| Контейнер `advent-minio` сразу останавливается | пароль короче 8 символов | `docker compose logs minio`, проверь `MINIO_ROOT_PASSWORD` |
| Сервер не стартует: `Unable to execute HTTP request: Connect to localhost:9000` | MinIO не запущен | `docker compose up -d` |
| Сервер не стартует: `S3Exception` и `Status Code: 403` | логин/пароль в `application.properties` не совпадают с `docker-compose.yml` | сверь `storage.access-key`, `storage.secret-key` с `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` |
| `missing column [image_key]` | Flyway не увидел `V5` | имя файла ровно `V5__wish_images.sql` (два подчёркивания) |
| `cannot find symbol S3Client` | Maven не скачал библиотеку | шаг 2, затем **Load Maven Changes** |
| Загрузка фото с телефона: `413` или «больше 5 МБ» | фото и правда больше 5 МБ | уменьши фото или выбери другое. Предел 5 МБ — требование задания |
| Загрузка WebP или HEIC (фото с iPhone): «Подойдут картинки JPG, PNG или GIF» (в Postman: «Это не картинка») | Java из коробки не умеет читать эти форматы | сохрани картинку как JPG или PNG. Так и задумано: принимаем JPG, PNG, GIF |
| Сервер отвечает `400` «Файл не выбран» | в форме нет поля `file` | в Postman Key ровно `file`; во фронте `form.append('file', ...)` |
| В Postman `403` на загрузку | нет заголовка `X-XSRF-TOKEN` | как на этапе 6: `GET /api/me`, скопируй токен в заголовок |
| Сервер отвечает `400` «Не получилось прочитать JSON» на загрузку | `http.ts` поставил `Content-Type: application/json` | шаг 14.1 |
| Картинка в клетке не появилась, в Network `401` | не вошёл или сессия закончилась | войди заново |
| Тесты: `Connect to localhost:9000` | MinIO не запущен | `docker compose up -d` |

## 🔹 Созданные и изменённые файлы

```
docker-compose.yml                            + сервис minio
backend/
├── pom.xml                                   + software.amazon.awssdk:s3
└── src/
    ├── main/
    │   ├── resources/
    │   │   ├── application.properties        + предел 5 МБ, настройки storage.*
    │   │   └── db/migration/V5__wish_images.sql  ← новый: колонка image_key
    │   └── java/com/adventcalendar/calendar/
    │       ├── image/                        ← новый пакет
    │       │   ├── StorageProperties.java    настройки storage.*
    │       │   ├── StorageConfig.java        клиент S3, создание корзины
    │       │   ├── ImageStorage.java         сохранить / достать / удалить файлы в MinIO
    │       │   ├── ProcessedImage.java       большая картинка + превью
    │       │   ├── ImageProcessor.java       проверка файла, уменьшение, JPEG
    │       │   ├── BadImageException.java    «файл не подходит» (400)
    │       │   ├── ImageUrls.java            адреса картинок для фронта
    │       │   ├── WishImageService.java     кто может загрузить и посмотреть
    │       │   └── WishImageController.java  POST и GET /api/wishes/{id}/image
    │       ├── wish/Wish.java                + imageKey
    │       ├── wish/WishResponse.java        + imageUrl, thumbUrl
    │       ├── wish/CalendarDayResponse.java + imageUrl, thumbUrl (у закрытого null)
    │       ├── wish/WishService.java         удаление желания удаляет файлы
    │       └── error/GlobalExceptionHandler.java + 400, 413 для картинок
    └── test/java/com/adventcalendar/calendar/
        └── image/ImageRulesTest.java         ← новый: 8 тестов на картинки

frontend/src/
├── types.ts                                  + thumb
├── App.tsx                                   картинка уходит на сервер, без useFakeStore
├── api/http.ts                               FormData без JSON-заголовка
├── api/wishes.ts                             + imageUrl, thumbUrl, uploadWishImage
├── api/friends.ts                            + imageUrl, thumbUrl
├── api/useMyWishes.ts                        сохранение = название + файл
├── api/toWishesByDate.ts                     картинки с сервера
├── components/DayCell.tsx                    в клетке превью
├── components/DayModal.tsx                   запоминаем файл, проверка 5 МБ
├── data/fakeData.ts                          − INITIAL_WISHES
└── data/useFakeStore.ts                      ✕ удалён
```

## Главное, что нужно запомнить

- **Файлы — в хранилище, записи — в базе.** В базе лежит только имя файла (`image_key`), сами байты — в MinIO.
- Хранилище закрыто, картинки отдаёт **сервер**, проверяя права при каждом запросе. Знать адрес картинки недостаточно.
- Файлу **не верим на слово**: ни имени `photo.png`, ни типу `image/png`. Сервер сам читает содержимое и перерисовывает картинку в JPEG, заодно стирая скрытые данные (EXIF).
- Проверка в браузере — для удобства, проверка на сервере — для защиты. Нужны обе.
