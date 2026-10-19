const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

let db;

// Memory storage ya kuhifadhi verification codes za muda (OTP)
const otpStore = new Map(); // Key: email, Value: { code, expiresAt }

// ==========================================
// CONFIGURATION YA EMAIL (NODEMAILER)
// ==========================================
// Badilisha hapa uweke Email na App Password yako ya Gmail halisi
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'YOUR_EMAIL@gmail.com', // Weka Gmail yako hapa
        pass: 'YOUR_GMAIL_APP_PASSWORD'  // Weka App Password ya Gmail hapa
    }
});

// Function ya kutuma barua pepe ya Usajili
async function sendStudentEmail(studentEmail, studentName, regNo, password) {
    const mailOptions = {
        from: '"BTI SMIS Portal" <YOUR_EMAIL@gmail.com>',
        to: studentEmail,
        subject: 'Taarifa za Usajili na Akaunti Yako - BTI SMIS',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e0e0e0; border-radius: 10px;">
                <h2 style="color: #2563eb;">Karibu BTI Student Management Information System (SMIS)</h2>
                <p>Habari <strong>${studentName}</strong>,</p>
                <p>Usajili wako umekamilika kikamilifu. Hazi hapa taarifa zako za kuingia kwenye portal ya wanafunzi:</p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <p style="margin: 5px 0;"><strong>Username (Form 4 Index No):</strong> <span style="color: #2563eb;">${regNo}</span></p>
                    <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
                </div>
                <p>Tafadhali tumia taarifa hizi kuingia kwenye mfumo wetu ili kuona masomo na matokeo yako.</p>
                <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
                <p style="font-size: 11px; color: #777;">Huu ni ujumbe wa kiotomatiki, tafadhali usijibu barua pepe hii.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Email ya usajili imetumwa kwa mafanikio kwenda: ${studentEmail}`);
    } catch (err) {
        console.error('❌ Tatizo wakati wa kutuma email:', err.message);
    }
}

// Function ya kutuma OTP ya Forgot Password
async function sendOTPCode(studentEmail, otpCode) {
    const mailOptions = {
        from: '"BTI SMIS Support" <YOUR_EMAIL@gmail.com>',
        to: studentEmail,
        subject: 'Verification Code - Badilisha Password BTI SMIS',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e0e0e0; border-radius: 10px;">
                <h2 style="color: #dc2626;">Kurejesha Password Yako (Password Reset)</h2>
                <p>Umewomba kurejesha password ya akaunti yako ya BTI SMIS.</p>
                <p>Kodi yako ya uhakiki (Verification Code / OTP) ni:</p>
                <div style="background-color: #fee2e2; border: 1px solid #fca5a5; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #dc2626;">${otpCode}</span>
                </div>
                <p>Kodi hii itakwisha muda wake ndani ya **dakika 10**. Kama hukuomba kurejesha password, tafadhali puuzia barua pepe hii.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 OTP Email imetumwa kwa mafanikio kwenda: ${studentEmail}`);
    } catch (err) {
        console.error('❌ Tatizo wakati wa kutuma OTP email:', err.message);
    }
}

// ==========================================
// DATABASE INITIALIZATION
// ==========================================
(async () => {
    try {
        db = await open({
            filename: path.join(__dirname, 'database.db'),
            driver: sqlite3.Database
        });

        // USERS TABLE
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                name TEXT,
                role TEXT,
                email TEXT UNIQUE,
                course TEXT,
                nta_level TEXT DEFAULT 'NTA Level 4'
            )
        `);

        // MODULES TABLE
        await db.exec(`
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE,
                title TEXT,
                nta_level TEXT,
                semester TEXT DEFAULT 'Semester 1',
                academic_year TEXT DEFAULT '2025/2026',
                lecturer_id INTEGER,
                FOREIGN KEY(lecturer_id) REFERENCES users(id)
            )
        `);

        // RESULTS TABLE
        await db.exec(`
            CREATE TABLE IF NOT EXISTS results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER,
                module_id INTEGER,
                coursework REAL DEFAULT 0,
                final_exam REAL DEFAULT 0,
                status TEXT DEFAULT 'SUBMITTED',
                FOREIGN KEY(student_id) REFERENCES users(id),
                FOREIGN KEY(module_id) REFERENCES modules(id)
            )
        `);

        // HOSTEL APPLICATIONS TABLE (Smith Annex, Anex ya Juu, Miombo)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS hostel_applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_name TEXT,
                gender TEXT,
                hostel_name TEXT,
                payment_proof TEXT,
                status TEXT DEFAULT 'PENDING',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ADMISSION APPLICATIONS TABLE (TAMISEMI, Form 6 -> Level 4, Level 5 -> Level 6)
        await db.exec(`
            CREATE TABLE IF NOT EXISTS admissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_name TEXT,
                email TEXT,
                type TEXT,
                index_no TEXT,
                status TEXT DEFAULT 'PENDING',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // SEED DEFAULT ACCOUNTS (Academic & Registrar)
        await db.run(`
            INSERT OR IGNORE INTO users (username, password, name, role) 
            VALUES ('academic', '123456', 'Academic Officer', 'ACADEMIC')
        `);

        await db.run(`
            INSERT OR IGNORE INTO users (username, password, name, role) 
            VALUES ('registrar', '123456', 'Admission Registrar', 'REGISTRAR')
        `);

        console.log("✅ Database and default accounts initialized successfully.");
    } catch (err) {
        console.error("❌ Database error:", err.message);
    }
})();

