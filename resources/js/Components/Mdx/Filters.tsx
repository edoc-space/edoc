import React from 'react';
import { Link } from '@inertiajs/react';
import { Button } from '@phpsoftbox/react-softbox';

export type FilterOption = { value: string; label: string; count?: number; href?: string };
type FiltersProps = {
  label: string;
  options: FilterOption[];
  value: string;
  className?: string;
} & ({ mode?: 'local'; onChange: (value: string) => void } | { mode: 'navigation'; onChange?: never });

/** Data ownership stays with the caller. Navigation preserves real server URLs/history. */
export function Filters(props: FiltersProps) {
  return <fieldset className={['collection-filters', props.className].filter(Boolean).join(' ')}>
    <legend>{props.label}</legend>
    <div className="collection-filter-options">
      {props.options.map(option => {
        const content = <>{option.label}{option.count !== undefined ? <span> ({option.count})</span> : null}</>;
        const selected = option.value === props.value;
        return props.mode === 'navigation'
          ? <Link key={option.value} href={option.href!} prefetch={false} aria-current={selected ? 'true' : undefined}>{content}</Link>
          : <Button key={option.value} type="button" variant="secondary" appearance="outline"
            style={selected ? { background: 'var(--color-text)', color: 'var(--color-body-bg)', borderColor: 'var(--color-text)' } : undefined}
            aria-pressed={selected} onClick={() => props.onChange(option.value)}>{content}</Button>;
      })}
    </div>
  </fieldset>;
}
