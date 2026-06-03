import { Effect, Match } from "effect"
import type { Errors, ProjitectConfig } from "@projitect/core"
import { detect, installDev as installDevelopment, readProjitectMetadata } from "../pm.js"
import type { ProjitectPackageMetadata } from "../pm.js"
import { splice } from "../edit-pjt.js"

export interface AddResult {
  readonly pm: string
  readonly pkg: string
  readonly metadata: ProjitectPackageMetadata | null
  readonly sectionsAdded: readonly string[]
  readonly splicedIntoBlueprintFile: boolean
}

/**
 * Strategy for picking which sections of a `blueprint-set` package to splice.
 *
 *   - `"all"` — silent default; pick every section the package declares. Used when the caller
 *     wants the legacy "no --section means everything" behavior.
 *   - `{ kind: "explicit", sections }` — caller already knows. `--section macOs,node` lands here.
 *   - `{ kind: "ask", choose }` — interactive: defer to the supplied callback (typically a
 *     `Prompt.multiSelect` from the dispatcher). The callback runs only when the installed
 *     package's metadata says `type: "blueprint-set"` and exposes sections.
 *
 * `R` parametrizes the callback's requirement channel so the dispatcher can hand us an Effect
 * that needs `Prompt.Environment` (FileSystem | Path | Terminal); the requirement propagates
 * out to the top of `add` and is satisfied by the bin shim's `NodePlatformLive`.
 */
export type SectionStrategy<R = never> =
  | { readonly _tag: "All" }
  | { readonly _tag: "Explicit"; readonly sections: readonly string[] }
  | {
      readonly _tag: "Ask"
      readonly choose: (
        metadata: ProjitectPackageMetadata,
      ) => Effect.Effect<readonly string[], Errors.ProjitectError, R>
    }

/**
 * `pjt add <package>` — install a blueprint package and splice it into `.pjt.ts`.
 *
 * Flow:
 *   1. Detect package manager (pnpm / yarn / bun / npm).
 *   2. Shell out `<pm> add -D <package>`.
 *   3. Read the installed package's `package.json` for the `"projitect"` metadata field.
 *      - If present and `type: "blueprint-set"`: section selection resolves per `strategy`
 *        (all / explicit / ask).
 *      - If present and `type: "blueprint"`: a single call line, strategy ignored.
 *      - If absent: install-only behavior. The caller (dispatcher) prints a hint about editing
 *        `.pjt.ts` by hand.
 *   4. Splice the import + call lines into `.pjt.ts` between the convention markers
 *      (`pjt:imports` and `pjt:blueprints`).
 */
export const add = <R = never>(params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly pkg: string
  readonly strategy: SectionStrategy<R>
}): Effect.Effect<AddResult, Errors.ProjitectError, R> =>
  Effect.gen(function* () {
    const pm = yield* detect({ projectRoot: params.config.projectRoot })
    yield* installDevelopment({ projectRoot: params.config.projectRoot, pm, pkg: params.pkg })
    const metadata = yield* readProjitectMetadata({
      projectRoot: params.config.projectRoot,
      pkg: params.pkg,
    })

    if (metadata === null) {
      return {
        pm,
        pkg: params.pkg,
        metadata: null,
        sectionsAdded: [],
        splicedIntoBlueprintFile: false,
      }
    }

    const sections = yield* resolveSections({ metadata, strategy: params.strategy })

    const { importLine, callLines, sectionsAdded } = computeSplice({
      metadata,
      requestedSections: sections,
    })

    yield* splice({
      projectRoot: params.config.projectRoot,
      blueprintFile: params.config.blueprintFile,
      importLine,
      callLines,
    })

    return {
      pm,
      pkg: params.pkg,
      metadata,
      sectionsAdded,
      splicedIntoBlueprintFile: true,
    }
  })

const resolveSections = <R>(params: {
  readonly metadata: ProjitectPackageMetadata
  readonly strategy: SectionStrategy<R>
}): Effect.Effect<readonly string[], Errors.ProjitectError, R> => {
  const { metadata, strategy } = params
  // Section strategy only matters for blueprint-sets. For `type: "blueprint"`, return empty —
  // `computeSplice` will emit a single non-templated call line.
  if (metadata.type === "blueprint") {
    return Effect.succeed([])
  }
  return Match.valueTags(strategy, {
    All: () => Effect.succeed<readonly string[]>([]),
    Explicit: (explicit) => Effect.succeed(explicit.sections),
    Ask: (ask) => ask.choose(metadata),
  })
}

const computeSplice = (params: {
  readonly metadata: ProjitectPackageMetadata
  readonly requestedSections: readonly string[]
}): {
  readonly importLine: string
  readonly callLines: readonly string[]
  readonly sectionsAdded: readonly string[]
} => {
  const { metadata, requestedSections } = params
  if (metadata.type === "blueprint") {
    const call =
      metadata.call ?? "/* TODO: replace with the blueprint call from the package's README */"
    return {
      importLine: metadata.import,
      callLines: [`${call},`],
      sectionsAdded: [],
    }
  }
  // Blueprint-set
  const allSections = metadata.sections ?? []
  const chosen =
    requestedSections.length > 0
      ? requestedSections.filter((s) => allSections.includes(s))
      : allSections
  const template = metadata.callTemplate ?? "{section}()"
  return {
    importLine: metadata.import,
    callLines: chosen.map((s) => `${template.replace("{section}", s)},`),
    sectionsAdded: chosen,
  }
}
