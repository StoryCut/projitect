import { Predicate } from "effect"
import type { Blueprint } from "@projitect/core"

/**
 * Scope children to a subdirectory. Inside a `directory(name, [...])` group, every child
 * blueprint's `path` is reinterpreted relative to `name/`, and write permissions outside the
 * subtree are stripped from the children's declared `Permission`s.
 *
 * Implementation note: `directory` returns a `DirectoryBlueprint` — a tagged variant that the
 * planner unpacks. Authors should treat the return value as opaque.
 */
export interface DirectoryBlueprint {
  readonly _tag: "Directory"
  readonly name: string
  readonly children: readonly (Blueprint.Blueprint | DirectoryBlueprint)[]
}

export const directory = (
  name: string,
  children: readonly (Blueprint.Blueprint | DirectoryBlueprint)[],
): DirectoryBlueprint => ({
  _tag: "Directory",
  name,
  children,
})

export const isDirectoryBlueprint = (
  v: Blueprint.Blueprint | DirectoryBlueprint,
  // `Directory` is the only member of the union carrying a `_tag`, so its presence is decisive.
): v is DirectoryBlueprint => Predicate.hasProperty(v, "_tag")
