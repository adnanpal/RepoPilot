import Groq from "groq-sdk";
import dotenv from "dotenv";
import { readFile } from "./tools/readFile.js";
import { listFiles } from "./tools/listFiles.js";
import { searchFiles } from "./tools/searchFiles.js";

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const toolHandlers = {
    searchFiles : async(args)=>{
        return await searchFiles(args.query);
    },

    readFile: async(args)=>{
        return await readFile(args.path);
    },

    listFiles: async(args)=>{
        return await listFiles(args.directory || ".");
    },
};


const tools = [
    {
        type: "function",
        function: {
            name: "searchFiles",
            description:
                "Searches the project files for a given text or keyword.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description:
                            "The word, phrase, function name, or variable to search for.",
                    },
                },
                required: ["query"],
                additionalProperties: false,
            },
        },
    },

    {
        type: "function",
        function: {
            name: "readFile",
            description:
                "Reads the contents of a specific project file.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "Relative path of the file to read.",
                    },
                },
                required: ["path"],
                additionalProperties: false,
            },
        },
    },

    {
        type: "function",
        function: {
            name: "listFiles",
            description:
                "Lists files and directories in the project root.",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
    },
];

let messages = [
    {
        role: "system",
        content: `
You are an AI repository engineer.

Use the available tools whenever repository information is required.

Rules:
- Never invent repository information.
- Use searchFiles to locate relevant code.
- Use readFile when you need to inspect a file.
- Use listFiles when you need to understand the project structure.
- Use the minimum number of tool calls necessary.
- Stop once you have enough information to answer.
`,
    },

    {
        role: "user",
        content:
            "Find where systemInstruction is defined and explain what it is used for.",
    },
];

const MAX_STEPS = 6;


for (let step = 0; step < MAX_STEPS; step++) {

    console.log(`\n--- Agent step ${step + 1} ---`);

    const response = await groq.chat.completions.create({
        model: "qwen/qwen3.6-27b",
        messages,
        tools,
        tool_choice: "auto",
        reasoning_effort: "none",
        reasoning_format: "hidden",
        max_completion_tokens: 500,
    });

    const assistantMessage = response.choices[0].message;

    // No tool call = final answer
    if (!assistantMessage.tool_calls?.length) {
        console.log("\nFINAL ANSWER:");
        console.log(assistantMessage.content);
        break;
    }

    // Save Qwen's tool-call message
    messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {

        const toolName = toolCall.function.name;

        const args = JSON.parse(
            toolCall.function.arguments
        );

        console.log("\nTool requested:", toolName);
        console.log("Arguments:", args);

        const handler = toolHandlers[toolName];

        if (!handler) {
            throw new Error(
                `Unknown tool requested: ${toolName}`
            );
        }

        const result = await handler(args);

        console.log("\nTool result:");
        console.dir(result, { depth: null });

        messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
        });
    }
}

const finalResponse = await groq.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages,
    tools,
    tool_choice: "auto",
    reasoning_effort: "none",
    reasoning_format: "hidden",
    max_completion_tokens: 500,
});

console.log("\nFINAL ANSWER:");
console.log(finalResponse.choices[0].message.content);

