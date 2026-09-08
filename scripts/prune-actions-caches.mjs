// GitHub gives a repository 10 GB of Actions cache and evicts least-recently-used entries
// once it is full — so an unreachable cache is not free, it costs some *other* run its
// binaries. This repo fills that budget fast: every e2e leg caches ~400 MB of Obsidian, and
// setup-node adds ~170 MB per lockfile hash per OS.
//
// Two kinds of entry are dead and this prunes them:
//   CLOSED PR   — a cache is scoped to the ref that created it, and refs/pull/N/merge outlives
//                 the head branch, so delete_branch_on_merge never reaches it. Only that PR's
//                 own runs may read it, and it is closed. cache-cleanup.yml sweeps these when
//                 the PR closes; this catches the ones it missed (a failed run, or a PR closed
//                 before that workflow existed).
//   UNREAD      — nothing has read it in STALE_DAYS. That is a lockfile hash no branch resolves
//                 to any more, or a version combo the matrix stopped asking for. GitHub is
//                 documented to evict at 7 days unread, but entries older than that have been
//                 observed surviving, so this does not rely on it.
//
// Anything on an open pull request is left alone regardless of age.
//
// Usage: node scripts/prune-actions-caches.mjs [--dry-run]
//   GH_TOKEN  a token with `actions: write` on the repo
//   REPO      owner/name (defaults to this repo)

const DRY_RUN = process.argv.includes("--dry-run");
const REPO = process.env.REPO ?? "srg-kostyrko/obsidian-journal";
const TOKEN = process.env.GH_TOKEN;
const STALE_DAYS = Number(process.env.STALE_DAYS ?? 14);

if (!TOKEN) {
  console.error("GH_TOKEN is required (needs `actions: write`).");
  process.exit(1);
}

async function api(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${TOKEN}`,
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? undefined : response.json();
}

async function allCaches() {
  const caches = [];
  for (let page = 1; ; page++) {
    const { actions_caches: batch } = await api(`/repos/${REPO}/actions/caches?per_page=100&page=${page}`);
    if (batch.length === 0) return caches;
    caches.push(...batch);
  }
}

const prStates = new Map();
async function pullRequestIsClosed(number) {
  if (!prStates.has(number)) {
    // A pull request can be missing entirely (deleted fork, transferred issue); treat an
    // unreadable one as open so an unknown state never costs a live cache.
    const state = await api(`/repos/${REPO}/pulls/${number}`)
      .then((pr) => pr.state)
      .catch(() => "open");
    prStates.set(number, state);
  }
  return prStates.get(number) === "closed";
}

const gb = (bytes) => `${(bytes / 1e9).toFixed(2)} GB`;
const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

async function verdictFor(cache) {
  const pull = /^refs\/pull\/(\d+)\//.exec(cache.ref);
  if (pull) {
    return (await pullRequestIsClosed(pull[1])) ? `pull request #${pull[1]} is closed` : undefined;
  }
  const unread = daysSince(cache.last_accessed_at);
  return unread > STALE_DAYS ? `unread for ${Math.floor(unread)} days` : undefined;
}

const caches = await allCaches();
const held = caches.reduce((sum, cache) => sum + cache.size_in_bytes, 0);
console.log(`${caches.length} caches, ${gb(held)} held, pruning anything unread for ${STALE_DAYS}+ days.`);

let reclaimed = 0;
let failed = 0;
for (const cache of caches) {
  const reason = await verdictFor(cache);
  if (!reason) continue;
  const label = `${cache.key} (${cache.ref}, ${gb(cache.size_in_bytes)}) — ${reason}`;
  if (DRY_RUN) {
    console.log(`would delete ${label}`);
    reclaimed += cache.size_in_bytes;
    continue;
  }
  try {
    await api(`/repos/${REPO}/actions/caches/${cache.id}`, { method: "DELETE" });
    console.log(`deleted ${label}`);
    reclaimed += cache.size_in_bytes;
  } catch (error) {
    // An entry can vanish between the listing and the delete — GitHub evicting it, or the
    // per-PR workflow sweeping the same ref. Keep going; only a total failure is a real fault.
    failed += 1;
    console.log(`could not delete ${label}: ${error.message}`);
  }
}

console.log(
  DRY_RUN
    ? `would reclaim ${gb(reclaimed)}, leaving ${gb(held - reclaimed)}.`
    : `reclaimed ${gb(reclaimed)}, leaving ${gb(held - reclaimed)}.`,
);
if (failed > 0 && reclaimed === 0) {
  console.error(`every delete failed (${failed}) — check that the token carries \`actions: write\`.`);
  process.exit(1);
}
