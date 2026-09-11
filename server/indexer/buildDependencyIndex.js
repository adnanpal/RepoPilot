import fs from "fs/promises";
import path from "path";

import { assertRepositoryExists } from "../tools/repositoryRoot.js";
import { getAstIndex, buildAstIndex } from "./buildAstIndexer.js";

const dependencyIndexes = new Map();

const EXTENSIONS = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
];

async function fileExists(filePath) {
    try {
        const stat = await fs.stat(filePath);
        return stat.isFile();
    } catch {
        return false;
    }
}

async function resolveImport(
    root,
    importerPath,
    importSource
) {
    // Ignore external packages such as "react"
    if (!importSource.startsWith(".")) {
        return null;
    }

    const importerDirectory = path.dirname(
        path.join(root, importerPath)
    );

    const basePath = path.resolve(
        importerDirectory,
        importSource
    );

    // Prevent escaping repository
    const relativeBase = path.relative(root, basePath);

    if (
        relativeBase.startsWith("..") ||
        path.isAbsolute(relativeBase)
    ) {
        return null;
    }

    // Example:
    // ./Navbar
    // ./Navbar.tsx
    // ./Navbar/index.tsx

    const candidates = [];

    // Exact path
    candidates.push(basePath);

    // Add extensions
    for (const extension of EXTENSIONS) {
        candidates.push(
            basePath + extension
        );
    }

    // Directory index files
    for (const extension of EXTENSIONS) {
        candidates.push(
            path.join(
                basePath,
                `index${extension}`
            )
        );
    }

    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return path
                .relative(root, candidate)
                .replaceAll(path.sep, "/");
        }
    }

    return null;
}

export async function buildDependencyIndex(repositoryId) {
    const root = await assertRepositoryExists(
        repositoryId,
        fs
    );

    let astIndex = getAstIndex(repositoryId);

    if (!astIndex) {
        astIndex = await buildAstIndex(
            repositoryId
        );
    }

    console.log(
        `Building dependency index for ${repositoryId}...`
    );

    const dependencies = new Map();

    for (const [
        filePath,
        fileData
    ] of astIndex.files) {

        const resolvedImports = [];

        for (const importInfo of fileData.imports) {
            const resolved = await resolveImport(
                root,
                filePath,
                importInfo.source
            );

            if (!resolved) {
                continue;
            }

            resolvedImports.push({
                path: resolved,
                line: importInfo.line,
                source: importInfo.source,
            });
        }

        dependencies.set(
            filePath,
            resolvedImports
        );
    }

    // Build reverse dependency graph.
    //
    // If:
    // App.tsx -> Navbar.tsx
    //
    // Then:
    // Navbar.tsx -> importedBy: App.tsx

    const dependents = new Map();

    for (const [
        importer,
        imports
    ] of dependencies) {

        for (const imported of imports) {

            if (!dependents.has(imported.path)) {
                dependents.set(
                    imported.path,
                    []
                );
            }

            dependents
                .get(imported.path)
                .push({
                    path: importer,
                    line: imported.line,
                });
        }
    }

    const index = {
        repositoryId,
        dependencies,
        dependents,
    };

    dependencyIndexes.set(
        repositoryId,
        index
    );

    console.log(
        `Dependency index ready. Files: ${dependencies.size}`
    );

    return index;
}

export function getDependencyIndex(repositoryId) {
    return dependencyIndexes.get(repositoryId);
}