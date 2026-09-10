import fs from "fs/promises";
import path from "path";
import { assertRepositoryExists } from "./repositoryRoot.js";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", ".next", ".vite", "coverage"]);
const IGNORED_FILES = new Set([".env", ".env.local", ".env.development", ".env.production", ".env.test", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);

export async function listFiles(repositoryId, directory = ".") {
    const root = await assertRepositoryExists(repositoryId, fs);
    const absolutePath = path.resolve(root, directory);
    const relativePath = path.relative(root, absolutePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error("Access denied: path is outside the repository.");
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    return entries
        .filter((entry) => {
            if (entry.isDirectory()) return !IGNORED_DIRECTORIES.has(entry.name);
            return !IGNORED_FILES.has(entry.name);
        })
        .map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
        }));
}
