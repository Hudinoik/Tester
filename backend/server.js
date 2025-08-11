const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET || "change_me_in_env";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "db.sqlite");

app.use(cors());
app.use(express.json());

// Serve frontend from the same service
app.use(express.static(path.join(__dirname, "../frontend")));

// --- DB Setup ---
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS shuls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      minyanim TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','manager')),
      shulId INTEGER,
      FOREIGN KEY (shulId) REFERENCES shuls(id)
  )`);
});

// --- First-run seed ---
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SHUL_NAME = process.env.ADMIN_SHUL_NAME || "My First Shul";
const ADMIN_SHUL_ADDRESS = process.env.ADMIN_SHUL_ADDRESS || "Address TBA";

db.get("SELECT COUNT(*) AS c FROM users", async (err, row) => {
  if (err) return console.error("Seed check failed:", err);
  if (row && row.c === 0) {
    db.run(
      "INSERT INTO shuls (name, address, minyanim) VALUES (?,?,?)",
      [ADMIN_SHUL_NAME, ADMIN_SHUL_ADDRESS, "Shacharis: 6:30\nMincha: 13:15\nMaariv: 19:00"],
      function (shErr) {
        if (shErr) return console.error("Seed shul failed:", shErr);
        const newShulId = this.lastID;
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
          return console.warn("No ADMIN_EMAIL/ADMIN_PASSWORD set — admin not created.");
        }
        bcrypt.hash(ADMIN_PASSWORD, 10).then(hash => {
          db.run(
            "INSERT INTO users (email, password, role, shulId) VALUES (?,?,?,?)",
            [ADMIN_EMAIL, hash, "admin", newShulId],
            (uErr) => {
              if (uErr) console.error("Seed admin failed:", uErr);
              else console.log(`Seeded admin ${ADMIN_EMAIL} for shul ID ${newShulId}.`);
            }
          );
        });
      }
    );
  }
});

// --- Auth middleware ---
function authRequired(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

// --- Routes ---

// Health check
app.get("/healthz", (req, res) => res.json({ ok: true }));

// Auth: login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!user) return res.status(400).json({ error: "User not found" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Wrong password" });
    const token = jwt.sign({ id: user.id, role: user.role, shulId: user.shulId }, SECRET, { expiresIn: "2d" });
    res.json({ token, role: user.role, shulId: user.shulId });
  });
});

// Admin: create user (admin or manager)
app.post("/register", authRequired, adminOnly, async (req, res) => {
  const { email, password, role, shulId } = req.body;
  if (!email || !password || !role) return res.status(400).json({ error: "Missing fields" });
  const hash = await bcrypt.hash(password, 10);
  db.run(
    "INSERT INTO users (email, password, role, shulId) VALUES (?,?,?,?)",
    [email, hash, role, shulId || null],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Public: list shuls
app.get("/shuls", (req, res) => {
  db.all("SELECT * FROM shuls ORDER BY name COLLATE NOCASE", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

// Admin: add a shul
app.post("/shuls", authRequired, adminOnly, (req, res) => {
  const { name, address, minyanim } = req.body;
  if (!name || !address || !minyanim) return res.status(400).json({ error: "Missing fields" });
  db.run(
    "INSERT INTO shuls (name, address, minyanim) VALUES (?,?,?)",
    [name, address, minyanim],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Manager/Admin: update a shul
app.put("/shuls/:id", authRequired, (req, res) => {
  const shulId = parseInt(req.params.id, 10);
  const { name, address, minyanim } = req.body;
  if (req.user.role !== "admin" && req.user.shulId !== shulId) {
    return res.status(403).json({ error: "No permission" });
  }
  db.run(
    "UPDATE shuls SET name=?, address=?, minyanim=? WHERE id=?",
    [name, address, minyanim, shulId],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// Admin: delete a shul
app.delete("/shuls/:id", authRequired, adminOnly, (req, res) => {
  const shulId = parseInt(req.params.id, 10);
  db.run("DELETE FROM shuls WHERE id=?", [shulId], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// Fallback to index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
