import React from 'react';
import { Alert, Badge, Button, Input, Modal, Notifier, Progress, Tooltip } from '@phpsoftbox/react-softbox';
import { MdxLayoutContext } from './context';
import { Card, Accordion, Cta } from './ContentBlocks';
import { Columns, Grid } from './Layout';
import { Filters } from './Filters';
import { EmptyState } from './Collections';
import { Section } from './Section';
import { Tabs, Tab } from './Tabs';
import { Gallery, Video } from './Media';
import { Slider } from './Slider';
import { useModalFocus } from '../useModalFocus';
import './BlocksCatalog.css';

type DialogProps = { open: boolean; onClose: () => void; title: string; closeLabel: string; children: React.ReactNode };

/** Adds naming and the engine's shared focus lifecycle to the existing UI-kit Modal. */
export function CatalogDialog({ open, onClose, title, closeLabel, children }: DialogProps) {
  const dialogId = React.useId();
  const titleId = `${dialogId}-title`;
  const attach = React.useCallback((node: HTMLDivElement | null) => {
    const dialog = node?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    dialog.id = dialogId;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.querySelector('header button')?.setAttribute('aria-label', closeLabel);
  }, [dialogId, titleId, closeLabel]);
  useModalFocus(open, dialogId);
  return <Modal open={open} onClose={onClose} lockScroll={false} size="sm">
    <div ref={attach} className="catalog-dialog">
      <h2 id={titleId}>{title}</h2>{children}
      <Button type="button" onClick={onClose} data-catalog-dialog-close>{closeLabel}</Button>
    </div>
  </Modal>;
}

type CatalogNotice = { id: string; number: number };

