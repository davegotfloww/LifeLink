const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.LIFELINK_ADMIN_KEY || "dev-admin-key";
const DATA_FILE = path.join(__dirname, "data.json");
const DB_PATH = path.join(__dirname, "lifelink.db");

const BLOOD_COMPATIBILITY = {
  "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
  "O+": ["O+", "A+", "B+", "AB+"],
  "A-": ["A-", "A+", "AB-", "AB+"],
  "A+": ["A+", "AB+"],
  "B-": ["B-", "B+", "AB-", "AB+"],
  "B+": ["B+", "AB+"],
  "AB-": ["AB-", "AB+"],
  "AB+": ["AB+"],
};

const db = new sqlite3.Database(DB_PATH, (error) => {
  if (error) {
    console.error("Failed to open LifeLink database:", error.message);
    process.exit(1);
  }
  initializeDatabase();
});

app.use(bodyParser.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname)));

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hashPassword(password, salt = null) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash: derived };
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function locationMatchScore(donorLocation = "", requestLocation = "") {
  const donor = normalizeText(donorLocation);
  const request = normalizeText(requestLocation);

  if (!donor && !request) return 0;
  if (!donor || !request) return 0.15;
  if (donor === request) return 1;

  const donorTokens = donor.split(" ");
  const requestTokens = request.split(" ");
  const overlap = donorTokens.filter((token) => requestTokens.includes(token));
  const overlapRatio = overlap.length / Math.max(donorTokens.length, requestTokens.length, 1);

  if (overlapRatio > 0) return Math.min(1, 0.55 + overlapRatio);
  return 0.2;
}

function isBloodCompatible(donorType = "", requestType = "") {
  const donor = String(donorType || "").trim();
  const request = String(requestType || "").trim();
  if (!donor || !request) return false;
  return BLOOD_COMPATIBILITY[donor]?.includes(request) || donor === request;
}

function requestUrgencyScore(priority = "urgent") {
  const map = {
    critical: 1,
    urgent: 0.8,
    scheduled: 0.5,
    high: 0.9,
    medium: 0.6,
    low: 0.3,
  };
  return map[String(priority || "urgent").toLowerCase()] ?? 0.7;
}

function calculateMatchScore(donor = {}, request = {}) {
  if (!donor || !request) return 0;
  if (!isBloodCompatible(donor.blood_type, request.type)) return 0;

  const locationWeight = locationMatchScore(donor.location, request.place) * 35;
  const urgencyWeight = requestUrgencyScore(request.priority || request.tag || "urgent") * 30;
  const availabilityWeight = donor.support_level === "unavailable" ? 0 : donor.support_level === "limited" ? 12 : 18;
  const base = 45 + locationWeight + urgencyWeight + availabilityWeight;

  return Math.max(0, Math.min(100, Math.round(base)));
}

function safeUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.pass_hash;
  delete copy.pass_salt;
  return copy;
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve({ id: this.lastID, changes: this.changes, lastID: this.lastID });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows || []);
    });
  });
}

