const express = require("express");
const cors = require("cors");

const app = express();


const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Route de test
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Smart Attendance API is running"
    });
});

// Route pour recevoir une carte RFID
app.post("/api/attendance", (req, res) => {

    const { uid, deviceId } = req.body;

    console.log("================================");
    console.log("Nouvelle carte RFID");
    console.log("UID :", uid);
    console.log("Device :", deviceId);
    console.log("================================");

    res.json({
        success: true,
        message: "Carte recue avec succes",
        uid: uid,
        deviceId: deviceId
    });
});

app.listen(PORT, () => {
    console.log(`Serveur demarre sur le port ${PORT}`);
});