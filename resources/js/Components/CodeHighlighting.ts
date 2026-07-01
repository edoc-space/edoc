import React from 'react';
import type { HighlighterCore, LanguageRegistration, ThemeRegistrationRaw } from '@shikijs/core';

type CoreModule = typeof import('@shikijs/core');
type EngineModule = typeof import('@shikijs/engine-javascript');
type ThemeModule = { default: ThemeRegistrationRaw };
type LanguageModule = { default: LanguageRegistration[] };

const codeTheme = 'github-light';
let highlighterPromise: Promise<HighlighterCore> | null = null;

const languageAliases: Record<string, string> = {
  bash: 'bash',
  css: 'css',
  diff: 'diff',
  console: 'bash',
  env: 'properties',
  html: 'html',
  ini: 'ini',
  js: 'javascript',
  json: 'json',
  md: 'markdown',
  mdx: 'mdx',
  php: 'php',
  shell: 'bash',
  sh: 'bash',
  shellscript: 'shellscript',
  ts: 'typescript',
  tsx: 'tsx',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

const supportedLanguages = new Set([
  'bash',
  'css',
  'diff',
  'html',
  'ini',
  'javascript',
  'json',
  'markdown',
  'mdx',
  'php',
  'properties',
  'shellscript',
  'tsx',
  'typescript',
  'xml',
  'yaml',
]);

const defaultCodeLabel = 'code';

export function useCodeHighlighting(
  rootRef: React.RefObject<HTMLElement | null>,
  dependencies: React.DependencyList,
) {
  React.useLayoutEffect(() => {
    let cancelled = false;
    const root = rootRef.current;

    if (root === null) {
      return () => {
        cancelled = true;
      };
    }

    highlightCodeBlocks(root, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, dependencies);
}

async function highlightCodeBlocks(root: HTMLElement, isCancelled: () => boolean) {
  const blocks = Array.from(root.querySelectorAll<HTMLPreElement>('pre'));
  const candidates = blocks.filter((block) => block.dataset.highlighted !== 'true');

  if (candidates.length === 0) {
    return;
  }

  const preparedBlocks = candidates
    .map(prepareCodeBlock)
    .filter((block): block is PreparedCodeBlock => block !== null);
  const supportedBlocks = preparedBlocks.filter((block) => supportedLanguages.has(block.highlightedLanguage));

  if (supportedBlocks.length === 0) {
    return;
  }

  let highlighter: HighlighterCore;
  try {
    highlighter = await loadHighlighter();
  } catch {
    return;
  }

  await Promise.all(supportedBlocks.map((block) => highlightCodeBlock(block, highlighter, isCancelled)));
}

type PreparedCodeBlock = {
  block: HTMLPreElement;
  language: string;
  highlightedLanguage: string;
  source: string;
  title: string;
};

function prepareCodeBlock(block: HTMLPreElement): PreparedCodeBlock | null {
  const code = block.querySelector('code');
  if (code === null) {
    return null;
  }

  const language = resolveLanguage(block, code);
  const highlightedLanguage = languageAliases[language] ?? language;
  const source = normalizeCodeSource(code.textContent ?? '');
  const title = resolveTitle(block);

  block.dataset.highlighted = 'true';
  if (language !== '') {
    block.dataset.language = language;
  }
  block.classList.add('markdown-code__pre');

  decorateCodeBlock(block, {
    language,
    source,
    title,
  });

  return {
    block,
    language,
    highlightedLanguage,
    source,
    title,
  };
}

async function highlightCodeBlock(
  preparedBlock: PreparedCodeBlock,
  highlighter: HighlighterCore,
  isCancelled: () => boolean,
) {
  if (preparedBlock.source.trim() === '') {
    return;
  }

  let html: string;
  try {
    html = highlighter.codeToHtml(preparedBlock.source, {
      lang: preparedBlock.highlightedLanguage,
      theme: codeTheme,
    });
  } catch {
    return;
  }

  if (isCancelled()) {
    return;
  }

  const highlightedBlock = htmlToPre(html);
  if (highlightedBlock === null) {
    return;
  }

  highlightedBlock.dataset.highlighted = 'true';
  highlightedBlock.dataset.language = preparedBlock.language;
  if (preparedBlock.title !== '') {
    highlightedBlock.dataset.title = preparedBlock.title;
  }
  highlightedBlock.classList.add('markdown-code__pre', 'markdown-code__pre--highlighted');
  preparedBlock.block.replaceWith(highlightedBlock);

  decorateCodeBlock(highlightedBlock, {
    language: preparedBlock.language,
    source: preparedBlock.source,
    title: preparedBlock.title,
  });
}

function resolveLanguage(block: HTMLPreElement, code: HTMLElement): string {
  const datasetLanguage = block.dataset.language ?? code.dataset.language ?? '';
  if (datasetLanguage.trim() !== '') {
    return normalizeLanguage(datasetLanguage);
  }

  const className = `${block.className} ${code.className}`;
  const classLanguage = className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? '';

  return normalizeLanguage(classLanguage);
}

function normalizeLanguage(language: string): string {
  return language.trim().replace(/^\{|\}$/g, '').toLocaleLowerCase('en-US');
}

function resolveTitle(block: HTMLPreElement): string {
  const datasetTitle = block.dataset.title ?? '';
  if (datasetTitle.trim() !== '') {
    return datasetTitle.trim();
  }

  const parent = block.parentElement;
  if (parent?.classList.contains('markdown-code')) {
    const caption = parent.querySelector<HTMLElement>(':scope > .markdown-code__title');

    return caption?.textContent?.trim() ?? '';
  }

  return '';
}

function decorateCodeBlock(
  block: HTMLPreElement,
  meta: {
    language: string;
    source: string;
    title: string;
  },
) {
  const figure = ensureCodeFigure(block);
  const previousHeader = figure.querySelector(':scope > .markdown-code__header');
  previousHeader?.remove();
  figure.querySelector(':scope > .markdown-code__title')?.remove();

  ensureLineElements(block, meta.source);

  const header = document.createElement('div');
  header.className = 'markdown-code__header';

  const controls = document.createElement('span');
  controls.className = 'markdown-code__window-controls';
  controls.setAttribute('aria-hidden', 'true');
  controls.append(
    document.createElement('span'),
    document.createElement('span'),
    document.createElement('span'),
  );

  const label = document.createElement('span');
  label.className = 'markdown-code__label';
  label.textContent = codeLabel(meta);

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'markdown-code__copy';
  copyButton.textContent = 'Копировать';
  copyButton.setAttribute('aria-label', 'Скопировать код');
  copyButton.addEventListener('click', () => {
    copyCode(meta.source, copyButton);
  });

  header.append(controls, label, copyButton);
  figure.insertBefore(header, block);
}

function ensureCodeFigure(block: HTMLPreElement): HTMLElement {
  const parent = block.parentElement;
  if (parent?.classList.contains('markdown-code')) {
    return parent;
  }

  const figure = document.createElement('figure');
  figure.className = 'markdown-code';
  block.replaceWith(figure);
  figure.appendChild(block);

  return figure;
}

function ensureLineElements(block: HTMLPreElement, source: string) {
  const code = block.querySelector('code');
  if (code === null) {
    return;
  }

  const existingLines = Array
    .from(code.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('line'));

  if (existingLines.length > 0) {
    Array.from(code.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.remove();
      }
    });
    existingLines.forEach((line) => {
      if ((line.textContent ?? '') === '') {
        line.textContent = ' ';
      }
    });
    return;
  }

  const lines = source.split('\n');
  code.textContent = '';

  lines.forEach((line) => {
    const element = document.createElement('span');
    element.className = 'line';
    element.textContent = line.length > 0 ? line : ' ';
    code.appendChild(element);
  });
}

function normalizeCodeSource(source: string): string {
  return source.replace(/^\n+/, '').replace(/\n+$/, '');
}

function codeLabel(meta: { language: string; title: string }): string {
  const language = meta.language || defaultCodeLabel;

  if (meta.title === '') {
    return language;
  }

  return `${meta.title} · ${language}`;
}

async function copyCode(source: string, button: HTMLButtonElement) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(source);
    } else {
      copyCodeWithTextarea(source);
    }

    showCopyState(button, 'Скопировано');
  } catch {
    showCopyState(button, 'Не удалось');
  }
}

