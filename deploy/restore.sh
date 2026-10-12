#!/bin/sh
# Восстановление из резервной копии. ВНИМАНИЕ: текущие данные заменятся данными из копии.
# Запуск: sh deploy/restore.sh backups/db-ДАТА.sql.gz backups/images-ДАТА.tar.gz
# Картинки можно не указывать — тогда восстановится только база
set -eu
# Для Git Bash на Windows: не превращать пути вроде /data в C:/Program Files/Git/data
export MSYS_NO_PATHCONV=1

DB_FILE=$(realpath "$1")                  # полный путь к файлам, пока мы не сменили папку
IMG_FILE=${2:+$(realpath "$2")}
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml"

# 1. Останавливаем бэкенд, чтобы никто не менял данные во время восстановления
$DC stop backend

# 2. База: в копии сначала идут команды «удалить таблицу», потом «создать и заполнить»
gunzip -c "$DB_FILE" | $DC exec -T postgres psql -q -U advent -d advent -v ON_ERROR_STOP=1

# 3. Картинки: очищаем том MinIO и распаковываем туда архив
if [ -n "$IMG_FILE" ]; then
  $DC stop minio
  docker run --rm -i -v advent_minio-data:/data alpine:3.22 \
    sh -c 'rm -rf /data/* /data/.[!.]*; tar -C /data -xzf -' < "$IMG_FILE"
  $DC start minio
fi

# 4. Кэш в Redis хранит старые данные — очищаем его
$DC exec -T redis redis-cli FLUSHALL

$DC start backend
echo "Восстановлено из $DB_FILE"
