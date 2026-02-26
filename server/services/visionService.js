import { GoogleGenAI } from '@google/genai';

/**
 * Service 1: Camera Vision
 * 
 * Takes a base64 image (from the CameraScanner component) and asks Gemini 1.5 Pro
 * to estimate the caloric and macronutrient breakdown of the food pictured.
 */
export const analyzeFoodImage = async (base64Image, mode, remainingMacros, API_KEY) => {
    try {
        if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
            throw new Error("Missing valid GEMINI_API_KEY in server/.env");
        }

        const ai = new GoogleGenAI({ apiKey: API_KEY });

        // The frontend sends the base64 string with the data URI scheme.
        // Extract the exact mime type (e.g., image/png, image/jpeg, image/webp)
        const mimeTypeMatch = base64Image.match(/^data:(image\/\w+);base64,/);
        const activeMimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";

        // Strip the data URI prefix for the API
        const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

        const kcalTarget = remainingMacros?.calories ? remainingMacros.calories : 600;
        const mealMax = Math.min(kcalTarget, 800); // Cap single meals at 800kcal to prevent massive portions

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

        const ingredientsPrompt = `
            You are an expert culinary AI. The user has provided an image of raw ingredients.
            Invent a simple, appealing recipe that uses ALL of the perishable raw ingredients shown (do not suggest leaving partial raw meat or vegetables stored uncooked).
            
            IMPORTANT PORTIONING MATH:
            1. Calculate the TOTAL macros for the entire cooked batch.
            2. Divide the total cooked batch into fractional portions (e.g., 1/2, 1/3, 1/4) so that ONE PORTION is a healthy, standard single-meal serving size (do not exceed ${mealMax} kcal for one sitting).
            3. The JSON macro fields ("cals", "protein", "carbs", "fats") MUST reflect the nutrients of ONE SINGLE PORTION, not the whole batch.

            CRITICAL INSTRUCTION ON UNITS: You MUST use METRIC units exclusively for all weights and volumes.

            Return ONLY a valid JSON object matching this exact schema:
            {
                "name": "Creative Recipe Name Idea",
                "cals": Estimated calories of ONE PORTION (integer),
                "protein": Estimated protein of ONE PORTION in grams (integer),
                "carbs": Estimated NET CARBS of ONE PORTION in grams (integer),
                "fats": Estimated fats of ONE PORTION in grams (integer),
                "description": "A 1-sentence quick summary of the recipe for voice TTS",
                "details": "A bulleted list formatted string containing:\\n- The step-by-step recipe instructions to cook the ENTIRE batch.\\n- Clear instructions on exactly what fraction of the final dish the user should eat right now as ONE PORTION (approx ${mealMax} kcal max). You MUST bold this serving size fraction using markdown (e.g., **serve exactly 1/4 of the dish**).\\n- Advice to store the remaining fractions as leftovers in containers."
            }
        `;

        const prompt = mode === 'ingredients' ? ingredientsPrompt : mealPrompt;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [
                { inlineData: { mimeType: activeMimeType, data: cleanBase64 } },
                { text: prompt }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        const parsedData = JSON.parse(response.text);

        return {
            status: 'success',
            data: parsedData
        };
    } catch (error) {
        console.error("Vision Error:", error);
        return {
            status: 'error',
            message: error.message || 'Failed to analyze image'
        };
    }
};
