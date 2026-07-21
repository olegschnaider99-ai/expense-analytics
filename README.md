# Аналітика витрат (Expense Analytics)

Персональний застосунок для аналітики витрат: автоматична синхронізація транзакцій з **Monobank**, дашборд із категоріями/трендами, і AI-асистент, який відповідає на запитання про твої власні витрати природною мовою.

Живий приклад: **[expense-analytics-ten.vercel.app](https://expense-analytics-ten.vercel.app)**

## Можливості

- **Синхронізація з Monobank** — підключення особистим токеном, вебхук на нові транзакції, автоматичний бекфіл історії (до 31 дня) та health-check із перепідключенням при збоях
- **Дашборд** — витрати за 30 днів по категоріях (кільцева діаграма), динаміка по днях, топ-5 найбільших покупок, останні транзакції, виявлення аномальних покупок
- **AI-асистент** — чат, що відповідає на запитання на кшталт «скільки я витратив на каву цього місяця», базуючись лише на реальних даних із бази (tool-calling, без вигаданих цифр)
- **Автентифікація** — email/пароль та Google OAuth через Supabase Auth
- **Українська локалізація** — весь інтерфейс і відповіді AI-асистента українською
- **Premium (тестова версія)** — самостійна активація без оплати, знімає денний ліміт на AI-запитання (реальна оплата через WayForPay поки не підключена)

## Стек

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) + TypeScript + Tailwind CSS v4
- [Supabase](https://supabase.com) — Postgres, Auth, Row Level Security, Vault (шифроване зберігання токенів), Edge Functions, `pg_cron`
- [OpenAI](https://platform.openai.com) — Responses API з tool-calling для AI-агента
- [Vitest](https://vitest.dev) + Testing Library — юніт/інтеграційні/компонентні тести проти живого Supabase-проєкту
- [Vercel](https://vercel.com) — деплой

## Локальний запуск

1. Встанови залежності:
   ```bash
   npm install
   ```
2. Створи `.env.local` зі значеннями зі свого Supabase та OpenAI проєктів:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SECRET_KEY=
   OPENAI_API_KEY=
   MONOBANK_HEALTHCHECK_SECRET=
   ```
3. Застосуй міграції з `supabase/migrations/` на свій Supabase-проєкт (`supabase db push` або через Supabase MCP/Dashboard).
4. Запусти сервер розробки:
   ```bash
   npm run dev
   ```
   Застосунок буде доступний на [http://localhost:3000](http://localhost:3000).

## Тести

```bash
npm test
```

Більшість тестів — інтеграційні: виконуються проти реального Supabase-проєкту (створюють і видаляють тестових користувачів), тож потрібен налаштований `.env.local`.

## Структура проєкту

```
app/                  # Next.js App Router: сторінки, server actions, API routes
components/           # React-компоненти (auth, dashboard)
lib/                  # Клієнти Supabase, AI-агент та інструменти, доступ до даних дашборду
supabase/
  migrations/         # SQL-міграції (схема, RLS, SECURITY DEFINER функції)
  functions/          # Edge Functions (Monobank webhook, health-check)
  tests/              # Інтеграційні тести на рівні бази даних
```
