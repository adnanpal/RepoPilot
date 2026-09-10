import fs from "fs/promises";
import path from "path";
import { assertRepositoryExists } from "./repositoryRoot.js";

const BLOCKED_FILES = new Set([
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    "credentials.json",
    "service-account.json",
]);

const BLOCKED_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx"]);
const MAX_LINES = 150;
const MAX_CHARS = 8000;

export async function readFile(repositoryId, filePath, startLine = 1, endLine = startLine + MAX_LINES - 1) {
    const root = await assertRepositoryExists(repositoryId, fs);
    const absolutePath = path.resolve(root, filePath);

    const relativePath = path.relative(root, absolutePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error("Access denied: path is outside the repository.");
    }

    const fileName = path.basename(absolutePath).toLowerCase();
    const extension = path.extname(absolutePath).toLowerCase();

    if (BLOCKED_FILES.has(fileName) || BLOCKED_EXTENSIONS.has(extension)) {
        throw new Error("Access denied: file is blocked.");
    }

    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) throw new Error("Path is not a file.");

    const content = await fs.readFile(absolutePath, "utf-8");
    const lines = content.split("\n");

    const safeStart = Math.max(1, Number(startLine) || 1);
    const requestedEnd = Math.max(safeStart, Number(endLine) || safeStart + MAX_LINES - 1);
    const safeEnd = Math.min(lines.length, safeStart + MAX_LINES - 1, requestedEnd);

    let result = lines.slice(safeStart - 1, safeEnd)
        .map((line, index) => `${safeStart + index}: ${line}`)
        .join("\n");

    const truncated = result.length > MAX_CHARS;
    if (truncated) result = result.slice(0, MAX_CHARS);

    return {
        path: filePath,
        startLine: safeStart,
        endLine: safeEnd,
        totalLines: lines.length,
        truncated,
        content: result,
    };
}
