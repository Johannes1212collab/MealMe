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

            ── INTENT D: Portion Adjustment ──
            The user is telling you that they ate LESS than a meal they already logged. They shared it, didn't finish it, only had part of it, or ate a specific fraction. This does NOT involve logging a new meal — it's correcting an existing one.
            Examples of wildly different phrasings that all mean INTENT D:
            • "I only ate half of it"
            • "We shared the pizza"
            • "Didn't finish my burger"
            • "Split dinner with my partner"
            • "Had about 3/4 of my pasta"
            • "Only ate a quarter of it"
            • "Shared the steak with my girlfriend"
            • "Left some on the plate"
            • "Had a few bites of the dessert"
            → Identify the fraction/multiplier from context. Return type "portion".
            Fraction → multiplier mapping: "half" = 0.5, "quarter" = 0.25, "third" = 0.33, "three quarters" = 0.75, "two thirds" = 0.67.
            If vague (e.g., "didn't finish", "left some"), use 0.5 as a default.
            Include the meal being adjusted in mealReference (use the food word from their message).

            ── NUTRITIONAL ACCURACY RULES ──
            These rules apply to ALL intents when producing macro numbers:

            1. PUBLISHED DATA FIRST: For any recognised fast-food or chain restaurant item, use the item's actual published nutritional data. Do not estimate a McDonald's Big Mac — you know it is 550 kcal, 25g protein, 43g carbs, 30g fat. Use that. Same for any other chain where authoritative data exists.

            2. UPPER BOUND ALWAYS: If you must estimate (e.g., a generic "double beef cheeseburger" with no specific restaurant), always select the HIGHEST plausible value within a realistic range. Do not average. If a meal could be 820–1050 kcal, return 1050 kcal. If protein could be 48–60g, return 60g. This prevents underlogging.

            3. BE DETERMINISTIC: The same meal described in different ways must always produce the same numbers. "Double cheeseburger", "double beef burger with cheese", and "two patty cheeseburger" are the same meal — they must return identical macros every single response.

            4. VERIFY YOUR MATHS: calories must equal (protein × 4) + (carbs × 4) + (fats × 9). If your chosen macro values don't add up to your calorie figure, adjust calories upward to match (never downward).

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
                        "carbs": integer (total carbs including fiber),
                        "fiber": integer,
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
                        "macros": { "cals": integer, "protein": integer, "carbs": integer, "fiber": integer, "fats": integer }
                    }
                ]
            }

            For INTENT D:
            {
                "type": "portion",
                "message": "Natural 1-2 sentence spoken confirmation, e.g. 'Got it, I've adjusted your burger to half a serving.'",
                "mealReference": "the food item mentioned, e.g. 'burger', 'pasta', 'pizza'",
                "portionMultiplier": number between 0 and 1,
                "portionNote": "brief human description e.g. 'shared with partner', 'half eaten'"
            }
        `;

        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const withTimeout = (p, ms) => Promise.race([
            p, new Promise((_, rej) => setTimeout(() => rej(new Error('Gemini call timed out')), ms))
        ]);
        const isTransient = err => {
            const msg = ((err?.message || '') + (err?.cause?.message || '')).toLowerCase();
            return ['503', 'unavailable', 'high demand', 'fetch failed', 'headers timeout', 'und_err', 'timed out']
                .some(s => msg.includes(s));
        };
        const modelCascade = [
            { model: 'gemini-3.1-pro-preview', attempts: 3, delay: 2000 },
            { model: 'gemini-3-flash-preview', attempts: 2, delay: 2000 },
        ];

        let parsedData;
        let lastError;
        outer: for (const tier of modelCascade) {
            for (let attempt = 0; attempt < tier.attempts; attempt++) {
                if (attempt > 0) {
                    console.warn(`${tier.model} error on attempt ${attempt + 1}, retrying in ${tier.delay}ms…`);
                    await sleep(tier.delay);
                }
                try {
                    const response = await withTimeout(
                        ai.models.generateContent({ model: tier.model, contents: prompt, config: { responseMimeType: 'application/json' } }),
                        20000
                    );
                    parsedData = JSON.parse(response.text);
                    if (tier.model !== 'gemini-3.1-pro-preview') console.info(`Fallback: ${tier.model}`);
                    break outer;
                } catch (err) {
                    lastError = err;
                    if (!isTransient(err)) break outer; // 404/auth — stop everything
                }
            }
        }
        if (!parsedData) throw lastError;

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
