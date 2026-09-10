import express from "express";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import crypto from "crypto";
import { proposeChange } from "../tools/proposeChange.js";
import { writeFile } from "../tools/writeFile.js";
import { generateDiff } from "../tools/generateDiff.js";
import { getProjectTree } from "../tools/getProjectTree.js";
import { readFile } from "../tools/readFile.js";
import { listFiles } from "../tools/listFiles.js";
import { searchFiles } from "../tools/searchFiles.js";
import { getRepositoryRoot } from "../tools/repositoryRoot.js";

dotenv.config();

const router = express.Router();
const pendingChanges = new Map();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "qwen/qwen3.6-27b";

const systemInstruction = `
You are RepoPilot, an AI repository engineer.

Your job is to answer questions about the user's codebase accurately
using the available repository tools.

========================
CORE PRINCIPLE
========================

Use the MINIMUM amount of repository information necessary to answer
the user's question.

Do NOT explore the repository broadly.

Do NOT inspect files simply because they exist.

Do NOT read large files unless the question requires their contents.

NEVER claim that a file, function, route, or implementation exists
unless it was directly observed through a tool result.

If the repository does not contain evidence of something,
say that it was not found.

Never infer or invent filenames.

========================
TOOL STRATEGY
========================

Follow this decision process:

1. If you already know which file is relevant, read that file directly.

2. If you do not know which file is relevant, use searchFiles with ONE
   focused search query.

3. After searchFiles returns relevant locations, read only the most
   relevant file and only the relevant line range.

4. Use getProjectTree only when you genuinely need to understand the
   repository structure.

5. Do not call searchFiles repeatedly with broad variations of the
   same query.

6. Do not search for generic terms such as:
   "api"
   "code"
   "function"
   "data"
   unless the user's question specifically requires them.

7. Never read an entire large source file when a smaller section can
   answer the question.

8. Once you have enough information to answer, STOP using tools.

========================
IMPORTANT LIMITS
========================

Maximum recommended tool calls for a normal question: 4.

STOP USING TOOLS as soon as you have enough evidence to answer the user's question.

Do not search for confirmation if the evidence already clearly answers the question.

Do not inspect unrelated files.

Do not repeat searches using synonymous queries unless the previous result was insufficient.

For simple questions, prefer answering directly without tools.

For repository questions, use the minimum number of tools necessary to establish the answer.

Once you can answer accurately, return the final answer immediately.

If you can answer with 1-3 calls, do so.

Never inspect the entire repository for a simple question.

========================
READ FILE RULES
========================

When using readFile:

- Prefer focused line ranges.
- For large files, request no more than 150 lines at a time.
- If the relevant code location is already known from search results,
  read around that location.
- Only request a larger range when necessary.

========================
ACCURACY
========================

Never invent repository information.

For repository-specific claims, use information obtained from the
repository tools.

If the available information is insufficient, perform one targeted
additional tool call.

Then answer.

========================
EXAMPLE
========================

User asks:

"How do I connect the frontend to the backend?"

Good approach:

searchFiles("fetch(")

then inspect the relevant frontend API code and backend route.

Bad approach:

getProjectTree
→ read package.json
→ read server/package.json
→ read vite.config.js
→ read server.js
→ search "fetch"
→ search "api"
→ search "localhost"
→ read entire App.jsx

The goal is to understand the relevant connection,
NOT the entire repository`;

const tools = [
    {
        type: "function",
        function: {
            name: "searchFiles",
            description: "Search the uploaded repository for a focused text, phrase, function, variable, route, or keyword.",
            parameters: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "getProjectTree",
            description: "Get the uploaded repository's file and folder structure when structure is needed.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
        },
    },
    {
        type: "function",
        function: {
            name: "readFile",
            description: "Read a focused portion of a file in the uploaded repository.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    startLine: { type: "integer" },
                    endLine: { type: "integer" },
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
            description: "List files/directories at the repository root.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
        },
    },
    {
        type: "function",
        function: {
            name: "proposeChange",
            description: "Prepare a change to an existing repository file without applying it.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    newContent: { type: "string" },
                },
                required: ["path", "newContent"],
                additionalProperties: false,
            },
        },
    },
];

async function runAgent(message, repositoryId) {
    // Validate that the repository exists before the model can access it.
    await getRepositoryRoot(repositoryId);

    const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: message },
    ];

    let proposal = null;
    const MAX_STEPS = 6;

    for (let step = 0; step < MAX_STEPS; step++) {
        console.log(`Agent step ${step + 1}`);

        const response = await groq.chat.completions.create({
            model: MODEL,
            messages,
            tools,
            tool_choice: "auto",
            reasoning_effort: "none",
            reasoning_format: "hidden",
            max_completion_tokens: 500,
        });

        const assistantMessage = response.choices[0].message;

        if (!assistantMessage.tool_calls?.length) {
            return { reply: assistantMessage.content || "", proposal };
        }

        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name;
            let args;

            try {
                args = JSON.parse(toolCall.function.arguments);
            } catch {
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ error: "Invalid tool arguments." }),
                });
                continue;
            }

            console.log("Tool:", toolName);
            console.log("Arguments:", args);

            try {
                let result;

                if (toolName === "searchFiles") result = await searchFiles(repositoryId, args.query);
                else if (toolName === "readFile") result = await readFile(repositoryId, args.path, args.startLine, args.endLine);
                else if (toolName === "getProjectTree") result = await getProjectTree(repositoryId);
                else if (toolName === "listFiles") result = await listFiles(repositoryId, ".");
                else if (toolName === "proposeChange") result = await proposeChange(repositoryId, args.path, args.newContent);
                else throw new Error(`Unknown tool: ${toolName}`);

                if (toolName === "proposeChange") {
                    proposal = {
                        proposalId: crypto.randomUUID(),
                        type: result.type,
                        path: result.path,
                        diff: generateDiff(result.path, result.oldContent, result.newContent),
                    };

                    pendingChanges.set(proposal.proposalId, {
                        repositoryId,
                        path: result.path,
                        newContent: result.newContent,
                    });

                    return {
                        reply: `I've prepared a proposed change for ${result.path}.`,
                        proposal,
                    };
                }

                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result),
                });
            } catch (error) {
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ error: error.message }),
                });
            }
        }
    }

    throw new Error("Agent exceeded maximum tool steps.");
}

router.post("/", async (req, res) => {
    try {
        const { message, repositoryId } = req.body || {};

        if (!message || typeof message !== "string") {
            return res.status(400).json({ error: "Message is required." });
        }

        if (!repositoryId) {
            return res.status(400).json({ error: "Upload a repository before chatting." });
        }

        const result = await runAgent(message, repositoryId);
        res.json(result);
    } catch (error) {
        console.error("Agent error:", error);
        res.status(500).json({ error: error.message || "Something went wrong." });
    }
});

router.post("/apply", async (req, res) => {
    try {
        const { proposalId } = req.body || {};
        const proposal = pendingChanges.get(proposalId);

        if (!proposal) {
            return res.status(404).json({ error: "Proposal not found or already expired." });
        }

        await writeFile(proposal.repositoryId, proposal.path, proposal.newContent);
        pendingChanges.delete(proposalId);

        res.json({ success: true, message: `Changes applied to ${proposal.path}.`, path: proposal.path });
    } catch (error) {
        console.error("Apply change error:", error);
        res.status(500).json({ error: error.message || "Failed to apply changes." });
    }
});

export default router;
