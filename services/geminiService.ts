
import { GoogleGenAI, Type } from "@google/genai";

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
};

export const parseQuotationPDF = async (input: File | File[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const files = Array.isArray(input) ? input : [input];
  
  const parts = await Promise.all(files.map(async f => {
    const base64 = await fileToBase64(f);
    return { inlineData: { data: base64, mimeType: f.type } };
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        ...parts,
        { text: "Extrae partidas de material de los documentos adjuntos. Devuelve un objeto con 'folio', 'cliente' y un array 'partidas'." }
      ],
    },
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      systemInstruction: `Actúa como un extractor de datos ultra-preciso para MAS TABLAROCA.
      Analiza los PDFs y devuelve un objeto JSON:
      {
        "folio": "Folio de la cotización",
        "cliente": "Nombre del cliente",
        "partidas": [
          {
            "codigo": "Identificador SKU (ej: POSTE6, CANAL4, ANGULO)",
            "descripcion": "Descripción técnica",
            "cantidad": 10,
            "ventaUnit": 150.50
          }
        ]
      }
      Reglas: Si ves códigos de CIASA o PANEL REY, intenta normalizarlos a los SKUs de MAS TABLAROCA.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          folio: { type: Type.STRING },
          cliente: { type: Type.STRING },
          partidas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                codigo: { type: Type.STRING },
                descripcion: { type: Type.STRING },
                cantidad: { type: Type.NUMBER },
                ventaUnit: { type: Type.NUMBER },
              },
              required: ["codigo", "descripcion", "cantidad", "ventaUnit"]
            }
          }
        },
        required: ["partidas"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const parseCompetitorPDF = async (input: File | File[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const files = Array.isArray(input) ? input : [input];

  const parts = await Promise.all(files.map(async f => {
    const base64 = await fileToBase64(f);
    return { inlineData: { data: base64, mimeType: f.type } };
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // Usamos Pro para mejor mapeo semántico de códigos
    contents: {
      parts: [
        ...parts,
        { text: "Analiza estos documentos de competencia (CIASA, PLAFORAMA, PANEL REY) y extrae sus precios de lista." }
      ],
    },
    config: {
      systemInstruction: `Eres un analista de mercado experto en construcción ligera en México.
      Tu tarea es extraer precios de competidores de los PDFs adjuntos.
      Debes retornar un objeto JSON con esta estructura:
      {
        "reportes": [
          {
            "empresa": "Nombre de la empresa (ej: CIASA o PLAFORAMA/PANEL REY)",
            "fecha": "Fecha del documento",
            "items": [
              {
                "codigo": "Intenta mapear al SKU de MasTablaroca (ej: POSTE6, CANAL4, ANGULO, REBORDE_J)",
                "descripcion": "Descripción original del competidor",
                "precio": "Precio unitario (sin IVA si es posible, o el que aparezca como unitario)"
              }
            ]
          }
        ]
      }
      Mapeos críticos:
      - 'POSTE MET 410' -> POSTE4
      - 'CANAL AMARRE 635' -> CANAL6
      - 'QUINERO' o 'ESQUINERO' -> ESQUINERO_LARGO
      - 'REBORDE J' -> REBORDE_J`,
      responseMimeType: "application/json",
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Error parsing Gemini response", e);
    return { reportes: [] };
  }
};
