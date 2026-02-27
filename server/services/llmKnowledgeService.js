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
            You are MealMe, a conversational AI nutrition assistant. You are talking with a real person who speaks naturally and casually.

            The user just said: "${userInput}"
            Their remaining daily macros: ${JSON.stringify(remainingMacros)}
            Their meal history for the past 7 days: ${JSON.stringify(weeklyHistory)}

            YOUR JOB: Identify the user's INTENT from what they said. Do not pattern-match on keywords — reason about what they actually want.
            People say the same thing in hundreds of different ways. Their phrasing may be:
            - Casual or abbreviated ("same as last night", "that chicken thing I had", "brekkie on Monday")
            - Implicit or indirect ("I went with the steak again", "I'm doing the same", "copying yesterday's lunch")
            - Regional slang ("Macca's" = McDonald's, "Nando's", "KFC", "Hungry Jack's" = Burger King, "servo", "dairy" = corner store)
            - Past-tense descriptions ("I smashed a burger", "had those eggs again", "went to Subway")
            - Vague time references ("last night", "the other day", "earlier this week", "on the weekend", "Monday arvo")

            There are THREE possible intents. Pick exactly one:

            ── INTENT A: Repeat/Log a Past Meal ──
            The user wants to record that they ate something they've eaten before. This includes: repeating a meal, logging the same food again, eating "the same as" a past meal, copying yesterday's entry.
            Examples of wildly different phrasings that all mean INTENT A:
            • "Same dinner as last night"
            • "I'm having what I had Monday"
            • "Log yesterday's lunch again"  
            • "Had those eggs again this morning"
            • "Copying Tuesday's dinner"
            • "I went with the same thing"
            • "That chicken rice bowl thing from wednesday"
            • "I smashed the same brekkie"
            → Search weeklyHistory for the closest matching meal. Return type "log" with 1 option using that meal's exact macros. If no match found, estimate based on the description.

            ── INTENT B: Food/Restaurant Suggestion ──
            The user is asking what to eat at a specific place, or is currently at a restaurant and wants a recommendation that fits their remaining macros.
            Examples:
            • "I'm at Maccas, what should I get?"
            • "At Subway, recommend something"
            • "What's good at Nando's for my macros?"
            • "Grabbing KFC, help me pick"
            • "I'm at the fish and chip shop"
            → Suggest 2 realistic single-meal options (400–800 calories each). Return type "suggestion" with 2 options.

            ── INTENT C: Historical Info Query ──
            The user wants to look up or recall what they ate — not to log it right now, but to get information. They're asking a question or expressing curiosity about past meals.
            Examples:
            • "What did I eat yesterday?"
            • "How many calories did I have on Monday?"
            • "Remind me what I had for dinner last night"
            • "What was my last meal?"
            • "Did I hit my protein yesterday?"
            • "What did I smash at lunch on Tuesday?"
            → Search weeklyHistory for the relevant entries. Return type "info" with a conversational spoken answer and the found meals in foundMeals.

            CRITICAL: Use METRIC units. Keep the "message" field natural and conversational — it will be read aloud by TTS.
            
            Return strict JSON matching ONE of these schemas:

            For INTENT A or B:
            {
                "type": "log" | "suggestion",
                "message": "Natural 1-2 sentence TTS-friendly response.",
                "options": [
                    {
                        "title": "Meal or item name",
                        "description": "Brief reason this was chosen.",
                        "cals": integer,
                        "protein": integer,
                        "carbs": integer,
                        "fats": integer,
                        "isPerfectMatch": boolean
                    }
                ]
            }

            For INTENT C:
            {
                "type": "info",
                "message": "Natural 1-2 sentence spoken answer about what you found.",
                "foundMeals": [
                    {
                        "time": "time string from history",
                        "desc": "meal description",
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
