import fs from "fs/promises";
import path from "path";

import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

import { assertRepositoryExists } from "../tools/repositoryRoot.js";

const traverse = traverseModule.default;

const SUPPORTED_EXTENSIONS = new Set([
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
]);

const IGNORED_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".vite",
    "coverage",
    "vendor",
]);

const astIndexes = new Map();

async function getSourceFiles(directory) {
    const entries = await fs.readdir(directory, {
        withFileTypes: true,
    });

    const files = [];

    for (const entry of entries) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
            continue;
        }

        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await getSourceFiles(fullPath));
            continue;
        }

        const extension = path
            .extname(entry.name)
            .toLowerCase();

        if (SUPPORTED_EXTENSIONS.has(extension)) {
            files.push(fullPath);
        }
    }

    return files;
}

function getLine(node) {
    return node?.loc?.start?.line ?? null;
}

function addSymbol(symbols, symbol) {
    if (!symbol.name) return;

    symbols.push({
        name: symbol.name,
        kind: symbol.kind,
        line: symbol.line,
    });
}

function extractIndex(ast) {
    const imports = [];
    const exports = [];
    const symbols = [];

    traverse(ast, {
        ImportDeclaration(path) {
            imports.push({
                source: path.node.source.value,
                line: getLine(path.node),
            });
        },

        ExportNamedDeclaration(path) {
            const node = path.node;

            if (node.declaration) {
                const declaration = node.declaration;

                if (
                    declaration.type === "FunctionDeclaration" &&
                    declaration.id
                ) {
                    addSymbol(symbols, {
                        name: declaration.id.name,
                        kind: "function",
                        line: getLine(declaration),
                    });
                }

                if (
                    declaration.type === "ClassDeclaration" &&
                    declaration.id
                ) {
                    addSymbol(symbols, {
                        name: declaration.id.name,
                        kind: "class",
                        line: getLine(declaration),
                    });
                }
            }

            for (const specifier of node.specifiers || []) {
                if (specifier.local) {
                    exports.push({
                        name: specifier.exported.name ||
                            specifier.exported.value,
                        local: specifier.local.name,
                        line: getLine(specifier),
                    });
                }
            }
        },

        ExportDefaultDeclaration(path) {
            exports.push({
                name: "default",
                line: getLine(path.node),
            });
        },

        FunctionDeclaration(path) {
            if (path.node.id) {
                addSymbol(symbols, {
                    name: path.node.id.name,
                    kind: "function",
                    line: getLine(path.node),
                });
            }
        },

        VariableDeclarator(path) {
            if (
                path.node.id?.type === "Identifier" &&
                (
                    path.node.init?.type === "ArrowFunctionExpression" ||
                    path.node.init?.type === "FunctionExpression"
                )
            ) {
                addSymbol(symbols, {
                    name: path.node.id.name,
                    kind: "function",
                    line: getLine(path.node),
                });
            }
        },

        ClassDeclaration(path) {
            if (path.node.id) {
                addSymbol(symbols, {
                    name: path.node.id.name,
                    kind: "class",
                    line: getLine(path.node),
                });
            }
        },
    });

    const uniqueSymbols = [];
    const seenSymbols = new Set();

    for (const symbol of symbols) {
        const key = `${symbol.kind}:${symbol.name}:${symbol.line}`;

        if (seenSymbols.has(key)) {
            continue;
        }

        seenSymbols.add(key);
        uniqueSymbols.push(symbol);
    }

    return {
        imports,
        exports,
        symbols: uniqueSymbols,
    };

}

export async function buildAstIndex(repositoryId) {
    const root = await assertRepositoryExists(
        repositoryId,
        fs
    );

    console.log(
        `Building AST index for ${repositoryId}...`
    );

    const sourceFiles = await getSourceFiles(root);
    const files = new Map();

    let indexed = 0;
    let failed = 0;

    for (const filePath of sourceFiles) {
        try {
            const content = await fs.readFile(
                filePath,
                "utf-8"
            );

            const ast = parse(content, {
                sourceType: "unambiguous",

                plugins: [
                    "jsx",
                    "typescript",
                    "classProperties",
                    "classPrivateProperties",
                    "classPrivateMethods",
                    "decorators-legacy",
                ],
            });

            const result = extractIndex(ast);

            const relativePath = path
                .relative(root, filePath)
                .replaceAll(path.sep, "/");

            files.set(relativePath, result);

            indexed++;
        } catch (error) {
            failed++;

            console.warn(
                `AST parse failed: ${filePath}`,
                error.message
            );
        }
    }

    const index = {
        repositoryId,
        files,
        indexed,
        failed,
    };

    astIndexes.set(repositoryId, index);

    console.log(
        `AST index ready. Indexed: ${indexed}, failed: ${failed}`
    );

    return index;
}

export function getAstIndex(repositoryId) {
    return astIndexes.get(repositoryId);
}