/** One UI-kit stack for the catalogue; each example owns only its own item. */
function CatalogNotifications({ notices, english, onDismiss }: {
  notices: CatalogNotice[]; english: boolean; onDismiss: (id: string) => void;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  const closeLabel = english ? 'Close' : 'Закрыть';
  // UI-kit 2.8.3 has no closeLabel prop. Adapt only this instance's toast DOM.
  React.useLayoutEffect(() => {
    root.current?.querySelectorAll('[role="region"] > div').forEach(toast => {
      toast.setAttribute('role', 'status');
      toast.querySelector('button')?.setAttribute('aria-label', closeLabel);
    });
  }, [notices, closeLabel]);
  return <div ref={root} data-catalog-notifications><Notifier
    items={notices.map(({ id, number }) => ({ id,
      title: `${english ? 'Example notification' : 'Пример уведомления'} ${number}`,
      message: english ? 'No data has been sent.' : 'Никакие данные не отправлены.',
      variant: 'success', duration: 0,
    }))} onDismiss={onDismiss} /></div>;
}

const initialFields = { name: '', notes: '', email: '', status: 'draft', size: 'small', checked: false, enabled: false };

function InteractiveExample({ number, english, onNotify }: {
  number: number; english: boolean; onNotify: (id: string, number: number) => void;
}) {
  const id = React.useId();
  const [count, setCount] = React.useState(0);
  const [filter, setFilter] = React.useState('all');
  const [dialog, setDialog] = React.useState(false);
  const [tip, setTip] = React.useState(false);
  const tipPinned = React.useRef(false);
  const [fields, setFields] = React.useState(initialFields);
  const updateField = <K extends keyof typeof initialFields,>(key: K, value: typeof initialFields[K]) =>
    setFields(current => ({ ...current, [key]: value }));
  const [validated, setValidated] = React.useState(false);
  const t = (ru: string, en: string) => english ? en : ru;
  const invalid = validated && fields.name.trim() === '';
  const closeLabel = t('Закрыть пример', 'Close example');
  return <section className="catalog-example" data-catalog-instance aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>{t('Независимый пример', 'Independent example')} {number}</h3>
    <div className="catalog-row" data-catalog-group="overlays">
      <Button type="button" data-catalog-increment onClick={() => setCount(current => current + 1)}>
        {t('Увеличить счётчик', 'Increment counter')}
      </Button>
      <output data-catalog-count aria-live="polite">{count}</output>
      <Button type="button" appearance="outline" data-catalog-dialog-trigger onClick={() => setDialog(true)}>
        {t('Открыть диалог', 'Open dialog')}
      </Button>
      <span onKeyDown={event => { if (event.key === 'Escape') { tipPinned.current = false; setTip(false); event.stopPropagation(); } }}>
        <Button id={`${id}-tooltip-trigger`} type="button" appearance="ghost" data-catalog-tooltip-trigger
          aria-describedby={tip ? `${id}-tooltip-description` : undefined}
          onClick={() => { tipPinned.current = !tipPinned.current; setTip(tipPinned.current); }}>{t('Подсказка', 'Tooltip')}</Button>
        <Tooltip anchorId={`${id}-tooltip-trigger`}
          content={<span id={`${id}-tooltip-description`}>{t('Подсказка доступна с клавиатуры и по нажатию.', 'This tooltip supports keyboard and touch.')}</span>}
          open={tip} onOpenChange={next => { if (!next) tipPinned.current = false; setTip(next); }} openOnFocus openOnClick={false} delay={0} />
      </span>
    </div>
    <div data-catalog-group="navigation"><Filters label={`${t('Отбор примера', 'Example filter')} ${number}`} value={filter} onChange={setFilter}
      options={[{ value: 'all', label: t('Все', 'All') }, { value: 'ready', label: t('Готово', 'Ready') }, { value: 'empty', label: t('Пустой набор', 'Empty set') }]} />
    {filter === 'empty' ? <EmptyState title={t('По выбранным условиям ничего нет.', 'No items match these filters.')} />
      : <p data-catalog-filter-result>{filter === 'ready' ? t('Готово: 1', 'Ready: 1') : t('Всего: 2', 'Total: 2')}</p>}
    <Tabs label={`${t('Вкладки примера', 'Example tabs')} ${number}`}>
      <Tab title={t('Описание', 'Overview')}><p>{t('Каждый экземпляр хранит собственное состояние.', 'Each example keeps its own state.')}</p></Tab>
      <Tab title={t('Код', 'Code')}><pre><code>{'<Tabs><Tab title="Overview">…</Tab><Tab title="Code">…</Tab></Tabs>'}</code></pre></Tab>
    </Tabs></div>
    <fieldset className="catalog-fields" data-catalog-group="forms"><legend>{t('Поля без отправки данных', 'Fields without data delivery')}</legend>
      <Input>
        <Input.Label htmlFor={`${id}-name`} required>{t('Название', 'Name')}</Input.Label>
        <Input.Control><Input.Field id={`${id}-name`} required value={fields.name} onChange={event => updateField('name', event.target.value)}
          hasError={invalid} aria-invalid={invalid} aria-describedby={`${id}-help`} /></Input.Control>
        <div id={`${id}-help`}>{invalid ? <Input.ErrorBag>{t('Введите название.', 'Enter a name.')}</Input.ErrorBag>
          : <small>{t('Данные остаются только в этом примере.', 'Data stays in this example only.')}</small>}</div>
      </Input>
      <Input><Input.Label htmlFor={`${id}-email`}>{t('Email для примера', 'Demo email')}</Input.Label>
        <Input.Field id={`${id}-email`} type="email" autoComplete="off" placeholder="demo@example.com"
          value={fields.email} onChange={event => updateField('email', event.target.value)} /></Input>
      <Input.Switch label={t('Включить пример', 'Enable example')} checked={fields.enabled} aria-checked={fields.enabled}
        onChange={event => updateField('enabled', event.target.checked)} />
      <Input><Input.Label htmlFor={`${id}-readonly`}>{t('Только чтение', 'Read only')}</Input.Label>
        <Input.Field id={`${id}-readonly`} readOnly value={t('Синтетические данные', 'Synthetic data')} /></Input>
      <Input><Input.Label htmlFor={`${id}-disabled`}>{t('Недоступное поле', 'Disabled field')}</Input.Label>
        <Input.Field id={`${id}-disabled`} disabled value="Disabled" /></Input>
      <Input><Input.Label htmlFor={`${id}-notes`}>{t('Заметка', 'Note')}</Input.Label>
        <Input.TextArea id={`${id}-notes`} value={fields.notes} onChange={event => updateField('notes', event.target.value)} rows={3} placeholder={t('Короткое описание', 'Short description')} /></Input>
      <Input.Select label={t('Статус', 'Status')} id={`${id}-status`} value={fields.status} onChange={value => updateField('status', value)}
        options={[{ value: 'draft', label: t('Черновик', 'Draft') }, { value: 'ready', label: t('Готово', 'Ready') }]} />
      <Input.Checkbox label={t('Выбрать пример', 'Select example')} checked={fields.checked} onChange={event => updateField('checked', event.target.checked)} />
      <fieldset><legend>{t('Размер', 'Size')}</legend><div className="catalog-row">
        <Input.Radio label={t('Маленький', 'Small')} name={`${id}-size`} value="small" checked={fields.size === 'small'} onChange={() => updateField('size', 'small')} />
        <Input.Radio label={t('Большой', 'Large')} name={`${id}-size`} value="large" checked={fields.size === 'large'} onChange={() => updateField('size', 'large')} />
      </div></fieldset>
      <div className="catalog-row" data-catalog-group="buttons">
        <Button type="button" data-catalog-validate onClick={() => setValidated(true)}>{t('Проверить поле', 'Validate field')}</Button>
        <Button type="button" appearance="outline" disabled>{t('Недоступно', 'Disabled')}</Button>
        <Button type="button" appearance="ghost" onClick={() => { setValidated(false); setFields(initialFields); }}>{t('Сбросить', 'Reset')}</Button>
      </div>
    </fieldset>
    <Button type="button" onClick={() => onNotify(id, number)}>{t('Показать уведомление', 'Show notification')}</Button>
    <CatalogDialog open={dialog} onClose={() => setDialog(false)} title={`${t('Пример диалога', 'Example dialog')} ${number}`} closeLabel={closeLabel}>
      <p>{t('Tab остаётся внутри; Escape закрывает окно и возвращает фокус.', 'Tab stays inside; Escape closes the dialog and restores focus.')}</p>
      <Input><Input.Label htmlFor={`${id}-dialog`}>{t('Поле в диалоге', 'Dialog field')}</Input.Label><Input.Field id={`${id}-dialog`} /></Input>
    </CatalogDialog>
  </section>;
}

const sampleImage = (fill: string, text: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><rect width="640" height="240" fill="${fill}"/><text x="28" y="130" fill="#fff" font-family="sans-serif" font-size="28">${text}</text></svg>`)}`;
const images = [{ src: sampleImage('#405b87', 'E-Doc / 01'), alt: 'E-Doc / 01' }, { src: sampleImage('#685087', 'E-Doc / 02'), alt: 'E-Doc / 02' }];

/** Public synthetic examples shared by both themes; this component sends no requests. */
export function BlocksCatalog() {
  const english = React.useContext(MdxLayoutContext).locale?.code === 'en';
  const t = (ru: string, en: string) => english ? en : ru;
  const [notices, setNotices] = React.useState<CatalogNotice[]>([]);
  const notify = React.useCallback((id: string, number: number) => {
    setNotices(current => current.some(item => item.id === id) ? current : [...current, { id, number }]);
  }, []);
  const dismiss = React.useCallback((id: string) => setNotices(current => current.filter(item => item.id !== id)), []);
  const sections = [
    ['colors', t('Цвета', 'Colors')], ['typography', t('Типографика', 'Typography')],
    ['layout', t('Карточки и композиция', 'Cards and composition')], ['status', t('Метки и состояния', 'Badges and feedback')],
    ['interaction', t('Кнопки, формы и навигация', 'Buttons, forms and navigation')],
    ['content', t('Данные', 'Data')], ['media', t('Медиа', 'Media')], ['tokens', t('Токены', 'Tokens')],
  ];
  return <div className="blocks-catalog" data-blocks-catalog>
    <CatalogNotifications notices={notices} english={english} onDismiss={dismiss} />
    <Section title={t('Общие компоненты', 'Shared components')}>
      <p>{t('Общие компоненты, реальные состояния и доступная интерактивность.', 'Shared components, real states and accessible interaction.')}</p>
    </Section>
    <nav className="catalog-row" aria-label={t('Разделы каталога', 'Catalogue sections')}>
      {sections.map(([section, label]) => <a key={section} href={`#catalog-${section}`}>{label}</a>)}
    </nav>
    <div id="catalog-colors" data-catalog-group="colors"><Section title={t('Цветовая палитра', 'Color palette')}>
      <p>{t('Образцы используют токены выбранной темы; подписи сохраняют смысл без цвета.', 'Swatches use the active theme tokens; labels preserve meaning without color.')}</p>
      <div className="catalog-swatches">
        {[
          ['--color-bg', t('Фон', 'Background')], ['--color-surface', t('Поверхность', 'Surface')],
          ['--color-surface-2', t('Вторичная поверхность', 'Secondary surface')], ['--color-text', t('Текст', 'Text')],
          ['--color-muted', t('Вторичный текст', 'Muted text')], ['--color-mint', t('Акцент', 'Accent')],
          ['--badge-success-bg', t('Успех', 'Success')], ['--color-danger-bg', t('Ошибка', 'Danger')],
        ].map(([token, label]) => <div className="catalog-swatch" key={token}>
          <div className="catalog-swatch-color" style={{ background: `var(${token})` }} aria-hidden="true" />
          <strong>{label}</strong><code>{token}</code>
        </div>)}
      </div>
    </Section></div>
    <div id="catalog-typography" data-catalog-group="typography"><Section title={t('Типографика', 'Typography')}>
      <div className="catalog-type-scale">
        <p className="catalog-type-display">{t('Крупный текст', 'Display text')} <small>clamp(2rem, 5vw, 3.5rem)</small></p>
        <h3>{t('Заголовок раздела', 'Section heading')}</h3>
        <p>{t('Основной текст. Читаемый ритм и длина строки помогают изучать материал.', 'Body text. Readable rhythm and line length help readers explore content.')}</p>
        <small>{t('Подпись и метаданные', 'Caption and metadata')}</small>
        <code>const theme = 'shared';</code>
      </div>
    </Section></div>
    <div id="catalog-layout" data-catalog-group="cards"><Section title={t('Композиция', 'Composition')}>
      <Grid columns={2}><Card title={t('Карточка с длинным заголовком и описанием', 'Card with a long title and description')}
        href="#catalog-interaction" label={t('Перейти к примерам', 'Explore examples')}>
        <p>{t('Сетка принимает произвольные блоки. Изображение необязательно.', 'The grid accepts any blocks. An image is optional.')}</p>
      </Card><Card title={t('Без изображения', 'Without an image')}><p>{t('Карточка сохраняет читабельность на узком экране.', 'Cards remain readable on narrow screens.')}</p></Card></Grid>
      <Columns columns={2}><div><h3>{t('Текст', 'Text')}</h3><p>{t('Общая раскладка и семантические заголовки.', 'Shared layout and semantic headings.')}</p></div>
        <div><h3>{t('Действие', 'Action')}</h3><a href="#catalog-content">{t('Посмотреть содержимое', 'Explore content')}</a></div></Columns>
      <pre><code>{'<Grid columns={2}><Card title="Example" href="/about" label="Read">…</Card><Card title="Another">…</Card></Grid>'}</code></pre>
      <Cta title={t('Соберите свою страницу', 'Compose your page')} href="#catalog-interaction" label={t('Проверить блоки', 'Try the blocks')} />
    </Section></div>
    <div id="catalog-status" data-catalog-group="feedback"><Section title={t('Статусы и уведомления', 'Status and feedback')}>
      <div className="catalog-row" data-catalog-group="badges"><Badge variant="success">{t('Готово', 'Ready')}</Badge><Badge variant="warning">{t('В работе', 'In progress')}</Badge>
        <Badge variant="danger">{t('Ошибка', 'Error')}</Badge><Badge variant="primary">MDX</Badge><Badge shape="pill">12</Badge></div>
      <div className="catalog-stack">
        <Alert variant="info" title={t('Информация', 'Information')}>{t('Статический пример сообщения.', 'Static message example.')}</Alert>
        <Alert variant="success" title={t('Успех', 'Success')}>{t('Подтверждение локального действия.', 'Local action confirmation.')}</Alert>
        <Alert variant="warning" title={t('Внимание', 'Attention')}>{t('Проверьте введённое значение.', 'Check the entered value.')}</Alert>
        <Alert variant="danger" title={t('Ошибка', 'Error')}>{t('Образец ошибки. Сеть и доставка формы не подключены.', 'Example error. Network and form delivery are not connected.')}</Alert>
        <div className="catalog-loading">
          <div role="status" className="catalog-row"><span className="catalog-spinner" aria-hidden="true" />{t('Загрузка', 'Loading')}</div>
          <Progress value={65} max={100} label={t('Прогресс загрузки', 'Loading progress')} showValue />
          <div data-catalog-skeleton role="img" aria-label={t('Образец каркаса загрузки', 'Loading skeleton preview')}>
            <span /><span /><span />
          </div>
        </div>
        <EmptyState title={t('Пока ничего нет', 'Nothing here yet')}><p>{t('Попробуйте изменить отбор.', 'Try changing the filters.')}</p></EmptyState>
      </div>
    </Section></div>
    <div id="catalog-interaction"><Section title={t('Интерактивные состояния', 'Interactive states')}>
      <p>{t('Два экземпляра независимы. Поля не отправляются на сервер; email-подписки нет.', 'The two instances are independent. Fields are not sent to a server; there is no email subscription.')}</p>
      <InteractiveExample number={1} english={english} onNotify={notify} /><InteractiveExample number={2} english={english} onNotify={notify} />
      <Accordion title={t('Как работает этот FAQ?', 'How does this FAQ work?')}><p>{t('Нативный details поддерживает Enter и пробел без глобального JavaScript.', 'Native details supports Enter and Space without global JavaScript.')}</p></Accordion>
    </Section></div>
    <div id="catalog-content" data-catalog-group="data"><Section title={t('Таблицы, списки и цитаты', 'Tables, lists and quotes')}>
      <div className="catalog-table" role="region" aria-label={t('Таблица вариантов', 'Variants table')} tabIndex={0}>
        <table><caption>{t('Пример публичных данных', 'Example public data')}</caption><thead><tr><th scope="col">{t('Блок', 'Block')}</th><th scope="col">{t('Назначение', 'Purpose')}</th></tr></thead>
          <tbody><tr><th scope="row">Card</th><td>{t('Композиция содержимого и действий', 'Content and actions composition')}</td></tr><tr><th scope="row">Grid</th><td>{t('Адаптивная раскладка', 'Responsive layout')}</td></tr></tbody></table>
      </div>
      <ul><li>{t('Первый пункт', 'First item')}</li><li>{t('Второй пункт', 'Second item')}</li></ul>
      <blockquote>{t('Контент и тема используют один renderer.', 'Content and themes use a single renderer.')}</blockquote>
      <pre><code>{'<Tabs label="Example"><Tab title="Overview">…</Tab><Tab title="Code">…</Tab></Tabs>'}</code></pre>
    </Section></div>
    <div id="catalog-tokens" data-catalog-group="tokens"><Section title={t('Размеры, интервалы и скругления', 'Sizes, spacing and radii')}>
      <h3>{t('Размеры кнопок', 'Button sizes')}</h3>
      <div className="catalog-row">{(['sm', 'md', 'lg'] as const).map(size => <Button key={size} type="button" size={size}>{size}</Button>)}</div>
      <h3>{t('Интервалы', 'Spacing')}</h3>
      <div className="catalog-token-grid">{[4, 8, 16, 24, 32].map(space => <div key={space}>
        <span className="catalog-space" style={{ width: space }} aria-hidden="true" /><code>{space}px</code>
      </div>)}</div>
      <h3>{t('Скругления', 'Radii')}</h3>
      <div className="catalog-token-grid">{['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg'].map(token =>
        <div key={token}><span className="catalog-radius" style={{ borderRadius: `var(${token})` }} aria-hidden="true" /><code>{token}</code></div>)}</div>
      <pre><code>{'.example { padding: 1rem; border-radius: var(--radius-md); background: var(--surface-panel); }'}</code></pre>
    </Section></div>
    <div id="catalog-media"><Section title={t('Медиа', 'Media')}>
      <Gallery id="catalog"><img src={images[0].src} alt={images[0].alt} /><img src={images[1].src} alt={images[1].alt} /></Gallery>
      <Slider title={t('Два синтетических кадра', 'Two synthetic frames')} images={images} />
      <Video provider="youtube" id="M7lc1UVf-VE" title={t('Пример видео: загрузка только по нажатию', 'Video example: load only on demand')} />
      <p>{t('Галерея и слайдер используют локальные синтетические изображения. Видео запрашивает внешний сервис только после нажатия; его доступность не гарантируется.', 'Gallery and slider use local synthetic images. Video requests an external service only after activation; its availability is not guaranteed.')}</p>
    </Section></div>
  </div>;
}
