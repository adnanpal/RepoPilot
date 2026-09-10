import fs from "fs/promises";
import path from "path";
import { assertRepositoryExists } from "./repositoryRoot.js";

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
    return { success: true, path: filePath, message: `File ${filePath} written successfully.` };
}
