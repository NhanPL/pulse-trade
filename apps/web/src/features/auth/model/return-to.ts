export function safeReturnTo(value: string | string[] | undefined): string {
  // Allow product routes only: no external URLs, auth loops, encoded paths or backslashes.
  if (
    typeof value !== "string" ||
    Array.from(value).some(
      (character) =>
        character === "\\" || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return "/";
  return /^\/(?:trade\/[A-Z0-9]+-[A-Z0-9]+|portfolio|orders|watchlist)?(?:[?#].*)?$/.test(value)
    ? value
    : "/";
}
