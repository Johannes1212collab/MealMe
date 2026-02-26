/**
 * Data store for mock scenarios. 
 * Allows new scenarios without modifying core components (Open/Closed Principle).
 */

export const mockFoodScanResult = {
    type: 'meal',
    name: "Grilled Chicken Salad",
    description: "A healthy mix of fresh greens, cherry tomatoes, cucumbers, and lean grilled chicken breast with a light vinaigrette.",
    cals: 320,
    protein: 35,
    carbs: 12,
    ingredients: [
        "Grilled Chicken Breast (150g)",
        "Mixed Greens (100g)",
        "Cherry Tomatoes (50g)",
        "Vinaigrette Dressing (1 tbsp)"
    ]
};

export const mockIngredientsResult = {
    type: 'ingredients',
    name: "Lemon Herb Chicken with Roasted Broccoli",
    description: "Based on the raw chicken, broccoli, and lemon I see, here is a quick 20-minute macro-friendly dinner recipe.",
    cals: 410,
    protein: 45,
    carbs: 15,
    ingredients: [
        "1 Chicken Breast (seasoned with salt, pepper, lemon juice)",
        "1 cup Broccoli florets (roasted with 1 tsp olive oil)",
        "Air fry chicken for 15 mins at 375°F",
        "Roast broccoli concurrently for 12 mins"
    ]
};

export const mcdonaldsScenario = {
    message: "I see you are at McDonald's. Given your plan today, you have about 760 calories and 65g of protein left for dinner. Here are two great options that keep you perfectly on track:",
    options: [
        {
            title: "Artisan Grilled Chicken Sandwich",
            description: "A solid choice with high protein. Ask for no mayo to save some extra fat.",
            isPerfectMatch: true,
            cals: 380,
            protein: 37,
            carbs: 44
        },
        {
            title: "6-Piece Chicken McNuggets & Side Salad",
            description: "Satisfies the craving while keeping portions controlled.",
            isPerfectMatch: false,
            cals: 265,
            protein: 14,
            carbs: 18
        }
    ]
};
