import { readFile } from "./readFile.js";

export async function proposeChange(repositoryId, filePath, newContent) {
    const oldResult = await readFile(repositoryId, filePath, 1, 150);
    if (oldResult.truncated || oldResult.totalLines > 150) {
        throw new Error("File is too large to safely replace in one proposal. Read and change a focused file first.");
    }

    const oldContent = oldResult.content
        .split("\n")
        .map((line) => line.replace(/^\d+: ?/, ""))
        .join("\n");

    const lineEnding = oldContent.includes("\r\n") ? "\r\n" : "\n";
    const normalizedNewContent = newContent.replace(/\r\n/g, "\n").replace(/\n/g, lineEnding);

    return { type: "file_change", path: filePath, oldContent, newContent: normalizedNewContent };
}
