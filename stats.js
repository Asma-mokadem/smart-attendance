const CLASS_START = 8 * 60 + 30;     // 08:30
const LATE_AFTER = CLASS_START + 10; // retard apres 08:40

function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function isLate(record) {
    return toMinutes(record.time) > LATE_AFTER;
}

function round1(x) {
    return Math.round(x * 10) / 10;
}

// Classement avec egalites : meme valeur = meme rang
// field : champ a trier, direction : "desc" ou "asc"
function rankBy(list, field, direction, keepZero) {
    const sorted = list
        .filter(s => keepZero || s[field] > 0)
        .sort((a, b) => {
            const diff = direction === "desc" ? b[field] - a[field] : a[field] - b[field];
            if (diff !== 0) return diff;
            return (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName);
        });

    let rank = 0;
    let previous = null;

    return sorted.map((s, i) => {
        if (s[field] !== previous) {
            rank = i + 1;
            previous = s[field];
        }
        return {
            rank,
            studentId: s.studentId,
            name: s.firstName + " " + s.lastName,
            value: s[field]
        };
    });
}

function computeStats(students, attendance, today) {

    // Seances passees seulement : la journee en cours n'est pas terminee
    const pastAttendance = attendance.filter(a => a.date < today);
    const dates = [...new Set(pastAttendance.map(a => a.date))].sort();
    const totalSessions = dates.length;

    // ----- par étudiant -----
    const perStudent = students.map(s => {
        const mine = pastAttendance.filter(a => a.studentId === s.studentId);
        const presentDays = mine.length;
        const lateDays = mine.filter(isLate).length;
        const absentDays = totalSessions - presentDays;

        return {
            studentId: s.studentId,
            firstName: s.firstName,
            lastName: s.lastName,
            sessions: totalSessions,
            present: presentDays,
            absent: absentDays,
            late: lateDays,
            attendanceRate: totalSessions ? round1(presentDays / totalSessions * 100) : 0,
            lateRate: presentDays ? round1(lateDays / presentDays * 100) : 0
        };
    });

    // ----- par jour -----
    const perDay = dates.map(d => {
        const recs = pastAttendance.filter(a => a.date === d);
        return {
            date: d,
            present: recs.length,
            absent: students.length - recs.length,
            late: recs.filter(isLate).length
        };
    });

    // ----- classements (calcules par le code, pas par le LLM) -----
    const rankings = {
        mostLate: rankBy(perStudent, "late", "desc", false),
        mostAbsent: rankBy(perStudent, "absent", "desc", false),
        lowestAttendance: rankBy(perStudent, "attendanceRate", "asc", true)
    };

    // ----- résumé global -----
    const totalPresences = pastAttendance.length;
    const possible = totalSessions * students.length;

    // Aujourd'hui : on lit toutes les presences (journee en cours)
    const todayRecs = attendance.filter(a => a.date === today);

    const summary = {
        totalStudents: students.length,
        totalSessions,
        globalAttendanceRate: possible ? round1(totalPresences / possible * 100) : 0,
        today: {
            date: today,
            present: todayRecs.length,
            absent: students.length - todayRecs.length,
            late: todayRecs.filter(isLate).length
        },
        classStart: "08:30",
        lateAfter: "08:40"
    };

    return { summary, perStudent, perDay, rankings };
}

module.exports = { computeStats };