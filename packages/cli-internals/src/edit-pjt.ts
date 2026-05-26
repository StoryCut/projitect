import { promises as fs } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { Errors } from "@projitect/core"

const IMPORTS_START = "// pjt:imports start"
const IMPORTS_END = "// pjt:imports end"
const BLUEPRINTS_START = "// pjt:blueprints start"
const BLUEPRINTS_END = "// pjt:blueprints end"

export interface SpliceParams {
  readonly projectRoot: string
  readonly blueprintFile: string
  /** Import statement to splice (one line, no trailing newline). Deduped. */
  readonly importLine: string
  /** Blueprint call lines (one entry per line, no leading indent, no trailing newline). */
  readonly callLines: ReadonlyArray<string>
}

/**
 * Splice an import line and one or more blueprint call lines into `.pjt.ts` using the convention
 * markers. The import goes between `// pjt:imports start/end` (deduped against existing
 * content), the calls go between `// pjt:blueprints start/end` (appended, with 4-space indent
 * to match the standard template).
 *
 * Fails with `pjt.add.markers-missing` if either marker pair is missing — the user has
 * hand-edited the file and we won't guess. They restore the markers, then re-run `pjt add`.
 */
export const splice = (
  params: SpliceParams,
): Effect.Effect<void, Errors.AddMarkersMissing | Errors.FsReadFailed | Errors.FsWriteFailed> =>
  Effect.gen(function* () {
    const full = path.join(params.projectRoot, params.blueprintFile)
    const raw = yield* Effect.tryPromise({
      try: () => fs.readFile(full, "utf8"),
      catch: (e) =>
        new Errors.FsReadFailed({
          id: "pjt.fs.read-failed",
          path: params.blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Could not read ${params.blueprintFile}`,
        }),
    })

    let next = yield* spliceImport({
      content: raw,
      blueprintFile: params.blueprintFile,
      importLine: params.importLine,
    })
    next = yield* spliceCalls({
      content: next,
      blueprintFile: params.blueprintFile,
      callLines: params.callLines,
    })

    yield* Effect.tryPromise({
      try: () => fs.writeFile(full, next, "utf8"),
      catch: (e) =>
        new Errors.FsWriteFailed({
          id: "pjt.fs.write-failed",
          path: params.blueprintFile,
          cause: e instanceof Error ? e.message : String(e),
          message: `Could not write ${params.blueprintFile}`,
        }),
    })
  })

const spliceImport = (params: {
  readonly content: string
  readonly blueprintFile: string
  readonly importLine: string
}): Effect.Effect<string, Errors.AddMarkersMissing> => {
  const { content, blueprintFile, importLine } = params
  return Effect.gen(function* () {
    const lines = content.split("\n")
    const startIndex = lines.findIndex((l) => l.trim() === IMPORTS_START)
    const endIndex = lines.findIndex((l) => l.trim() === IMPORTS_END)
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return yield* Effect.fail(
        new Errors.AddMarkersMissing({
          id: "pjt.add.markers-missing",
          blueprintFile,
          missingMarker: `${IMPORTS_START} / ${IMPORTS_END}`,
          message:
            `${blueprintFile} is missing the \`pjt:imports start\` / \`pjt:imports end\` markers. ` +
            "Restore them (see `pjt init`'s starter template) and re-run `pjt add`.",
        }),
      )
    }
    // Dedupe: skip if any line between the markers already equals the import
    const between = lines.slice(startIndex + 1, endIndex).map((l) => l.trim())
    if (between.includes(importLine.trim())) return content
    const before = lines.slice(0, endIndex)
    const after = lines.slice(endIndex)
    return [...before, importLine, ...after].join("\n")
  })
}

const spliceCalls = (params: {
  readonly content: string
  readonly blueprintFile: string
  readonly callLines: ReadonlyArray<string>
}): Effect.Effect<string, Errors.AddMarkersMissing> => {
  const { content, blueprintFile, callLines } = params
  return Effect.gen(function* () {
    if (callLines.length === 0) return content
    const lines = content.split("\n")
    const startIndex = lines.findIndex((l) => l.trim() === BLUEPRINTS_START)
    const endIndex = lines.findIndex((l) => l.trim() === BLUEPRINTS_END)
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return yield* Effect.fail(
        new Errors.AddMarkersMissing({
          id: "pjt.add.markers-missing",
          blueprintFile,
          missingMarker: `${BLUEPRINTS_START} / ${BLUEPRINTS_END}`,
          message:
            `${blueprintFile} is missing the \`pjt:blueprints start\` / \`pjt:blueprints end\` markers. ` +
            "Restore them and re-run `pjt add`.",
        }),
      )
    }
    const indent = "    " // 4-space, matching the starter template
    const newCalls = callLines.map((c) => `${indent}${c.replace(/^\s+/, "")}`)
    const before = lines.slice(0, endIndex)
    const after = lines.slice(endIndex)
    return [...before, ...newCalls, ...after].join("\n")
  })
}
