import { Effect } from "effect"
import type { Errors, ProjitectConfig } from "@projitect/core"
import { detect, installDev, readProjitectMetadata, type ProjitectPackageMetadata } from "../pm.js"
import { splice } from "../edit-pjt.js"

export interface AddResult {
  readonly pm: string
  readonly pkg: string
  readonly metadata: ProjitectPackageMetadata | null
  readonly sectionsAdded: ReadonlyArray<string>
  readonly splicedIntoBlueprintFile: boolean
}

/**
 * `pjt add <package>` — install a blueprint package and splice it into `.pjt.ts`.
 *
 * Flow:
 *   1. Detect package manager (pnpm / yarn / bun / npm).
 *   2. Shell out `<pm> add -D <package>`.
 *   3. Read the installed package's `package.json` for the `"projitect"` metadata field.
 *      - If present and `type: "blueprint-set"`: requested sections (or all sections if none
 *        requested) get spliced as separate calls.
 *      - If present and `type: "blueprint"`: a single call line.
 *      - If absent: install-only behavior. The caller (dispatcher) prints a hint about editing
 *        `.pjt.ts` by hand.
 *   4. Splice the import + call lines into `.pjt.ts` between the convention markers
 *      (`pjt:imports` and `pjt:blueprints`).
 */
export const add = (params: {
  readonly config: ProjitectConfig.ProjitectConfig
  readonly pkg: string
  readonly sections: ReadonlyArray<string>
}): Effect.Effect<AddResult, Errors.ProjitectError> =>
  Effect.gen(function* () {
    const pm = yield* detect({ projectRoot: params.config.projectRoot })
    yield* installDev({ projectRoot: params.config.projectRoot, pm, pkg: params.pkg })
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

    const { importLine, callLines, sectionsAdded } = computeSplice({
      metadata,
      requestedSections: params.sections,
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

const computeSplice = (params: {
  readonly metadata: ProjitectPackageMetadata
  readonly requestedSections: ReadonlyArray<string>
}): {
  readonly importLine: string
  readonly callLines: ReadonlyArray<string>
  readonly sectionsAdded: ReadonlyArray<string>
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
  // blueprint-set
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
