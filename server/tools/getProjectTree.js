import fs from "fs/promises";
import path from "path";
import { assertRepositoryExists } from "./repositoryRoot.js";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", ".next", ".vite", "coverage"]);
const IGNORED_FILES = new Set([".env", ".env.local", ".env.development", ".env.production", ".env.test", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
const MAX_TREE_LINES = 500;

async function buildTree(directory, prefix = "", state = { count: 0 }) {
    if (state.count >= MAX_TREE_LINES) return ["... tree truncated ..."];

    const entries = await fs.readdir(directory, { withFileTypes: true });
    const visible = entries
        .filter((entry) => entry.isDirectory()
            ? !IGNORED_DIRECTORIES.has(entry.name)
            : !IGNORED_FILES.has(entry.name))
        .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

    const lines = [];
    for (let i = 0; i < visible.length; i++) {
        if (state.count >= MAX_TREE_LINES) {
            lines.push(`${prefix}... tree truncated ...`);
            break;
        }

        const entry = visible[i];
        const last = i === visible.length - 1;
        lines.push(`${prefix}${last ? "└── " : "├── "}${entry.name}`);
        state.count++;

        if (entry.isDirectory()) {
            lines.push(...await buildTree(path.join(directory, entry.name), prefix + (last ? "    " : "│   "), state));
        }
    }
    return lines;
}

export async function getProjectTree(repositoryId) {
    const root = await assertRepositoryExists(repositoryId, fs);
    return [path.basename(root), ...(await buildTree(root))].join("\n");
}
