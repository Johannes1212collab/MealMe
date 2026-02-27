import { GoogleGenAI } from '@google/genai';

/**
 * Service 6: AI Analysis Correction
 *
 * Takes a previous meal analysis result and a user correction string,
 * then asks Gemini to recalculate the macros accordingly.
 * 
 * Example correction: "actually it had 3 eggs, not 1"
 */
export const correctFoodAnalysis = async (previousResult, correctionText, API_KEY) => {
    try {
        if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
            throw new Error('Missing valid GEMINI_API_KEY in server/.env');
        }

        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const correctionPrompt = `
You previously analyzed a food photo and produced this nutritional result:

Meal: "${previousResult.name}"
Calories: ${previousResult.cals} kcal
Protein: ${previousResult.protein}g
Carbs: ${previousResult.carbs}g
Fats: ${previousResult.fats}g
Description: ${previousResult.description}

The user has provided this correction: "${correctionText}"

Your task:
1. Identify which ingredient(s) or quantity(ies) the correction refers to.
2. Recalculate ONLY the affected macros using standard nutritional values.
3. Leave all unaffected ingredients and macros unchanged.
4. Use the standard Atwater model (1g protein = 4 kcal, 1g carbs = 4 kcal, 1g fat = 9 kcal) to ensure calorie totals are mathematically consistent.

Return ONLY a valid JSON object (no markdown, no explanation):
{
    "name": "Updated meal name if appropriate, otherwise keep the same",
    "cals": Updated total calories as integer,
    "protein": Updated total protein in grams as integer,
    "carbs": Updated total net carbs in grams as integer,
    "fats": Updated total fats in grams as integer,
    "description": "Updated 1-sentence description reflecting the correction",
    "details": "Brief explanation of what changed and the recalculation performed"
}
        `.trim();

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [{ text: correctionPrompt }],
            config: { responseMimeType: 'application/json' }
        });

        const parsedData = JSON.parse(response.text);

        return {
            status: 'success',
            data: parsedData
        };

    } catch (error) {
        console.error('Correction Service Error:', error);
        return {
            status: 'error',
            message: error.message || 'Failed to apply correction'
        };
    }
};
