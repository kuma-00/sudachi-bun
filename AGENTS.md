- By default, write code without prioritizing backward compatibility, even if changes are breaking.
- If backward compatibility is required, ask the user before implementing.

- This repository does not use `npm`. Use `bun` for package management and script execution.
- After testing code changes, run `bun test`.
- Run `bun run biome:check` after code changes.
- When formatting issues are reported, run `bun run biome:write` and re-run `bun run biome:check`.
