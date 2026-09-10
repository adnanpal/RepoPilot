import express from "express";
import multer from "multer";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import crypto from "crypto";
import unzipper from "unzipper";

const router = express.Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const REPOSITORIES_DIR = path.resolve(process.cwd(), "repositories");

const upload = multer({
    dest: UPLOAD_DIR,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100 MB
    },
    fileFilter: (req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith(".zip")) {
            return cb(new Error("Only ZIP files are allowed."));
        }

        cb(null, true);
    },
});

router.post("/upload", upload.single("repository"), async (req, res) => {
    let uploadedFile;

    try {
        if (!req.file) {
            return res.status(400).json({
                error: "Repository ZIP file is required.",
            });
        }

        uploadedFile = req.file;

        const repositoryId = crypto.randomUUID();

        const repositoryPath = path.join(
            REPOSITORIES_DIR,
            repositoryId
        );

        await fs.mkdir(repositoryPath, {recursive: true});
        await fs.mkdir(REPOSITORIES_DIR, { recursive: true });
        await fs.mkdir(UPLOAD_DIR, {recursive: true});

        const zipPath = uploadedFile.path;

        const directory = await unzipper.Open.file(zipPath);

        for (const entry of directory.files) {
            const entryPath = entry.path;

            // Prevent ZIP Slip/path traversal attacks
            const destination = path.resolve(
                repositoryPath,
                entryPath
            );

            const relativePath = path.relative(
                repositoryPath,
                destination
            );

            if (
                relativePath.startsWith("..") ||
                path.isAbsolute(relativePath)
            ) {
                throw new Error(
                    "ZIP contains an invalid file path."
                );
            }

            if (entry.type === "Directory") {
                await fs.mkdir(destination, {
                    recursive: true,
                });

                continue;
            }

            await fs.mkdir(path.dirname(destination), {
                recursive: true,
            });

            await new Promise((resolve, reject) => {
                entry
                    .stream()
                    .pipe(createWriteStream(destination))
                    .on("finish", resolve)
                    .on("error", reject);
            });
        }

        await fs.unlink(zipPath);

        res.status(201).json({
            message: "Repository uploaded successfully.",
            repositoryId,
            name: path.basename(repositoryPath),
        
        });
    } catch (error) {
        console.error("Repository upload failed:", error);

        if (uploadedFile?.path) {
            await fs.unlink(uploadedFile.path).catch(() => {});
        }

        res.status(500).json({
            error: error.message || "Failed to process repository.",
        });
    }
});

export default router;