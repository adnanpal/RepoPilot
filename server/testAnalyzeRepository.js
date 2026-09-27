import { analyzeRepository } from "./tools/analyzeRepository.js";

const repositoryId =
    "07248f55-da78-4bc6-9d7c-ce03e923c1a5";

const result =
    await analyzeRepository(repositoryId);

console.log(
    JSON.stringify(
        result,
        null,
        2
    )
);