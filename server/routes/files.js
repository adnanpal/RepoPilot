import express from "express";
import { getProjectTree } from "../tools/getProjectTree.js";

const router = express.Router();

router.get("/tree", async (req, res) => {
    try {
        const tree = await getProjectTree();

        res.json({
            tree,
        });
    } catch (error) {
        console.error("Failed to get project tree:", error);

        res.status(500).json({
            error: "Failed to load project tree.",
        });
    }
});

export default router;