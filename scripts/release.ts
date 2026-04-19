import { $ } from "bun";

function usage(): void {
  console.error(`Usage:
  bun run release -- <version>

Examples:
  bun run release -- v1.2.3
  bun run release -- 1.2.3`);
}

const version = process.argv[2];
if (!version) {
  usage();
  process.exit(1);
}

const tag = version.startsWith("v") ? version : `v${version}`;

const ghCheck = await $`which gh`.nothrow();
if (ghCheck.exitCode !== 0) {
  console.error("gh command is required. Install GitHub CLI first.");
  process.exit(1);
}

const worktreeStatus = await $`git status --porcelain`.text();
if (worktreeStatus.trim() !== "") {
  console.error("Working tree has uncommitted changes. Commit/stash first.");
  process.exit(1);
}

const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
if (branch !== "main" && branch !== "master") {
  console.error("Release is only allowed from main or master.");
  process.exit(1);
}

const fetch = await $`git fetch origin ${branch}`.nothrow();
if (fetch.exitCode !== 0) {
  console.error(`Failed to fetch origin/${branch}.`);
  process.exit(1);
}

const head = (await $`git rev-parse HEAD`.text()).trim();
const upstream = (
  await $`git rev-parse refs/remotes/origin/${branch}`.text()
).trim();
if (head !== upstream) {
  console.error(
    `HEAD does not match origin/${branch}. Push/pull before release.`,
  );
  process.exit(1);
}

const localTag =
  await $`git rev-parse --verify --quiet refs/tags/${tag}`.nothrow();
if (localTag.exitCode === 0) {
  console.error(`Tag ${tag} already exists locally.`);
  process.exit(1);
}

const remoteTag = await $`git ls-remote --tags origin refs/tags/${tag}`.text();
if (remoteTag.trim() !== "") {
  console.error(`Tag ${tag} already exists on origin.`);
  process.exit(1);
}

await $`gh release create ${tag} --generate-notes --target ${head}`;

console.log(`Published release: ${tag}`);
