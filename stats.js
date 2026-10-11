const CLASS_START = 8 * 60 + 30;   // 08:30
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

function computeStats(students, attendance, today) {

    const dates = [...new Set(attendance.map(a => a.date))].sort();
    const totalSessions = dates.length;

    // ----- par étudiant -----
    const perStudent = students.map(s => {
        const mine = attendance.filter(a => a.studentId === s.studentId);
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
        const recs = attendance.filter(a => a.date === d);
        return {
            date: d,
            present: recs.length,
            absent: students.length - recs.length,
            late: recs.filter(isLate).length
        };
    });

    // ----- résumé global -----
    const totalPresences = attendance.length;
    const possible = totalSessions * students.length;

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

    return { summary, perStudent, perDay };
}

module.exports = { computeStats };