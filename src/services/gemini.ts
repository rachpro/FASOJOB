import { GoogleGenAI, Type } from "@google/genai";
import { ContractType } from "../types/index.ts";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing in environment variables.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function parseSearchCriteria(message: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extrais les critères de recherche d'emploi du message suivant: "${message}".
    Retourne un objet JSON avec les champs: keywords (tableau de chaînes), location (chaîne), contractType (un parmi: CDD, CDI, Stage, Apprentissage, Interim), sector (chaîne), email (chaîne, si l'utilisateur mentionne une adresse email).
    Si un champ n'est pas trouvé, laisse-le vide ou null.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          location: { type: Type.STRING },
          contractType: { type: Type.STRING, enum: ["CDD", "CDI", "Stage", "Apprentissage", "Interim"] },
          sector: { type: Type.STRING },
          email: { type: Type.STRING },
        },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function parseUserProfile(message: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extrais les informations du profil utilisateur du message suivant: "${message}".
    Retourne un objet JSON avec les champs: name (chaîne), bio (chaîne), skills (tableau de chaînes), location (chaîne).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          bio: { type: Type.STRING },
          skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          location: { type: Type.STRING },
        },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function matchOfferToProfile(offer: any, profile: any) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Évalue si l'offre d'emploi suivante correspond au profil de l'utilisateur.
    Offre: ${JSON.stringify(offer)}
    Profil: ${JSON.stringify(profile)}
    Retourne un objet JSON avec: score (nombre de 0 à 100), reasoning (chaîne expliquant pourquoi).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
        },
      },
    },
  });

  return JSON.parse(response.text);
}

export async function classifyIntent(message: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Classifie l'intention de l'utilisateur dans ce message WhatsApp: "${message}".
    Les intentions possibles sont:
    - SEARCH: L'utilisateur cherche un emploi ou une formation.
    - PROFILE: L'utilisateur donne des informations sur lui-même.
    - ALERT: L'utilisateur veut être prévenu des nouvelles offres.
    - APPLY: L'utilisateur veut postuler à une offre spécifique.
    - CV_GENERATE: L'utilisateur veut générer ou voir son CV.
    - UNKNOWN: Autre chose.
    Retourne un objet JSON avec le champ 'intent'.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: { type: Type.STRING, enum: ["SEARCH", "PROFILE", "ALERT", "APPLY", "CV_GENERATE", "UNKNOWN"] },
        },
      },
    },
  });
  return JSON.parse(response.text).intent;
}

export async function generateCV(profile: any) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Génère un CV professionnel en Markdown basé sur ce profil: ${JSON.stringify(profile)}.
    Le CV doit être bien structuré avec des sections: Expérience, Compétences, Éducation, etc.
    Utilise un ton professionnel adapté au marché du travail au Burkina Faso.`,
  });

  return response.text;
}
