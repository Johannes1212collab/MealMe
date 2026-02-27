import { GoogleGenAI } from '@google/genai';

/**
 * Service 5: Document & File Parser
 *
 * Accepts an uploaded file (image, PDF, or plain text) and asks Gemini 3.1 Pro
 * to extract ALL nutritional data (calories, protein, carbs, fats) from it.
 * 
 * Supports:
 * - Images (image/jpeg, image/png, image/webp, etc.)
 * - PDF documents (application/pdf) — e.g. coach plans, nutrition labels
 * - Plain text (text/plain)
 */
export const analyzeDocument = async (base64Data, mimeType, remainingMacros, API_KEY) => {
    try {
        if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
            throw new Error("Missing valid GEMINI_API_KEY in server/.env");
        }

        const ai = new GoogleGenAI({ apiKey: API_KEY });

        // Strip any data URI prefix if present
        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

        const extractionPrompt = `
You are a nutritional data parser. Analyze the provided document in TWO steps:

STEP 1 — READ AND LIST:
Find every line or cell in the document that contains a nutritional value. Write out each one EXACTLY as it appears, for example:
- "Total Calories: 2100 kcal"
- "Protein: 200g"
- "Total Fat: 50g"
- "Saturated Fat: 15g"
- "Carbohydrates: 165g"

STEP 2 — MAP TO JSON:
Using ONLY the values you listed in Step 1, fill in this schema.
CRITICAL RULES for mapping:
- "cals": use the value labeled "Calories", "Total Calories", "Energy", or "kcal".
- "protein": use the value labeled "Protein".
- "carbs": use the value labeled "Carbohydrates", "Total Carbs", or "Net Carbs". Do NOT include fiber.
- "fats": use the value labeled "Total Fat" or "Fat". Do NOT use "Saturated Fat", "Trans Fat", "Unsaturated Fat" — these are SUBTYPES, not the total.
- "tdee": use the value labeled "TDEE", "Maintenance", "Total Daily Energy Expenditure", or 0 if absent.
- DO NOT ESTIMATE. If you cannot find a value in Step 1, use 0.
- DO NOT ADJUST values based on your nutritional knowledge. If the document says 50g fat, return 50.

Return ONLY this JSON (no markdown fences, no Step 1 text in the output):
{
    "name": "Short title of the plan/document",
    "cals": integer,
    "protein": integer,
    "carbs": integer,
    "fats": integer,
    "tdee": integer,
    "description": "One sentence summary of the document",
    "details": "Paste your Step 1 verbatim list here so the user can verify the extraction"
}
        `.trim();

        let contents;

        if (mimeType.startsWith('text/')) {
            // For text files: decode base64 to string and send as text
            const textContent = Buffer.from(cleanBase64, 'base64').toString('utf-8');
            contents = [
                { text: `${extractionPrompt}\n\nFILE CONTENTS:\n${textContent}` }
            ];
        } else {
            // For images and PDFs: send as inline binary data
            // Gemini 3.1 Pro natively reads both image/* and application/pdf
            contents = [
                { inlineData: { mimeType: mimeType, data: cleanBase64 } },
                { text: extractionPrompt }
            ];
        }

        let response;
        const models = ['gemini-3.1-pro-preview', 'gemini-1.5-pro'];
        let lastError;
        for (const model of models) {
            try {
                response = await ai.models.generateContent({
                    model,
                    contents,
                    config: { responseMimeType: 'application/json' }
                });
                break; // success — exit the loop
            } catch (modelErr) {
                lastError = modelErr;
                console.warn(`Model ${model} failed, trying next:`, modelErr.message);
            }
        }
        if (!response) throw lastError;

        const parsedData = JSON.parse(response.text);

        return {
            status: 'success',
            data: parsedData,
            source: 'document'
        };

    } catch (error) {
        console.error("Document Analysis Error:", error);
        return {
            status: 'error',
            message: error.message || 'Failed to analyze document'
        };
    }
};
