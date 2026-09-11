import fs from "fs/promises";
import path from "path";
import { assertRepositoryExists } from "./repositoryRoot.js";
import { invalidateRepository } from "./repositoryCache.js";

const BLOCKED_FILES = new Set([".env", ".env.local", ".env.development", ".env.production", ".env.test", "credentials.json", "service-account.json"]);
const BLOCKED_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx"]);

export async function writeFile(repositoryId, filePath, content) {
    const root = await assertRepositoryExists(repositoryId, fs);
    const absolutePath = path.resolve(root, filePath);
    const relativePath = path.relative(root, absolutePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error("Access denied: path is outside the repository.");
    }

    const fileName = path.basename(absolutePath).toLowerCase();
    const extension = path.extname(absolutePath).toLowerCase();

    if (BLOCKED_FILES.has(fileName) || BLOCKED_EXTENSIONS.has(extension)) {
        throw new Error("Access denied: sensitive file cannot be modified.");
    }

    if (typeof content !== "string") throw new Error("Invalid content.");

    await fs.writeFile(absolutePath, content, "utf8");

    // Every write goes through this function, so this is the one place that
    // needs to know a file changed. Bumping the repo version here makes the
    // search index (and anything else cached per-repo) rebuild lazily on the
    // next read, instead of silently serving stale search results.
    invalidateRepository(repositoryId);

    return { success: true, path: filePath, message: `File ${filePath} written successfully.` };
}
