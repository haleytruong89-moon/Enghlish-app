"use client";

import { useState } from "react";
import { skillMapCopy } from "@/lib/copy/vi";
import type { DomainKey, SkillMapView } from "@/lib/skillmap/types";

/** The domain shown: what the user picked in this picker, else the default (which follows the open tab) - so a tab change never overrides a choice. */
export function effectiveDomain(picked: string | null, defaultDomain: DomainKey | null): string {
  return picked ?? defaultDomain ?? "";
}

/** Domain, then group of that domain (two native selects: phone-friendly). `onChange(null)` while no group is chosen. */
export function GroupPicker({
  map,
  value,
  onChange,
  testIdPrefix,
  defaultDomain = null,
}: {
  map: SkillMapView;
  value: string | null;
  onChange: (groupKey: string | null) => void;
  testIdPrefix: string;
  defaultDomain?: DomainKey | null;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const domain = effectiveDomain(picked, defaultDomain);
  const groups = map.domains.find((d) => d.key === domain)?.groups ?? [];
  const select = "min-h-11 min-w-0 rounded-lg border border-line bg-white px-2 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-muted">{skillMapCopy.domainLabel}</span>
        <select
          value={domain}
          onChange={(e) => {
            setPicked(e.target.value);
            onChange(null);
          }}
          data-testid={`${testIdPrefix}-domain`}
          className={select}
        >
          <option value="">{skillMapCopy.pickDomain}</option>
          {map.domains.map((d) => (
            <option key={d.key} value={d.key}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-muted">{skillMapCopy.groupLabel}</span>
        <select
          value={value ?? ""}
          disabled={!domain}
          onChange={(e) => onChange(e.target.value || null)}
          data-testid={`${testIdPrefix}-group`}
          className={select}
        >
          <option value="">{skillMapCopy.pickGroup}</option>
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
