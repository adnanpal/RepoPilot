import fs from "fs/promises";
import path from "path";

const repositoryIndexes = new Map();

const IGNORED_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
]);

const IGNORED_FILES = new Set([
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
]);

async function scanDirectory(directoryPath, repositoryPath) {
    const entries = await fs.readdir(directoryPath, {
        withFileTypes: true,
    });

    const children = [];

    for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry.name);

        if (entry.isDirectory()) {
            if (IGNORED_DIRECTORIES.has(entry.name)) {
                continue;
            }

            const directory = await scanDirectory(
                fullPath,
                repositoryPath
            );

            children.push({
                type: "directory",
                name: entry.name,
                children: directory,
            });

            continue;
        }

        if (IGNORED_FILES.has(entry.name)) {
            continue;
        }

        const stats = await fs.stat(fullPath);

        const relativePath = path.relative(
            repositoryPath,
            fullPath
        );

        children.push({
            type: "file",
            name: entry.name,
            path: relativePath.replaceAll(path.sep, "/"),
            extension: path.extname(entry.name),
            size: stats.size,
        });
    }

    return children;
}

export async function buildFileIndex(
    repositoryId,
    repositoryPath
) {
    const tree = {
        type: "directory",
        name: repositoryId,
        children: await scanDirectory(
            repositoryPath,
            repositoryPath
        ),
    };

    const files = [];

    function collectFiles(node) {
        for (const child of node.children || []) {
            if (child.type === "file") {
                files.push(child);
            }

            if (child.type === "directory") {
                collectFiles(child);
            }
        }
    }

    collectFiles(tree);

    const index = {
        repositoryId,
        repositoryPath,
        tree,
        files,
    };

    repositoryIndexes.set(repositoryId, index);

    return index;
}

export function getFileIndex(repositoryId) {
    return repositoryIndexes.get(repositoryId);
}