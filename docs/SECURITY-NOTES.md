# Security Notes — residual dependency risk

This note documents **accepted residual risk** that cannot be fixed by version bump alone.
Do not invent a local patch that claims to “fix” these; track upstream and apply mitigations.

## minimatch (via exceljs → archiver → readdir-glob)

| Advisory | Severity | Summary | Patched release |
|----------|----------|---------|-----------------|
| GHSA (Dependabot alert #112) | **Moderate** | Globstar amplification can cause CPU DoS while matching attacker-crafted patterns | **11.0.1** |

### How this package is reached here

- Runtime: `exceljs` → `archiver` → `readdir-glob` / `archiver-utils` pulls `minimatch` 3.x/5.x.
- Build/dev: `electron-builder` → app-builder-lib pulls 3.x/5.x/9.x/10.x.
- No code path passes user-controlled glob strings to `minimatch`; Excel export walks local stats directories with fixed patterns, and character/market imports use the app's own glob matcher. The advisory requires an attacker-chosen pattern, not an attacker-chosen filename.

### Mitigations (active)

1. Do not expose arbitrary glob/regex input to `minimatch` through IPC or character packs.
2. Track `exceljs`/`archiver` upstream for a release that moves to minimatch ≥ 11; avoid a blanket npm override to 11.x until API compatibility (CJS/Node engine) is verified against electron-builder.
3. Re-run `npm audit` against the public registry when the mirror supports the advisories endpoint.

Last reviewed: 2026-11-05.

## extract-zip (via electron / electron-builder toolchain)

| Advisory | Severity | Summary | Patched release |
|----------|----------|---------|-----------------|
| [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) (CVE-2026-19693) | **High** | Symlink + same-name entry allows arbitrary file write outside destination | **none** (`<= 2.0.1`) |
| [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) (CVE-2026-56876) | **High** | Unvalidated symlink path traversal on extract | **none** (`<= 2.0.1`) |

npm `extract-zip` latest published version is **2.0.1** (no 2.0.2+). Overrides to an unreviewed git fork are **intentionally not applied** — a silent fork pin is higher operational risk than a documented residual for this portfolio/local tool.

### How this package is reached here

- DesktopPet packages with `electron` + `electron-builder` (toolchain unpack of asar/resources).
- **Runtime character-pack import (`.pet`) uses `adm-zip`**, with entry-name sanitization, root jail, and zip-bomb caps — that path does **not** call `extract-zip`.

### Mitigations (active)

1. **Never extract untrusted ZIPs with app privileges.** Treat third-party `.pet` packs as untrusted input; prefer the in-app importer (guards + dry visibility) over shelling out to extractors.
2. **Path containment where we control extraction** (see `src/main/character/importer.ts`): reject `..` / absolute / reserved names, enforce size limits, write only under the characters root.
3. **Least privilege for packaging.** Do not run `electron-builder` / `npx electron-builder` as Administrator on untrusted working trees.
4. **Track upstream:** watch [max-mapper/extract-zip](https://github.com/max-mapper/extract-zip) / npm for `> 2.0.1` closing both GHSAs; drop this residual when `npm audit` is clean.
5. **Do not** `overrides` to a random GitHub tarball “fix” without review.

### Status

| Item | State |
|------|-------|
| npm patched `extract-zip` release | ❌ not published |
| Local override to git fork | ⏭ skipped (too risky for this repo) |
| Runtime policy + importer guards | ✅ documented |
| Upstream watch | ✅ this file |

See also: [SECURITY.md](../SECURITY.md) for reporting policy.

Last reviewed: 2026-09 (portfolio security pass).
