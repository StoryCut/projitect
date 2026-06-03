import { Array } from "effect"
import { dual } from "effect/Function"

/**
 * Prepends `start` to `string_`. v4's `String` module has no native `prepend` (only `concat`),
 * so we keep this as a pipeable helper.
 */
export const prepend = dual<
  (start: string) => (string_: string) => string,
  (string_: string, start: string) => string
>(2, (string_: string, start: string): string => `${start}${string_}`)

/**
 * Wraps `string_` between `start` and `end`. No v4 native equivalent.
 */
export const surround = dual<
  (start: string, end: string) => (string_: string) => string,
  (string_: string, start: string, end: string) => string
>(3, (string_: string, start: string, end: string): string => `${start}${string_}${end}`)

/**
 * Prepends `start` to `string_` unless it already starts with it. Idempotent.
 */
export const ensurePrepend = dual<
  (start: string) => (string_: string) => string,
  (string_: string, start: string) => string
>(2, (string_: string, start: string): string => {
  if (string_.startsWith(start)) {
    return string_
  }

  return `${start}${string_}`
})

/**
 * Split a string into lines on `\n`. The inverse of `Array.join(lines, "\n")`.
 */
export const splitLines = (content: string): readonly string[] => content.split("\n")

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
