import React, { useState, useRef } from 'react';
import { Camera, X, Zap, Image as ImageIcon, Mic, MicOff, ChefHat, ArrowLeft, Send, Loader2 } from 'lucide-react';
import './CameraScanner.css';
import { API_BASE_URL } from '../utils/api';

export default function CameraScanner({ isOpen, onClose, onCapture, remainingMacros }) {
    const [isScanning, setIsScanning] = useState(false);
    const [scanMode, setScanMode] = useState('meal'); // 'meal' or 'ingredients'

    // Recipe-intent flow states
    const [scanStep, setScanStep] = useState('capture'); // 'capture' | 'intent' | 'scanning'
    const [pendingImage, setPendingImage] = useState(null); // { base64, previewUrl }
    const [recipeIntent, setRecipeIntent] = useState('');
    const [isListeningIntent, setIsListeningIntent] = useState(false);
    const intentRecognitionRef = useRef(null);

    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const [selectedImage, setSelectedImage] = useState(null);

    const resetState = () => {
        setScanStep('capture');
        setPendingImage(null);
        setRecipeIntent('');
        setSelectedImage(null);
        setIsScanning(false);
        setIsListeningIntent(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    // Called when mode changes — reset the capture flow
    const handleModeChange = (newMode) => {
        resetState();
        setScanMode(newMode);
    };

    // Submit captured photo (and optional intent) to API
    const submitToAPI = async (base64String, mode, intent) => {
        setScanStep('scanning');
        setIsScanning(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/vision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: base64String,
                    mode,
                    remainingMacros,
                    recipeIntent: intent || undefined
                })
            });

            const json = await response.json();
            setIsScanning(false);
            resetState();

            if (json.status === 'success') {
                onCapture(mode, json.data);
            } else {
                onCapture(mode, { error: true, message: json.message });
            }
        } catch (err) {
            console.error('Camera API Error:', err);
            setIsScanning(false);
            resetState();
            onCapture(mode, { error: true, message: 'Failed to connect' });
        }
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const previewUrl = URL.createObjectURL(file);
        setSelectedImage(previewUrl);

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result;

            if (scanMode === 'ingredients') {
                // Store the image and show the intent panel
                setPendingImage({ base64: base64String, previewUrl });
                setScanStep('intent');
            } else {
                // Meal mode — send straight away
                await submitToAPI(base64String, scanMode, null);
            }
        };
        reader.readAsDataURL(file);

        // Clear input so the same file can be re-selected after retake
        e.target.value = '';
    };

    const handleIntentSubmit = async () => {
        if (!pendingImage) return;
        await submitToAPI(pendingImage.base64, 'ingredients', recipeIntent.trim());
    };

    const toggleVoiceIntent = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (isListeningIntent) {
            intentRecognitionRef.current?.stop();
            setIsListeningIntent(false);
            return;
        }

        const recognition = new SpeechRecognition();
        intentRecognitionRef.current = recognition;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.onresult = (e) => {
            setRecipeIntent(e.results[0][0].transcript);
            setIsListeningIntent(false);
        };
        recognition.onerror = () => setIsListeningIntent(false);
        recognition.onend = () => setIsListeningIntent(false);
        recognition.start();
        setIsListeningIntent(true);
    };

    if (!isOpen) return null;

    // ─── Intent input screen (ingredients mode only) ─────────────
    if (scanStep === 'intent') {
        return (
            <div className="camera-overlay">
                <div className="camera-header">
                    <button className="icon-btn" onClick={() => { setScanStep('capture'); setPendingImage(null); setRecipeIntent(''); }}>
                        <ArrowLeft size={24} />
                    </button>
                    <div className="camera-title">What are you making?</div>
                    <button className="icon-btn" onClick={handleClose}><X size={24} /></button>
                </div>

                {/* Ingredients thumbnail */}
                {pendingImage && (
                    <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'center' }}>
                        <img
                            src={pendingImage.previewUrl}
                            alt="Your ingredients"
                            style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: '14px', opacity: 0.85 }}
                        />
                    </div>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', gap: '16px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <ChefHat size={28} color="var(--primary-light)" style={{ marginBottom: '8px' }} />
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.4 }}>
                            Tell me what dish you're making and I'll calculate the exact macros and suggest a serving size.
                        </p>
                    </div>

                    {/* Text + voice input */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder='e.g. "spaghetti bolognese" or "chicken stir fry"'
                            value={recipeIntent}
                            onChange={(e) => setRecipeIntent(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleIntentSubmit()}
                            autoFocus
                            style={{
                                flex: 1, background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '12px', padding: '12px 14px',
                                color: 'var(--text-primary)', fontSize: '0.95rem',
                                fontFamily: 'var(--font-primary)', outline: 'none'
                            }}
                        />
                        <button
                            onClick={toggleVoiceIntent}
                            style={{
                                width: 46, height: 46, borderRadius: '50%', border: 'none',
                                background: isListeningIntent ? 'rgba(229,90,106,0.2)' : 'rgba(231,156,74,0.15)',
                                color: isListeningIntent ? '#e55a6a' : 'var(--primary-light)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0,
                                animation: isListeningIntent ? 'pulseGlow 1.5s infinite' : 'none'
                            }}
                        >
                            {isListeningIntent ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    </div>

                    {/* Quick suggestions */}
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Quick picks</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {['Pasta', 'Stir fry', 'Curry', 'Salad', 'Soup', 'Fried rice', 'Tacos', 'Burger'].map(dish => (
                                <button
                                    key={dish}
                                    onClick={() => setRecipeIntent(dish)}
                                    style={{
                                        padding: '6px 14px', borderRadius: '20px',
                                        border: `1px solid ${recipeIntent === dish ? 'rgba(231,156,74,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                        background: recipeIntent === dish ? 'rgba(231,156,74,0.12)' : 'rgba(255,255,255,0.03)',
                                        color: recipeIntent === dish ? 'var(--primary-light)' : 'var(--text-secondary)',
                                        fontSize: '0.82rem', fontFamily: 'var(--font-primary)', cursor: 'pointer'
                                    }}
                                >
                                    {dish}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleIntentSubmit}
                        disabled={!pendingImage}
                        style={{
                            marginTop: 'auto', padding: '14px', borderRadius: '14px', border: 'none',
                            background: 'linear-gradient(135deg, var(--primary-light), var(--accent-secondary))',
                            color: '#0e0c13', fontWeight: '700', fontSize: '1rem',
                            fontFamily: 'var(--font-primary)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                    >
                        {recipeIntent ? <><ChefHat size={18} /> Calculate {recipeIntent}</> : <><Send size={18} /> Analyse Ingredients</>}
                    </button>
                </div>
            </div>
        );
    }

    // ─── Scanning / loading screen ────────────────────────────────
    if (scanStep === 'scanning') {
        return (
            <div className="camera-overlay" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <div className="viewfinder-container">
                    <div className="viewfinder-frame scanning">
                        {pendingImage && (
                            <img src={pendingImage.previewUrl} alt="Scanning"
                                style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />
                        )}
                        <div className="scan-line" />
                        <div className="camera-hint" style={{ zIndex: 1, position: 'relative' }}>
                            {recipeIntent ? `Calculating macros for ${recipeIntent}...` : 'AI analysing ingredients...'}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Default capture screen ───────────────────────────────────
    return (
        <div className="camera-overlay">
            <div className="camera-header">
                <button className="icon-btn" onClick={handleClose}>
                    <X size={24} />
                </button>
                <div className="camera-title">
                    {scanMode === 'meal' ? 'Scan Food' : 'Scan Ingredients'}
                </div>
                <button className="icon-btn">
                    <Zap size={24} />
                </button>
            </div>

            <div className="viewfinder-container">
                <div className={`viewfinder-frame ${isScanning ? 'scanning' : ''}`}>
                    {selectedImage && (
                        <img
                            src={selectedImage}
                            alt="Scan target"
                            style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, zIndex: 0 }}
                        />
                    )}

                    <div className="corner top-left"></div>
                    <div className="corner top-right"></div>
                    <div className="corner bottom-left"></div>
                    <div className="corner bottom-right"></div>

                    {isScanning && <div className="scan-line"></div>}

                    <div className="camera-hint" style={{ zIndex: 1, position: 'relative' }}>
                        {isScanning ? 'AI analyzing image...' :
                            scanMode === 'ingredients' ? 'Snap your ingredients — you\'ll describe the dish next' :
                                'Tap capture to upload photo'}
                    </div>
                </div>
            </div>

            {/* Hidden Inputs */}
            <input type="file" ref={cameraInputRef} accept="image/*" capture="environment"
                style={{ display: 'none' }} onChange={handleFileSelect} />
            <input type="file" ref={galleryInputRef} accept="image/*"
                style={{ display: 'none' }} onChange={handleFileSelect} />

            <div className="camera-controls">
                <div className="mode-selector">
                    <button className={`mode-btn ${scanMode === 'meal' ? 'active' : ''}`}
                        onClick={() => handleModeChange('meal')} disabled={isScanning}>
                        Meal
                    </button>
                    <button className={`mode-btn ${scanMode === 'ingredients' ? 'active' : ''}`}
                        onClick={() => handleModeChange('ingredients')} disabled={isScanning}>
                        Ingredients
                    </button>
                </div>

                <div className="camera-actions-row">
                    <button className="gallery-btn" onClick={() => galleryInputRef.current?.click()} disabled={isScanning}>
                        <ImageIcon size={24} />
                    </button>

                    <button className={`capture-btn ${isScanning ? 'disabled' : ''}`}
                        onClick={() => cameraInputRef.current?.click()} disabled={isScanning}>
                        <div className="capture-inner"></div>
                    </button>

                    <div className="action-spacer"></div>
                </div>
            </div>
        </div>
    );
}
