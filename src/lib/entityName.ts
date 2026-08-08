/**
 * Some real NWS location entities are a semicolon-delimited list of
 * counties/zones bundled into one string by the source feed (e.g. "Benton,
 * WA; Columbia, WA; Franklin, WA; ..."), not a fabrication or a merge error
 * this app introduced — see the redesign's data-quality note. This only
 * changes how that real string is *displayed*: the underlying entity name
 * is never altered, split, or re-saved.
 */
export interface SplitEntityName {
  /** First segment — the concise label shown as the primary title. */
  primary: string
  /** How many additional segments exist beyond the primary one (0 for an ordinary short name). */
  extraCount: number
  /** The untouched, original full name — always available for a tooltip/detail view. */
  full: string
}

const MULTI_PART_DELIMITER = ';'
/** Above this length, even a single-segment name gets truncated with an ellipsis (a tooltip/title attribute still carries the full value) — protects against any other kind of unusually long real name, not just the semicolon-delimited case. */
const MAX_PRIMARY_LENGTH = 48

export function splitEntityName(name: string): SplitEntityName {
  const parts = name
    .split(MULTI_PART_DELIMITER)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (parts.length <= 1) {
    const single = parts[0] ?? name
    if (single.length <= MAX_PRIMARY_LENGTH) return { primary: single, extraCount: 0, full: name }
    return { primary: `${single.slice(0, MAX_PRIMARY_LENGTH - 1).trimEnd()}…`, extraCount: 0, full: name }
  }

  const [first, ...rest] = parts
  const primary = first.length <= MAX_PRIMARY_LENGTH ? first : `${first.slice(0, MAX_PRIMARY_LENGTH - 1).trimEnd()}…`
  return { primary, extraCount: rest.length, full: name }
}
