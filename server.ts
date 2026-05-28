import express from "express";
import path from "path";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, KNOWLEDGE_BASE } from "./src/constants";

dotenv.config();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Demasiadas solicitudes. Por favor espere unos minutos antes de continuar." },
  standardHeaders: true,
  legacyHeaders: false,
});

let genAI: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in the environment.");
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Trust first proxy hop (Railway, Render) so rate limiting uses real client IP
  app.set("trust proxy", 1);

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/chat", chatLimiter, async (req, res) => {
    try {
      const { history, message } = req.body as {
        history?: { role: string; parts: { text: string }[] }[];
        message?: string;
      };

      if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "El campo 'message' es requerido." });
        return;
      }

      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...(history || []),
          { role: "user", parts: [{ text: message }] },
        ],
        config: {
          systemInstruction: `${SYSTEM_PROMPT}\n\nKNOWLEDGE BASE INTEGRATED:\n${KNOWLEDGE_BASE}`,
        },
      });

      const text =
        response.text ||
        "La información específica solicitada no se encuentra detallada en la Guía Operativa o los Protocolos de Actuación vigentes.";

      res.json({ response: text });
    } catch (error) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: "Error al procesar la solicitud con la IA." });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
