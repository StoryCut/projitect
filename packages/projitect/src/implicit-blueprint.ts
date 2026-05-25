import { jsonMerge } from "@projitect/blueprint"
import type { Blueprint } from "@projitect/core"

/**
 * The implicit projitect blueprint. Prepended to every plan by the CLI. Owns:
 *
 *   - `devDependencies.projitect` in package.json
 *   - `devDependencies.effect` in package.json
 *   - `scripts.pjt` in package.json
 *
 * `.pjt.ts` itself is **not** owned. Users own that file — `pjt init` seeds it, but subsequent
 * edits are theirs. This is the boundary between "we manage your scaffolding" and "we manage
 * the manager."
 */
export const implicitBlueprint = (versions: {
  readonly projitect: string
  readonly effect: string
}): Blueprint.Blueprint =>
  jsonMerge({
    id: "pjt:projitect:bootstrap",
    version: versions.projitect,
    description: "Implicit blueprint: keeps projitect itself wired into package.json",
    path: "package.json",
    ownedKeys: [
      "devDependencies.projitect",
      "devDependencies.effect",
      "scripts.pjt",
    ],
    value: {
      scripts: { pjt: "pjt" },
      devDependencies: {
        projitect: `^${versions.projitect}`,
        effect: versions.effect,
      },
    },
  })
