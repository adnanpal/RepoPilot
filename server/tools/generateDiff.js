import { createTwoFilesPatch } from "diff";

export function generateDiff(filePath, oldContent, newContent) {
    return createTwoFilesPatch(
        filePath,
        filePath,
        oldContent,
        newContent,
        "",
        ""
    );
}