const { ingestDocs } = require("./rag");

ingestDocs()
    .then(n => console.log("Import termine : " + n + " passage(s) dans Qdrant"))
    .catch(e => console.log("Erreur :", e.message));