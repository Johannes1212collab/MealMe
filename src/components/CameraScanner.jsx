import React, { useState, useRef, useEffect } from 'react';
import { X, Zap, Image as ImageIcon, Mic, MicOff, ChefHat, ArrowLeft, Send } from 'lucide-react';
import './CameraScanner.css';
import { API_BASE_URL } from '../utils/api';

export default function CameraScanner({ isOpen, onClose, onCapture, remainingMacros }) {
    const [isScanning, setIsScanning] = useState(false);
    const [scanMode, setScanMode] = useState('meal');
    const [scanStep, setScanStep] = useState('capture');
    const [pendingImage, setPendingImage] = useState(null);
    const [recipeIntent, setRecipeIntent] = useState('');
    const [menuMealType, setMenuMealType] = useState('full meal'); // 'snack' | 'full meal' | 'dessert'
    const [isListeningIntent, setIsListeningIntent] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState(false);

    const intentRecognitionRef = useRef(null);
    const galleryInputRef = useRef(null);
    const cameraFallbackRef = useRef(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    // ── Live camera stream ─────────────────────────────────────────
    useEffect(() => {
        if (!isOpen || scanStep !== 'capture') return;
        let cancelled = false;
        setCameraReady(false);
        setCameraError(false);

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // Use oncanplay instead of onloadedmetadata so we know
                    // the first actual video frame is available before marking ready.
                    videoRef.current.oncanplay = () => { if (!cancelled) setCameraReady(true); };
                }
            } catch {
                if (!cancelled) setCameraError(true);
            }
        };

        startCamera();
        return () => {
            cancelled = true;
            stopStream();
        };
    }, [isOpen, scanStep]);

    const stopStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setCameraReady(false);
    };

    // ── Helpers ────────────────────────────────────────────────────
    const resetState = () => {
        setScanStep('capture');
        setPendingImage(null);
        setRecipeIntent('');
        setMenuMealType('full meal');
        setIsScanning(false);
        setIsListeningIntent(false);
    };

    const handleClose = () => {
        stopStream();
        resetState();
        onClose();
    };

    const handleModeChange = newMode => {
        resetState();
        setScanMode(newMode);
    };

    const abortRef = useRef(null);

    const submitToAPI = async (base64String, mode, intent) => {
        setScanStep('scanning');
        setIsScanning(true);
        const controller = new AbortController();
        abortRef.current = controller;
        // 45-second safety timeout — if Gemini doesn't respond, don't leave user stuck
        const timer = setTimeout(() => controller.abort(), 45000);
        try {
            const response = await fetch(`${API_BASE_URL}/api/vision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64String, mode, remainingMacros, recipeIntent: intent || undefined }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            const json = await response.json();
            setIsScanning(false);
            resetState();
            onCapture(mode, json.status === 'success' ? json.data : { error: true, message: json.message });
        } catch (err) {
            clearTimeout(timer);
            setIsScanning(false);
            resetState();
            const msg = err.name === 'AbortError' ? 'Request timed out — please try again.' : 'Failed to connect';
            onCapture(mode, { error: true, message: msg });
        }
    };

    const cancelScan = () => {
        abortRef.current?.abort();
        resetState();
    };

    // ── Capture button: trigger native camera picker → FileReader ──────────────
    // Stream stays live until the photo comes back from the native camera.
    // handleFileSelect calls stopStream() once the file is received.
    const captureFromVideo = () => {
        cameraFallbackRef.current?.click();
    };

    // ── File picker (gallery / native camera) ──────────────────────
    // Compress before sending: phone camera JPEGs are 10-20MB; base64 makes
    // them even larger and will exceed most server platform request limits.
    // We resize to ≤1280px longest-side at JPEG 0.82, keeping Gemini accuracy
    // while keeping the payload under ~500KB.
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

    const handleFileSelect = async e => {
        const file = e.target.files[0];
        if (!file) return;
        const previewUrl = URL.createObjectURL(file);
        const reader = new FileReader();
        reader.onloadend = async () => {
            stopStream();
            const compressed = await compressImage(reader.result);
            setPendingImage({ base64: compressed, previewUrl });
            if (scanMode === 'ingredients') {
                setScanStep('intent');
            } else if (scanMode === 'menu') {
                setScanStep('menuIntent');
            } else {
                await submitToAPI(compressed, scanMode, null);
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };


    // ── Voice intent ───────────────────────────────────────────────
    const handleIntentSubmit = async () => {
        if (!pendingImage) return;
        await submitToAPI(pendingImage.base64, 'ingredients', recipeIntent.trim());
    };

    const toggleVoiceIntent = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;
        if (isListeningIntent) { intentRecognitionRef.current?.stop(); setIsListeningIntent(false); return; }
        const rec = new SR();
        intentRecognitionRef.current = rec;
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.onresult = e => { setRecipeIntent(e.results[0][0].transcript); setIsListeningIntent(false); };
        rec.onerror = () => setIsListeningIntent(false);
        rec.onend = () => setIsListeningIntent(false);
        rec.start();
        setIsListeningIntent(true);
    };

    if (!isOpen) return null;

    // ── Menu mealType step ─────────────────────────────────────────
    if (scanStep === 'menuIntent') {
        const mealTypes = [
            { id: 'snack', label: 'Snack', desc: 'Light, 200–400 kcal' },
            { id: 'full meal', label: 'Full Meal', desc: 'Balanced, 400–800 kcal' },
            { id: 'dessert', label: 'Dessert', desc: 'Sweet treat' },
        ];
        return (
            <div className="camera-overlay">
                <div className="camera-header camera-header-float">
                    <button className="icon-btn" onClick={() => { setScanStep('capture'); setPendingImage(null); }}>
                        <ArrowLeft size={24} />
                    </button>
                    <div className="camera-title">What are you after?</div>
                    <button className="icon-btn" onClick={handleClose}><X size={24} /></button>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', gap: '14px', overflowY: 'auto' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.4, textAlign: 'center' }}>
                        Tell MealMe what kind of option you're looking for and it'll pick the best match from the menu.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {mealTypes.map(mt => (
                            <button key={mt.id} onClick={() => setMenuMealType(mt.id)}
                                style={{
                                    padding: '14px 18px', borderRadius: '12px', border: `1px solid ${menuMealType === mt.id ? 'rgba(231,156,74,0.6)' : 'rgba(255,255,255,0.1)'}`,
                                    background: menuMealType === mt.id ? 'rgba(231,156,74,0.12)' : 'rgba(255,255,255,0.03)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    fontFamily: 'var(--font-primary)', transition: 'all 0.2s'
                                }}
                            >
                                <span style={{ color: menuMealType === mt.id ? 'var(--primary-light)' : 'var(--text-primary)', fontWeight: '600', fontSize: '1rem' }}>{mt.label}</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{mt.desc}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => submitToAPI(pendingImage.base64, 'menu', menuMealType)}
                        disabled={!pendingImage}
                        style={{ marginTop: 'auto', padding: '14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, var(--primary-light), var(--accent-secondary))', color: '#0e0c13', fontWeight: '700', fontSize: '1rem', fontFamily: 'var(--font-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        <ChefHat size={18} /> Find Best {menuMealType.charAt(0).toUpperCase() + menuMealType.slice(1)}
                    </button>
                </div>
            </div>
        );
    }

    if (scanStep === 'intent') {
        return (
            <div className="camera-overlay">
                <div className="camera-header camera-header-float">
                    <button className="icon-btn" onClick={() => { setScanStep('capture'); setPendingImage(null); setRecipeIntent(''); }}>
                        <ArrowLeft size={24} />
                    </button>
                    <div className="camera-title">What are you making?</div>
                    <button className="icon-btn" onClick={handleClose}><X size={24} /></button>
                </div>
                {pendingImage && (
                    <div style={{ padding: '0 20px 0', display: 'flex', justifyContent: 'center' }}>
                        <img src={pendingImage.previewUrl} alt="Your ingredients" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: '14px', opacity: 0.85 }} />
                    </div>
                )}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', gap: '14px', overflowY: 'auto' }}>
                    <div style={{ textAlign: 'center' }}>
                        <ChefHat size={28} color="var(--primary-light)" style={{ marginBottom: '6px' }} />
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.4 }}>
                            Tell me the dish and I'll calculate exact macros.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder='e.g. "spaghetti bolognese"'
                            value={recipeIntent}
                            onChange={e => setRecipeIntent(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleIntentSubmit()}
                            autoFocus
                            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '12px 14px', color: 'var(--text-primary)', fontSize: '0.95rem', fontFamily: 'var(--font-primary)', outline: 'none' }}
                        />
                        <button onClick={toggleVoiceIntent}
                            style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: isListeningIntent ? 'rgba(229,90,106,0.2)' : 'rgba(231,156,74,0.15)', color: isListeningIntent ? '#e55a6a' : 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            {isListeningIntent ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    </div>
                    <div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Quick picks</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {['Pasta', 'Stir fry', 'Curry', 'Salad', 'Soup', 'Fried rice', 'Tacos', 'Burger'].map(dish => (
                                <button key={dish} onClick={() => setRecipeIntent(dish)}
                                    style={{ padding: '6px 14px', borderRadius: '20px', border: `1px solid ${recipeIntent === dish ? 'rgba(231,156,74,0.5)' : 'rgba(255,255,255,0.1)'}`, background: recipeIntent === dish ? 'rgba(231,156,74,0.12)' : 'rgba(255,255,255,0.03)', color: recipeIntent === dish ? 'var(--primary-light)' : 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--font-primary)', cursor: 'pointer' }}>
                                    {dish}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button onClick={handleIntentSubmit} disabled={!pendingImage}
                        style={{ marginTop: 'auto', padding: '14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, var(--primary-light), var(--accent-secondary))', color: '#0e0c13', fontWeight: '700', fontSize: '1rem', fontFamily: 'var(--font-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {recipeIntent ? <><ChefHat size={18} /> Calculate {recipeIntent}</> : <><Send size={18} /> Analyse Ingredients</>}
                    </button>
                </div>
            </div>
        );
    }

    // ── Scanning screen ────────────────────────────────────────────
    if (scanStep === 'scanning') {
        return (
            <div className="camera-overlay" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
                <div className="viewfinder-overlay" style={{ position: 'relative', width: '78%', aspectRatio: '3/4', maxHeight: '52vh' }}>
                    {pendingImage && (
                        <img src={pendingImage.previewUrl} alt="Scanning"
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.65, borderRadius: '8px' }} />
                    )}
                    <div className="corner top-left" /><div className="corner top-right" />
                    <div className="corner bottom-left" /><div className="corner bottom-right" />
                    <div className="scan-line" />
                    <div className="camera-hint">
                        {recipeIntent ? `Calculating macros for ${recipeIntent}…` : 'AI analysing…'}
                    </div>
                </div>
                <button onClick={cancelScan}
                    style={{ padding: '10px 28px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-primary)', fontSize: '0.88rem', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
                    Cancel
                </button>
            </div>
        );
    }

    // ── Main capture screen (live camera) ─────────────────────────
    return (
        <div className="camera-overlay">
            {/* Live video fills the background */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video-bg"
            />

            {/* Floating header */}
            <div className="camera-header camera-header-float">
                <button className="icon-btn" onClick={handleClose}><X size={24} /></button>
                <div className="camera-title">
                    {scanMode === 'meal' ? 'Scan Food' : scanMode === 'ingredients' ? 'Scan Ingredients' : 'Scan Menu'}
                </div>
                <button className="icon-btn"><Zap size={24} /></button>
            </div>

            {/* Middle zone fills remaining space — viewfinder is centred within it */}
            <div className="camera-viewfinder-area">
                <div className="viewfinder-overlay">
                    <div className="corner top-left" /><div className="corner top-right" />
                    <div className="corner bottom-left" /><div className="corner bottom-right" />
                    <div className="camera-hint">
                        {cameraError
                            ? 'Tap capture to open camera'
                            : !cameraReady
                                ? 'Starting camera…'
                                : scanMode === 'ingredients'
                                    ? 'Snap your ingredients'
                                    : scanMode === 'menu'
                                        ? 'Point at the full menu page'
                                        : 'Point at your food'}
                    </div>
                </div>
            </div>

            {/* Floating bottom controls */}
            <div className="camera-controls camera-controls-float">
                <div className="mode-selector">
                    <button className={`mode-btn ${scanMode === 'meal' ? 'active' : ''}`} onClick={() => handleModeChange('meal')}>Meal</button>
                    <button className={`mode-btn ${scanMode === 'ingredients' ? 'active' : ''}`} onClick={() => handleModeChange('ingredients')}>Ingredients</button>
                    <button className={`mode-btn ${scanMode === 'menu' ? 'active' : ''}`} onClick={() => handleModeChange('menu')}>Menu</button>
                </div>
                <div className="camera-actions-row">
                    <button className="gallery-btn" onClick={() => galleryInputRef.current?.click()}>
                        <ImageIcon size={24} />
                    </button>
                    <button className="capture-btn" onClick={captureFromVideo}>
                        <div className="capture-inner" />
                    </button>
                    <div className="action-spacer" />
                </div>
            </div>

            {/* Hidden inputs */}
            <input type="file" ref={galleryInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
            <input type="file" ref={cameraFallbackRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>
    );
}
