import { buildDependencyIndex } from "./indexer/buildDependencyIndex.js";

const repositoryId =
    "07248f55-da78-4bc6-9d7c-ce03e923c1a5";

const index = await buildDependencyIndex(
    repositoryId
);

console.log("\nDEPENDENCIES\n");

for (const [
    file,
    imports
] of index.dependencies) {

    console.log(`\n${file}`);

    for (const imported of imports) {
        console.log(
            `  -> ${imported.path} (line ${imported.line})`
        );
    }
}

console.log("\nDEPENDENTS\n");

for (const [
    file,
    dependents
] of index.dependents) {

    console.log(`\n${file}`);

    for (const dependent of dependents) {
        console.log(
            `  <- ${dependent.path}`
        );
    }
}