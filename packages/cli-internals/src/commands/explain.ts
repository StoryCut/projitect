import { Effect } from "effect"
import { Errors } from "@projitect/core"

/**
 * `pjt explain <id>` — print a short description of an error id, with a link to the docs page.
 * The full content lives on the marketing site at `/errors/<id>`; this CLI gives the basics
 * without a network call.
 */
export const explain = (params: {
  readonly errorId: string
}): Effect.Effect<string> =>
  Effect.sync(() => {
    const known = Errors.ERROR_IDS.includes(params.errorId as Errors.ErrorId)
    if (!known) {
      return `Unknown error id: ${params.errorId}\nSee https://projitect.dev/errors for the full registry.`
    }
    const url = Errors.docsUrl(params.errorId as Errors.ErrorId)
    const blurb = ERROR_BLURBS[params.errorId as Errors.ErrorId]
    return `${params.errorId}\n${blurb}\nMore at: ${url}`
  })

const ERROR_BLURBS: Readonly<Record<Errors.ErrorId, string>> = {
  "pjt.fs.permission-denied":
    "A blueprint attempted a filesystem operation outside its declared permissions. Check the blueprint's `permissions` array.",
  "pjt.fs.read-failed":
    "A read operation failed at the OS level (typically ENOENT or EACCES). The cause is printed alongside.",
  "pjt.fs.write-failed":
    "A write operation failed at the OS level. The cause is printed alongside.",
  "pjt.loader.import-failed":
    "The `.pjt.ts` file could not be imported. Check for syntax errors or missing dependencies.",
  "pjt.loader.invalid-default-export":
    "`.pjt.ts` must `export default pjt({...})`. Found a different shape.",
  "pjt.config.invalid":
    "A config value failed schema validation. The offending field and source layer are reported.",
  "pjt.config.blueprint-file-not-found":
    "No `.pjt.ts` at the project root. Run `pjt init` to create one.",
  "pjt.plan.conflict-region":
    "Two blueprints share the same `ownerId` for a region in the same file. Pick distinct ids.",
  "pjt.plan.conflict-merge":
    "Two blueprints claim the same JSON key in the same file. Coordinate ownership.",
  "pjt.plan.conflict-owned":
    "Two blueprints both claim full ownership of one file. Only one `ownFile` per path is allowed.",
  "pjt.region.missing-end":
    "A region start marker was found without a matching end marker. The file has been hand-edited and the closing marker removed.",
  "pjt.region.duplicate":
    "Multiple start markers for the same region in one file. Hand-edited?",
  "pjt.apply.dirty-git":
    "`build` requires a clean git working tree. Commit or stash first, then retry.",
  "pjt.init.git-missing":
    "`pjt init` requires a git repository. Run `git init` first, or rerun with --yes.",
  "pjt.init.package-json-missing":
    "`pjt init` requires a `package.json`. Run `npm init -y` first, or rerun with --yes.",
  "pjt.drift.detected":
    "`pjt inspect` exits nonzero when the project drifts from its blueprints. Run `pjt remodel` to sync.",
  "pjt.lock.parse-failed":
    "`.pjt.lock` is corrupted or doesn't match the expected schema. Delete it and rerun `pjt remodel` to rebuild.",
  "pjt.lock.version-mismatch":
    "`.pjt.lock` was written by a newer projitect than the one currently installed. Upgrade the `projitect` devDep.",
  "pjt.git.not-a-repo":
    "Required a git repository, but `.git/` was missing. Run `git init` first.",
  "pjt.git.command-failed":
    "A `git` command exited non-zero or git isn't installed. The underlying error is included in the message.",
}
