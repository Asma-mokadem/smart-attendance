const { searchDocs } = require("./rag");

const question = process.argv.slice(2).join(" ");

searchDocs(question)
    .then(results => {
        console.log("Question :", question, "\n");
        results.forEach(r => {
            console.log("Score " + r.score.toFixed(3) + " | " + r.source);
            console.log(r.text);
            console.log("--------------------");
        });
    })
    .catch(e => console.log("Erreur :", e.message));