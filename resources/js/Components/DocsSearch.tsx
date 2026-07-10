import React from 'react';
import { createPortal } from 'react-dom';
import type { SiteUiText } from '../Layouts/SiteLayout';

const SEARCH_RESULT_LIMIT = 8;

export type SearchEntry = {
  id: string;
  title: string;
  label: string;
  href: string;
  kind: string;
  type: string;
  description: string;
  content: string;
  contexts?: string[];
};

export type SearchResult = {
  entry: SearchEntry;
  snippet: string;
  score: number;
};

export type SearchProviderType = 'memory' | 'static' | 'api';

export type SearchProviderConfig =
  | SearchProviderType
  | {
      type?: SearchProviderType;
      endpoint?: string;
      entries?: SearchEntry[];
    };

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

type ResolvedSearchProvider = {
  type: SearchProviderType;
  endpoint: string;
  entries: SearchEntry[];
};

type DocsSearchProps = {
  provider: SearchProviderConfig;
  ui: SiteUiText;
  textLocale: string;
  className?: string;
  placeholder?: string;
  triggerLabel?: string;
  variant?: 'compact' | 'hero';
};

export function DocsSearch({
  provider,
  ui,
  textLocale,
  className = '',
  placeholder,
  triggerLabel,
  variant = 'compact',
}: DocsSearchProps) {
  const resolvedProvider = resolveSearchProvider(provider);
  const [query, setQuery] = React.useState('');
  const [isOpen, setOpen] = React.useState(false);
  const [staticEntries, setStaticEntries] = React.useState<SearchEntry[]>([]);
  const [staticStatus, setStaticStatus] = React.useState<SearchStatus>('idle');
  const [apiResults, setApiResults] = React.useState<SearchResult[]>([]);
  const [apiStatus, setApiStatus] = React.useState<SearchStatus>('idle');
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const staticLoadRef = React.useRef<string | null>(null);
  const [pressedShortcutKeys, setPressedShortcutKeys] = React.useState({ modifier: false, key: false });
  const isQueryActive = query.trim() !== '';
  const modifierKey = platformModifierKey();

  const loadStaticEntries = React.useCallback(async () => {
    if (resolvedProvider.type !== 'static' || resolvedProvider.endpoint === '') {
      return;
    }

    if (staticStatus === 'loading' || staticLoadRef.current === resolvedProvider.endpoint) {
      return;
    }

    staticLoadRef.current = resolvedProvider.endpoint;
    setStaticStatus('loading');

    try {
      const response = await fetch(resolvedProvider.endpoint, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Search index request failed: ${response.status}`);
      }

      const payload: unknown = await response.json();
      setStaticEntries(parseSearchEntriesPayload(payload));
      setStaticStatus('ready');
    } catch {
      staticLoadRef.current = null;
      setStaticEntries([]);
      setStaticStatus('error');
    }
  }, [resolvedProvider.endpoint, resolvedProvider.type, staticStatus]);

  const handleOpen = React.useCallback(() => {
    setOpen(true);
    void loadStaticEntries();
  }, [loadStaticEntries]);

  const handleClose = React.useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  React.useEffect(() => {
    setStaticEntries([]);
    setStaticStatus('idle');
    staticLoadRef.current = null;
  }, [resolvedProvider.endpoint, resolvedProvider.type]);

  React.useEffect(() => {
    if (!isOpen || resolvedProvider.type !== 'api') {
      return undefined;
    }

    const normalizedQuery = query.trim();
    if (normalizedQuery === '' || resolvedProvider.endpoint === '') {
      setApiResults([]);
      setApiStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setApiStatus('loading');

      try {
        const url = new URL(resolvedProvider.endpoint, window.location.origin);
        url.searchParams.set('q', normalizedQuery);

        const response = await fetch(url.toString(), {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Search request failed: ${response.status}`);
        }

        const payload: unknown = await response.json();
        setApiResults(parseSearchResultsPayload(payload, normalizedQuery, textLocale));
        setApiStatus('ready');
      } catch {
        if (!controller.signal.aborted) {
          setApiResults([]);
          setApiStatus('error');
        }
      }
    }, 150);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, query, resolvedProvider.endpoint, resolvedProvider.type, textLocale]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isModifierKey(event)) {
        setPressedShortcutKeys((current) => ({ ...current, modifier: true }));
        return;
      }

      if (event.key.toLocaleLowerCase() === 'k') {
        setPressedShortcutKeys((current) => ({ ...current, key: true }));
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        handleOpen();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isModifierKey(event)) {
        setPressedShortcutKeys((current) => ({ ...current, modifier: false }));
      }

      if (event.key.toLocaleLowerCase() === 'k') {
        setPressedShortcutKeys((current) => ({ ...current, key: false }));
      }
    };

    const handleBlur = () => {
      setPressedShortcutKeys({ modifier: false, key: false });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [handleClose, isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  const entries = resolvedProvider.type === 'memory'
    ? resolvedProvider.entries
    : staticEntries;
  const results = resolvedProvider.type === 'api'
    ? apiResults
    : filterSearchEntries(entries, query, textLocale);
  const status = resolvedProvider.type === 'api' ? apiStatus : resolvedProvider.type === 'static' ? staticStatus : 'ready';
  const searchPlaceholder = placeholder || ui.searchPlaceholder || 'Поиск';
  const searchTriggerLabel = triggerLabel || searchPlaceholder;
  const rootClassName = ['docs-search', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} data-open={isOpen} data-variant={variant}>
      <button
        type="button"
        className="docs-search-trigger"
        aria-label={ui.searchOpenAria ?? ui.searchAria ?? 'Поиск по документации'}
        onClick={handleOpen}
      >
        <span className="docs-search-icon" aria-hidden="true" />
        <span className="docs-search-trigger-label">{searchTriggerLabel}</span>
        <span className="docs-search-shortcut" aria-hidden="true">
          <kbd data-pressed={pressedShortcutKeys.modifier}>{modifierKey}</kbd>
          <kbd data-pressed={pressedShortcutKeys.key}>K</kbd>
        </span>
      </button>

      {isOpen && typeof document !== 'undefined' ? createPortal(
        <div className="docs-search-overlay" role="presentation">
          <button type="button" className="docs-search-backdrop" aria-label={ui.searchClose ?? 'Закрыть поиск'} onClick={handleClose} />
          <div className="docs-search-dialog" role="dialog" aria-modal="true" aria-label={ui.searchAria ?? 'Поиск по документации'}>
            <div className="docs-search-field">
              <span className="docs-search-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                className="docs-search-input"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={ui.searchAria ?? 'Поиск по документации'}
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    handleClose();
                  }
                }}
              />
              <button type="button" className="docs-search-close" aria-label={ui.searchClose ?? 'Закрыть поиск'} onClick={handleClose}>
                <span aria-hidden="true" />
              </button>
            </div>

            <SearchResults
              query={query}
              results={results}
              status={status}
              ui={ui}
              textLocale={textLocale}
              onClose={handleClose}
            />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function SearchResults({
  query,
  results,
  status,
  ui,
  textLocale,
  onClose,
}: {
  query: string;
  results: SearchResult[];
  status: SearchStatus;
  ui: SiteUiText;
  textLocale: string;
  onClose: () => void;
}) {
  const isQueryActive = query.trim() !== '';

  if (status === 'loading') {
    return (
      <div className="docs-search-results" role="status">
        <span className="docs-search-empty">{ui.searchLoading ?? 'Загрузка поиска...'}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="docs-search-results" role="status">
        <span className="docs-search-empty">{ui.searchError ?? 'Поиск временно недоступен'}</span>
      </div>
    );
  }

  return (
    <div className="docs-search-results" role="listbox">
      {isQueryActive && results.length > 0 ? (
        results.map((result) => (
          <a key={result.entry.id} href={result.entry.href} className="docs-search-result" onClick={onClose}>
            <span className="docs-search-result-title">
              <HighlightedText text={result.entry.title} query={query} textLocale={textLocale} />
            </span>
            {result.snippet ? (
              <span className="docs-search-result-description">
                <HighlightedText text={result.snippet} query={query} textLocale={textLocale} />
              </span>
            ) : null}
            <span className="docs-search-result-type">{result.entry.kind === 'category' ? (ui.category ?? 'Раздел') : (ui.document ?? 'Документ')}</span>
          </a>
        ))
      ) : (
        <span className="docs-search-empty">{isQueryActive ? (ui.searchEmpty ?? 'Ничего не найдено') : (ui.searchStart ?? 'Начните вводить запрос для поиска по документации.')}</span>
      )}
    </div>
  );
}

function resolveSearchProvider(provider: SearchProviderConfig): ResolvedSearchProvider {
  if (typeof provider === 'string') {
    return {
      type: provider,
      endpoint: '',
      entries: [],
    };
  }

  return {
    type: provider.type ?? (provider.entries ? 'memory' : 'static'),
    endpoint: provider.endpoint ?? '',
    entries: provider.entries ?? [],
  };
}

function parseSearchEntriesPayload(payload: unknown): SearchEntry[] {
  const data = payloadObject(payload);
  let entries: unknown[] = [];

  if (Array.isArray(data)) {
    entries = data;
  } else if (data !== null) {
    entries = Array.isArray(data.entries)
      ? data.entries
      : Array.isArray(data.search)
        ? data.search
        : [];
  }

  return entries.map(normalizeSearchEntry).filter((entry): entry is SearchEntry => entry !== null);
}

function parseSearchResultsPayload(payload: unknown, query: string, textLocale: string): SearchResult[] {
  const data = payloadObject(payload);
  const results = data !== null && !Array.isArray(data) && Array.isArray(data.results) ? data.results : null;

  if (results !== null) {
    return results
      .map((result, index): SearchResult | null => {
        if (typeof result !== 'object' || result === null) {
          return null;
        }

        const record = result as Record<string, unknown>;
        const entry = normalizeSearchEntry(record.entry ?? record);
        if (entry === null) {
          return null;
        }

        return {
          entry,
          snippet: typeof record.snippet === 'string' ? record.snippet : '',
          score: typeof record.score === 'number' ? record.score : index,
        };
      })
      .filter((result): result is SearchResult => result !== null)
      .slice(0, SEARCH_RESULT_LIMIT);
  }

  return filterSearchEntries(parseSearchEntriesPayload(payload), query, textLocale);
}

function payloadObject(payload: unknown): Record<string, unknown> | unknown[] | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const data = record.data;

  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown> | unknown[];
  }

  return Array.isArray(payload) ? payload : record;
}

