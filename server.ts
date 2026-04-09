import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { parseSearchCriteria, parseUserProfile, matchOfferToProfile } from "./src/services/gemini.ts";

import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Simulated WhatsApp Webhook
  app.post("/api/whatsapp/webhook", async (req, res) => {
    const { from, message, intent, data } = req.body;

    // The frontend now handles Gemini calls and sends the intent/data
    if (intent === "SEARCH") {
      res.json({ type: "search", criteria: data, message: `🔍 Recherche en cours sur FasoJob pour : ${data.keywords?.join(', ') || 'votre demande'} à ${data.location || 'partout'}...` });
    } else if (intent === "PROFILE") {
      res.json({ type: "profile", profile: data, message: `✅ Merci ${data.name || ''} ! Votre profil est maintenant en ligne sur FasoJob. Les entreprises peuvent vous contacter.` });
    } else if (intent === "ALERT") {
      res.json({ type: "alert", criteria: data, message: "🔔 Alerte activée ! FasoJob vous préviendra dès qu'une opportunité correspondante sera publiée." });
    } else if (intent === "APPLY") {
      res.json({ type: "application", message: "🚀 Candidature envoyée ! Votre profil FasoJob a été transmis directement au recruteur." });
    } else if (intent === "CV_GENERATE") {
      res.json({ type: "cv", message: "📄 Votre CV professionnel a été généré avec succès. Vous pouvez le visualiser ci-dessous." });
    } else {
      res.json({ type: "unknown", message: "Bienvenue sur FasoJob ! Je peux vous aider à trouver un job, créer votre profil pro ou générer un CV. Que voulez-vous faire ?" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
