import React, { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, Flame, Target, Activity, ChefHat, Mic, Send, Loader2, RotateCcw } from 'lucide-react';
import { API_BASE_URL } from '../utils/api';
import './AnalysisResults.css';

export default function AnalysisResults({ isVisible, onClose, resultData, onAdd, onResultUpdate }) {
    const [localResult, setLocalResult] = useState(resultData);
    const [correctionText, setCorrectionText] = useState('');
    const [isRefining, setIsRefining] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [wasCorreted, setWasCorrected] = useState(false);
    const recognitionRef = useRef(null);
    const inputRef = useRef(null);

    // Sync localResult when resultData prop changes (new scan)
    useEffect(() => {
        setLocalResult(resultData);
        setWasCorrected(false);
        setCorrectionText('');
    }, [resultData]);

    if (!isVisible || !localResult) return null;

    const isRecipe = localResult.type === 'ingredients';

    const parseMarkdown = (text) => {
        if (!text) return null;
        return text.split('\n').map((line, idx) => {
            const parts = line.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} style={{ color: 'var(--primary-light)' }}>{part.slice(2, -2)}</strong>;
                }
                return part;
            });
            return <p key={idx} style={{ marginBottom: '8px' }}>{parts}</p>;
        });
    };

    const handleCorrection = async () => {
        if (!correctionText.trim() || isRefining) return;
        setIsRefining(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/correct-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    previousResult: localResult,
                    correctionText: correctionText.trim()
                })
            });
            const result = await response.json();
            if (result.status === 'success' && result.data) {
                setLocalResult(result.data);
                setWasCorrected(true);
                setCorrectionText('');
                if (onResultUpdate) onResultUpdate(result.data);
            }
        } catch (err) {
            console.error('Correction error:', err);
        } finally {
            setIsRefining(false);
        }
    };

    const startVoiceCorrection = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            setCorrectionText(transcript);
        };
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleCorrection();
        }
    };

    return (
        <div className="analysis-overlay">
            <div className="analysis-panel glass-panel animate-slide-up">
                <div className="panel-header">
                    <div className="agent-badge">
                        {isRecipe ? 'Generated Recipe' : 'Food Analysis'}
                        {wasCorreted && <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: 'rgba(45,212,191,0.2)', color: 'var(--primary-light)', padding: '2px 8px', borderRadius: '20px' }}>✓ Corrected</span>}
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="panel-content">
                    <div className="image-thumbnail">
                        <div className="thumbnail-icon">{isRecipe ? '🥦' : '📸'}</div>
                        <div className="thumbnail-label">
                            {isRecipe ? 'Ingredients Recognized' : 'Image Captured'}
                        </div>
                    </div>

                    <h3 className="food-title">
                        {isRecipe && <ChefHat size={20} className="inline-icon" />}
                        {localResult.name}
                    </h3>
                    <p className="food-desc">{localResult.description}</p>

                    <div className="macros-breakdown">
                        <div className="macro-box cals">
                            <Flame size={18} />
                            <span className="macro-val">{localResult.cals}</span>
                            <span className="macro-lbl">kcal</span>
                        </div>
                        <div className="macro-box prot">
                            <Target size={18} />
                            <span className="macro-val">{localResult.protein}g</span>
                            <span className="macro-lbl">Protein</span>
                        </div>
                        <div className="macro-box carbs">
                            <Activity size={18} />
                            <span className="macro-val">{localResult.carbs}g</span>
                            <span className="macro-lbl">Carbs</span>
                        </div>
                    </div>

                    <div className="ingredients-list">
                        <h4>AI Analysis Notes:</h4>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                            {parseMarkdown(localResult.details) || <p>A delicious looking meal successfully identified.</p>}
                        </div>
                    </div>

                    {/* Correction Input */}
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <RotateCcw size={13} /> Need to correct something?
                        </label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                ref={inputRef}
                                type="text"
                                value={correctionText}
                                onChange={(e) => setCorrectionText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={`e.g. "actually 3 eggs not 1"`}
                                disabled={isRefining}
                                style={{
                                    flex: 1,
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.9rem',
                                    fontFamily: 'var(--font-primary)',
                                    outline: 'none',
                                    transition: 'border-color 0.2s ease'
                                }}
                            />
                            <button
                                onClick={startVoiceCorrection}
                                title={isListening ? 'Stop listening' : 'Dictate correction'}
                                style={{
                                    width: '40px', height: '40px', borderRadius: '50%', border: 'none', flexShrink: 0,
                                    background: isListening ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                                    color: isListening ? '#ef4444' : 'var(--text-secondary)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <Mic size={16} />
                            </button>
                            <button
                                onClick={handleCorrection}
                                disabled={!correctionText.trim() || isRefining}
                                title="Apply correction"
                                style={{
                                    width: '40px', height: '40px', borderRadius: '50%', border: 'none', flexShrink: 0,
                                    background: correctionText.trim() ? 'linear-gradient(135deg, var(--primary-light) 0%, #00d2ff 100%)' : 'rgba(255,255,255,0.05)',
                                    color: correctionText.trim() ? '#000' : 'var(--text-secondary)',
                                    cursor: correctionText.trim() ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isRefining ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                            </button>
                        </div>
                        {isListening && (
                            <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                                Listening... speak your correction
                            </p>
                        )}
                        {isRefining && (
                            <p style={{ color: 'var(--primary-light)', fontSize: '0.78rem', margin: 0 }}>
                                Recalculating macros...
                            </p>
                        )}
                    </div>

                    <button className="add-to-plan-btn" onClick={() => onAdd(localResult)} style={{ marginTop: '16px' }}>
                        <CheckCircle size={18} /> Add to Today's Plan
                    </button>
                </div>
            </div>
        </div>
    );
}
