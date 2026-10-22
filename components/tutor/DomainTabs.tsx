"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { skillMapCopy } from "@/lib/copy/vi";
import type { Bucket } from "@/lib/skillmap/group";

/** ARIA tabs keyboard rule: arrows move to the neighbour (wrapping), Home / End to the ends; any other key does nothing. */
export function nextTabKey(keys: string[], current: string, pressed: string): string | null {
  if (keys.length === 0) return null;
  const i = Math.max(0, keys.indexOf(current));
  if (pressed === "ArrowRight") return keys[(i + 1) % keys.length]!;
  if (pressed === "ArrowLeft") return keys[(i - 1 + keys.length) % keys.length]!;
  if (pressed === "Home") return keys[0]!;
  if (pressed === "End") return keys[keys.length - 1]!;
  return null;
}

/**
 * Items of the skill map by domain (SM-1): one tab per domain (+ "Chưa xếp mảng"), group headings inside a tab, and a quick search
 * across every domain. Every panel is rendered and the inactive ones are `hidden`, so a choice in another tab keeps its state.
 * Controlled: the parent keeps the active tab (so it can jump to the tab of a tag it just added).
 */
export function DomainTabs<T>({
  buckets,
  active,
  onActive,
  itemKey,
  itemText,
  renderItem,
  testId,
}: {
  buckets: Bucket<T>[];
  active: string;
  onActive: (key: string) => void;
  itemKey: (item: T) => string;
  itemText: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  testId: string;
}) {
  const [query, setQuery] = useState("");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const q = query.trim().toLowerCase();
  const hits = q
    ? buckets.flatMap((b) =>
        b.groups.flatMap((g) =>
          g.items
            .filter((it) => itemText(it).toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
            .map((it) => ({ it, place: b.key === g.key ? b.name : skillMapCopy.place(b.name, g.name) })),
        ),
      )
    : [];

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const next = nextTabKey(buckets.map((b) => b.key), active, e.key);
    if (next === null) return;
    e.preventDefault();
    onActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`tabs-${testId}`}>
      <input
        type="search"
        aria-label={skillMapCopy.search}
        placeholder={skillMapCopy.searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid={`search-${testId}`}
        className="min-h-11 rounded-lg border border-line px-3 text-sm"
      />
      {q ? (
        <ul className="flex flex-col gap-2" data-testid={`results-${testId}`}>
          {hits.length === 0 ? <li className="text-sm text-muted">{skillMapCopy.noMatch}</li> : null}
          {hits.map(({ it, place }) => (
            <li key={itemKey(it)} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{place}</span>
              {renderItem(it)}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div role="tablist" aria-label={skillMapCopy.tabsLabel} className="flex flex-wrap gap-2">
            {buckets.map((b) => {
              const on = b.key === active;
              return (
                <button
                  key={b.key}
                  ref={(el) => {
                    tabRefs.current[b.key] = el;
                  }}
                  type="button"
                  role="tab"
                  tabIndex={on ? 0 : -1}
                  onKeyDown={onTabKey}
                  id={`tab-${testId}-${b.key}`}
                  aria-selected={on}
                  aria-controls={`panel-${testId}-${b.key}`}
                  onClick={() => onActive(b.key)}
                  data-testid={`tab-${testId}-${b.key}`}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`}
                >
                  {b.name} <span className="ml-1 text-xs opacity-80">{b.total}</span>
                </button>
              );
            })}
          </div>
          {buckets.map((b) => (
            <div
              key={b.key}
              role="tabpanel"
              id={`panel-${testId}-${b.key}`}
              aria-labelledby={`tab-${testId}-${b.key}`}
              tabIndex={0}
              hidden={b.key !== active}
              data-testid={`panel-${testId}-${b.key}`}
              className="flex flex-col gap-3"
            >
              {b.groups.length === 0 ? <p className="text-sm text-muted">{skillMapCopy.emptyDomain}</p> : null}
              {b.groups.map((g) => (
                <section key={g.key} aria-label={g.name} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-muted">{g.name}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {g.items.map((it) => (
                      <li key={itemKey(it)}>{renderItem(it)}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
