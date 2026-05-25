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
  readonly children: ReadonlyArray<Blueprint.Blueprint | DirectoryBlueprint>
}

export const directory = (
  name: string,
  children: ReadonlyArray<Blueprint.Blueprint | DirectoryBlueprint>,
): DirectoryBlueprint => ({
  _tag: "Directory",
  name,
  children,
})

export const isDirectoryBlueprint = (
  v: Blueprint.Blueprint | DirectoryBlueprint,
): v is DirectoryBlueprint => "_tag" in v && v._tag === "Directory"
