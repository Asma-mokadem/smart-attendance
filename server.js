const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { computeStats } = require("./stats");
const DEMO_FILE = path.join(__dirname, "demo-attendance.json");

const app = express();
const PORT = process.env.PORT || 3000;

const STUDENTS_FILE = path.join(__dirname, "students.json");
const ATTENDANCE_FILE = path.join(__dirname, "attendance.json");

app.use(cors());
app.use(express.json());



function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
        return [];  
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
if (!fs.existsSync(ATTENDANCE_FILE) && fs.existsSync(DEMO_FILE)) {
    fs.copyFileSync(DEMO_FILE, ATTENDANCE_FILE);
    console.log("Donnees de demo chargees");
}

function nowTunis() {
    const now = new Date();
    return {
        date: now.toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" }),   // 2026-10-10
        time: now.toLocaleTimeString("fr-FR", { timeZone: "Africa/Tunis" })    // 14:32:05
    };
}



app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Smart Attendance API is running"
    });
});

app.use(express.static(path.join(__dirname, "public")));

// Liste des étudiants
app.get("/api/students", (req, res) => {
    res.json(readJson(STUDENTS_FILE));
});

// Liste des présences
app.get("/api/attendance", (req, res) => {
    res.json(readJson(ATTENDANCE_FILE));
});

// Enregistrer une présence 
app.post("/api/attendance", (req, res) => {

    const { uid, deviceId } = req.body;

    console.log("================================");
    console.log("Nouvelle carte RFID");
    console.log("UID :", uid);
    console.log("Device :", deviceId);

    if (!uid) {
        return res.status(400).json({
            success: false,
            message: "UID manquant"
        });
    }

    // 1. Identifier l'étudiant
    const students = readJson(STUDENTS_FILE);
    const student = students.find(
        s => s.uid.toUpperCase() === String(uid).toUpperCase()
    );

    if (!student) {
        console.log("Carte inconnue");
        return res.status(404).json({
            success: false,
            message: "Carte inconnue",
            uid: uid
        });
    }

    // 2. Eviter le doublon le même jour
    const { date, time } = nowTunis();
    const attendance = readJson(ATTENDANCE_FILE);

    const already = attendance.find(
        a => a.studentId === student.studentId && a.date === date
    );

    if (already) {
        console.log("Deja present :", student.firstName, student.lastName);
        return res.json({
            success: true,
            alreadyRecorded: true,
            message: "Presence deja enregistree aujourd'hui",
            record: already
        });
    }

    // 3. Enregistrer la présence
    const record = {
        id: attendance.length + 1,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        uid: student.uid,
        date: date,
        time: time,
        deviceId: deviceId || "inconnu",
        status: "PRESENT"
    };

    attendance.push(record);
    writeJson(ATTENDANCE_FILE, attendance);

    console.log("Presence enregistree :", student.firstName, student.lastName);
    console.log("================================");

    res.json({
        success: true,
        alreadyRecorded: false,
        message: "Presence enregistree",
        record: record
    });
});
app.get("/api/stats/summary", (req, res) => {
    const s = computeStats(readJson(STUDENTS_FILE), readJson(ATTENDANCE_FILE), nowTunis().date);
    res.json(s.summary);
});

app.get("/api/stats/students", (req, res) => {
    const s = computeStats(readJson(STUDENTS_FILE), readJson(ATTENDANCE_FILE), nowTunis().date);
    res.json(s.perStudent);
});

app.get("/api/stats/daily", (req, res) => {
    const s = computeStats(readJson(STUDENTS_FILE), readJson(ATTENDANCE_FILE), nowTunis().date);
    res.json(s.perDay);
});
app.get("/api/stats/rankings", (req, res) => {
    const s = computeStats(readJson(STUDENTS_FILE), readJson(ATTENDANCE_FILE), nowTunis().date);
    res.json(s.rankings);
});
app.listen(PORT, () => {
    console.log(`Serveur demarre sur le port ${PORT}`);
});