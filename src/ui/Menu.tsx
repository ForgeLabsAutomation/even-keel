import { Ellipsis, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A small "more actions" menu following the WAI-ARIA menu button pattern:
 * Enter/Space/ArrowDown opens it, arrow keys move, Escape closes and
 * returns focus to the button.
 */
export function MenuButton({ label, items, icon: Icon = Ellipsis }: { label: string; items: MenuItem[]; icon?: LucideIcon }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const focusItem = (index: number) => {
    const els = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    if (!els || els.length === 0) return;
    els[(index + els.length) % els.length].focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    focusItem(0);
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  return (
    <div className="menu">
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon size={18} />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="menu__list"
          onKeyDown={(e) => {
            const els = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
            const index = els.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusItem(index + 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              focusItem(index - 1);
            } else if (e.key === 'Home') {
              e.preventDefault();
              focusItem(0);
            } else if (e.key === 'End') {
              e.preventDefault();
              focusItem(els.length - 1);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === 'Tab') {
              close(false);
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu__item ${item.danger ? 'menu__item--danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.icon && <item.icon size={16} aria-hidden="true" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
