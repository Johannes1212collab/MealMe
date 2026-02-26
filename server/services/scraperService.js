import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';

/**
 * Service 4: Live Web Scraping
 * 
 * For localized, mid-sized restaurants that have websites but aren't in Supabase.
 * We fetch the raw HTML, strip it to text, and let the LLM parse the menu.
 */
export const scrapeAndAnalyzeMenu = async (restaurantUrl, API_KEY) => {
    try {
        // 1. Fetch raw HTML
        // const { data } = await axios.get(restaurantUrl);

        // 2. Strip to text using Cheerio
        // const $ = cheerio.load(data);
        // const rawText = $('body').text().replace(/\s+/g, ' ').trim();

        // 3. Send text to LLM parser
        // const ai = new GoogleGenAI({ apiKey: API_KEY });
        // const response = await ai.models.generateContent({
        //     model: 'gemini-1.5-flash',
        //     contents: `Find the food items and estimate macros from this website text: ${rawText}`
        // });

        return {
            status: 'success',
            message: `Mock Scraper Response. Hook up Axios to scrape ${restaurantUrl}.`
        };
    } catch (error) {
        console.error("Scraper Error:", error);
        throw error;
    }
};
