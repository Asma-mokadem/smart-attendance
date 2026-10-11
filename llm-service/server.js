const express = require("express");
const cors = require("cors");
const { searchDocs } = require("./rag");

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

//  Classements 

function formatRanking(title, list, unit) {
    if (!list.length) return title + " : aucun.";
    const lines = list.map(r => `${r.rank}. ${r.name} : ${r.value}${unit}`);
    return title + " :\n" + lines.join("\n");
}

function answerFromRankings(question, rankings) {
    const q = question.toLowerCase();

    if (q.includes("retard")) {
        return formatRanking("Etudiants classes par nombre de retards", rankings.mostLate, " retard(s)");
    }
    if (q.includes("absen")) {
        return formatRanking("Etudiants classes par nombre d'absences", rankings.mostAbsent, " absence(s)");
    }
    if (q.includes("taux") && (q.includes("bas") || q.includes("faible") || q.includes("pire"))) {
        return formatRanking("Taux de presence, du plus bas au plus haut", rankings.lowestAttendance, " %");
    }
    return null;
}

//  Questions sur le reglement 

const RULE_WORDS = ["reglement", "règlement", "regle", "règle", "justifi", "seuil",
    "avertissement", "exclu", "examen", "tolerance", "tolérance", "procedure", "procédure",
    "convoqu", "sanction", "politique"];

function isRuleQuestion(q) {
    const s = q.toLowerCase();
    return RULE_WORDS.some(w => s.includes(w)) || s.includes("risque") || s.includes("situation");
}

// Retrouve un etudiant cite dans la question 
function findStudent(question, students) {
    const q = question.toLowerCase();
    return students.find(s =>
        q.includes(s.firstName.toLowerCase()) || q.includes(s.lastName.toLowerCase())
    ) || null;
}

// Compare les chiffres de l'etudiant aux seuils du reglement
function buildAssessment(s) {
    // Regle : 3 retards = 1 absence non justifiee
    const lateAsAbsence = Math.floor(s.late / 3);
    const equivalentAbsences = s.absent + lateAsAbsence;

    const lines = [];
    lines.push(`Etudiant : ${s.firstName} ${s.lastName}`);
    lines.push(`Taux de presence : ${s.attendanceRate} %`);
    lines.push(`Absences : ${s.absent} sur ${s.sessions} seances`);
    lines.push(`Retards : ${s.late}`);
    lines.push(`Absences equivalentes (absences + retards/3) : ${equivalentAbsences}`);

    if (s.attendanceRate < 50) {
        lines.push("Situation : taux inferieur a 50 % (risque d'interdiction d'examen).");
    } else if (s.attendanceRate < 70) {
        lines.push("Situation : taux inferieur a 70 % (situation d'alerte).");
    } else {
        lines.push("Situation : taux superieur ou egal a 70 % (pas d'alerte sur le taux).");
    }

    if (equivalentAbsences >= 5) {
        lines.push("Absences : seuil de 5 atteint (convocation par le responsable pedagogique).");
    } else if (equivalentAbsences >= 3) {
        lines.push("Absences : seuil de 3 atteint (premier avertissement par e-mail).");
    } else {
        lines.push("Absences : aucun seuil d'absence atteint.");
    }

    return lines.join("\n");
}

//  Route chat 

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

        // 2. Questions sur le reglement (RAG) + bilan etudiant calcule
        if (isRuleQuestion(question)) {
            const passages = await searchDocs(question, 3);
            const context = passages.map(p => "[" + p.source + "]\n" + p.text).join("\n\n");

            const student = findStudent(question, students);
            const assessment = student ? buildAssessment(student) : "";

            const rulePrompt =
`Tu es l'assistant d'un systeme de gestion de presence.
Reponds en francais, de facon courte, UNIQUEMENT a partir des extraits et du bilan ci-dessous.
Si les extraits ne contiennent pas la reponse, dis : "Je ne trouve pas cette information dans les documents."
Si un BILAN CALCULE est fourni, recopie ses chiffres et conclusions sans les modifier, puis explique les consequences d'apres les extraits.

${assessment ? "BILAN CALCULE (a recopier tel quel) :\n" + assessment + "\n" : ""}
EXTRAITS :
${context}

QUESTION : ${question}

REPONSE :`;

            const rr = await fetch(OLLAMA_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: MODEL, prompt: rulePrompt, stream: false, options: { temperature: 0.1 } })
            });
            if (!rr.ok) throw new Error("Ollama : erreur " + rr.status);
            const out = await rr.json();

            const sources = [...new Set(passages.map(p => p.source))];
            return res.json({
                success: true,
                answer: out.response.trim() + "\n\nSources : " + sources.join(", "),
                source: "rag",
                passages: passages.map(p => ({ source: p.source, score: p.score }))
            });
        }

        // 3. Classements calcules par le code
        const direct = answerFromRankings(question, rankings);
        if (direct) {
            return res.json({ success: true, answer: direct, source: "code" });
        }

        // 4. Questions libres : LLM avec les chiffres
        const data = JSON.stringify({ summary, rankings, students }, null, 1);

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
- Pour les classements, utilise UNIQUEMENT la section "rankings" : elle est deja triee, recopie-la dans l'ordre.
- Les valeurs "attendanceRate" et "lowestAttendance" sont des taux de PRESENCE (jamais d'absence).
- Pour un resume, cite uniquement les chiffres de "summary" et au plus 3 etudiants, et precise "parmi d'autres" s'il y a des egalites.

DONNEES :
${data}

QUESTION : ${question}

REPONSE :`;

        const r = await fetch(OLLAMA_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0.1 } })
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