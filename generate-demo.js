const fs = require("fs");

const students = JSON.parse(fs.readFileSync("students.json", "utf8"));

// profil : probabilité d'être présent, probabilité d'être en retard
const profiles = {
  "2025001": { present: 1.0, late: 0.0 },
  "2025002": { present: 0.95, late: 0.1 },
  "2025003": { present: 0.7, late: 0.5 },
  "2025004": { present: 0.9, late: 0.1 },
  "2025005": { present: 0.5, late: 0.3 },
  "2025006": { present: 0.85, late: 0.6 }
};

function pad(n) { return String(n).padStart(2, "0"); }

const records = [];
let id = 1;
let day = new Date();
let sessions = 0;

while (sessions < 10) {
  day.setDate(day.getDate() - 1);
  const dow = day.getDay();
  if (dow === 0 || dow === 6) continue;   // pas de week-end
  sessions++;

  const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;

  for (const s of students) {
    const p = profiles[s.studentId] || { present: 0.8, late: 0.2 };
    if (Math.random() > p.present) continue;   // absent

    const isLate = Math.random() < p.late;
    const minutes = isLate
      ? 8 * 60 + 41 + Math.floor(Math.random() * 25)   // 08:41 à 09:05
      : 8 * 60 + 15 + Math.floor(Math.random() * 14);  // 08:15 à 08:28
    const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;

    records.push({
      id: id++,
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      uid: s.uid,
      date,
      time,
      deviceId: "ESP32-CLASS-01",
      status: "PRESENT"
    });
  }
}

fs.writeFileSync("demo-attendance.json", JSON.stringify(records, null, 2));
console.log(`${records.length} presences generees sur 10 jours`);