import type { Permission } from "@projitect/core"

/**
 * Minimal glob matcher for permission globs. Supports asterisk (any non-slash chars) and double
 * asterisk (any chars including slashes). No brace expansion, no character classes — that's v1.
 *
 * Examples that match `src/(double-star)/*.ts`: `src/a.ts`, `src/foo/b.ts`, `src/x/y/z.ts`.
 */
const globToRegex = (glob: string): RegExp => {
  let pattern = ""
  for (let index = 0; index < glob.length; index++) {
    const ch = glob[index]!
    if (ch === "*" && glob[index + 1] === "*") {
      pattern += ".*"
      index++
    } else if (ch === "*") {
      pattern += "[^/]*"
    } else if (".+^${}()|[]\\".includes(ch)) {
      pattern += "\\" + ch
    } else {
      pattern += ch
    }
  }
  return new RegExp(`^${pattern}$`)
}

const matchesGlob = (path: string, glob: string): boolean => globToRegex(glob).test(path)

export type FsOp = "read" | "write" | "exists" | "remove" | "mkdir" | "listDir"

const opCategory = (op: FsOp): "read" | "write" =>
  op === "read" || op === "exists" || op === "listDir" ? "read" : "write"

/**
 * Returns `true` if the declared permissions cover the requested operation on the given path.
 * `read`-permissioned globs cover `read | exists | listDir`. `write`-permissioned globs cover all
 * write-side operations (`write | remove | mkdir`) **and implicitly** the read operations on the
 * same path — a blueprint that writes a file naturally needs to read it back for region updates.
 */
export const isPermitted = (
  permissions: ReadonlyArray<Permission.Permission>,
  op: FsOp,
  path: string,
): boolean => {
  const category = opCategory(op)
  for (const p of permissions) {
    if (p.kind === "exec") continue
    if (!matchesGlob(path, p.glob)) continue
    if (p.kind === "write") return true
    if (p.kind === "read" && category === "read") return true
  }
  return false
}
