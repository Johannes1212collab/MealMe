import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Supabase admin client (server-side)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Basic health check route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'MealMe Live Backend is running' });
});

import { analyzeFoodImage } from './services/visionService.js';
import { getChainMenuFromDB } from './services/databaseService.js';
import { getKnownRestaurantSuggestions } from './services/llmKnowledgeService.js';
import { scrapeAndAnalyzeMenu } from './services/scraperService.js';
import { analyzeDocument } from './services/documentService.js';
import { correctFoodAnalysis } from './services/correctionService.js';
import { sendPushToAll, vapidPublicKey } from './services/pushService.js';

// Route 1: Camera Vision
app.post('/api/vision', async (req, res) => {
    try {
        const { imageBase64, mode, remainingMacros, recipeIntent, perMealTarget } = req.body;
        const result = await analyzeFoodImage(imageBase64, mode, remainingMacros, process.env.GEMINI_API_KEY, recipeIntent, perMealTarget);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route 2: Database Pre-Scraped Menus
app.post('/api/database', async (req, res) => {
    try {
        const { restaurantName } = req.body;
        const result = await getChainMenuFromDB(restaurantName, process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route 3: LLM Native Knowledge Base
app.post('/api/llm-knowledge', async (req, res) => {
    try {
        const { restaurantName, remainingMacros, weeklyHistory, perMealTarget, plannedMeals } = req.body;
        const result = await getKnownRestaurantSuggestions(restaurantName, remainingMacros, weeklyHistory, process.env.GEMINI_API_KEY, perMealTarget, plannedMeals);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route 4: Live Web Scraper
app.post('/api/scrape', async (req, res) => {
    try {
        const { url } = req.body;
        const result = await scrapeAndAnalyzeMenu(url, process.env.GEMINI_API_KEY);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route 5: File / Document Upload Analyzer
app.post('/api/analyze-file', async (req, res) => {
    try {
        const { base64Data, mimeType, remainingMacros } = req.body;
        if (!base64Data || !mimeType) {
            return res.status(400).json({ error: 'base64Data and mimeType are required' });
        }
        const result = await analyzeDocument(base64Data, mimeType, remainingMacros, process.env.GEMINI_API_KEY);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route 6: AI Analysis Correction
app.post('/api/correct-analysis', async (req, res) => {
    try {
        const { previousResult, correctionText } = req.body;
        if (!previousResult || !correctionText) {
            return res.status(400).json({ error: 'previousResult and correctionText are required' });
        }
        const result = await correctFoodAnalysis(previousResult, correctionText, process.env.GEMINI_API_KEY);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── Push Notification Routes ──────────────────────────────────────────────────

// GET VAPID public key (client needs this to subscribe)
app.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: vapidPublicKey });
});

// Save a new push subscription
app.post('/api/push/subscribe', async (req, res) => {
    try {
        const { userId, endpoint, p256dh, auth } = req.body;
        if (!userId || !endpoint || !p256dh || !auth) {
            return res.status(400).json({ error: 'userId, endpoint, p256dh, auth required' });
        }
        // Upsert — one subscription per user/endpoint pair
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({ user_id: userId, endpoint, p256dh, auth }, { onConflict: 'endpoint' });
        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        console.error('Subscribe error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Remove a push subscription
app.delete('/api/push/unsubscribe', async (req, res) => {
    try {
        const { endpoint } = req.body;
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Daily Check-In — node-cron (7:30 AM UTC daily) ───────────────────────────
// NOTE: Render server must stay awake via UptimeRobot /api/health ping (every 14 min)
const sendDailyCheckIn = async () => {
    console.log('[cron] Sending daily meal check-in push...');
    try {
        const { data: subs, error } = await supabase.from('push_subscriptions').select('*');
        if (error) throw error;
        if (!subs || subs.length === 0) return;

        const payload = {
            title: 'Plan your meals for today 🍽️',
            body: 'How many meals are you having today?',
            tag: 'daily-meal-checkin',
            actions: [
                { action: '2', title: '2 meals' },
                { action: '3', title: '3 meals' },
                { action: '4', title: '4 meals' },
                { action: '5', title: '5 meals' },
                { action: '6plus', title: '6+' },
            ],
            data: { url: '/?mealPlan=prompt', type: 'meal-checkin' }
        };

        const expired = await sendPushToAll(subs, payload);

        // Clean up expired subscriptions
        if (expired.length > 0) {
            await supabase.from('push_subscriptions').delete().in('endpoint', expired);
            console.log(`[cron] Removed ${expired.length} expired subscriptions`);
        }

        console.log(`[cron] Sent to ${subs.length} subscribers`);
    } catch (err) {
        console.error('[cron] sendDailyCheckIn error:', err);
    }
};

// Fire at 7:30 AM UTC every day
cron.schedule('30 7 * * *', sendDailyCheckIn, { timezone: 'UTC' });

// Start server
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
