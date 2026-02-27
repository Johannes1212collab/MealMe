import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Basic health check route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'MealMe Live Backend is running' });
});

import { analyzeFoodImage } from './services/visionService.js';
import { getChainMenuFromDB } from './services/databaseService.js';
import { getKnownRestaurantSuggestions } from './services/llmKnowledgeService.js';
import { scrapeAndAnalyzeMenu } from './services/scraperService.js';
import { analyzeDocument } from './services/documentService.js';

// Route 1: Camera Vision
app.post('/api/vision', async (req, res) => {
    try {
        const { imageBase64, mode, remainingMacros } = req.body;
        const result = await analyzeFoodImage(imageBase64, mode, remainingMacros, process.env.GEMINI_API_KEY);
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
        const { restaurantName, remainingMacros, weeklyHistory } = req.body;
        const result = await getKnownRestaurantSuggestions(restaurantName, remainingMacros, weeklyHistory, process.env.GEMINI_API_KEY);
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

// Start server
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
