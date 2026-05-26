/**
 * Section helpers — thin wrappers around `regionFile` that bake in the right comment
 * delimiters for two common file shapes:
 *
 *  - **`markdownSection`** for HTML/MDX/XML files where comments need a closing `-->`.
 *    The fenced region renders invisible in markdown output — readers never see the markers.
 *    Useful for README.md, AGENTS.md, CONTRIBUTING.md, generated MDX docs, etc.
 *
 *  - **`ignoreSection`** for `#`-comment "ignore"-style files. Same shape as the gitignore
 *    convention; the helper exists because the name documents intent better than a bare
 *    `regionFile({ commentPrefix: "#" })` does, and the surface guides authors toward the
 *    right primitive when they're scaffolding a `.eslintignore` / `.prettierignore` /
 *    `.dockerignore` / `.npmignore` blueprint.
 *
 * Both helpers re-emit the underlying `RegionFileSpec`-shaped result of `regionFile`, so
 * everything that works for `regionFile` works for these (extra permissions, descriptions,
 * etc.). They aren't shipped as separate npm packages because there's no opinionated content
 * to bundle — the blueprint author always provides their own.
 */

import type { Blueprint, Permission } from "@projitect/core"
import { regionFile } from "./constructors.js"

export interface SectionSpec {
  readonly id: string
  readonly version: string
  readonly description?: string
  readonly path: string
  readonly content: string
  readonly extraPermissions?: ReadonlyArray<Permission.Permission>
}

/**
 * Region-mode blueprint for HTML / MDX / XML files. The fence is rendered as two HTML
 * comments on their own lines:
 *
 *     <!-- pjt:<owner-id> start -->
 *     <body>
 *     <!-- pjt:<owner-id> end -->
 *
 * The markers don't render in HTML output (they're comments), so readers of the published
 * file never see them. `pjt inspect` flags hand-edits between the markers; lines outside
 * the fence belong to the user.
 *
 * @example
 * ```ts
 * markdownSection({
 *   id: "my-org:readme:badges",
 *   version: "1.0.0",
 *   path: "README.md",
 *   content: "![ci](https://example.com/badge.svg)\n",
 * })
 * ```
 */
export const markdownSection = (spec: SectionSpec): Blueprint.Blueprint =>
  regionFile({
    id: spec.id,
    version: spec.version,
    ...(spec.description !== undefined && { description: spec.description }),
    path: spec.path,
    commentPrefix: "<!--",
    commentSuffix: " -->",
    content: spec.content,
    ...(spec.extraPermissions !== undefined && { extraPermissions: spec.extraPermissions }),
  })

/**
 * Region-mode blueprint for `#`-comment ignore-style files: `.gitignore`, `.eslintignore`,
 * `.prettierignore`, `.dockerignore`, `.npmignore`, etc. The fence is two `#`-prefixed lines
 * on either side of the section content:
 *
 *     # pjt:<owner-id> start
 *     <body>
 *     # pjt:<owner-id> end
 *
 * Equivalent to `regionFile({ commentPrefix: "#", ... })`, but the name documents the
 * intent and makes the right primitive easy to find.
 *
 * @example
 * ```ts
 * ignoreSection({
 *   id: "my-org:eslintignore:generated",
 *   version: "1.0.0",
 *   path: ".eslintignore",
 *   content: "dist/\nbuild/\ncoverage/\n",
 * })
 * ```
 */
export const ignoreSection = (spec: SectionSpec): Blueprint.Blueprint =>
  regionFile({
    id: spec.id,
    version: spec.version,
    ...(spec.description !== undefined && { description: spec.description }),
    path: spec.path,
    commentPrefix: "#",
    content: spec.content,
    ...(spec.extraPermissions !== undefined && { extraPermissions: spec.extraPermissions }),
  })
