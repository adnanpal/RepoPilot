import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat.js";
import filesRouter from "./routes/files.js";
import repositoriesRouter from "./routes/repositories.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
    res.json({ message: "AI File Explorer API is running" });
});

app.use("/api/repositories", repositoriesRouter);
app.use("/api/files", filesRouter);
app.use("/api/chat", chatRouter);

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
