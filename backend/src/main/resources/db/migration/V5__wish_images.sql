-- Имя картинки желания в хранилище MinIO. NULL = картинки нет
ALTER TABLE wishes ADD COLUMN image_key VARCHAR(100);
