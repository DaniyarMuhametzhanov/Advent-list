#!/bin/sh
# Резервная копия: база данных и картинки. Кладёт файлы в папку backups/
# Запуск вручную: sh deploy/backup.sh   (cron запускает его сам каждую ночь)
set -eu
# Для Git Bash на Windows: не превращать пути вроде /data в C:/Program Files/Git/data
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."          # перейти в папку проекта, откуда бы ни запустили
mkdir -p backups
STAMP=$(date +%Y-%m-%d_%H-%M)

# 1. База: pg_dump выгружает всё в SQL-текст, gzip сжимает
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U advent -d advent --clean --if-exists | gzip > "backups/db-$STAMP.sql.gz"

# 2. Картинки: упаковываем содержимое тома MinIO в архив
docker run --rm -v advent_minio-data:/data:ro alpine:3.22 \
  tar -C /data -czf - . > "backups/images-$STAMP.tar.gz"

# 3. Удаляем копии старше 14 дней, чтобы не забить диск
find backups -name '*.gz' -mtime +14 -delete

echo "Готово: backups/db-$STAMP.sql.gz и backups/images-$STAMP.tar.gz"
