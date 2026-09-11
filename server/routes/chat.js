import express from "express";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import crypto from "crypto";
import { proposeChange } from "../tools/proposeChange.js";
import { writeFile } from "../tools/writeFile.js";
import { generateDiff } from "../tools/generateDiff.js";
import { getProjectTree } from "../tools/getProjectTree.js";
import { listFiles } from "../tools/listFiles.js";
import { searchFiles } from "../tools/searchFiles.js";
import { getRepositoryRoot } from "../tools/repositoryRoot.js";
import { readFileRange } from "../tools/readFileRange.js";
import { analyzeRepository } from "../tools/analyzeRepository.js";

dotenv.config();

const router = express.Router();
const pendingChanges = new Map();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "qwen/qwen3.6-27b";

const systemInstruction = `You are RepoPilot, an AI repository engineer. Use the MINIMUM repository info needed to answer. Never claim a file, function, route, or behavior exists unless a tool result showed it — say "not found" instead of guessing.

Tool strategy:
1. Already know the file? Read it directly with readFileRange, not the whole file.
2. Otherwise call searchFiles ONCE with a focused query. It returns files ranked by relevance, each with the best-matching lines, inline snippets, and enclosing function/route name — this is usually enough to answer without any further tool call.
3. Only call readFileRange afterward if the snippet genuinely isn't enough context. Request a narrow line range around the match, never the whole file.
4. 4. For architecture, dependency, entry-point, module-relationship, or "how is this repository structured?" questions, use analyzeRepository first. Do not manually explore the repository with getProjectTree, searchFiles, and multiple reads unless analyzeRepository is insufficient.
5. Don't repeat searches with synonyms if the first result already answered it. Don't search generic terms ("api", "code", "data") unless the question needs them.
6. Stop calling tools the moment you have enough evidence. Normal questions should take 1-3 calls, 4 at most.

If evidence is still insufficient after one targeted extra call, answer with what you found and say what's missing — don't invent the rest.`;

const tools = [
    {
        type: "function",
        function: {
            name: "analyzeRepository",
            description:
                "Analyze the repository architecture using its AST and dependency indexes. Returns a compact summary of entry points, their dependencies, important symbols, exports, and highly shared modules. Use this first for architecture, dependency, module relationship, or repository structure questions.",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "searchFiles",
            description: "Search the uploaded repository for a focused text, phrase, function, variable, route, or keyword. Returns the top matching files ranked by relevance (BM25), each with the best-matching lines, an inline code snippet, and the enclosing function/route name — often enough to answer without a follow-up readFileRange call.",
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
    {
        type: "function",
        function: {
            name: "readFileRange",
            description:
                "Reads a specific range of lines from a file. Use this after searchFiles finds a relevant line so that only the necessary code is inspected.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative path of the file.",
                    },
                    startLine: {
                        type: "integer",
                        description: "First line to read.",
                    },
                    endLine: {
                        type: "integer",
                        description: "Last line to read.",
                    },
                },
                required: [
                    "path",
                    "startLine",
                    "endLine",
                ],
                additionalProperties: false,
            },
        },

    }

];

// Groq's API is stateless per request: the whole `messages` array is resent
// on every one of the (up to MAX_STEPS) calls in this loop. Without pruning,
// a file read in step 2 gets billed again as input tokens in steps 3-8. Once
// a tool result is more than KEEP_FULL_STEPS steps old, it's already been
// seen and used by the model, so we collapse it down to a short marker
// instead of resending it in full.
const KEEP_FULL_STEPS = 2;

function summarizeToolContent(content) {
    if (content.length <= 300) return content;

    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return JSON.stringify({ note: `[${parsed.length} result(s) from an earlier step — already used]` });
        }
        if (parsed && typeof parsed === "object") {
            const label = parsed.path || parsed.file || "result";
            return JSON.stringify({ note: `[earlier ${label} already read in a previous step]` });
        }
    } catch {
        // Not JSON — fall through to a plain truncation.
    }

    return content.slice(0, 200) + "...[truncated, already used in an earlier step]";
}

async function runAgent(message, repositoryId) {
    // Validate that the repository exists before the model can access it.
    await getRepositoryRoot(repositoryId);

    const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: message },
    ];

    let proposal = null;
    let analyzeRepositoryUsed = false;
    const MAX_STEPS = 8;
    const toolMessageIndicesByStep = [];

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
        const currentStepToolIndices = [];

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
                currentStepToolIndices.push(messages.length - 1);
                continue;
            }

            console.log("Tool:", toolName);
            console.log("Arguments:", args);

            try {
                let result;
                if (toolName === "analyzeRepository") {
                    if (analyzeRepositoryUsed) {
                        result = {
                            error: "analyzeRepository can only be called once per user request. Use the existing analysis and inspect specific files if more evidence is needed."
                        };
                    } else {
                        analyzeRepositoryUsed = true;
                        result = await analyzeRepository(repositoryId);
                    }
                }
                else if (toolName === "searchFiles") result = await searchFiles(repositoryId, args.query);
                else if (toolName === "getProjectTree") result = await getProjectTree(repositoryId);
                else if (toolName === "listFiles") result = await listFiles(repositoryId, ".");
                else if (toolName === "readFileRange") result = await readFileRange(repositoryId, args.path, args.startLine, args.endLine);
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
                currentStepToolIndices.push(messages.length - 1);
            } catch (error) {
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ error: error.message }),
                });
                currentStepToolIndices.push(messages.length - 1);
            }
        }

        toolMessageIndicesByStep.push(currentStepToolIndices);

        // Compact the oldest step that's now outside the "keep full" window.
        if (toolMessageIndicesByStep.length > KEEP_FULL_STEPS) {
            const staleIndices = toolMessageIndicesByStep[toolMessageIndicesByStep.length - 1 - KEEP_FULL_STEPS];
            for (const idx of staleIndices) {
                messages[idx] = { ...messages[idx], content: summarizeToolContent(messages[idx].content) };
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
