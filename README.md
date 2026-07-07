# Shugyla Academy

Внутренняя обучающая платформа для сотрудников Shugyla Market.

## Быстрый старт

```bash
# Установить зависимости
npm install

# Запустить dev-сервер
npm run dev
```

Откройте http://localhost:5173 в браузере.

## Демо-аккаунты

| Логин      | Пароль    | Роль                    |
|------------|-----------|-------------------------|
| admin      | admin123  | Администратор системы   |
| kassir     | 123456    | Кассир                  |
| adminzal   | 123456    | Администратор зала      |

## Страницы

- `/academy` — главная с каталогом курсов
- `/login` — вход в систему
- `/dashboard` — личный кабинет сотрудника
- `/admin` — админ-панель (только admin)
- `/courses/:id` — страница курса с уроками

## Структура проекта

```
src/
├── data/          # Mock-данные (users, courses, lessons, tests, roles)
├── utils/         # auth.js, storage.js (localStorage)
├── components/    # Переиспользуемые компоненты
├── pages/         # Страницы приложения
├── App.jsx        # Маршрутизация
└── main.jsx       # Точка входа
```

## Стек

- React 19 + Vite 6
- React Router 7
- CSS (без UI-библиотек)
- localStorage для сессии и прогресса
