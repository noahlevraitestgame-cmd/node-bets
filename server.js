const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs"); // ✅ Remplacement bcrypt -> bcryptjs
const fs = require("fs");
const path = require("path");

const app = express();

// Port dynamique pour Render
const PORT = process.env.PORT || 3000;

// Charger ou initialiser les données
let data = { users: [], combats: [], bets: [] };
if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json", "utf-8"));
}

function saveData() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: "nodebets_secret",
  resave: false,
  saveUninitialized: false
}));

// Middleware pour passer l'utilisateur connecté aux vues
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Page d'accueil
app.get("/", (req, res) => {
  res.render("index", { combats: data.combats });
});

// Inscription
app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (data.users.find(u => u.username === username)) {
    return res.send("Pseudo déjà utilisé.");
  }
  const hashed = await bcrypt.hash(password, 10);
  const user = { username, password: hashed, coins: 1000 };
  data.users.push(user);
  saveData();
  res.redirect("/login");
});

// Connexion
app.get("/login", (req, res) => {
  res.render("login");
});

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
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Créer un combat
app.get("/combat/new", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("combat");
});

app.post("/combat/new", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const { opponent } = req.body;
  const combat = {
    id: Date.now(),
    player1: req.session.user.username,
    player2: opponent,
    status: "open",
    bets: []
  };
  data.combats.push(combat);
  saveData();
  res.redirect("/");
});

// Parier
app.post("/bet/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { player, amount } = req.body;
  const combat = data.combats.find(c => c.id == req.params.id);
  if (!combat || combat.status !== "open") return res.send("Combat indisponible.");

  const user = data.users.find(u => u.username === req.session.user.username);
  const amt = parseInt(amount);

  // Vérifications
  if (isNaN(amt) || amt <= 0) return res.send("Montant invalide.");
  if (amt > user.coins) return res.send("Solde insuffisant !");
  if (player === user.username) return res.send("Vous ne pouvez pas parier sur vous-même !");

  // Déduire le solde
  user.coins -= amt;

  // Ajouter le pari
  const bet = {
    combatId: combat.id,
    bettor: user.username,
    player,
    amount: amt
  };
  combat.bets.push(bet);
  data.bets.push(bet);

  saveData();
  res.redirect("/");
});

// Terminer un combat
app.post("/combat/:id/end", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const combat = data.combats.find(c => c.id == req.params.id);
  if (!combat || combat.status !== "open") return res.send("Combat indisponible.");

  const { winner } = req.body;
  if (![combat.player1, combat.player2].includes(winner)) return res.send("Vainqueur invalide.");

  combat.status = "closed";

  // Créditer les paris gagnants
  combat.bets.forEach(bet => {
    if (bet.player === winner) {
      const bettor = data.users.find(u => u.username === bet.bettor);
      bettor.coins += bet.amount * 2; // Gagne le double
    }
  });

  saveData();
  res.redirect("/");
});

// Lancer le serveur
app.listen(PORT, () => console.log(`Node Bets lancé sur le port ${PORT}`));
