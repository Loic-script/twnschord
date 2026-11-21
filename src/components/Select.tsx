"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectGroup<T extends string> {
  group: string;
  options: SelectOption<T>[];
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  /** Options, éventuellement rangées par groupes titrés. */
  options: (SelectOption<T> | SelectGroup<T>)[];
  /** Ce que la liste permet de choisir, pour les lecteurs d'écran. */
  label: string;
}

const CLOSE_MS = 110;

/**
 * Liste déroulante de l'application : même usage qu'une liste du navigateur
 * (clic, flèches, Entrée, Échap, saisie des premières lettres), dans le style
 * de l'interface, avec une ouverture animée.
 */
export function Select<T extends string>({ value, onChange, options, label }: Props<T>) {
  const id = useId();
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const [align, setAlign] = useState<"start" | "end">("start");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const flat = useMemo(() => options.flatMap((item) => ("group" in item ? item.options : [item])), [options]);
  const selected = Math.max(0, flat.findIndex((option) => option.value === value));
  const open = state === "open";

  const show = () => {
    // La liste s'ouvre vers le haut quand la place manque en dessous.
    const rect = button.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - 90;
      setPlacement(below < 250 && rect.top > below ? "up" : "down");
      // Près du bord droit, la liste s'aligne à droite du bouton pour ne pas sortir de l'écran.
      setAlign(rect.left + 260 > window.innerWidth && rect.right > 260 ? "end" : "start");
    }
    setActive(selected);
    setState("open");
  };

  const hide = () => {
    if (state !== "open") return;
    setState("closing");
  };

  const choose = (index: number) => {
    const option = flat[index];
    if (option && option.value !== value) onChange(option.value);
    hide();
  };

  // La fermeture laisse le temps à l'animation de sortie.
  useEffect(() => {
    if (state !== "closing") return;
    const timer = setTimeout(() => setState("closed"), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // Un clic ailleurs referme la liste.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setState("closing");
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // L'option en cours reste visible quand on parcourt une longue liste au clavier.
  useEffect(() => {
    if (!open) return;
    const box = list.current;
    const item = box?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!box || !item) return;
    if (item.offsetTop < box.scrollTop) box.scrollTop = item.offsetTop - 6;
    else if (item.offsetTop + item.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = item.offsetTop + item.offsetHeight - box.clientHeight + 6;
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        show();
      }
      return;
    }
    if (key === "Escape" || key === "Tab") {
      if (key === "Escape") event.preventDefault();
      hide();
    } else if (key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (key === "End") {
      event.preventDefault();
      setActive(flat.length - 1);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      choose(active);
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Saisie des premières lettres : on saute à l'option qui commence ainsi.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + key.toLowerCase(), at: now };
      const match = flat.findIndex((option) => option.label.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) setActive(match);
    }
  };

  let index = -1;
  const renderOption = (option: SelectOption<T>) => {
    index++;
    const i = index;
    return (
      <div
        key={option.value}
        id={`${id}-${i}`}
        role="option"
        aria-selected={option.value === value}
        className="sel-option"
        style={{ "--i": i } as CSSProperties}
        data-index={i}
        data-active={i === active || undefined}
        // Le bouton garde le focus : la liste reste pilotable au clavier après un clic.
        onPointerDown={(e) => e.preventDefault()}
        onPointerEnter={() => setActive(i)}
        onClick={() => choose(i)}
      >
        <span>{option.label}</span>
        <svg className="sel-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </div>
    );
  };

  return (
    <div className="sel" ref={root} data-open={open || undefined}>
      <button
        ref={button}
        type="button"
        className="sel-btn"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onKeyDown}
      >
        <span className="sel-label">{flat[selected]?.label ?? ""}</span>
        <svg className="sel-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {state !== "closed" && (
        <div ref={list} id={`${id}-list`} role="listbox" aria-label={label} tabIndex={-1} className="sel-list" data-placement={placement} data-align={align} data-state={state}>
          {options.map((item) =>
            "group" in item ? (
              <div key={item.group} role="group" aria-label={item.group}>
                <div className="sel-group" aria-hidden="true">
                  {item.group}
                </div>
                {item.options.map(renderOption)}
              </div>
            ) : (
              renderOption(item)
            ),
          )}
        </div>
      )}
    </div>
  );
}
