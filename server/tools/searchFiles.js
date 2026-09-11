import fs from "fs/promises";
import path from "path";
import { assertRepositoryExists } from "./repositoryRoot.js";
import { getRepositoryVersion } from "./repositoryCache.js";

const IGNORED_DIRECTORIES = new Set([
    "node_modules", ".git", "dist", "build", ".next", ".vite", "coverage", "vendor",
]);

const TEXT_EXTENSIONS = new Set([
    ".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".html", ".md", ".mjs", ".cjs",
    ".php", ".py", ".java", ".go", ".rb", ".c", ".cpp", ".h", ".hpp",
]);

const IGNORED_FILES = new Set([
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ".env", ".env.local", ".env.development", ".env.production", ".env.test",
    "credentials.json", "service-account.json",
]);

const IGNORED_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".min.js"]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_RESULT_FILES = 6;        // top-N files returned, ranked by BM25
const MAX_MATCHES_PER_FILE = 3;    // best matching lines per file
const CONTEXT_LINES = 1;           // lines of context above/below a match in the snippet

// BM25 parameters
const K1 = 1.5;
const B = 0.75;

// repositoryId -> { version, index }
const repositoryIndexes = new Map();
// repositoryId -> Promise   (dedupe concurrent index builds)
const indexPromises = new Map();

function tokenize(text) {
    return text.toLowerCase().match(/[a-zA-Z0-9_$]+/g) || [];
}

