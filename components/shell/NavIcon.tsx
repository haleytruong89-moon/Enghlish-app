/** Small stroke icons for the left column (hướng B v2): decorative, the label next to them says what they are. */
const PATHS: Record<string, string[]> = {
  grade: ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  assign: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
  note: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  desk: ["M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  work: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"],
  sessions: ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M16 2v4M8 2v4M3 10h18"],
  progress: ["M3 3v18h18", "M7 15l4-4 3 3 5-6"],
  plan: ["M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z", "M8 2v16M16 6v16"],
  profile: ["M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z", "M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"],
};

export function NavIcon({ name, className = "" }: { name: string; className?: string }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {d.map((p) => <path key={p} d={p} />)}
    </svg>
  );
}