function normalizeSearchEntry(value: unknown): SearchEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const href = stringValue(record.href);
  const title = stringValue(record.title || record.label);

  if (href === '' || title === '') {
    return null;
  }

  return {
    id: stringValue(record.id) || href,
    title,
    label: stringValue(record.label) || title,
    href,
    kind: stringValue(record.kind),
    type: stringValue(record.type),
    description: stringValue(record.description),
    content: stringValue(record.content),
    contexts: Array.isArray(record.contexts) ? record.contexts.map(stringValue).filter(Boolean) : [],
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isModifierKey(event: KeyboardEvent): boolean {
  return event.key === 'Meta' || event.key === 'Control';
}

function platformModifierKey(): string {
  if (typeof window === 'undefined') {
    return 'Ctrl';
  }

  return /Mac|iPhone|iPad|iPod/i.test(window.navigator.platform) ? '⌘' : 'Ctrl';
}

function HighlightedText({ text, query, textLocale = 'ru' }: { text: string; query: string; textLocale?: string }) {
  const normalizedQuery = query.trim();
  if (normalizedQuery === '') {
    return <>{text}</>;
  }

  const index = text.toLocaleLowerCase(textLocale).indexOf(normalizedQuery.toLocaleLowerCase(textLocale));
  if (index < 0) {
    return <>{text}</>;
  }

  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + normalizedQuery.length)}</mark>
      {text.slice(index + normalizedQuery.length)}
    </>
  );
}

