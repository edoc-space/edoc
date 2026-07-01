# E-Doc

E-Doc - self-hosted documentation hosting для проектов, где документация хранится в файлах и живет рядом с кодом.

Проект публикует Markdown/MDX-страницы через PhpSoftBox, Inertia, React и Vite. На текущем этапе публичная документация не требует базы данных и админки: контент редактируется как код, проходит через git workflow и раскладывается по файловой структуре.

## Что Сейчас Есть

- Публичный сайт документации на Inertia + React.
- Markdown-рендер через `phpsoftbox/markdown`.
- MDX-страницы через `phpsoftbox/mdx` и `@mdx-js/react`.
- Базовые MDX-компоненты: `Hero`, `Section`, `Grid`, `Columns`, `Feature`, `Card`, `Cta`, `Steps`, `Tabs`, `Slider`, `Accordion`, `Testimonial`.
- Автоматическая навигация по обычным страницам и дереву документации.
- Поддержка `index.json` для настройки каталогов документации.
- Поддержка локальных React-плагинов для разработки будущих npm-пакетов.

## Где Лежит Контент

Контент хранится в storage-дисках приложения. Пути задаются в `config/app/storage.php`, а не через отдельные ENV-переменные.

| Путь | Назначение |
| --- | --- |
| `local/storage/edoc/site.json` | Название сайта, логотип, верхнее меню и футер. |
| `local/storage/edoc/pages/*.md` | Обычные самостоятельные страницы. |
| `local/storage/edoc/pages/*.mdx` | Самостоятельные страницы с React-компонентами. |
| `local/storage/edoc/docs/**/*.md` | Документы в разделе `/docs`. |
| `local/storage/edoc/docs/**/*.mdx` | Документы в разделе `/docs` с React-компонентами. |
| `local/storage/edoc/docs/**/index.json` | Метаданные каталога документации. |
| `local/storage/edoc/static/*` | Статические файлы: логотипы, изображения, OpenAPI JSON, changelog и т.д. |
| `local/plugins/*` | Локальная разработка MDX-плагинов. |

Директория `local/*` находится в `.gitignore`. Это важно для self-hosted сценария: владельцы инсталляции могут хранить свой контент и плагины отдельно от core-кода E-Doc и обновлять приложение без конфликтов с пользовательскими файлами.

## Роутинг

| URL | Поведение |
| --- | --- |
| `/` | Рендерит `pages/index.md` или `pages/index.mdx`, если файл существует. Иначе редиректит на `/docs`. |
| `/{slug}` | Рендерит самостоятельную страницу из `local/storage/edoc/pages`. |
| `/docs` | Открывает корень документации. |
| `/docs/{slug}` | Рендерит документ или сгенерированную страницу каталога из `local/storage/edoc/docs`. |
| `/storage/edoc/static/*` | Отдает статические файлы из `local/storage/edoc/static`. |

## Самостоятельные Страницы

Страницы лежат в `local/storage/edoc/pages`. Для обычного контента достаточно `.md`, для компонентных блоков используется `.mdx`.

Пример front matter:

```mdx
---
title: Плагины
description: React-компоненты для расширения MDX-страниц E-Doc.
slug: plugins
layout: page
nav_label: Плагины
nav_position: 2
---

import { Hero, Section } from '@/Components/Mdx'

<Hero
  title="Плагины"
  eyebrow="MDX components"
  subtitle="Готовые React-компоненты для страниц и документации."
/>

<Section title="Как используются плагины">
  Плагин устанавливается через package manager и импортируется в MDX.
</Section>
```

Поддерживаемые поля:

- `title` - заголовок страницы и meta title.
- `description` - описание страницы.
- `slug` - URL без начального `/`. Для `index.mdx` по умолчанию используется `/`.
- `layout` - тип layout, сейчас используется как metadata.
- `nav_label` - подпись в верхнем меню. Если поле пустое, страница не попадает в меню.
- `nav_position` - порядок в верхнем меню.
- `nav_hidden` - принудительно скрывает страницу из меню.

## Документация

Документация лежит в `local/storage/edoc/docs` и строится из файловой структуры.

Пример документа:

```md
---
title: Установка
description: Как установить и запустить E-Doc локально.
sidebar_label: Установка
sidebar_position: 1
---

# Установка

Текст документации.
```

Поддерживаемые поля документов:

- `title` - заголовок документа.
- `description` - описание для списков, оглавления раздела и поиска.
- `slug` - ручной URL внутри `/docs`. Если не задан, берется путь файла без расширения.
- `sidebar_label` - подпись в дереве документации.
- `sidebar_position` - порядок в дереве.
- `draft` - скрывает документ в `APP_ENV=prod`.
- `hide_table_of_contents` - скрывает блок "На странице".

Пример `index.json` для каталога:

