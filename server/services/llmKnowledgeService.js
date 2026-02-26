import { GoogleGenAI } from '@google/genai';

/**
 * Service 3: LLM Native Knowledge Base
 * 
 * If a user is at a massive global chain (e.g. Starbucks), we don't even need to 
 * scrape it. Gemini already knows the Starbucks menu. We just ask it directly.
 */
export const getKnownRestaurantSuggestions = async (userInput, remainingMacros, weeklyHistory, API_KEY) => {
    try {
        if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
            throw new Error("Missing valid GEMINI_API_KEY in server/.env");
        }

        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const prompt = `
            You are MealMe, an expert AI nutritionist assistant. The user just said: "${userInput}". 
            Their remaining daily macros are: ${JSON.stringify(remainingMacros)}. 
            Their historical meal data for the past 7 days is: ${JSON.stringify(weeklyHistory)}.
            
            Based on what the user said, determine their INTENT.

            SCENARIO 1: "Log Historical Meal" Intent
            If the user is asking to re-log or eat a meal they had in the past (e.g., "Log the chicken salad from yesterday", "I'm having the same steak I had on Tuesday", "Add the pasta from earlier this week").
            - You MUST search their 'weeklyHistory' array to find the exact meal they are referring to.
            - If found, return exactly 1 option matching that historical meal's macros. Make the "message" acknowledge that you are logging their past meal.
            - If not found, create 1 estimated option based on what they described, but apologize in the "message" that you couldn't find it in their history.

            SCENARIO 2: "Restaurant Suggestion" Intent
            If the user is telling you where they are currently eating or asking for ideas (e.g., "I'm at McDonald's", "What should I eat at Subway?").
            - DO NOT try to completely fill their remaining macros if it results in massive, unrealistic portion sizes (e.g., 3 cheeseburgers). A normal meal is 400-800 calories.
            - Suggest 2 specific items from that restaurant's common menu that fit their remaining macros reasonably well.
            - Make the "message" a 1-2 sentence spoken recommendation telling them what to order.

            CRITICAL INSTRUCTION ON UNITS: Use METRIC units exclusively for all quantities, weights, and volumes.
            
            Return in strict JSON format matching exactly this schema:
            {
                "message": "A 1-2 sentence spoken utterance for Voice TTS answering their query.",
                "options": [
                    {
                        "title": "Exact Food Name / Meal Name",
                        "description": "A short sentence explaining why this fits or where it was pulled from.",
                        "cals": integer calories,
                        "protein": integer protein,
                        "carbs": integer (Net Carbs),
                        "fats": integer fats,
                        "isPerfectMatch": boolean
                    }
                ] // Provide 1 option if logging history, 2 options if suggesting from a restaurant.
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