// ==========================================
// AUTH & FORGOT PASSWORD APIS
// ==========================================

// LOGIN API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const cleanUser = username.trim();

    try {
        const user = await db.get(
            `SELECT * FROM users 
             WHERE (UPPER(username) = UPPER(?) OR UPPER(email) = UPPER(?) OR UPPER(name) = UPPER(?)) 
             AND password = ?`, 
            [cleanUser, cleanUser, cleanUser, password]
        );

        if (!user) {
            return res.status(401).json({ success: false, message: 'Taarifa za kuingilia sio sahihi!' });
        }

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// REQUEST OTP FORGOT PASSWORD
app.post('/api/forgot-password/request-otp', async (req, res) => {
    const { email } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    try {
        const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Barua pepe hii haijasajiliwa kwenye mfumo!' });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // Dakika 10

        otpStore.set(cleanEmail, { code: otpCode, expiresAt });

        await sendOTPCode(cleanEmail, otpCode);

        res.json({ success: true, message: 'Verification Code imetumwa kwenye email yako!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// RESET PASSWORD
app.post('/api/forgot-password/reset', async (req, res) => {
    const { email, otp_code, new_password } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    const storedData = otpStore.get(cleanEmail);

    if (!storedData) {
        return res.status(400).json({ success: false, message: 'Utafutaji wa OTP haukupatikana. Omba tena kodi!' });
    }

    if (Date.now() > storedData.expiresAt) {
        otpStore.delete(cleanEmail);
        return res.status(400).json({ success: false, message: 'Verification Code imepitwa na wakati (Expired). Omba mpya!' });
    }

    if (storedData.code !== otp_code.trim()) {
        return res.status(400).json({ success: false, message: 'Verification Code uliyoweka sio sahihi!' });
    }

    try {
        await db.run('UPDATE users SET password = ? WHERE LOWER(email) = ?', [new_password, cleanEmail]);
        otpStore.delete(cleanEmail);

        res.json({ success: true, message: 'Password imebadilishwa kikamilifu! Sasa unaweza kuingia.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// REGISTRAR APIS
// ==========================================

// REGISTER NEW STUDENT (Kutumia Form 4 Secondary Index Number kama Username)
app.post('/api/registrar/add-student', async (req, res) => {
    const { name, email, password, course, nta_level, secondary_index_no } = req.body;

    const username = secondary_index_no ? secondary_index_no.trim().toUpperCase() : `BTI/2026/${Math.floor(1000 + Math.random() * 9000)}`;

    try {
        await db.run(
            `INSERT INTO users (username, password, name, role, email, course, nta_level) 
             VALUES (?, ?, ?, 'STUDENT', ?, ?, ?)`, 
            [username, password, name, email.trim().toLowerCase(), course, nta_level]
        );

        if (email) {
            sendStudentEmail(email, name, username, password);
        }

        res.json({ success: true, regNo: username });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Email au Form 4 Index No hii tayari ipo kwenye mfumo!' });
    }
});

// ==========================================
// HOSTEL APIS
// ==========================================

// 1. Tuma Maombi ya Hostel
app.post('/api/hostel/apply', async (req, res) => {
    const { student_name, gender, hostel_name, payment_proof } = req.body;
    try {
        await db.run(
            `INSERT INTO hostel_applications (student_name, gender, hostel_name, payment_proof) 
             VALUES (?, ?, ?, ?)`,
            [student_name, gender, hostel_name, payment_proof]
        );
        res.json({ success: true, message: 'Maombi ya hostel yametumwa kikamilifu!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Tazama Maombi Yote ya Hostel (Registrar Side)
app.get('/api/registrar/hostel-applications', async (req, res) => {
    try {
        const apps = await db.all('SELECT * FROM hostel_applications ORDER BY id DESC');
        res.json(apps);
    } catch (err) {
        res.status(500).json([]);
    }
});

// 3. Kubali (Approve) au Kataa (Reject) Maombi ya Hostel
app.post('/api/registrar/hostel-status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await db.run('UPDATE hostel_applications SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true, message: `Maombi yamekuwa ${status}!` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// ADMISSION APIS (TAMISEMI, LEVEL 4 & LEVEL 6)
// ==========================================

// 1. Tuma Maombi ya Udahili
app.post('/api/admissions/apply', async (req, res) => {
    const { student_name, email, type, index_no } = req.body;
    try {
        await db.run(
            `INSERT INTO admissions (student_name, email, type, index_no) VALUES (?, ?, ?, ?)`,
            [student_name, email, type, index_no]
        );
        res.json({ success: true, message: 'Maombi ya udahili yametumwa kikamilifu!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Tazama Maombi Yote ya Udahili (Registrar Side)
app.get('/api/registrar/admissions', async (req, res) => {
    try {
        const list = await db.all('SELECT * FROM admissions ORDER BY id DESC');
        res.json(list);
    } catch (err) {
        res.status(500).json([]);
    }
});

// 3. Kubali au Kataa Maombi ya Udahili
app.post('/api/registrar/admission-status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await db.run('UPDATE admissions SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true, message: `Udahili umekuwa ${status}!` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// ACADEMIC OFFICER APIS
// ==========================================

app.get('/api/academic/students', async (req, res) => {
    try {
        const students = await db.all("SELECT id, username, name, email, course, nta_level FROM users WHERE role = 'STUDENT'");
        res.json(students);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.get('/api/lecturers', async (req, res) => {
    try {
        const lecturers = await db.all("SELECT id, username, name, email FROM users WHERE role = 'LECTURER'");
        res.json(lecturers);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post('/api/academic/add-lecturer', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const countObj = await db.get('SELECT COUNT(*) as total FROM users WHERE role = "LECTURER"');
        const staffId = `LEC/2026/${String(countObj.total + 1).padStart(3, '0')}`;
        await db.run(
            `INSERT INTO users (username, password, name, role, email) VALUES (?, ?, ?, 'LECTURER', ?)`, 
            [staffId, password, name, email]
        );
        res.json({ success: true, staffId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/academic/add-module', async (req, res) => {
    const { code, title, nta_level, semester, academic_year, lecturer_id } = req.body;
    try {
        await db.run(
            `INSERT INTO modules (code, title, nta_level, semester, academic_year, lecturer_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [code.toUpperCase().trim(), title, nta_level, semester, academic_year, lecturer_id || null]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Module code already registered or invalid input!' });
    }
});

app.get('/api/academic/modules', async (req, res) => {
    try {
        const modules = await db.all(`
            SELECT m.id, m.code, m.title, m.nta_level, m.semester, m.academic_year, u.name as lecturer_name 
            FROM modules m 
            LEFT JOIN users u ON m.lecturer_id = u.id
        `);
        res.json(modules);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.get('/api/academic/results', async (req, res) => {
    try {
        const results = await db.all(`
            SELECT r.id, u.name as student_name, u.username as reg_no, u.nta_level, 
                   m.title as module_title, m.semester, r.coursework, r.final_exam,
                   (r.coursework + r.final_exam) as total_marks
            FROM results r
            JOIN users u ON r.student_id = u.id
            JOIN modules m ON r.module_id = m.id
        `);
        res.json(results);
    } catch (err) {
        res.status(500).json([]);
    }
});

// ==========================================
// LECTURER APIS
// ==========================================

app.get('/api/lecturer/modules/:lecturerId', async (req, res) => {
    const { lecturerId } = req.params;
    try {
        const modules = await db.all(
            `SELECT id, code, title, nta_level, semester, academic_year 
             FROM modules 
             WHERE lecturer_id = ?`,
            [lecturerId]
        );
        res.json(modules);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/lecturer/submit-results', async (req, res) => {
    const { student_id, module_id, coursework, final_exam } = req.body;
    try {
        await db.run(
            `INSERT INTO results (student_id, module_id, coursework, final_exam, status) 
             VALUES (?, ?, ?, ?, 'SUBMITTED')`,
            [student_id, module_id, coursework, final_exam]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// PAGE ROUTING & SERVER START
// ==========================================

// Route ya Registrar (Inasaidia majina yote mawili ili kuzuia 404/Cannot GET)
app.get(['/registrar.html', '/registrar-dash.html'], (req, res) => {
    res.sendFile(path.join(frontendPath, 'registrar.html'));
});

// Route ya Academic Officer
app.get(['/academic.html', '/academic-dash.html'], (req, res) => {
    res.sendFile(path.join(frontendPath, 'academic.html'));
});

// Route ya Lecturer
app.get(['/lecturer.html', '/lecturer-dash.html'], (req, res) => {
    res.sendFile(path.join(frontendPath, 'lecturer.html'));
});

// Route ya Student
app.get(['/student.html', '/student-dash.html'], (req, res) => {
    res.sendFile(path.join(frontendPath, 'student.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BTI SMIS running on port ${PORT}`);
});