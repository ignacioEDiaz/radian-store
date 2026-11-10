import { useId, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSuggestions } from '../hooks/useCatalog';
import styles from '../catalog.module.css';

/** Buscador con sugerencias (patrón combobox ARIA, navegación con teclado, debounce de 200 ms). */
export function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const navigate = useNavigate();
  const { data } = useSuggestions(q);

  const options = [
    ...(data?.products ?? []).map((p) => ({ key: p.id, label: p.title, hint: p.productType, href: `/productos/${p.slug}` })),
    ...(data?.collections ?? []).map((c) => ({ key: c.id, label: c.title, hint: 'Colección', href: `/colecciones/${c.slug}` })),
  ];
  const expanded = open && q.trim().length >= 2 && options.length > 0;

  function go(href: string) {
    setOpen(false);
    setActive(-1);
    setQ('');
    void navigate(href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = expanded && active >= 0 ? options[active] : undefined;
      if (option) go(option.href);
      else if (q.trim()) go(`/buscar?q=${encodeURIComponent(q.trim())}`);
    }
  }

  return (
    <div className={styles.search}>
      <input
        role="combobox"
        aria-label="Buscar productos"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        type="search"
        placeholder="Buscar"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => setOpen(true)}
      />
      <ul id={listId} role="listbox" className={styles.suggestions} hidden={!expanded}>
        {options.map((o, i) => (
          <li
            key={o.key}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? styles.activeOption : undefined}
            onMouseDown={(e) => {
              e.preventDefault();
              go(o.href);
            }}
          >
            <span>{o.label}</span> <small>{o.hint}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
