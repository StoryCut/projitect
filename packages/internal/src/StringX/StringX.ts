import { Array } from "effect"

// ---------------------------------------------------------------------------
// Line-range text editing — projitect-specific extras not yet upstreamed to
// `@nunofyobiz/effect-extras`'s `StringX`. See AGENTS.md "Where utilities live".
// ---------------------------------------------------------------------------

/**
 * Replace the inclusive line range `[startLine, endLine]` of `content` with `replacement`
 * lines, returning the rejoined string. Pass an empty `replacement` to delete the range.
 */
export const replaceLineRange = (
  content: string,
  startLine: number,
  endLine: number,
  replacement: readonly string[],
): string => {
  const lines = content.split("\n")
  return Array.join(
    [...Array.take(lines, startLine), ...replacement, ...Array.drop(lines, endLine + 1)],
    "\n",
  )
}

/**
 * Insert `lines` immediately before the line at `anchorIndex`, preserving the anchor line and
 * everything after it. Returns the rejoined string.
 */
export const insertBeforeLine = (
  content: string,
  anchorIndex: number,
  lines: readonly string[],
): string => {
  const split = content.split("\n")
  return Array.join(
    [...Array.take(split, anchorIndex), ...lines, ...Array.drop(split, anchorIndex)],
    "\n",
  )
}
