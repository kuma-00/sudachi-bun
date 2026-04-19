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

const runsResult =
  await $`gh run list --workflow ci.yml --commit ${head} --json event,status,conclusion,createdAt,headBranch --limit 20`.nothrow();
if (runsResult.exitCode !== 0) {
  console.error(
    `Failed to get CI run status from GitHub CLI (exit code ${runsResult.exitCode}). Check gh authentication/network and retry.`,
  );
  process.exit(1);
}
type WorkflowRun = {
  event: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  headBranch: string;
};
let runs: WorkflowRun[];
try {
  runs = JSON.parse(runsResult.stdout.toString()) as WorkflowRun[];
} catch {
  console.error("Failed to parse CI run response from GitHub CLI.");
  process.exit(1);
}
const pushRuns = runs
  .filter((run) => run.event === "push" && run.headBranch === branch)
  .sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

if (pushRuns.length === 0) {
  console.error(
    `No push CI runs found for this commit on ${branch}. Wait for CI to start before releasing.`,
  );
  process.exit(1);
}

const latestPushRun = pushRuns[0];
if (!latestPushRun) {
  console.error(
    `No push CI runs found for this commit on ${branch}. Wait for CI to start before releasing.`,
  );
  process.exit(1);
}
if (latestPushRun.status !== "completed") {
  console.error(
    `Latest push CI run is ${latestPushRun.status}. Wait for CI to complete before releasing.`,
  );
  process.exit(1);
}
if (latestPushRun.conclusion !== "success") {
  console.error(
    `Latest push CI run concluded with "${latestPushRun.conclusion ?? "null"}". Fix CI failures before releasing.`,
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
