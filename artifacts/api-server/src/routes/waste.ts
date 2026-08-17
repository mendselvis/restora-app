import { Router, type IRouter } from "express";
import {
  AnalyzeWasteBody,
  AnalyzeWasteResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

router.post("/analyze-waste", async (req, res): Promise<void> => {
  const parsed = AnalyzeWasteBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid waste analysis input");
    res.status(400).json({ error: "Upload a supported image before analyzing it." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    req.log.error("GEMINI_API_KEY is not configured");
    res.status(503).json({ error: "Waste analysis is not configured yet." });
    return;
  }

  const prompt = [
    "You are a careful waste-management field assistant.",
    "Inspect the uploaded image and identify the most visible waste.",
    "Return only valid JSON with exactly these keys:",
    "title (short human-readable title),",
    "category (exactly one of Plastic, Organic, E-waste, Mixed),",
    "estimatedQuantity (plain-language count or volume, such as 'about 6 bottles' or 'one small bag'),",
    "estimatedWeightKg (number, kilograms, use a conservative estimate and never negative),",
    "confidence (integer from 0 to 100),",
    "explanation (one or two sentences explaining the visual evidence),",
    "impact (one short sentence about why documenting this waste matters).",
    "If waste is not clearly visible, use Mixed, a low conservative estimate, and confidence below 40.",
    "Do not claim that cleanup happened; describe only what is visible.",
  ].join(" ");

  try {
    const response: globalThis.Response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: parsed.data.mimeType, data: parsed.data.imageBase64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      req.log.error({ status: response.status, detail: detail.slice(0, 500) }, "Gemini waste analysis request failed");
      res.status(502).json({ error: "Gemini could not analyze this image. Try another clear photo." });
      return;
    }

    const result = await response.json() as GeminiResponse;
    const text = result.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) {
      req.log.error("Gemini returned no analysis text");
      res.status(502).json({ error: "Gemini returned an empty analysis. Try another clear photo." });
      return;
    }

    const analysis = AnalyzeWasteResponse.safeParse(parseJsonText(text));
    if (!analysis.success) {
      req.log.error({ errors: analysis.error.flatten() }, "Gemini returned an invalid waste analysis");
      res.status(502).json({ error: "The analysis was incomplete. Try another clear photo." });
      return;
    }

    res.json(analysis.data);
  } catch (error) {
    req.log.error({ err: error }, "Waste image analysis failed");
    res.status(502).json({ error: "Waste analysis failed unexpectedly. Try again." });
  }
});

export default router;