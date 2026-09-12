const paths = {
  email: "M3 5h18v14H3V5Zm0 1 9 7 9-7",
  lock: "M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4M12 14v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  gift: "M3 8h18v5H3V8Zm2 5v8h14v-8M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z",
  chart: "M3 3v18h18M6 16l5-5 4 2 6-8M16 5h5v5M7 18v-2m5 2v-4m5 4v-3",
  pie: "M12 3v9h9a9 9 0 1 1-9-9Zm3 0v6h6a6 6 0 0 0-6-6Z",
  live: "M4 4a12 12 0 0 0 0 16M20 4a12 12 0 0 1 0 16M8 7a7 7 0 0 0 0 10M16 7a7 7 0 0 1 0 10M12 10v4",
  shield: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6",
} as const;

export function AuthIcon({
  name,
  className = "size-5",
}: {
  name: keyof typeof paths;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