export function filterSearchEntries(entries: SearchEntry[], query: string, textLocale: string): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query, textLocale);
  if (normalizedQuery === '') {
    return [];
  }

  return entries
    .map((entry) => {
      const title = normalizeSearchText(entry.title, textLocale);
      const description = normalizeSearchText(entry.description, textLocale);
      const content = normalizeSearchText(entry.content, textLocale);
      const contextIndex = (entry.contexts ?? []).findIndex((context) => normalizeSearchText(context, textLocale).includes(normalizedQuery));
      const haystack = `${title} ${description} ${content}`;

      if (!haystack.includes(normalizedQuery) && contextIndex < 0) {
        return null;
      }

      const score = title.includes(normalizedQuery)
        ? 0
        : description.includes(normalizedQuery)
          ? 1
          : contextIndex >= 0
            ? 2
            : 3;

      return {
        entry,
        score,
        snippet: searchSnippet(entry, normalizedQuery, score, textLocale),
      };
    })
    .filter((item): item is SearchResult => item !== null)
    .sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title, textLocale))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((item) => item);
}

function normalizeSearchText(value: string, textLocale: string): string {
  return value.trim().toLocaleLowerCase(textLocale).replace(/\s+/g, ' ');
}

function searchSnippet(entry: SearchEntry, normalizedQuery: string, score: number, textLocale: string): string {
  if (score === 0) {
    return entry.description || contextSnippet(entry.contexts ?? [], normalizedQuery, textLocale) || trimSnippet(entry.content, normalizedQuery, textLocale);
  }

  if (score === 1) {
    return trimSnippet(entry.description, normalizedQuery, textLocale);
  }

  return contextSnippet(entry.contexts ?? [], normalizedQuery, textLocale) || trimSnippet(entry.content, normalizedQuery, textLocale);
}

function contextSnippet(contexts: string[], normalizedQuery: string, textLocale: string): string {
  for (const context of contexts) {
    if (normalizeSearchText(context, textLocale).includes(normalizedQuery)) {
      return trimSnippet(context, normalizedQuery, textLocale);
    }
  }

  return '';
}

function trimSnippet(value: string, normalizedQuery: string, textLocale: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text === '') {
    return '';
  }

  const normalizedText = text.toLocaleLowerCase(textLocale);
  const index = normalizedText.indexOf(normalizedQuery);
  if (index < 0) {
    return text.slice(0, 160);
  }

  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + normalizedQuery.length + 90);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}
