import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
 
const app = express();

const PORT =  process.env.PORT || 3000;


// middlewares

app.use(cors());
app.use(express.json({
    limit: "20mb"
}));



//

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
 
// ─── Types ────────────────────────────────────────────────────
interface AnalyzeRequest {
    image: string;     // base64
    mimeType: string;  // image/jpeg | image/png | image/heic
  }
   
  interface NutritionData {
    foodName: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
    servingSize: string;
    confidence: number;
    breakdown: Array<{
      name: string;
      calories: number;
      quantity: string;
    }>;
  }
   
  // ─── Prompt ───────────────────────────────────────────────────
  const NUTRITION_PROMPT = `
  You are an expert nutritionist and food recognition AI.
   
  Analyze the food in this image and return ONLY a valid JSON object (no markdown, no explanation).
   
  Rules:
  - Identify ALL food items visible
  - Estimate realistic portion sizes based on visual cues
  - Calculate accurate nutritional values for the total visible serving
  - Confidence should be 0-100 based on how clearly you can identify the food
   
  JSON format to return:
  {
    "foodName": "Primary dish name (e.g. Chicken Biryani)",
    "calories": <number: total kcal>,
    "protein": <number: grams>,
    "carbs": <number: grams>,
    "fat": <number: grams>,
    "fiber": <number: grams>,
    "sugar": <number: grams>,
    "sodium": <number: milligrams>,
    "servingSize": "e.g. 1 plate (~350g)",
    "confidence": <number: 0-100>,
    "breakdown": [
      { "name": "item name", "calories": <number>, "quantity": "e.g. 100g or 1 cup" }
    ]
  }
   
  If you cannot identify food in the image, return:
  {
    "error": "No food detected in image"
  }
  `.trim();
   
  // ─── Route: Analyze Food Image ────────────────────────────────
  app.post('/analyze', async (req: Request, res: Response) => {
    const { image, mimeType } = req.body as AnalyzeRequest;
   
    if (!image) {
      return res.status(400).json({ message: 'Image is required' });
    }
   
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ message: 'GEMINI_API_KEY not configured' });
    }
   
    try {
      const imagePart: Part = {
        inlineData: {
          data: image,
          mimeType: (mimeType || 'image/jpeg') as any,
        },
      };
   
      const result = await model.generateContent([NUTRITION_PROMPT, imagePart]);
      const text = result.response.text().trim();
   
      // Strip any accidental markdown fences
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as NutritionData & { error?: string };
   
      if (parsed.error) {
        return res.status(422).json({ message: parsed.error });
      }
   
      return res.json(parsed);
   
    } catch (err: any) {
      console.error('[/analyze] Error:', err.message);
   
      if (err instanceof SyntaxError) {
        return res.status(500).json({ message: 'AI returned invalid response. Try again.' });
      }
   
      return res.status(500).json({ message: 'Analysis failed. Please try again.' });
    }
  });
   
  // ─── Health Check ─────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', model: 'gemini-2.5-flash-lite', timestamp: new Date().toISOString() });
  });
   
  // ─── Global Error Handler ─────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Global Error]', err.message);
    res.status(500).json({ message: 'Internal server error' });
  });
   
  // ─── Start Server ─────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`🍽️  NutriScan API running on http://localhost:${PORT}`);
    console.log(`🤖  Model: gemini-2.5-flash-lite`);
  });
   
  export default app;
