# NexusTavern

**Modern Material You (M3) AI Roleplay Workspace — 100% Compatible with SillyTavern User Data**

[English](#english) · [Русский](#русский)

---

## English

**NexusTavern** is a clean, modular standalone application for narrative AI roleplay built from the ground up with **React 19 + Vite** and a lightweight **Node.js (Express)** core. Originally inspired by the *BookboundUI* aesthetic, it replaces legacy monolithic DOM code with a fast, atomic **Material Design 3** workspace while maintaining **100% backward compatibility** with SillyTavern's `data/default-user` formats.

### Key Features
- **100% SillyTavern Data Compatibility** — Reads and writes Character Cards Spec v2 & v3 (`.png` `chara`/`ccv3` chunks & `.json`), `.jsonl` chat histories with swipes & branches, user personas, World Info / Lorebooks, Regex scripts, and completion presets.
- **Virtualized Chat & Timeline Graph** — Tail-first pagination, smooth streaming, collapsible Chain-of-Thought (`<think>`), inline Live-Markdown editor, and an interactive visual branching tree.
- **Prompt & Context Engineering** — Visual Prompt Manager with nested XML groups, **Regex Studio** with live debugger & ReDoS guard, **Message Recap** context compressor, **Refusal Catcher** with automatic fallback routing, and Anthropic/Claude prompt caching.
- **Dynamic Material You Theming** — Automatic Dark & Light palette engine, perceptual color extraction from character portraits (`Auto Portrait`), 8-slot RP typography colors, built-in 2:3 portrait cropper, and mobile-first bottom sheets.
- **Zero-Trust Local & Mobile Access** — Server-isolated `secrets.json` API Vault (multi-key rotation & health telemetry), instant LAN access, and optional AES-256-GCM E2EE SSH tunnel with QR pairing.

### Tech Stack
- **Client**: JavaScript (ESNext), React 19, Vite 6, Atomic M3 UI-Kit (`src/ui/`)
- **Server**: Node.js, Express 5, atomic filesystem persistence, built-in `node:test` suite

### Quick Start

```bash
# Install dependencies
npm install

# Run in development mode (Server + Vite HMR)
npm run dev

# Build production bundle & start standalone server
npm run build
npm start
```

### Quality Checks

```bash
npm run lint   # ESLint + architectural layer boundaries
npm test       # Fast Node.js unit test suite
```

> Detailed architecture, directory layout, and data specifications are documented in **[PROJECT.md](./PROJECT.md)**.

---

## Русский

**NexusTavern** — самостоятельное модульное приложение для текстового ролевого отыгрыша (RP) с ИИ на чистом стеке **React 19 + Vite** и лёгком **Node.js (Express)** ядре. Приложение сочетает атомарную дизайн-систему **Material Design 3 (Material You)** и высокую производительность со **100% обратной совместимостью** пользовательских данных SillyTavern (`data/default-user`).

### Ключевые возможности
- **100% совместимость с данными SillyTavern** — прямая работа с карточками персонажей Spec v2 / v3 (`.png` чанки `chara`/`ccv3` и `.json`), файлами чатов `.jsonl` (свайпы, таймлайны, рассуждения), персонами, лорбуками (World Info), Regex-скриптами и пресетами промптов.
- **Быстрый чат и граф таймлайнов** — Tail-First подгрузка истории, плавный стриминг, сворачиваемые блоки `Chain of Thought`, Live-Markdown редактор и интерактивное дерево ветвлений чата.
- **Инструменты промптинга и контекста** — визуальный Prompt Manager с вложенными группами, **Regex Studio** с живым отладчиком, авто-сжатие контекста **Message Recap**, перехватчик отказов **Refusal Catcher** с резервной маршрутизацией и кэширование промптов.
- **Динамическая кастомизация Material You** — авто-генерация тёмных и светлых палитр, извлечение цветов из портрета персонажа (`Auto Portrait`), 8 слотов РП-типографики, встроенный 2:3 кроппер аватарок и полная адаптация под смартфоны.
- **Безопасный локальный и мобильный доступ** — изолированное хранилище ключей `secrets.json` на сервере (ротация ключей и телеметрия), доступ по локальной сети (LAN) и опциональный E2EE SSH-туннель (`AES-256-GCM`) по QR-коду.

### Быстрый запуск

```bash
# Установка зависимостей
npm install

# Режим разработки (Сервер + клиент Vite)
npm run dev

# Продакшен-сборка и запуск локального сервера
npm run build
npm start
```

> Подробное описание архитектуры, структуры директорий и стандартов разработки находится в **[PROJECT.md](./PROJECT.md)**.

