import React, { useState, useRef } from 'react';
import { X, Mic, Camera, Keyboard, Send, Loader2, Plus, CheckCircle } from 'lucide-react';
import { API_BASE_URL } from '../utils/api';
import './RetroAddMealModal.css';

/**
 * RetroAddMealModal
 * Lets the user add a meal to a past day via text, voice, or camera/file upload.
 * 
 * Props:
 *   isOpen        — boolean
 *   targetDate    — string e.g. "3/2/2026"
 *   onClose       — () => void
 *   onConfirm     — (mealData) => void  where mealData = { desc, macros: {cals,protein,carbs,fiber,fats} }
 */
export default function RetroAddMealModal({ isOpen, targetDate, onClose, onConfirm }) {
    const [activeTab, setActiveTab] = useState('text'); // 'text' | 'voice' | 'camera'
    const [textInput, setTextInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [pendingResult, setPendingResult] = useState(null); // AI result awaiting confirmation

    const recognitionRef = useRef(null);
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    // ── Speech recognition ──────────────────────────────────────────
    const startListening = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setErrorMsg('Speech recognition not supported. Please type instead.'); return; }
        recognitionRef.current = new SR();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.onresult = (e) => {
            let t = '';
            for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
            setTextInput(t);
        };
        recognitionRef.current.onend = () => setIsListening(false);
        recognitionRef.current.onerror = () => setIsListening(false);
        recognitionRef.current.start();
        setIsListening(true);
    };

    const stopListening = () => {
        if (recognitionRef.current) recognitionRef.current.stop();
        setIsListening(false);
    };

    // ── LLM text/voice query ────────────────────────────────────────
    const submitTextQuery = async () => {
        if (!textInput.trim()) return;
        if (isListening) stopListening();
        setIsLoading(true);
        setErrorMsg('');
        setPendingResult(null);
        try {
            const res = await fetch(`${API_BASE_URL}/api/llm-knowledge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantName: textInput.trim(),
                    remainingMacros: { calories: 600, protein: 40, carbs: 60, fats: 20 },
                    weeklyHistory: []
                })
            });
            const data = await res.json();
            if (data.status === 'success' && data.data) {
                const d = data.data;
                // Flatten: for 'log' and 'suggestion' types take first option; for 'info' take first foundMeal
                if ((d.type === 'log' || d.type === 'suggestion') && d.options?.length) {
                    const opt = d.options[0];
                    setPendingResult({
                        desc: opt.title,
                        macros: { cals: opt.cals || 0, protein: opt.protein || 0, carbs: opt.carbs || 0, fiber: opt.fiber || 0, fats: opt.fats || 0 }
                    });
                } else if (d.type === 'info' && d.foundMeals?.length) {
                    const m = d.foundMeals[0];
                    setPendingResult({
                        desc: m.desc,
                        macros: m.macros || { cals: 0, protein: 0, carbs: 0, fiber: 0, fats: 0 }
                    });
                } else {
                    setErrorMsg('No meal found. Try describing it differently.');
                }
            } else {
                setErrorMsg('Could not identify that meal. Please try again.');
            }
        } catch {
            setErrorMsg('Connection error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Camera / file upload ────────────────────────────────────────
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsLoading(true);
        setErrorMsg('');
        setPendingResult(null);
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            // Compress image before sending
            const compressed = await compressImage(base64);
            const res = await fetch(`${API_BASE_URL}/api/vision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: compressed, mode: 'meal', remainingMacros: { calories: 600, protein: 40, carbs: 60, fats: 20 } })
            });
            const data = await res.json();
            if (data.status === 'success' && data.data?.name) {
                const d = data.data;
                setPendingResult({
                    desc: d.name,
                    macros: { cals: d.cals || 0, protein: d.protein || 0, carbs: d.carbs || 0, fiber: d.fiber || 0, fats: d.fats || 0 }
                });
            } else {
                setErrorMsg(data.message || 'Could not analyse image. Please try again.');
            }
        } catch {
            setErrorMsg('Failed to process image. Please try again.');
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const compressImage = (dataUrl) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const MAX = 1280;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
                if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
                else { width = Math.round(width * MAX / height); height = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = dataUrl;
    });

    // ── Confirm adding the pending result ───────────────────────────
    const handleConfirm = () => {
        if (!pendingResult) return;
        onConfirm(pendingResult);
        // Reset state
        setTextInput('');
        setPendingResult(null);
        setErrorMsg('');
    };

    const handleClose = () => {
        stopListening();
        setTextInput('');
        setPendingResult(null);
        setErrorMsg('');
        setIsLoading(false);
        onClose();
    };

    const tabs = [
        { id: 'text', label: 'Text', icon: <Keyboard size={15} /> },
        { id: 'voice', label: 'Voice', icon: <Mic size={15} /> },
        { id: 'camera', label: 'Photo', icon: <Camera size={15} /> },
    ];

    return (
        <div className="retro-overlay" onClick={handleClose}>
            <div className="retro-sheet glass-panel animate-slide-up" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="retro-header">
                    <div>
                        <span className="retro-title">Add Meal</span>
                        <span className="retro-date">{targetDate}</span>
                    </div>
                    <button className="retro-close-btn" onClick={handleClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Tab switcher */}
                <div className="retro-tabs">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            className={`retro-tab ${activeTab === t.id ? 'active' : ''}`}
                            onClick={() => { setActiveTab(t.id); setPendingResult(null); setErrorMsg(''); setTextInput(''); }}
                        >
                            {t.icon}{t.label}
                        </button>
                    ))}
                </div>

                {/* ── Text / Voice input ── */}
                {(activeTab === 'text' || activeTab === 'voice') && (
                    <div className="retro-input-section">
                        <div className="retro-input-row">
                            <input
                                className="retro-text-input"
                                type="text"
                                placeholder={activeTab === 'voice' ? 'Tap the mic and speak...' : 'e.g. Big Mac and large fries'}
                                value={textInput}
                                onChange={e => setTextInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && submitTextQuery()}
                                autoFocus={activeTab === 'text'}
                            />
                            {activeTab === 'voice' && (
                                <button
                                    className={`retro-mic-btn ${isListening ? 'listening' : ''}`}
                                    onClick={isListening ? stopListening : startListening}
                                >
                                    <Mic size={18} className={isListening ? 'animate-pulse' : ''} />
                                </button>
                            )}
                            <button
                                className="retro-send-btn"
                                onClick={submitTextQuery}
                                disabled={!textInput.trim() || isLoading}
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Camera / Photo upload ── */}
                {activeTab === 'camera' && (
                    <div className="retro-input-section">
                        <input
                            ref={fileInputRef}
                            id="retro-file-input"
                            type="file"
                            accept="image/*"
                            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', zIndex: -1 }}
                            onChange={handleFileSelect}
                        />
                        <label
                            htmlFor="retro-file-input"
                            className={`retro-upload-label ${isLoading ? 'loading' : ''}`}
                            onClick={e => isLoading && e.preventDefault()}
                        >
                            {isLoading
                                ? <><Loader2 size={20} className="animate-spin" /> Analysing image...</>
                                : <><Camera size={20} /> Take a photo or choose from gallery</>}
                        </label>
                    </div>
                )}

                {/* Error */}
                {errorMsg && (
                    <p className="retro-error">⚠️ {errorMsg}</p>
                )}

                {/* Pending result card */}
                {pendingResult && (
                    <div className="retro-result-card">
                        <div className="retro-result-name">{pendingResult.desc}</div>
                        <div className="retro-result-macros">
                            <span>🔥 {pendingResult.macros.cals} kcal</span>
                            <span>🥩 {pendingResult.macros.protein}g P</span>
                            <span>🍞 {pendingResult.macros.carbs}g C</span>
                            <span>🥑 {pendingResult.macros.fats}g F</span>
                        </div>
                        <button className="retro-confirm-btn" onClick={handleConfirm}>
                            <CheckCircle size={16} /> Add to {targetDate}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