async function initializeDatabase() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      location TEXT,
      blood_type TEXT,
      hospital_name TEXT,
      contact TEXT,
      verified INTEGER DEFAULT 0,
      support_level TEXT DEFAULT 'ready',
      pass_salt TEXT,
      pass_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      place TEXT NOT NULL,
      priority TEXT DEFAULT 'Urgent',
      requested_minutes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open',
      hospital_id TEXT,
      hospital_name TEXT,
      hospital_location TEXT,
      contact TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT DEFAULT 'Urgent',
      location TEXT,
      urgency_score INTEGER DEFAULT 0,
      match_score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      sent_at TEXT,
      read_at TEXT,
      FOREIGN KEY(donor_id) REFERENCES users(id),
      FOREIGN KEY(request_id) REFERENCES requests(id)
    )
  `);

  await importLegacyData();
}

async function importLegacyData() {
  if (!fs.existsSync(DATA_FILE)) return;

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const legacy = JSON.parse(raw);
    const users = Array.isArray(legacy.users) ? legacy.users : [];
    const requests = Array.isArray(legacy.requests) ? legacy.requests : [];

    for (const user of users) {
      if (!user || !user.email) continue;

      const existing = await dbGet("SELECT id FROM users WHERE email = ?", [String(user.email).toLowerCase()]);
      if (existing) continue;

      await dbRun(
        `INSERT INTO users (id, name, email, role, location, blood_type, hospital_name, contact, verified, support_level, pass_salt, pass_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id || uuid(),
          user.name || "",
          String(user.email || "").toLowerCase(),
          user.role || "donor",
          user.location || "",
          user.bloodType || user.blood_type || "",
          user.hospitalName || user.hospital_name || "",
          user.contact || "",
          user.verified ? 1 : 0,
          user.supportLevel || "ready",
          user.passSalt || "",
          user.passHash || "",
          user.createdAt || new Date().toISOString(),
          user.updatedAt || user.createdAt || new Date().toISOString(),
        ],
      );
    }

    for (const request of requests) {
      if (!request || !request.id) continue;
      const existing = await dbGet("SELECT id FROM requests WHERE id = ?", [request.id]);
      if (existing) continue;

      await dbRun(
        `INSERT INTO requests (id, type, place, priority, requested_minutes, status, hospital_id, hospital_name, hospital_location, contact, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          request.id,
          request.type || "O-",
          request.place || "",
          request.priority || request.tag || "Urgent",
          Number(request.requestedMinutes || request.requested_minutes || 0),
          request.status || "open",
          request.hospitalId || null,
          request.hospitalName || null,
          request.hospitalLocation || request.hospital_location || "",
          request.contact || "",
          request.createdAt || new Date().toISOString(),
          request.updatedAt || request.createdAt || new Date().toISOString(),
        ],
      );
    }
  } catch (error) {
    console.warn("Legacy data import skipped:", error.message);
  }
}

async function buildNotificationMessage(donor, request, score) {
  const urgency = String(request.priority || request.tag || "Urgent").toLowerCase();
  const locationLabel = request.place || donor.location || "your area";
  return `Urgent ${request.type || "blood"} request in ${locationLabel}. Match score ${score}/100 and urgency is ${urgency}. Please respond if available.`;
}

async function notifyEligibleDonors(request) {
  const donors = await dbAll(
    "SELECT * FROM users WHERE role = 'donor' AND (support_level IS NULL OR support_level != 'unavailable') ORDER BY created_at DESC",
  );

  const matches = [];

  for (const donor of donors) {
    const score = calculateMatchScore(donor, request);
    if (score < 55) continue;

    const message = await buildNotificationMessage(donor, request, score);
    const notificationId = uuid();

    await dbRun(
      `INSERT INTO notifications (id, donor_id, request_id, message, priority, location, urgency_score, match_score, status, created_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        notificationId,
        donor.id,
        request.id,
        message,
        request.priority || request.tag || "Urgent",
        request.place,
        Math.round(requestUrgencyScore(request.priority || request.tag || "urgent") * 100),
        score,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    matches.push({
      id: notificationId,
      donorId: donor.id,
      requestId: request.id,
      message,
      matchScore: score,
      location: request.place,
    });
  }

  return matches;
}

app.get("/api/ping", (req, res) => {
  res.json({ ok: true, db: "sqlite" });
});

app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password, role, location, bloodType, hospitalName, contact, supportLevel } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await dbGet("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ error: "Account exists" });
    }

    const { salt, hash } = hashPassword(password);
    const user = {
      id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: String(name).trim(),
      email: normalizedEmail,
      role: String(role).trim(),
      location: location || "",
      blood_type: role === "donor" ? bloodType || "" : "",
      hospital_name: role === "hospital" ? hospitalName || "" : "",
      contact: contact || "",
      verified: role === "hospital" ? 0 : 1,
      support_level: supportLevel || "ready",
      pass_salt: salt,
      pass_hash: hash,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await dbRun(
      `INSERT INTO users (id, name, email, role, location, blood_type, hospital_name, contact, verified, support_level, pass_salt, pass_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        user.role,
        user.location,
        user.blood_type,
        user.hospital_name,
        user.contact,
        user.verified,
        user.support_level,
        user.pass_salt,
        user.pass_hash,
        user.created_at,
        user.updated_at,
      ],
    );

    return res.json({ user: safeUser(user) });
  } catch (error) {
    console.error("signup route failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await dbGet("SELECT * FROM users WHERE email = ?", [normalizedEmail]);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { hash } = hashPassword(password, user.pass_salt);
    if (hash !== user.pass_hash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const safeUserRecord = safeUser(user);
    return res.json({ user: safeUserRecord });
  } catch (error) {
    console.error("login route failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM users ORDER BY created_at DESC");
    res.json({ users: rows.map((user) => safeUser(user)) });
  } catch (error) {
    console.error("user listing failed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/requests", async (req, res) => {
  try {
    let sql = "SELECT * FROM requests WHERE 1 = 1";
    const params = [];

    if (req.query.status) {
      sql += " AND LOWER(status) = LOWER(?)";
      params.push(String(req.query.status));
    }

    if (req.query.type) {
      sql += " AND LOWER(type) LIKE LOWER(?)";
      params.push(`%${String(req.query.type)}%`);
    }

    if (req.query.place) {
      sql += " AND LOWER(place) LIKE LOWER(?)";
      params.push(`%${String(req.query.place)}%`);
    }

    if (req.query.hospitalId) {
      sql += " AND hospital_id = ?";
      params.push(String(req.query.hospitalId));
    }

    sql += " ORDER BY created_at DESC";

    const requests = await dbAll(sql, params);
    res.json({ requests });
  } catch (error) {
    console.error("request listing failed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/requests", async (req, res) => {
  try {
    const { type, place, priority, tag, requestedMinutes, hospitalId, contact, hospitalName } = req.body || {};

    if (!type || !place) {
      return res.status(400).json({ error: "Missing request fields" });
    }

    const hospital = hospitalId
      ? await dbGet("SELECT * FROM users WHERE id = ? AND role = 'hospital'", [String(hospitalId)])
      : null;

    const requestId = uuid();
    const timestamp = new Date().toISOString();
    const request = {
      id: requestId,
      type: String(type).trim(),
      place: String(place).trim(),
      priority: String(priority || tag || "Urgent").trim(),
      requested_minutes: Number(requestedMinutes || 0),
      status: "open",
      hospital_id: hospitalId || null,
      hospital_name: hospital ? hospital.hospital_name || hospital.hospitalName || hospital.name : hospitalName || null,
      hospital_location: hospital ? hospital.location || "" : "",
      contact: hospital ? hospital.contact || contact || "" : contact || "",
      created_at: timestamp,
      updated_at: timestamp,
    };

    await dbRun(
      `INSERT INTO requests (id, type, place, priority, requested_minutes, status, hospital_id, hospital_name, hospital_location, contact, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.type,
        request.place,
        request.priority,
        request.requested_minutes,
        request.status,
        request.hospital_id,
        request.hospital_name,
        request.hospital_location,
        request.contact,
        request.created_at,
        request.updated_at,
      ],
    );

    const notifications = await notifyEligibleDonors(request);
    return res.json({ request, notificationsSent: notifications.length });
  } catch (error) {
    console.error("request creation failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/requests/:id", async (req, res) => {
  try {
    const { id } = req.params || {};
    const { type, place, priority, tag, requestedMinutes, status, contact } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: "Missing request id" });
    }

    const existing = await dbGet("SELECT * FROM requests WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (type !== undefined) existing.type = String(type).trim();
    if (place !== undefined) existing.place = String(place).trim();
    if (priority !== undefined) existing.priority = String(priority).trim();
    if (tag !== undefined && existing.priority === undefined) existing.priority = String(tag).trim();
    if (requestedMinutes !== undefined) existing.requested_minutes = Number(requestedMinutes);
    if (contact !== undefined) existing.contact = String(contact).trim();

    if (status !== undefined) {
      const normalized = String(status).toLowerCase();
      const allowed = ["open", "fulfilled", "cancelled"];
      if (!allowed.includes(normalized)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      existing.status = normalized;
    }

    existing.updated_at = new Date().toISOString();

    await dbRun(
      `UPDATE requests
       SET type = ?, place = ?, priority = ?, requested_minutes = ?, status = ?, contact = ?, updated_at = ?
       WHERE id = ?`,
      [existing.type, existing.place, existing.priority, existing.requested_minutes, existing.status, existing.contact, existing.updated_at, id],
    );

    return res.json({ request: existing });
  } catch (error) {
    console.error("request update failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/matches", async (req, res) => {
  try {
    const donorId = req.query.donorId || req.query.userId;
    if (!donorId) {
      return res.status(400).json({ error: "Missing donorId" });
    }

    const donor = await dbGet("SELECT * FROM users WHERE id = ? AND role = 'donor'", [String(donorId)]);
    if (!donor) {
      return res.status(404).json({ error: "Donor not found" });
    }

    const requests = await dbAll("SELECT * FROM requests WHERE status = 'open' ORDER BY created_at DESC");
    const matches = requests
      .map((request) => ({
        request,
        matchScore: calculateMatchScore(donor, request),
      }))
      .filter((entry) => entry.matchScore >= 55)
      .sort((a, b) => b.matchScore - a.matchScore)
      .map(({ request, matchScore }) => ({
        id: request.id,
        type: request.type,
        place: request.place,
        priority: request.priority,
        requestedMinutes: request.requested_minutes,
        hospitalName: request.hospital_name,
        hospitalLocation: request.hospital_location,
        matchScore,
      }));

    return res.json({ donorId, matches });
  } catch (error) {
    console.error("match lookup failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/notifications", async (req, res) => {
  try {
    const userId = req.query.userId || req.query.donorId;
    let sql = "SELECT * FROM notifications WHERE 1 = 1";
    const params = [];

    if (userId) {
      sql += " AND donor_id = ?";
      params.push(String(userId));
    }

    if (req.query.status) {
      sql += " AND status = ?";
      params.push(String(req.query.status));
    }

    sql += " ORDER BY created_at DESC";

    const notifications = await dbAll(sql, params);
    return res.json({ notifications });
  } catch (error) {
    console.error("notification lookup failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/notifications/:id/read", async (req, res) => {
  try {
    const id = req.params.id;
    const row = await dbGet("SELECT * FROM notifications WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "Notification not found" });

    const readAt = new Date().toISOString();
    await dbRun("UPDATE notifications SET status = 'read', read_at = ? WHERE id = ?", [readAt, id]);
    return res.json({ notification: { ...row, status: "read", read_at: readAt } });
  } catch (error) {
    console.error("notification update failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const key = req.query.key || req.headers["x-admin-key"];
    if (key !== ADMIN_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const users = await dbAll("SELECT * FROM users ORDER BY created_at DESC");
    res.json({ users: users.map((user) => safeUser(user)) });
  } catch (error) {
    console.error("admin lookup failed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/verify-user", async (req, res) => {
  try {
    const { userId, verify } = req.body || {};
    const key = req.body.key || req.headers["x-admin-key"];

    if (key !== ADMIN_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (!userId) {
      return res.status(400).json({ error: "missing userId" });
    }

    const user = await dbGet("SELECT * FROM users WHERE id = ?", [String(userId)]);
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const verified = !!verify ? 1 : 0;
    await dbRun("UPDATE users SET verified = ?, updated_at = ? WHERE id = ?", [verified, new Date().toISOString(), userId]);

    const updatedUser = { ...user, verified, updated_at: new Date().toISOString() };
    return res.json({ user: safeUser(updatedUser) });
  } catch (error) {
    console.error("admin verify failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.use((req, res) => {
  res.status(404).send("Not found");
});

app.listen(PORT, () => console.log(`LifeLink backend running on port ${PORT}`));
