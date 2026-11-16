# NexusTavern — Отчёт по разработке вкладки Settings & Customization

Данный файл фиксирует выполненные шаги (**Шаги 1–4**) и оставшийся шаг (**Шаг 5**) по задаче создания вкладки `Settings` и системы кастомизации в стиле `ST + BookboundUI` на чистой модульной архитектуре React + Vite + Node.js.

---

## 1. Что уже полностью сделано и работает в сборке

### Шаг 1 — Расширение M3 UI-Kit (`src/ui/`)
- **`ColorField` (`src/ui/molecules/ColorField/`)**:
  - Переиспользуемая молекула выбора цвета (`ColorField.jsx`, `ColorPickerPopover.jsx`, `colorMath.js`, `ColorField.css`, `ColorPickerPopover.css`) в режимах `row` и `compact`.
  - Крупные скруглённые квадраты цвета (`30×30px` на ПК, `34×34px` на мобильных, рамки приведены к `--bb-control-radius: 8px`).
  - Непрозрачный **M3 Solid Popover** на ПК и **M3 Modal Bottom Sheet** на экранах `≤ 640px` (2D HSV-квадрат с захватом указателя, Hue, опциональный Alpha, ввод HEX + R/G/B, копирование HEX, пипетка `EyeDropper`, крупные `44px` свотчи палитры, чистый тумблер `Auto`).
- **`ThemePresetCard` (`src/ui/molecules/ThemePresetCard/`)**:
  - Карточка пресета темы с 2×2 плиткой скруглённых квадратов (`22×22px`), бейджем `Default`, индикатором `Dark / Light` и `KebabMenu`.
- **`FolderCard` (`src/ui/molecules/FolderCard/FolderCard.jsx`)**: добавлен `forceOpen` для авто-раскрытия карточек при поиске.
- Добавлены иконки `eyedropper`, `sun`, `moon`, `font` в `Icon.jsx`, витрина в `TokenSandbox` и unit-тесты `tests/colorMath.test.js`.

### Шаг 2 — Ядро кастомизации, Авто-подбор палитры, РП-апострофы и Сервер (`src/core/customization/`, `server/`)
- **Стандартная тема и библиотека BookboundUI (`customizationDefaults.js`)**:
  - Текущая тема **`Indigo Slate` (`#6D6D83 / #6575B3`)** сохранена как стандартная (`Default`).
  - Перенесены встроенные темы из BookboundUI: **`Bronze Tome`**, **`Astral Azure`**, **`Crimson Eclipse`**, **`Abyssal Void`**, **`Ivory Grimoire`**, **`Rose Quartz`**.
- **Автоматический движок палитры (`paletteEngine.js` + `portraitPalette.js`)**:
  - Авто-расчёт всех поверхностей M3, границ, шейдера и 8 слотов РП-типографики (`Two-Color` / `Monochrome`, адаптация контраста `Dark ↔ Light`, 7 слотов `paletteOverrides`).
  - Перцептивный k-means алгоритм **`Auto Portrait`** (извлекает гармоничные пары и свотчи прямо из портрета активного персонажа с переключением вариантов).
- **РП-оформление текста и апострофов (`messageDecorator.js`, `MessageDecorator.jsx`, `MessageDecorator.css`)**:
  - Мысли/речь в одинарных кавычках `'...'` и `‘...’` оформляются в `.bb-decorator-apostrophe` **без подчёркивания (`text-decoration: none`)** и в статике, и при живом стриминге, не ломая английские сокращения (`didn't`, `I'm`, `Elowen's`).
  - Добавлена функция `applyTextFormattingRules` (`trimSpaces: true`, `collapseNewlines: true`, `autoFixMarkdown: true`, `trimIncompleteSentences: false`).
- **Серверное хранилище и старт без мигания (`customizationStore.js`, `routes/customization.js`, `customizationDom.js`, `main.jsx`)**:
  - Хранение в `data/default-user/.nexustavern/customization.json`, пресетов в `.nexustavern/themes/`, шрифтов в `.nexustavern/fonts/`.
  - Двусторонняя синхронизация общих полей с `data/default-user/settings.json -> power_user`.
  - Безбликовый старт `bootCachedCustomizationEarly()` до первого рендера React + тесты `tests/customizationCore.test.js`.

### Шаг 3 — Вкладка `Settings` (поиск + подвкладки) и полная секция `Appearance` (`src/features/customization/`)
- **`SettingsTomePanel.jsx` + `.css`** (ленивый чанк `React.lazy`):
  - Закреплённый сверху поиск `SearchInput` по всем категориям сразу + закладки `Appearance`, `Chat & AI`, `System`.