function copyCodeWithTextarea(source: string) {
  const textarea = document.createElement('textarea');
  textarea.value = source;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function showCopyState(button: HTMLButtonElement, text: string) {
  const previousText = button.textContent ?? 'Копировать';
  button.textContent = text;
  button.disabled = true;

  window.setTimeout(() => {
    button.textContent = previousText;
    button.disabled = false;
  }, 1200);
}

function htmlToPre(html: string): HTMLPreElement | null {
  const template = document.createElement('template');
  template.innerHTML = html.trim();

  return template.content.querySelector('pre');
}

function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= Promise
    .all([
      import('@shikijs/core') as Promise<CoreModule>,
      import('@shikijs/engine-javascript') as Promise<EngineModule>,
      import('shiki/themes/github-light.mjs') as Promise<ThemeModule>,
      import('shiki/langs/bash.mjs') as Promise<LanguageModule>,
      import('shiki/langs/css.mjs') as Promise<LanguageModule>,
      import('shiki/langs/diff.mjs') as Promise<LanguageModule>,
      import('shiki/langs/html.mjs') as Promise<LanguageModule>,
      import('shiki/langs/ini.mjs') as Promise<LanguageModule>,
      import('shiki/langs/javascript.mjs') as Promise<LanguageModule>,
      import('shiki/langs/json.mjs') as Promise<LanguageModule>,
      import('shiki/langs/markdown.mjs') as Promise<LanguageModule>,
      import('shiki/langs/mdx.mjs') as Promise<LanguageModule>,
      import('shiki/langs/php.mjs') as Promise<LanguageModule>,
      import('shiki/langs/properties.mjs') as Promise<LanguageModule>,
      import('shiki/langs/shellscript.mjs') as Promise<LanguageModule>,
      import('shiki/langs/tsx.mjs') as Promise<LanguageModule>,
      import('shiki/langs/typescript.mjs') as Promise<LanguageModule>,
      import('shiki/langs/xml.mjs') as Promise<LanguageModule>,
      import('shiki/langs/yaml.mjs') as Promise<LanguageModule>,
    ])
    .then(([core, engine, theme, ...languages]) => core.createHighlighterCore({
      engine: engine.createJavaScriptRegexEngine(),
      langs: languages.flatMap((language) => language.default),
      themes: [theme.default],
    }));

  return highlighterPromise;
}
