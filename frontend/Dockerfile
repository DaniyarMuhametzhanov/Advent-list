# ===== Шаг 1: сборка. Node собирает из исходников готовые файлы в папку dist =====
FROM node:24-alpine AS build
WORKDIR /app
# Сначала только списки библиотек: пока они не менялись, Docker не ставит библиотеки заново
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ===== Шаг 2: запуск. nginx отдаёт файлы из dist и передаёт /api бэкенду =====
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