- **Модули `Appearance` (`src/features/customization/sections/`)**:
  - `ThemePresetsSection.jsx`: выбор, сохранение, перезапись, переименование, импорт/экспорт `.json`, удаление пользовательских пресетов и сброс к `Indigo Slate`.
  - `ColorSchemeSection.jsx`: `Dark / Light`, `Two-Color / Monochrome`, кнопка `Auto Portrait` с полоской свотчей, `Primary / Secondary` пикеры и редактор 7 слотов поверхностей (`Edit 7 Slots`).
  - `ChatTextColorsSection.jsx`: 8 карточек цветов РП-текста (`Normal Prose`, `Spoken Quotes`, `Apostrophes`, `Italic`, `Bold`, `Inline Code`, `Code Block`, `Details`) с живыми превью, тумблерами `Auto` и прозрачностью плашек.
  - `LayoutAndSurfacesSection.jsx`: ширина колонки чата (`620–1280px`), прозрачность и блюр карточек сообщений, `Chat Edge Soft Fade`, настройки `Pearlescent Shader`, прозрачность/блюр боковых томов, 6 векторных `JRPG Pattern` узоров сцены и `Global Screen Dimming`.
  - `TypographyAndCssSection.jsx`: масштаб шрифтов (`75–135%`), выбор `Heading / Body / Monospace`, подключение Google Fonts, загрузка/удаление локальных `.woff2/.woff/.ttf/.otf` шрифтов, `Reduced Motion` и **`Custom CSS`** с мастер-тумблером `Enable Custom CSS`.

### Шаг 4 — Полная секция `Chat & AI` со сквозной интеграцией и LLM Prompt Caching
- **UI секции `src/features/customization/sections/ChatAndAiSection.jsx`**:
  1. *Composer, Window & Streaming*: `Enter Key Behavior` (`Enter` / `Ctrl+Enter` / `Button Only`), `Send Empty Input to Continue`, `Restore Unsaved Composer Draft`, `Confirm Message Deletion`, `Double-Click Message to Edit`, `Initial Messages Window (Tail-First: 15/20/30/50)`, `Auto-Load Last Chat on Startup`, `Auto-Scroll During Streaming`, `Smooth Word-Paced Streaming`, `Bypass Smoothing in Thinking Blocks`.
  2. *Message Card Badges & Visibility* (нулевые ререндеры через `data-*` атрибуты на `:root`): `Generation Timer & Speed`, `Message Timestamps`, `Provider & Model Icons`, `Sequential Message #IDs`, `Message Token Count`, `Hide Chat Portraits`, `Mobile Horizontal Swipe Gestures`, `Block External Remote Media`.
  3. *Text Hygiene, Formatting & Reasoning*: включённые по умолчанию правила из ST Formatting (`Trim Spaces`, `Collapse Consecutive Newlines`, `Auto-Fix Generated Markdown`, плюс опциональный `Trim Incomplete Sentences`), управление `Chain-of-Thought` (`Auto-Parse <think>`, `Auto-Expand`, `Include Previous Reasoning in Prompts` + `Max Reasoning Blocks`), звуковой сигнал окончания генерации через Web Audio API (`Play Chime` + `Background Tab Only` + `Preview`).
  4. *Card Context & LLM Prompt Caching*: `Example Dialogues Behavior` (`Gradual Push-Out` / `Always Keep` / `Never Include`), `Prefer Card System Prompt`, `Prefer Card Post-History Instructions` и **LLM Prompt Caching (Token Saver)**.
- **Сквозная серверная и клиентская привязка**:
  - Сервер: `promptCompiler.js`, `llmResponsePersistence.js`, `llmProviderAdapters.js` (`applyPromptCachingBreakpoints` ставит `cache_control: { type: 'ephemeral' }` и `ttl: '1h'` + beta-хедер `extended-cache-ttl-2025-04-11` для Anthropic и Claude на OpenRouter/прокси без поломки схем других OpenAI-совместимых моделей; покрыто `tests/promptCaching.test.js`).
  - Клиент: `customizationRuntimeStore.js`, `ChatComposer.jsx`, `ChatViewport.jsx`, `ChatMessageCard.jsx`/`.css`, `MessageDecorator.jsx`, `useChatWorkspace.js`, `useChatStreaming.js`, `useSessionBoot.js`.

---

## 2. Шаг 5 — Полная секция `System` и очистка рудиментов (Выполнено)

1. **`SystemSection.jsx` (`src/features/customization/sections/SystemSection.jsx`)**, подключённая в `SettingsTomePanel.jsx` через `AppShell.jsx` → `LeftTomeContent.jsx`:
   - **`Network, LAN & Remote E2EE Tunnel`**: отображение LAN-адресов хост-ПК с копированием URL в 1 клик, живой статус E2EE SSH-туннеля (`AES-256-GCM`), кнопки запуска/остановки туннеля, ротации ключа и открытия `QR & Pairing` модалки + тумблер `Auto-Open Browser on Startup` (`config.system.autoOpenBrowser`, подключён к `server/index.js`).
   - **`Performance & Hardware`**: тумблер `Low-GPU Mode` (`config.system.lowGpu`).
   - **`Workspace Backup & Onboarding`**: полный экспорт и импорт `.json`-архива настроек `customization.json` вместе с кастомными темами `customPresets` (`POST /api/customization/backup/import`), кнопка повторного открытия `Show Welcome Guide` и сброс всех настроек `Reset All Settings`.
2. **Очистка рудиментов**: устаревшие флаги `labMode` и `verbosePromptLogging` полностью удалены из схемы `customizationDefaults.js`, серверных сервисов и поискового индекса.


