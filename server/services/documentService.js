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
You are a data extraction assistant. Your ONLY job is to read the provided file and extract nutritional numbers that are explicitly written in the document.

STRICT RULES — you MUST follow these exactly:
1. Extract ONLY numbers that are LITERALLY WRITTEN in the document. Do NOT estimate, infer, calculate, or adjust any value.
2. Do NOT "correct" values that seem too high or too low. If the document says 50g fat, return 50. Not 37. Not 45. Exactly 50.
3. If multiple days or phases are listed, extract the FIRST or PRIMARY plan values.
4. If a value is genuinely absent from the document, return 0 for that field.
5. NEVER use your own nutritional knowledge to override what the document says.

Return ONLY a valid JSON object (no markdown, no explanation):
{
    "name": "Short title describing the plan or document",
    "cals": Exact calories as written in the document (integer),
    "protein": Exact protein grams as written (integer),
    "carbs": Exact carbs grams as written (integer),
    "fats": Exact fat grams as written (integer),
    "tdee": Exact TDEE or maintenance calories as written, or 0 if not present (integer),
    "description": "Brief 1-sentence summary of what the document contains",
    "details": "List of all items/values found verbatim in the document"
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
