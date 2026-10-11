const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 4000;

const STATS_API = "https://smart-attendance-07y4.onrender.com";   // backend Render
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "qwen2.5:3b";

app.use(cors());
app.use(express.json());

async function getJson(path) {
    const r = await fetch(STATS_API + path);
    if (!r.ok) throw new Error("API stats : erreur " + r.status);
    return r.json();
}

app.post("/api/chat", async (req, res) => {
    const question = (req.body.question || "").trim();
    if (!question) {
        return res.status(400).json({ success: false, message: "Question manquante" });
    }

    try {
        // 1. Chiffres fiables calcules par le code
        const [summary, students, rankings] = await Promise.all([
            getJson("/api/stats/summary"),
            getJson("/api/stats/students"),
            getJson("/api/stats/rankings")
        ]);

        const data = JSON.stringify({ summary, rankings, students }, null, 1);

        // 2. Consignes strictes pour le LLM
        const prompt =
`Tu es l'assistant d'un systeme de gestion de presence d'etudiants.
Regles :
- Reponds en francais, de facon courte et claire.
- Tu reponds UNIQUEMENT aux questions sur la presence des etudiants.
- Pour toute autre question (culture generale, meteo, etc.), reponds exactement :
  "Je ne peux repondre qu'aux questions sur la presence des etudiants."
- Utilise UNIQUEMENT les donnees ci-dessous. N'invente aucun chiffre.
- Ne calcule rien toi-meme : recopie les valeurs fournies.
- Si la reponse n'est pas dans les donnees, dis-le.
- Un retard = arrivee apres 08:40. Les taux portent sur les seances passees.
- Pour les classements (plus de retards, plus d'absences, taux le plus bas), utilise UNIQUEMENT la section "rankings" : elle est deja triee, recopie-la dans l'ordre.

DONNEES :
${data}

QUESTION : ${question}

REPONSE :`;

        // 3. Appel a Ollama
        const r = await fetch(OLLAMA_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODEL,
                prompt,
                stream: false,
                options: { temperature: 0.1 }
            })
        });

        if (!r.ok) throw new Error("Ollama : erreur " + r.status);
        const out = await r.json();

        res.json({ success: true, answer: out.response.trim() });

    } catch (err) {
        console.log("Erreur :", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => {
    console.log("LLM service sur http://localhost:" + PORT);
});