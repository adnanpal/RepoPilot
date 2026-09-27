import { buildAstIndex } from "./indexer/buildAstIndexer.js";

const repositoryId = "07248f55-da78-4bc6-9d7c-ce03e923c1a5";

const index = await buildAstIndex(repositoryId);

console.log(
    JSON.stringify(
        Object.fromEntries(index.files),
        null,
        2
    )
);