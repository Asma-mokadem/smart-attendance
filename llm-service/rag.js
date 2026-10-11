const fs = require("fs");
const path = require("path");

const OLLAMA_EMBED_URL = "http://localhost:11434/api/embed";
const EMBED_MODEL = "nomic-embed-text";
const QDRANT_URL = "http://localhost:6333";
const COLLECTION = "attendance_docs";
const VECTOR_SIZE = 768;   
const DOCS_DIR = path.join(__dirname, "docs");

//  Vecteurs 
async function embed(text, kind) {
    const r = await fetch(OLLAMA_EMBED_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: EMBED_MODEL,
            input: "search_" + kind + ": " + text
        })
    });
    if (!r.ok) throw new Error("Ollama embed : erreur " + r.status);
    const data = await r.json();
    return data.embeddings[0];
}

//  Decoupage 

function chunkDocument(fileName, content) {
    const firstLine = content.split("\n")[0];
    const title = firstLine.replace(/^#\s*/, "").trim();

    return content
        .split(/\n(?=## )/)
        .map(s => s.trim())
        .filter(s => s.length > 40)          // ignore les morceaux vides 
        .map(s => ({
            source: fileName,
            text: s.startsWith("# ") ? s : "[" + title + "]\n" + s
        }));
}

// Qdrant 

async function qdrant(method, pathUrl, body) {
    const r = await fetch(QDRANT_URL + pathUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await r.json();
    if (!r.ok) throw new Error("Qdrant : " + JSON.stringify(data));
    return data;
}

// Importe tous les documents 
async function ingestDocs() {
    try { await qdrant("DELETE", "/collections/" + COLLECTION); } catch (e) {}

    await qdrant("PUT", "/collections/" + COLLECTION, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" }
    });

    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith(".md"));
    const points = [];
    let id = 1;

    for (const file of files) {
        const content = fs.readFileSync(path.join(DOCS_DIR, file), "utf8");
        const chunks = chunkDocument(file, content);
        console.log(file + " : " + chunks.length + " passage(s)");

        for (const c of chunks) {
            points.push({
                id: id++,
                vector: await embed(c.text, "document"),
                payload: { source: c.source, text: c.text }
            });
        }
    }

    await qdrant("PUT", "/collections/" + COLLECTION + "/points?wait=true", { points });
    return points.length;
}

// Recherche les passages les plus proches de la question
async function searchDocs(question, limit = 3) {
    const vector = await embed(question, "query");
    const data = await qdrant("POST", "/collections/" + COLLECTION + "/points/search", {
        vector,
        limit,
        with_payload: true
    });
    return data.result.map(p => ({
        score: p.score,
        source: p.payload.source,
        text: p.payload.text
    }));
}

module.exports = { ingestDocs, searchDocs };