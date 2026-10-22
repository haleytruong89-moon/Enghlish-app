"use client";

import { useState } from "react";
import { GroupPicker } from "@/components/tutor/GroupPicker";
import { feedbackCopy } from "@/lib/copy/vi";
import type { Leaf } from "@/lib/revision/types";
import type { SkillMapView } from "@/lib/skillmap/types";

const keyOf = (l: Leaf) => `${l.kind}:${l.refKey}`;

/** The group and the name of a leaf in the map; null when it has no group (it cannot be chosen, D16). */
export function findLeaf(map: SkillMapView, leaf: Leaf): { groupKey: string; label: string } | null {
  for (const d of map.domains) {
    for (const g of d.groups) {
      const hit = g.leaves.find((l) => l.kind === leaf.kind && l.refKey === leaf.refKey);
      if (hit) return { groupKey: g.key, label: hit.label };
    }
  }
  return null;
}

/** Optional skill of one feedback item (1-b, D16): domain → group (SM-1 GroupPicker) → leaf. The child never sees it. */
export function LeafPicker({ map, value, onChange, testIdPrefix }: { map: SkillMapView; value: Leaf | null; onChange: (l: Leaf | null) => void; testIdPrefix: string }) {
  const [group, setGroup] = useState<string | null>(() => (value ? (findLeaf(map, value)?.groupKey ?? null) : null));
  const leaves = map.domains.flatMap((d) => d.groups).find((g) => g.key === group)?.leaves.filter((l) => !l.hiddenInPicker) ?? [];
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{feedbackCopy.leafLabel}</span>
      <GroupPicker
        map={map}
        value={group}
        onChange={(g) => {
          setGroup(g);
          onChange(null);
        }}
        testIdPrefix={testIdPrefix}
      />
      <select
        aria-label={feedbackCopy.leafPick}
        value={value ? keyOf(value) : ""}
        disabled={!group}
        onChange={(e) => {
          const hit = leaves.find((l) => keyOf({ kind: l.kind, refKey: l.refKey }) === e.target.value);
          onChange(hit ? { kind: hit.kind, refKey: hit.refKey } : null);
        }}
        data-testid={`${testIdPrefix}-leaf`}
        className="min-h-11 min-w-0 rounded-lg border border-line bg-white px-2 text-sm"
      >
        <option value="">{feedbackCopy.leafNone}</option>
        {leaves.map((l) => (
          <option key={keyOf({ kind: l.kind, refKey: l.refKey })} value={keyOf({ kind: l.kind, refKey: l.refKey })}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
