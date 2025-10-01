const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;

// Charger ou initialiser les données
let data = { users: [], combats: [], bets: [] };
if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json", "utf-8"));
}

function saveData() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// Config Express
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(session({
  secret: "nodebets_secret",
  resave: false,
  saveUninitialized: false
}));

// Middleware pour passer l'utilisateur aux vues
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Créer admin si absent
if (!data.users.find(u => u.username === "Timeo3738")) {
  const hash = bcrypt.hashSync("Timeo3738***", 10);
  data.users.push({ username: "Timeo3738", password: hash, coins: 1000 });
  saveData();
}

// Page d’accueil
app.get("/", (req, res) => {
  res.render("index", { combats: data.combats });
});

// Inscription
app.get("/register", (req, res) => res.render("register"));
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (data.users.find(u => u.username === username)) return res.send("Pseudo déjà utilisé.");
  const hashed = await bcrypt.hash(password, 10);
  data.users.push({ username, password: hashed, coins: 1000 });
  saveData();
  res.redirect("/login");
});

// Connexion
app.get("/login", (req, res) => res.render("login"));
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = data.users.find(u => u.username === username);
  if (!user) return res.send("Utilisateur introuvable.");
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send("Mot de passe incorrect.");
  req.session.user = user;
  res.redirect("/");
});

// Déconnexion
app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));

// Créer un combat
app.get("/combat/new", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("combat_new");
});
app.post("/combat/new", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { opponent } = req.body;
  const combat = {
    id: Date.now(),
    player1: req.session.user.username,
    player2: opponent,
    status: "open",
    proof: null,
    bets: []
  };
  data.combats.push(combat);
  saveData();
  res.redirect("/");
});

// Page détail d’un match
app.get("/match/:id", (req, res) => {
  const combat = data.combats.find(c => c.id == req.params.id);
  if (!combat) return res.send("Combat introuvable");
  const bets = data.bets.filter(b => b.combatId == combat.id);
  res.render("match", { combat, bets });
});

// Soumettre preuve (status -> pending)
app.post("/combat/:id/proof", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const combat = data.combats.find(c => c.id == req.params.id);
  if (!combat || ![combat.player1, combat.player2].includes(req.session.user.username)) return res.send("Accès refusé");
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.send("Image requise");
  combat.proof = imageBase64;
  combat.status = "pending";
  saveData();
  res.json({ success: true });
});

// Parier
app.post("/bet/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { player, amount } = req.body;
  const combat = data.combats.find(c => c.id == req.params.id);
  if (!combat || combat.status !== "open") return res.send("Combat indisponible.");
  const user = data.users.find(u => u.username === req.session.user.username);
  const amt = parseInt(amount);
  if (isNaN(amt) || amt <= 0) return res.send("Montant invalide.");
  if (amt > user.coins) return res.send("Solde insuffisant !");
  if (player === user.username) return res.send("Vous ne pouvez pas parier sur vous-même !");
  user.coins -= amt;
  const bet = { combatId: combat.id, bettor: user.username, player, amount: amt };
  combat.bets.push(bet);
  data.bets.push(bet);
  saveData();
  res.redirect("/match/" + combat.id);
});

// Admin panel
app.get("/admin", (req, res) => {
  if (!req.session.user || req.session.user.username !== "Timeo3738") return res.send("Accès admin interdit");
  const pending = data.combats.filter(c => c.status === "pending");
  res.render("admin", { pending });
});

// Admin accepter
app.post("/admin/resolve", (req, res) => {
  if (!req.session.user || req.session.user.username !== "Timeo3738") return res.send("Accès admin interdit");
  const { combatId, winner } = req.body;
  const combat = data.combats.find(c => c.id == combatId);
  if (!combat) return res.send("Combat introuvable");
  combat.status = "closed";
  combat.winner = winner;
  // Distribuer gains
  combat.bets.forEach(b => {
    if (b.player === winner) {
      const bettor = data.users.find(u => u.username === b.bettor);
      bettor.coins += b.amount * 2;
    }
  });
  saveData();
  res.redirect("/admin");
});

// Admin annuler
app.post("/admin/cancel", (req, res) => {
  if (!req.session.user || req.session.user.username !== "Timeo3738") return res.send("Accès admin interdit");
  const { combatId } = req.body;
  const combat = data.combats.find(c => c.id == combatId);
  if (!combat) return res.send("Combat introuvable");
  combat.bets.forEach(b => {
    const bettor = data.users.find(u => u.username === b.bettor);
    bettor.coins += b.amount;
  });
  combat.status = "canceled";
  saveData();
  res.redirect("/admin");
});

app.listen(PORT, () => console.log(`Node Bets lancé sur http://localhost:${PORT}`));
