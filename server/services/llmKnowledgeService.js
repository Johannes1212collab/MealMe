import { GoogleGenAI } from '@google/genai';

/**
 * Service 3: LLM Native Knowledge Base
 * 
 * If a user is at a massive global chain (e.g. Starbucks), we don't even need to 
 * scrape it. Gemini already knows the Starbucks menu. We just ask it directly.
 */
export const getKnownRestaurantSuggestions = async (restaurantName, remainingMacros, API_KEY) => {
    try {
        if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
            throw new Error("Missing valid GEMINI_API_KEY in server/.env");
        }

        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const prompt = `
            You are MealMe, an expert AI nutritionist assistant. The user is at a restaurant called "${restaurantName}". 
            Their remaining daily macros are: ${JSON.stringify(remainingMacros)}. 
            
            CRITICAL INSTRUCTION ON PORTIONS: You are suggesting a SINGLE MEAL, not a full day of food. 
            DO NOT try to completely fill their remaining macros if it results in massive, unrealistic portion sizes (e.g., suggesting 3 cheeseburgers for breakfast just because they have 1600 kcal left). 
            A normal meal should typically be between 400-800 calories depending on their targets. Aim for a healthy, realistic single-serving portion that makes a dent in their remaining macros without going overboard.

            CRITICAL INSTRUCTION ON UNITS: You MUST use METRIC units exclusively for all quantities, weights, and volumes (e.g., use grams (g), milliliters (ml), kilograms (kg) instead of ounces, pounds, or fluid ounces).
            
            Using your internal knowledge of the standard ${restaurantName} menu, suggest 2 specific items or realistic meal combinations that fit these macros well. 
            BE EXACT with quantities (e.g., "One double cheeseburger and a side salad").
            
            Return in strict JSON format matching exactly this schema:
            {
                "message": "A 1-2 sentence spoken recommendation telling the user EXACTLY what to order and why it fits.",
                "options": [
                    {
                        "title": "Exact Food Item Name(s) and Quantity",
                        "description": "A short sentence explaining why this specific order is a good fit.",
                        "cals": integer calories,
                        "protein": integer protein,
                        "carbs": integer (Net Carbs. Total minus Fiber/Sugar Alcohols),
                        "fats": integer fats,
                        "isPerfectMatch": boolean (true if it hits protein goal perfectly)
                    },
                    {
                        "title": "Exact Food Item Name(s) and Quantity",
                        "description": "A short sentence explaining why this specific order is a good fit.",
                        "cals": integer calories,
                        "protein": integer protein,
                        "carbs": integer (Net Carbs. Total minus Fiber/Sugar Alcohols),
                        "fats": integer fats,
                        "isPerfectMatch": boolean
                    }
                ]
            }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: prompt,
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
        console.error("LLM Knowledge Error:", error);
        return {
            status: 'error',
            message: error.message || 'Failed to fetch LLM suggestion'
        };
    }
};
