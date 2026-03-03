import { GoogleGenAI } from '@google/genai';

/**
 * Service 1: Camera Vision
 * 
 * Takes a base64 image (from the CameraScanner component) and asks Gemini 1.5 Pro
 * to estimate the caloric and macronutrient breakdown of the food pictured.
 */
export const analyzeFoodImage = async (base64Image, mode, remainingMacros, API_KEY, recipeIntent, perMealTarget) => {
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
        // If user has set a meal plan, size suggestions to per-meal budget; otherwise cap at 800
        const mealMax = perMealTarget ? Math.min(perMealTarget, kcalTarget) : Math.min(kcalTarget, 800);
        const mealBudgetNote = perMealTarget
            ? `The user plans multiple meals today. Per-meal calorie target: ~${perMealTarget} kcal. Size your suggestion to fit ONE meal slot — do not exhaust the daily budget in a single serving.`
            : `Suggest a single-meal portion (max ${mealMax} kcal).`;

        const mealPrompt = `
            You are an expert nutritionist AI. Analyze the food in this image.
            CRITICAL INSTRUCTION ON UNITS: You MUST use METRIC units exclusively for all quantities, weights, and volumes.
            ${mealBudgetNote}

            Return ONLY a valid JSON object matching this exact schema:
            {
                "name": "Name of the meal",
                "cals": Estimated calories (integer, based on full macros including fiber at 2 kcal/g),
                "protein": Estimated protein in grams (integer),
                "carbs": Estimated TOTAL carbs in grams (integer, includes fiber),
                "fiber": Estimated dietary fiber in grams (integer, must be <= carbs),
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
            ${mealBudgetNote}
            3. The JSON macro fields ("cals", "protein", "carbs", "fats") MUST reflect the nutrients of ONE SINGLE PORTION, not the whole batch.

            CRITICAL INSTRUCTION ON UNITS: You MUST use METRIC units exclusively for all weights and volumes.

            Return ONLY a valid JSON object matching this exact schema:
            {
                "name": "Creative Recipe Name Idea",
                "cals": Estimated calories of ONE PORTION (integer),
                "protein": Estimated protein of ONE PORTION in grams (integer),
                "carbs": Estimated TOTAL carbs of ONE PORTION in grams (integer, includes fiber),
                "fiber": Estimated dietary fiber of ONE PORTION in grams (integer, must be <= carbs),
                "fats": Estimated fats of ONE PORTION in grams (integer),
                "description": "A 1-sentence quick summary of the recipe for voice TTS",
                "details": "A bulleted list formatted string containing:\\n- The step-by-step recipe instructions to cook the ENTIRE batch.\\n- Clear instructions on exactly what fraction of the final dish the user should eat right now as ONE PORTION (approx ${mealMax} kcal max). You MUST bold this serving size fraction using markdown (e.g., **serve exactly 1/4 of the dish**).\\n- Advice to store the remaining fractions as leftovers in containers."
            }
        `;

        // Recipe-specific prompt when user tells us what they're making
        const recipePlanPrompt = recipeIntent ? `
            You are an expert nutritionist and chef. The user has photographed their raw ingredients and plans to make: "${recipeIntent}".

            1. Identify every ingredient visible in the photo and estimate its quantity (grams or ml)
            2. Calculate the TOTAL macro profile for a full batch of "${recipeIntent}" using those ingredients
            3. Choose a serving fraction (1/2, 1/3, 1/4 etc.) so ONE serving stays under ${mealMax} kcal
            ${mealBudgetNote}
            4. Return macros for ONE SINGLE SERVING only

            Factor in the typical cooking method (oil absorbed when frying, water lost when boiling/baking).
            Minor staples not visible (salt, cooking spray) are fine to assume. Do NOT invent major missing ingredients.
            Use METRIC units exclusively.

            Return ONLY valid JSON:
            {
                "name": "${recipeIntent}",
                "cals": calories of ONE serving (integer),
                "protein": protein of ONE serving in grams (integer),
                "carbs": total carbs of ONE serving in grams (integer, includes fiber),
                "fiber": dietary fiber of ONE serving in grams (integer),
                "fats": fats of ONE serving in grams (integer),
                "description": "A 1-sentence TTS-friendly summary of dish and portion",
                "details": "Bulleted: identified ingredients and amounts, total batch macros, **serving instruction** (e.g. eat exactly 1/3 of the dish ≈ 350g), key prep notes"
            }
        ` : null;

        // Menu-scan prompt: read a restaurant menu photo → suggest best options by mealType
        const menuPrompt = `
            You are an expert nutritionist AI. The user has photographed a restaurant menu.
            Their goal is: ${recipeIntent || 'a balanced full meal'}.
            Their remaining macros for the day: ${remainingMacros?.calories ?? 600} kcal, ${remainingMacros?.protein ?? 40}g protein, ${remainingMacros?.carbs ?? 60}g carbs, ${remainingMacros?.fats ?? 20}g fats.

            Task: Read the menu in the image and identify the 2-3 BEST options that:
            - Match the goal type: "${recipeIntent || 'full meal'}" (snack = light, 200-400 kcal; full meal = 400-800 kcal; dessert = sweet, treat)
            - Are the most macro-balanced and nutritious for the stated goal
            - Stay within the remaining macro budget as closely as possible
            - ${mealBudgetNote}

            Return ONLY a valid JSON object in this exact format (no preamble, no markdown):
            {
                "type": "suggestion",
                "response": "A single encouraging sentence explaining your top pick and why it suits their macros.",
                "options": [
                    {
                        "title": "Menu item name exactly as written",
                        "desc": "One sentence: why this is a good macro choice",
                        "cals": estimated calories as integer,
                        "protein": estimated protein grams as integer,
                        "carbs": estimated carbs grams as integer,
                        "fiber": estimated fiber grams as integer,
                        "fats": estimated fats grams as integer,
                        "match": "perfect" or "good"
                    }
                ],
                "coachNote": "One short optional tip about this meal choice, or null"
            }
        `;

        // Pick the right prompt
        let prompt;
        if (mode === 'menu') {
            prompt = menuPrompt;
        } else if (mode === 'ingredients' && recipeIntent) {
            prompt = recipePlanPrompt;
        } else if (mode === 'ingredients') {
            prompt = ingredientsPrompt;
        } else {
            prompt = mealPrompt;
        }

        const contents = [
            { inlineData: { mimeType: activeMimeType, data: cleanBase64 } },
            { text: prompt }
        ];

        // Model cascade: try pro first, fall back to flash on sustained errors
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        // Cap per-call at 55s so pro gets a real chance; total worst-case ~80s
        const withTimeout = (p, ms) => Promise.race([
            p, new Promise((_, rej) => setTimeout(() => rej(new Error('Gemini call timed out')), ms))
        ]);
        const isTransient = err => {
            const msg = ((err?.message || '') + (err?.cause?.message || '')).toLowerCase();
            return ['503', 'unavailable', 'high demand', 'fetch failed', 'headers timeout', 'und_err', 'timed out']
                .some(s => msg.includes(s));
        };
        const modelCascade = [
            { model: 'gemini-3.1-pro-preview', attempts: 1, delay: 0 },
            { model: 'gemini-3-flash-preview', attempts: 2, delay: 1000 },
        ];

        let lastRetryableError;
        let lastError;
        for (const tier of modelCascade) {
            for (let attempt = 0; attempt < tier.attempts; attempt++) {
                if (attempt > 0) {
                    console.warn(`${tier.model} error on attempt ${attempt + 1}, retrying in ${tier.delay}ms…`);
                    await sleep(tier.delay);
                }
                try {
                    const response = await withTimeout(
                        ai.models.generateContent({ model: tier.model, contents, config: { responseMimeType: 'application/json' } }),
                        55000
                    );
                    const parsedData = JSON.parse(response.text);
                    if (tier.model !== 'gemini-3.1-pro-preview') console.info(`Fallback: ${tier.model}`);
                    return { status: 'success', data: parsedData };
                } catch (err) {
                    lastError = err;
                    if (isTransient(err)) { lastRetryableError = err; }
                    else break; // 404 / auth — stop this tier
                }
            }
        }

        throw lastRetryableError || lastError;
    } catch (error) {
        console.error("Vision Error:", error);
        const msg = (error.message || '');
        const friendlyMsg = (msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand') || msg.includes('timed out'))
            ? 'Gemini is under high demand right now — please try again in a moment.'
            : msg || 'Failed to analyze image';
        return { status: 'error', message: friendlyMsg };
    }
};