// Poor-man's AST: a regex-based symbol index. A real per-language AST parser
// would need one dependency per language (JS/TS/PHP/Python show up in the
// same repo) just to answer "which function is this line inside?". These
// patterns cover the common declaration shapes across those languages and
// cost nothing at index time, which is what actually matters for token
// budget: they let a search hit report its enclosing function/route so the
// agent often doesn't need a follow-up readFileRange call just to see
// context.
const SYMBOL_PATTERNS = [
    { kind: "function", re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/ },
    { kind: "function", re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(?[^=]*\)?\s*=>/ },
    { kind: "class", re: /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_$]+)/ },
    { kind: "route", re: /^\s*(?:router|app)\.(?:get|post|put|delete|patch|use)\s*\(\s*["'`]([^"'`]+)["'`]/ },
    { kind: "function", re: /^\s*(?:public\s+|private\s+|protected\s+|static\s+)*function\s+([A-Za-z0-9_]+)/ }, // PHP/Java-ish
    { kind: "function", re: /^\s*def\s+([A-Za-z0-9_]+)/ },   // Python
    { kind: "class", re: /^\s*class\s+([A-Za-z0-9_]+)/ },    // Python
];

function extractSymbol(line) {
    for (const { kind, re } of SYMBOL_PATTERNS) {
        const m = re.exec(line);
        if (m && m[1]) return { kind, name: m[1] };
    }
    return null;
}

async function getFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (IGNORED_DIRECTORIES.has(entry.name) || IGNORED_FILES.has(entry.name)) continue;

        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await getFiles(fullPath));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

async function buildSearchIndex(repositoryId, root) {
    console.log(`Building search index for ${repositoryId}...`);

    const files = new Map();  // relPath -> { lines, termFreq, length, symbols }
    const df = new Map();     // term -> number of files containing it

    const allFiles = await getFiles(root);
    let indexedFiles = 0;
    let skippedFiles = 0;

    for (const filePath of allFiles) {
        const extension = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath).toLowerCase();

        if (IGNORED_FILES.has(fileName) || IGNORED_EXTENSIONS.has(extension) || !TEXT_EXTENSIONS.has(extension)) {
            skippedFiles++;
            continue;
        }

        try {
            const stat = await fs.stat(filePath);
            if (stat.size > MAX_FILE_BYTES) {
                skippedFiles++;
                continue;
            }

            const content = await fs.readFile(filePath, "utf-8");
            const lines = content.split("\n");
            const relativePath = path.relative(root, filePath);

            const termFreq = new Map();
            const symbols = [];
            const seenTermsInFile = new Set();
            let length = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const symbol = extractSymbol(line);
                if (symbol) symbols.push({ line: i + 1, ...symbol });

                const words = tokenize(line);
                length += words.length;

                for (const word of words) {
                    termFreq.set(word, (termFreq.get(word) || 0) + 1);
                    seenTermsInFile.add(word);
                }
            }

            for (const term of seenTermsInFile) {
                df.set(term, (df.get(term) || 0) + 1);
            }

            files.set(relativePath, { lines, termFreq, length, symbols });
            indexedFiles++;
        } catch {
            skippedFiles++;
        }
    }

    let totalLength = 0;
    for (const f of files.values()) totalLength += f.length;
    const avgdl = files.size ? totalLength / files.size : 0;

    const index = { files, df, N: files.size, avgdl };

    repositoryIndexes.set(repositoryId, { version: getRepositoryVersion(repositoryId), index });

    console.log(`Search index ready for ${repositoryId}. Files indexed: ${indexedFiles}, skipped: ${skippedFiles}, unique terms: ${df.size}`);

    return index;
}

async function ensureIndex(repositoryId, root) {
    const currentVersion = getRepositoryVersion(repositoryId);
    const cached = repositoryIndexes.get(repositoryId);

    if (cached && cached.version === currentVersion) {
        return cached.index;
    }

    let promise = indexPromises.get(repositoryId);
    if (!promise) {
        promise = buildSearchIndex(repositoryId, root);
        indexPromises.set(repositoryId, promise);
        try {
            await promise;
        } finally {
            indexPromises.delete(repositoryId);
        }
    } else {
        await promise;
    }

    return repositoryIndexes.get(repositoryId).index;
}

function bm25Score(termFreq, docLength, term, df, N, avgdl) {
    const f = termFreq.get(term) || 0;
    if (f === 0) return 0;

    const n = df.get(term) || 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    const denom = f + K1 * (1 - B + B * (docLength / (avgdl || 1)));

    return idf * ((f * (K1 + 1)) / denom);
}

function symbolAtLine(symbols, lineNumber) {
    let best = null;
    for (const s of symbols) {
        if (s.line <= lineNumber && (!best || s.line > best.line)) best = s;
    }
    return best ? `${best.kind} ${best.name}` : null;
}

function buildSnippet(lines, lineNumber) {
    const start = Math.max(1, lineNumber - CONTEXT_LINES);
    const end = Math.min(lines.length, lineNumber + CONTEXT_LINES);
    return lines
        .slice(start - 1, end)
        .map((text, i) => `${start + i}: ${text}`)
        .join("\n");
}

export async function searchFiles(repositoryId, query) {
    const root = await assertRepositoryExists(repositoryId, fs);
    const normalizedQuery = query?.toLowerCase().trim();
    if (!normalizedQuery) return [];

    const index = await ensureIndex(repositoryId, root);
    const queryTerms = [...new Set(tokenize(normalizedQuery))];
    if (queryTerms.length === 0) return [];

    // Rank files by BM25 relevance to the query.
    const scored = [];
    for (const [relativePath, file] of index.files) {
        let score = 0;
        for (const term of queryTerms) {
            score += bm25Score(file.termFreq, file.length, term, index.df, index.N, index.avgdl);
        }
        if (score > 0) scored.push({ relativePath, file, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const topFiles = scored.slice(0, MAX_RESULT_FILES);

    // For each top file, surface the best matching lines with inline
    // snippets + enclosing symbol, so the agent usually doesn't need a
    // follow-up readFileRange call just to see what the match looks like.
    return topFiles.map(({ relativePath, file, score }) => {
        const lineHits = [];
        for (let i = 0; i < file.lines.length; i++) {
            const words = new Set(tokenize(file.lines[i]));
            const hitCount = queryTerms.reduce((n, t) => n + (words.has(t) ? 1 : 0), 0);
            if (hitCount > 0) lineHits.push({ line: i + 1, hitCount });
        }

        lineHits.sort((a, b) => b.hitCount - a.hitCount);
        const matches = lineHits.slice(0, MAX_MATCHES_PER_FILE).map(({ line }) => ({
            line,
            symbol: symbolAtLine(file.symbols, line),
            snippet: buildSnippet(file.lines, line),
        }));

        return {
            file: relativePath,
            score: Math.round(score * 100) / 100,
            matches,
        };
    });
}
