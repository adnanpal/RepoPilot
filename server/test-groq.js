import { proposeChange } from "./tools/proposeChange.js";
import { generateDiff } from "./tools/generateDiff.js";

const proposal = await proposeChange(
    "server/server.js",
    `import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "AI File Explorer API is running" });
});

app.use("/api/chat", chatRouter);

const PORT = 8000;

app.listen(PORT, () => {
    console.log(\`Server running on http://localhost:\${PORT}\`);
});
`
);

const diff = generateDiff(
    proposal.path,
    proposal.oldContent,
    proposal.newContent
);

console.log(diff);