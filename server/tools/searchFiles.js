import fs from "fs/promises";
import path from "path";
import { assertRepositoryExists } from "./repositoryRoot.js";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", ".next", ".vite", "coverage"]);
const TEXT_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".html", ".md", ".mjs", ".cjs"]);
const IGNORED_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".env", ".env.local", ".env.development", ".env.production", ".env.test", "credentials.json", "service-account.json"]);
const IGNORED_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx"]);
const MAX_RESULTS = 10;
const MAX_FILE_BYTES = 512 * 1024;

function isSensitive(filePath) {
    const name = path.basename(filePath).toLowerCase();
    return IGNORED_FILES.has(name) || IGNORED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function searchDirectory(directory, query, results) {
    if (results.length >= MAX_RESULTS) return;

    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        if (results.length >= MAX_RESULTS) return;
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;

        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            await searchDirectory(fullPath, query, results);
            continue;
        }

        const extension = path.extname(entry.name).toLowerCase();
        if (isSensitive(fullPath) || !TEXT_EXTENSIONS.has(extension)) continue;

        try {
            const stat = await fs.stat(fullPath);
            if (stat.size > MAX_FILE_BYTES) continue;

            const content = await fs.readFile(fullPath, "utf8");
            const lines = content.split("\n");

            for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
                if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        file: path.relative(directory === "" ? process.cwd() : directory, fullPath),
                        line: i + 1,
                        snippet: lines[i].trim().slice(0, 500),
                    });
                }
            }
        } catch {}
    }
}

export async function searchFiles(repositoryId, query) {
    if (!query || typeof query !== "string") throw new Error("Search query is required.");

    const root = await assertRepositoryExists(repositoryId, fs);
    const results = [];

    // Search paths are made relative to the repository root.
    async function walk(directory) {
        if (results.length >= MAX_RESULTS) return;
        const entries = await fs.readdir(directory, { withFileTypes: true });

        for (const entry of entries) {
            if (results.length >= MAX_RESULTS) return;
            if (IGNORED_DIRECTORIES.has(entry.name)) continue;

            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }

            if (isSensitive(fullPath) || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

            try {
                const stat = await fs.stat(fullPath);
                if (stat.size > MAX_FILE_BYTES) continue;

                const content = await fs.readFile(fullPath, "utf8");
                const lines = content.split("\n");

                for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
                    if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                        results.push({
                            file: path.relative(root, fullPath),
                            line: i + 1,
                            snippet: lines[i].trim().slice(0, 500),
                        });
                    }
                }
            } catch {}
        }
    }

    await walk(root);
    return results;
}
