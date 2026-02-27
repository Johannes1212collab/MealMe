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
            If the user wants to re-log or eat a meal they had in the past (e.g., "Log the chicken salad from yesterday", "I'm having the same steak as Tuesday", "Add the pasta from earlier this week").
            - Search 'weeklyHistory' to find the exact meal. Return type "log" with 1 option matching that meal's macros.
            - If not found, create 1 estimated option and apologise in the message.

            SCENARIO 2: "Restaurant Suggestion" Intent
            If the user is at or asking about a restaurant (e.g., "I'm at McDonald's", "What should I eat at Subway?").
            - Suggest 2 specific items. A normal meal is 400-800 calories. Return type "suggestion" with 2 options.

            SCENARIO 3: "History Info Query" Intent
            If the user is asking WHAT they ate in the past without explicitly wanting to log it now (e.g., "What did I have for dinner yesterday?", "How many calories did I eat on Monday?", "What was my last meal?").
            - Search 'weeklyHistory' for the relevant day and meals.
            - Return type "info" with a clear spoken message summarising what you found.
            - Include any matching meals in "foundMeals" so the user can optionally re-add them.

            CRITICAL INSTRUCTION ON UNITS: Use METRIC units for all quantities.
            
            Return in strict JSON format. Choose the schema that matches the detected scenario:

            For Scenario 1 or 2 (type "log" or "suggestion"):
            {
                "type": "log" | "suggestion",
                "message": "1-2 sentence spoken utterance for TTS.",
                "options": [
                    {
                        "title": "Meal Name",
                        "description": "Why this fits or where it was pulled from.",
                        "cals": integer,
                        "protein": integer,
                        "carbs": integer,
                        "fats": integer,
                        "isPerfectMatch": boolean
                    }
                ]
            }

            For Scenario 3 (type "info"):
            {
                "type": "info",
                "message": "1-2 sentence spoken answer describing what you found in their history.",
                "foundMeals": [
                    {
                        "time": "e.g. 7:30 PM",
                        "desc": "Meal name as logged",
                        "macros": { "cals": integer, "protein": integer, "carbs": integer, "fats": integer }
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
