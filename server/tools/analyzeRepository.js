import { buildDependencyIndex, getDependencyIndex } from "../indexer/buildDependencyIndex.js";
import { buildAstIndex, getAstIndex } from "../indexer/buildAstIndexer.js";

const MAX_ENTRY_POINTS = 5;
const MAX_DEPENDENCIES_PER_FILE = 8;
const MAX_SHARED_MODULES = 10;

function getEntryPoints(files) {
    const candidates = [];

    for (const filePath of files) {
        const name = filePath
            .split("/")
            .pop()
            .toLowerCase();

        let score = 0;

        if (
            name === "main.tsx" ||
            name === "main.ts" ||
            name === "main.jsx" ||
            name === "main.js"
        ) {
            score += 100;
        }

        if (
            name === "app.tsx" ||
            name === "app.ts" ||
            name === "app.jsx" ||
            name === "app.js"
        ) {
            score += 90;
        }

        if (
            name === "index.tsx" ||
            name === "index.ts" ||
            name === "index.jsx" ||
            name === "index.js"
        ) {
            score += 80;
        }

        if (
            name === "server.js" ||
            name === "server.ts" ||
            name === "server.jsx" ||
            name === "server.tsx"
        ) {
            score += 90;
        }

        if (score > 0) {
            candidates.push({
                path: filePath,
                score,
            });
        }
    }

    return candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRY_POINTS)
        .map(item => item.path);
}

function getSharedModules(dependencyIndex) {
    const result = [];

    for (const [
        filePath,
        dependents
    ] of dependencyIndex.dependents) {

        if (dependents.length < 2) {
            continue;
        }

        result.push({
            path: filePath,
            importedByCount: dependents.length,
            importedBy: dependents
                .slice(0, MAX_DEPENDENCIES_PER_FILE)
                .map(item => item.path),
        });
    }

    return result
        .sort(
            (a, b) =>
                b.importedByCount -
                a.importedByCount
        )
        .slice(0, MAX_SHARED_MODULES);
}

function buildEntryPointSummary(
    entryPoints,
    dependencyIndex
) {
    return entryPoints.map(filePath => {
        const dependencies =
            dependencyIndex.dependencies.get(
                filePath
            ) || [];

        return {
            path: filePath,
            dependencies: dependencies
                .slice(0, MAX_DEPENDENCIES_PER_FILE)
                .map(item => ({
                    path: item.path,
                    line: item.line,
                })),
        };
    });
}

function buildSymbolSummary(
    astIndex,
    entryPoints
) {
    const result = [];

    for (const filePath of entryPoints) {
        const fileData =
            astIndex.files.get(filePath);

        if (!fileData) {
            continue;
        }

        result.push({
            path: filePath,
            symbols: fileData.symbols.slice(0, 15),
            exports: fileData.exports.slice(0, 15),
        });
    }

    return result;
}

export async function analyzeRepository(repositoryId) {
    let astIndex = getAstIndex(repositoryId);

    if (!astIndex) {
        astIndex = await buildAstIndex(
            repositoryId
        );
    }

    let dependencyIndex =
        getDependencyIndex(repositoryId);

    if (!dependencyIndex) {
        dependencyIndex =
            await buildDependencyIndex(
                repositoryId
            );
    }

    const files = [
        ...astIndex.files.keys()
    ];

    const entryPoints =
        getEntryPoints(files);

    const result = {
        repositoryId,

        totalFiles: files.length,

        entryPoints: buildEntryPointSummary(
            entryPoints,
            dependencyIndex
        ),

        entryPointSymbols: buildSymbolSummary(
            astIndex,
            entryPoints
        ),

        sharedModules:
            getSharedModules(
                dependencyIndex
            ),
    };

    return result;
}