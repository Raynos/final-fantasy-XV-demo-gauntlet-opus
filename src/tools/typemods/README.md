# Type codemods

The machinery behind the "no `any`" work. Each one reads the real TypeScript
program, decides what it can prove, and edits the source; none of them guess
from a regex.

They run under Node's type stripping like the rest of the harness, and import
the compiler **API** as `typescript-api` — a devDependency alias for
typescript 5, because typescript 7's `tsc` is a native binary and no longer
ships a JavaScript API. `tsc` itself stays on 7.

    node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --fields
    node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --params

**Pass the repo root as an absolute path.** A relative root makes
`parseJsonConfigFileContent` resolve a config with an `exclude` against the
wrong base and silently hand back two files instead of thirty-seven — which
looks exactly like "nothing left to do".

| tool | what it does |
|---|---|
| `infer` | The main one. `--fields`: a field declared `any` takes the type of what is assigned to it. `--params`: a parameter declared `any` takes the type of what its callers pass. Both only when every site agrees on one clean named type; `--dry` reports without writing. |
| `nonnull` | Adds `!` where the checker says a value is possibly null and the code reads through it. |
| `nulls` / `nulllocals` | `= null` parameters and locals infer `null`; annotate them. |
| `undefnull` | `T \| undefined` assigned into a `T \| null` field: appends `?? null`. |
| `emptyobj` / `emptyarr` | `= {}` and `= []` defaults infer `{}` and `never[]`. |
| `extendopts` / `relax` | Options types that drifted from their callers: add the properties they are passed or read for, make the ones callers omit optional. |
| `keyofcast` | `TABLE[key]` with a computed key: casts the key, not the table. |
| `annparams` / `declfields` | The original port's mechanical passes: `: any` on implicit-any parameters, declarations for fields assigned on `this`. |
| `jsdoc2ts` / `jsdocclean` | JSDoc `@param {T}` to a real annotation, then tidy the tag. |
| `unused` | Removes what `noUnusedLocals` finds. **`--impure` deletes declarations whose initialiser is a call** — that is how four enemy spawns disappeared out of `combatloop`. Read every one before letting it run. |
| `optionalize` | Trailing parameters callers omit become `?`. |

The loop that works: run a pass, run `npx tsc --noEmit -p tsconfig.json`, fix
what it surfaced by hand, repeat. The errors a pass surfaces are the point — a
type that was `any` could not be wrong, and the moment it is real, the places
that disagreed with it show up.
