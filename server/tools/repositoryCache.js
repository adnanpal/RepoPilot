// Lightweight cache-invalidation registry shared by every tool that caches
// per-repository state in memory (search index, symbol index, tree string).
//
// Why not a real fs.watch()/chokidar watcher?
// All writes to a repository go through writeFile.js — there is no external
// process touching these files. So instead of watching the filesystem for
// changes (extra dependency, extra file descriptors, debouncing logic),
// every write explicitly calls invalidateRepository(). This is simpler,
// deterministic, and cannot miss an event the way a debounced fs watcher can.
//
// Each repository has a "version" counter. Anything that caches derived data
// for a repository stores the version it was built against, and rebuilds
// whenever the current version no longer matches.

const versions = new Map(); // repositoryId -> number

export function getRepositoryVersion(repositoryId) {
    return versions.get(repositoryId) || 0;
}

export function invalidateRepository(repositoryId) {
    versions.set(repositoryId, getRepositoryVersion(repositoryId) + 1);
}
