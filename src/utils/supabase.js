import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase environment variables are missing. Please check your .env.local file.");
}

/**
 * IndexedDB-backed storage adapter for Supabase Auth.
 *
 * iOS Safari's Intelligent Tracking Prevention (ITP) aggressively clears
 * localStorage for sites that haven't been interacted with recently — even
 * for PWAs installed to the home screen. IndexedDB is treated as a separate,
 * more persistent store and survives these clears.
 *
 * Falls back silently to null/no-op on any error so auth still works.
 */
function createIDBStorage(storeName = 'auth') {
    const DB_NAME = 'mealme-persistence';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => reject(req.error);
        });
    }

    return {
        async getItem(key) {
            try {
                const db = await openDB();
                return new Promise((resolve) => {
                    const tx = db.transaction(storeName, 'readonly');
                    const req = tx.objectStore(storeName).get(key);
                    req.onsuccess = () => resolve(req.result ?? null);
                    req.onerror = () => resolve(null);
                });
            } catch {
                // Fall back to localStorage if IndexedDB is unavailable
                try { return localStorage.getItem(key); } catch { return null; }
            }
        },
        async setItem(key, value) {
            try {
                const db = await openDB();
                await new Promise((resolve) => {
                    const tx = db.transaction(storeName, 'readwrite');
                    tx.objectStore(storeName).put(value, key);
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                });
            } catch {
                try { localStorage.setItem(key, value); } catch { }
            }
        },
        async removeItem(key) {
            try {
                const db = await openDB();
                await new Promise((resolve) => {
                    const tx = db.transaction(storeName, 'readwrite');
                    tx.objectStore(storeName).delete(key);
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                });
            } catch {
                try { localStorage.removeItem(key); } catch { }
            }
        }
    };
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
        storage: createIDBStorage(),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
    }
});
