const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const ADMIN_KEY = process.env.LIFELINK_ADMIN_KEY || "dev-admin-key";

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return { users: [], requests: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function hashPassword(password, salt = null) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash: derived };
}

app.get("/api/ping", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/signup", (req, res) => {
  const { name, email, password, role, location, bloodType, hospitalName } =
    req.body || {};
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: "Missing required fields" });

  const data = readData();
  const exists = data.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (exists) return res.status(409).json({ error: "Account exists" });

  const { salt, hash } = hashPassword(password);
  const user = {
    id: `${role}-${Date.now()}`,
    name,
    email: email.toLowerCase(),
    role,
    location: location || "",
    bloodType: role === "donor" ? bloodType || "" : "",
    hospitalName: role === "hospital" ? hospitalName || "" : "",
    verified: role === "hospital" ? false : true,
    passSalt: salt,
    passHash: hash,
    createdAt: new Date().toISOString(),
  };

  data.users.push(user);
  writeData(data);

  const safe = Object.assign({}, user);
  delete safe.passHash;
  delete safe.passSalt;

  res.json({ user: safe });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Missing credentials" });

  const data = readData();
  const user = data.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const { salt, passHash } = { salt: user.passSalt, passHash: user.passHash };
  const { hash } = hashPassword(password, salt);
  if (hash !== passHash)
    return res.status(401).json({ error: "Invalid credentials" });

  const safe = Object.assign({}, user);
  delete safe.passHash;
  delete safe.passSalt;
  res.json({ user: safe });
});

app.get("/api/requests", (req, res) => {
  const data = readData();
  let requests = data.requests || [];

  if (req.query.status) {
    requests = requests.filter(
      (r) => String(r.status || "open").toLowerCase() ===
        String(req.query.status).toLowerCase(),
    );
  }

  if (req.query.type) {
    const type = String(req.query.type).toLowerCase();
    requests = requests.filter(
      (r) => String(r.type || "").toLowerCase().includes(type),
    );
  }

  if (req.query.place) {
    const place = String(req.query.place).toLowerCase();
    requests = requests.filter(
      (r) => String(r.place || "").toLowerCase().includes(place),
    );
  }

  if (req.query.hospitalId) {
    requests = requests.filter(
      (r) => String(r.hospitalId || "") === String(req.query.hospitalId),
    );
  }

  res.json({ requests });
});

app.post("/api/requests", (req, res) => {
  const { type, place, tag, requestedMinutes, hospitalId } = req.body || {};
  if (!type || !place)
    return res.status(400).json({ error: "Missing request fields" });

  const data = readData();
  const hospital = data.users.find((u) => u.id === hospitalId && u.role === "hospital");
  const reqObj = {
    id: `req-${Date.now()}`,
    type,
    place,
    tag: tag || "Urgent",
    requestedMinutes: requestedMinutes || 0,
    status: "open",
    hospitalId: hospitalId || null,
    hospitalName: hospital ? hospital.hospitalName || hospital.name : null,
    hospitalLocation: hospital ? hospital.location || "" : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.requests.unshift(reqObj);
  writeData(data);
  res.json({ request: reqObj });
});

app.put("/api/requests/:id", (req, res) => {
  const { id } = req.params || {};
  const { type, place, tag, requestedMinutes, status } = req.body || {};
  if (!id) return res.status(400).json({ error: "Missing request id" });

  const data = readData();
  const request = (data.requests || []).find((r) => r.id === id);
  if (!request) return res.status(404).json({ error: "Request not found" });

  if (type !== undefined) request.type = type;
  if (place !== undefined) request.place = place;
  if (tag !== undefined) request.tag = tag;
  if (requestedMinutes !== undefined)
    request.requestedMinutes = requestedMinutes;

  if (status !== undefined) {
    const allowed = ["open", "fulfilled", "cancelled"];
    const normalized = String(status).toLowerCase();
    if (!allowed.includes(normalized))
      return res.status(400).json({ error: "Invalid status" });
    request.status = normalized;
  }

  request.updatedAt = new Date().toISOString();
  writeData(data);
  res.json({ request });
});

// Admin endpoints (simple admin-key protection for demo)
app.get("/api/admin/users", (req, res) => {
  const key = req.query.key || req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "unauthorized" });
  const data = readData();
  const safe = (data.users || []).map((u) => {
    const copy = Object.assign({}, u);
    delete copy.passHash;
    delete copy.passSalt;
    return copy;
  });
  res.json({ users: safe });
});

app.post("/api/admin/verify-user", (req, res) => {
  const { userId, verify } = req.body || {};
  const key = req.body.key || req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "unauthorized" });
  if (!userId) return res.status(400).json({ error: "missing userId" });
  const data = readData();
  const user = data.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "user not found" });
  user.verified = !!verify;
  writeData(data);
  const safe = Object.assign({}, user);
  delete safe.passHash;
  delete safe.passSalt;
  res.json({ user: safe });
});

app.use((req, res) => {
  res.status(404).send("Not found");
});

app.listen(PORT, () => console.log(`LifeLink backend running on port ${PORT}`));
