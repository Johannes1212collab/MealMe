import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const testVision = async () => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const mealPrompt = `
            You are an expert nutritionist AI. Analyze the food in this image.
            CRITICAL INSTRUCTION ON UNITS: You MUST use METRIC units exclusively for all quantities, weights, and volumes.

            Return ONLY a valid JSON object matching this exact schema:
            {
                "name": "Name of the meal",
                "cals": Estimated calories (integer),
                "protein": Estimated protein in grams (integer),
                "carbs": Estimated NET CARBS in grams (integer),
                "fats": Estimated fats in grams (integer),
                "description": "A 1-sentence quick summary of the meal for voice TTS",
                "details": "A bulleted list containing any interesting nutritional facts or tips about this meal."
            }
        `;

        console.log("Sending request to Gemini 2.5 Flash...");
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [
                { inlineData: { mimeType: "image/png", data: dummyBase64 } },
                { text: mealPrompt }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        console.log("Success! Response text:");
        console.log(response.text);
    } catch (err) {
        console.error("SDK Error Catch:");
        console.error(err);
    }
};

testVision();
