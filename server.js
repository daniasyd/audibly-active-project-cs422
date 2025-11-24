import express from "express";
import session from "express-session";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import bcrypt from "bcryptjs";


const app = express();
const PORT = 3000;

const __dirname = process.cwd();
const PUBLIC_DIR = path.join(__dirname, "public");
const USERS_FILE = path.join(__dirname, "users.json");
const SETS_FILE  = path.join(__dirname, "sets.json");

// ensure data files exist
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]), "utf-8");
if (!fs.existsSync(SETS_FILE))  fs.writeFileSync(SETS_FILE,  JSON.stringify([]), "utf-8");

const readUsers = () => {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")); }
  catch { return []; }
};
const writeUsers = (users) =>
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");

const readSets = () => {
  try { return JSON.parse(fs.readFileSync(SETS_FILE, "utf-8")); }
  catch { return []; }
};
const writeSets = (sets) =>
  fs.writeFileSync(SETS_FILE, JSON.stringify(sets, null, 2), "utf-8");

// middleware
app.use(express.json());
app.use(
  session({
    secret: "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 } // 1 day
  })
);
app.use(express.static(PUBLIC_DIR));

// auth helpers
const requireAuth = (req, res, next) => {
  if (req.session?.user?.username) return next();
  return res.status(401).json({ ok: false, message: "Not logged in." });
};

// --- auth routes ---
app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: "Username and password required." });
  }

  const users = readUsers();
  const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) return res.status(409).json({ ok: false, message: "Username already exists." });

  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ username, passwordHash });
  writeUsers(users);

  req.session.user = { username };
  res.json({ ok: true, username });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: "Username and password required." });
  }

  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(401).json({ ok: false, message: "Invalid credentials." });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ ok: false, message: "Invalid credentials." });

  req.session.user = { username: user.username };
  res.json({ ok: true, username: user.username });
});

app.get("/api/me", (req, res) => {
  if (req.session.user) return res.json({ ok: true, user: req.session.user });
  res.status(401).json({ ok: false, message: "Not logged in." });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// --- sets routes ---
// save a set for the current user
app.post("/api/sets", requireAuth, (req, res) => {
  const { name, description, cards } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, message: "Set name required." });
  }
  if (!Array.isArray(cards)) {
    return res.status(400).json({ ok: false, message: "Cards must be an array." });
  }

  // normalize: keep only cards with at least one side filled
  const cleaned = cards
    .map(c => ({
      q: (c?.q ?? "").trim(),
      a: (c?.a ?? "").trim()
    }))
    .filter(c => c.q || c.a);

  const all = readSets();
  const id = Date.now().toString(); // simple id
  const owner = req.session.user.username;
  const doc = { id, owner, name: name.trim(), description: (description || "").trim(), cards: cleaned, createdAt: new Date().toISOString() };
  all.push(doc);
  writeSets(all);

  return res.json({ ok: true, id });
});

// (optional) get sets for current user later if needed
app.get("/api/sets/mine", requireAuth, (req, res) => {
  const all = readSets();
  const mine = all.filter(s => s.owner === req.session.user.username);
  res.json({ ok: true, sets: mine });
});

// DELETE /api/sets/:id  -> deletes one set by id from sets.json
app.delete("/api/sets/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ ok: false, message: "Missing set id" });

  // if you have auth, enforce owner:
  // const owner = req.session?.user?.username; // or however you store it

  const sets = await readSets();
  const idx = sets.findIndex(s => String(s.id) === String(id));

  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Set not found" });
  }

  // If you want to restrict deletion to the owner, uncomment:
  // if (owner && sets[idx].owner !== owner) {
  //   return res.status(403).json({ ok: false, message: "Not allowed to delete this set" });
  // }

  const [removed] = sets.splice(idx, 1);
  await writeSets(sets);

  // 204 (no content) is fine; returning JSON is also fine
  // res.status(204).end();
  res.json({ ok: true, deletedId: removed.id });
});

// UPDATE /api/sets/:id -> Updates an existing set
app.put("/api/sets/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const { name, description, cards } = req.body;
  
  if (!id) return res.status(400).json({ ok: false, message: "Missing set ID" });

  const all = readSets();
  const idx = all.findIndex(s => String(s.id) === String(id));

  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Set not found" });
  }

  // Check ownership (optional safety)
  if (all[idx].owner !== req.session.user.username) {
     return res.status(403).json({ ok: false, message: "Not your set" });
  }

  // Update fields
  const cleanedCards = (cards || [])
    .map(c => ({ q: (c?.q ?? "").trim(), a: (c?.a ?? "").trim() }))
    .filter(c => c.q || c.a);

  all[idx].name = (name || "").trim();
  all[idx].description = (description || "").trim();
  all[idx].cards = cleanedCards;
  // Keep original owner and createdAt, maybe update "updatedAt"
  all[idx].updatedAt = new Date().toISOString();

  writeSets(all);
  return res.json({ ok: true });
});

// start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
