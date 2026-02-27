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
You are an expert nutritionist AI. Carefully analyze the provided file — it may be a meal photo, nutrition label, diet plan, food receipt, restaurant menu, or any document relating to food and health.

Your task is to:
1. Identify and TOTAL all nutritional values present in the file.
2. If multiple items are listed (e.g., a full day's meal plan, or multiple meals on a menu), SUM them all into a single combined total.
3. If exact values are not provided, make your best professional estimation based on the context.

IMPORTANT: The user currently has ${remainingMacros?.calories || 'an unspecified number of'} calories remaining for the day.

Return ONLY a valid JSON object matching this exact schema (no markdown, no explanation):
{
    "name": "Short descriptive title of what was found in the file",
    "cals": Total calories as an integer,
    "protein": Total protein in grams as an integer,
    "carbs": Total net carbs in grams as an integer,
    "fats": Total fats in grams as an integer,
    "description": "A 1-sentence TTS-friendly summary of what was found and the key totals",
    "details": "A detailed breakdown of what was extracted from the file, including individual items if multiple were found. Use bullet points."
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

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents,
            config: {
                responseMimeType: 'application/json'
            }
        });

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
