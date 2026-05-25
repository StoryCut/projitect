import { Effect } from "effect"
import { Errors } from "@projitect/core"

const START = (prefix: string, owner: string): string => `${prefix} ${owner} start`
const END = (prefix: string, owner: string): string => `${prefix} ${owner} end`

export interface RegionFound {
  readonly kind: "found"
  readonly startLine: number
  readonly endLine: number
  readonly content: string
}

export interface RegionAbsent {
  readonly kind: "absent"
}

export type RegionLookup = RegionFound | RegionAbsent

/**
 * Find the existing region for `ownerId` inside `fileContent`. Returns its line range and
 * content, or `{ kind: "absent" }`. A start marker without an end is a
 * `pjt.region.missing-end` error; duplicate start markers are `pjt.region.duplicate`.
 */
export const findRegion = (params: {
  readonly fileContent: string
  readonly ownerId: string
  readonly commentPrefix: string
  readonly path: string
}): Effect.Effect<RegionLookup, Errors.RegionMissingEnd | Errors.RegionDuplicate> => {
  const { fileContent, ownerId, commentPrefix, path } = params
  type Result = Effect.Effect<RegionLookup, Errors.RegionMissingEnd | Errors.RegionDuplicate>
  return Effect.suspend((): Result => {
    const lines = fileContent.split("\n")
    const startMarker = START(commentPrefix, ownerId)
    const endMarker = END(commentPrefix, ownerId)

    let startLine = -1
    let endLine = -1
    let duplicateStart = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trimEnd()
      if (line === startMarker) {
        if (startLine !== -1) duplicateStart = true
        else startLine = i
      } else if (line === endMarker) {
        endLine = i
      }
    }

    if (duplicateStart) {
      return Effect.fail(
        new Errors.RegionDuplicate({
          id: "pjt.region.duplicate",
          path,
          ownerId,
          message: `Multiple start markers for region ${ownerId} in ${path}`,
        }),
      )
    }

    if (startLine === -1) return Effect.succeed({ kind: "absent" })

    if (endLine === -1 || endLine < startLine) {
      return Effect.fail(
        new Errors.RegionMissingEnd({
          id: "pjt.region.missing-end",
          path,
          ownerId,
          startLine,
          message: `Region ${ownerId} started at line ${startLine + 1} of ${path} but never closed`,
        }),
      )
    }

    return Effect.succeed({
      kind: "found",
      startLine,
      endLine,
      content: lines.slice(startLine + 1, endLine).join("\n"),
    })
  })
}

/**
 * Render a region block (markers + content) ready to splice into a file.
 */
export const renderRegion = (params: {
  readonly ownerId: string
  readonly commentPrefix: string
  readonly content: string
}): string => {
  const body = params.content.endsWith("\n")
    ? params.content.slice(0, -1)
    : params.content
  return [
    START(params.commentPrefix, params.ownerId),
    body,
    END(params.commentPrefix, params.ownerId),
  ].join("\n")
}

/**
 * Splice or append a region into a file's existing content. Returns the updated text.
 */
export const upsertRegion = (params: {
  readonly fileContent: string
  readonly existing: RegionLookup
  readonly rendered: string
}): string => {
  const { fileContent, existing, rendered } = params
  if (existing.kind === "absent") {
    if (fileContent.length === 0) return `${rendered}\n`
    return fileContent.endsWith("\n") ? `${fileContent}${rendered}\n` : `${fileContent}\n${rendered}\n`
  }
  const lines = fileContent.split("\n")
  const before = lines.slice(0, existing.startLine)
  const after = lines.slice(existing.endLine + 1)
  return [...before, rendered, ...after].join("\n")
}