```json
{
  "label": "Быстрый старт",
  "description": "Базовые шаги для первого запуска.",
  "position": 1,
  "collapsed": false,
  "sidebar": true,
  "link": { "type": "generated-index" },
  "redirects": {
    "old-install.md": "ustanovka.md"
  }
}
```

Поля каталога:

- `label` - название каталога.
- `description` - описание каталога.
- `position` - порядок каталога среди соседей.
- `collapsed` или `expanded` - начальное состояние в дереве.
- `sidebar` - делает каталог отдельной верхней точкой документации.
- `link` - поведение ссылки каталога. Сейчас используется `generated-index` или ссылка на документ.
- `redirects` - постоянные редиректы `301` со старых путей на новые.

Файл `_category_.json` поддерживается для совместимости, но для E-Doc предпочтительный формат - `index.json`.

## MDX И Компоненты

MDX используется там, где Markdown недостаточно:

- главные и промо-страницы;
- интерактивные блоки;
- OpenAPI reference;
- changelog;
- табы, слайдеры, плитки преимуществ;
- проектные React-компоненты.

Базовые компоненты экспортируются из `@/Components/Mdx`:

```mdx
import { Hero, Grid, Feature } from '@/Components/Mdx'

<Hero title="E-Doc" subtitle="Документация как код." />

<Grid columns={3}>
  <Feature title="Markdown">Простой текстовый формат.</Feature>
  <Feature title="MDX">React внутри страниц.</Feature>
  <Feature title="Git">Контент версионируется вместе с проектом.</Feature>
</Grid>
```

## Плагины

Core `package.json` является частью движка E-Doc и не должен использоваться как место для пользовательских расширений. Иначе при обновлении движка установка плагинов будет конфликтовать с git-индексом.

Плагины должны подключаться через отдельный ignored-слой, который живет рядом с пользовательским контентом. Сейчас для этого используется `local/plugins/package.json`; дальше этот сценарий должен быть закрыт инсталлером или менеджером плагинов, чтобы пользователь не правил core-файлы вручную.

Текущий ручной сценарий:

```bash
cd local/plugins
yarn add @edoc-space/plugin-openapi
yarn add @edoc-space/plugin-changelog
yarn add @edoc-space/plugin-directory-tree
```

В MDX плагин выглядит как обычный npm-пакет:

```mdx
import { OpenApi } from '@edoc-space/plugin-openapi'
import { Changelog } from '@edoc-space/plugin-changelog'
import { DirectoryTree } from '@edoc-space/plugin-directory-tree'

<OpenApi source="/storage/edoc/static/examples/openapi.json" />
<Changelog source="/storage/edoc/static/examples/changelog.md" />
<DirectoryTree source="/storage/edoc/static/examples/edoc-content-tree.json" />
```

Для разработки плагинов внутри этого проекта используется `local/plugins`. Vite читает `local/plugins/*/package.json`, берет имя пакета и добавляет alias на `edoc.source`.

Минимальный manifest локального плагина:

```json
{
  "name": "@edoc-space/plugin-example",
  "private": true,
  "type": "module",
  "edoc": {
    "kind": "mdx-component",
    "source": "src/index.tsx",
    "components": ["Example"]
  }
}
```

Зависимости локальных плагинов добавляются в `local/plugins/package.json`, чтобы core `package.json` приложения не превращался в список пользовательских расширений.

## Настройка Сайта

Файл `local/storage/edoc/site.json` управляет общей оболочкой сайта:

```json
{
  "title": "E-Doc",
  "description": "Self-hosted documentation hosting на Markdown-файлах.",
  "brand": {
    "name": "e-doc",
    "href": "/",
    "logo": "logo.svg"
  },
  "navigation": [
    { "source": "pages" },
    { "source": "docs" }
  ],
  "footer": {
    "enabled": true,
    "description": "Self-hosted documentation hosting на Markdown-файлах.",
    "columns": [
      { "title": "Сайт", "source": "pages" },
      { "title": "Документация", "source": "docs" }
    ]
  }
}
```

Логотип указывается относительно `local/storage/edoc/static`.

## Локальный Запуск

E-Doc запускается поверх `phpsoftbox/workspace`. В публичном сценарии подготовкой окружения должен заниматься installer: создать локальные конфиги, подготовить storage-директории, установить зависимости и подсказать дальнейшие команды.

Для разработки текущего репозитория используются `Makefile` и Docker Compose из workspace-обвязки.

По умолчанию приложение открывается на:

- `https://e-doc.local` - сайт;
- `https://vite.e-doc.local` - Vite dev server.

Локальный HTTPS и домены обслуживаются через Traefik. Настройку DNS/hosts, сертификатов и сети `traefik` нужно описывать отдельно в документации по установке.

## Проверки

Команды из корня репозитория:

```bash
make test
make yarn-build
make -- php-run npx tsc --noEmit
```

Команды из `local/backend`:

```bash
composer test
yarn build
npx tsc --noEmit
```
