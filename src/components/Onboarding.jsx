import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Activity, Target, User, Scale, FileText, CheckCircle, Upload, Loader2 } from 'lucide-react';
import { calculateBMR, calculateTDEE, generateMacroPlan, parseCoachPlan } from '../utils/calculations';
import { supabase } from '../utils/supabase';
import { API_BASE_URL } from '../utils/api';
import './Onboarding.css';


export default function Onboarding({ onComplete }) {
    const [step, setStep] = useState(1);
    const [data, setData] = useState({
        name: '',
        age: '',
        gender: '',
        weight: '',
        height: '',
        activityLevel: '',
        goal: ''
    });

    // State for importing a coach plan
    const [importMode, setImportMode] = useState(false);
    const [rawPlanText, setRawPlanText] = useState('');
    const [parsedImportError, setParsedImportError] = useState(false);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [fileUploadError, setFileUploadError] = useState('');
    const [showInstallBanner, setShowInstallBanner] = useState(false);
    const [installOS, setInstallOS] = useState('android');
    const planFileRef = useRef(null);

    // Detect in-app browsers (Messenger, Instagram, Facebook, WhatsApp, etc.)
    useEffect(() => {
        const ua = navigator.userAgent || '';
        const inApp = /FBAN|FBAV|FB_IAB|Instagram|MessengerLite|WhatsApp|TikTok|Line\/|MicroMessenger/i.test(ua);
        if (inApp) {
            setShowInstallBanner(true);
            setInstallOS(/iPad|iPhone|iPod/.test(ua) ? 'ios' : 'android');
        }
    }, []);

    // Upload a coach plan file (image or PDF) — AI extracts the macro targets
    const handlePlanFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileUploadError('');
        setIsUploadingFile(true);
        try {
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const res = await fetch(`${API_BASE_URL}/api/analyze-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64Data, mimeType: file.type, fileName: file.name, remainingMacros: {} })
            });
            const result = await res.json();
            if (result.status === 'success' && result.data) {
                const d = result.data;
                const protein = d.protein || 0;
                const carbs = d.carbs || 0;
                const fats = d.fats || 0;
                const calories = d.calories || Math.round((protein * 4) + (carbs * 4) + (fats * 9));
                onComplete({ calories, protein, carbs, fats, tdee: d.tdee || calories + 500, name: data.name });
            } else {
                setFileUploadError('Could not extract plan from this file. Please paste the text below instead.');
            }
        } catch {
            setFileUploadError('Upload failed — check your connection and try again.');
        } finally {
            setIsUploadingFile(false);
            if (planFileRef.current) planFileRef.current.value = '';
        }
    };

    const updateData = (field, value) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const calculateMacros = () => {
        const bmr = calculateBMR(data.weight, data.height, data.age, data.gender);
        const tdee = calculateTDEE(bmr, data.activityLevel);
        return generateMacroPlan(data.weight, tdee, data.goal);
    };

    const handleNext = () => {
        if (importMode) {
            const result = parseCoachPlan(rawPlanText);
            if (result.isValid) {
                onComplete({ ...result.plan, name: data.name });
            } else {
                setParsedImportError(true);
            }
            return;
        }

        if (step < 4) {
            setStep(step + 1);
        } else {
            const plan = calculateMacros();
            onComplete({ ...plan, name: data.name });
        }
    };

    return (
        <div className="onboarding-container">

            {/* Install-to-homescreen banner — shown only inside in-app browsers */}
            {showInstallBanner && (
                <div style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(231,156,74,0.08)', border: '1px solid rgba(231,156,74,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                            <p style={{ color: 'var(--primary-light)', fontWeight: 700, fontSize: '0.88rem', margin: '0 0 4px' }}>📲 Install MealMe on your Home Screen</p>
                            {installOS === 'ios' ? (
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', margin: 0, lineHeight: 1.5 }}>
                                    Tap the <strong style={{ color: '#fff' }}>Share ⬆️</strong> button at the bottom of Safari, then tap <strong style={{ color: '#fff' }}>&ldquo;Add to Home Screen&rdquo;</strong>
                                </p>
                            ) : (
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', margin: 0, lineHeight: 1.5 }}>
                                    Open in <strong style={{ color: '#fff' }}>Chrome</strong>, tap the menu <strong style={{ color: '#fff' }}>⋮</strong>, then <strong style={{ color: '#fff' }}>&ldquo;Add to Home Screen&rdquo;</strong>
                                </p>
                            )}
                        </div>
                        <button onClick={() => setShowInstallBanner(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '1rem', padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
                    </div>
                </div>
            )}

            <div className="onboarding-header">
                <div className="app-logo text-gradient mb-4">MealMe</div>
                <h2>{importMode ? "Import Your Plan" : "Create Your Plan"}</h2>
                {!importMode && (
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${(step / 4) * 100}%` }}></div>
                    </div>
                )}
            </div>

            <div className="onboarding-content">
                <div className="mode-toggle mb-lg">
                    <button
                        className={`mode-btn ${!importMode ? 'active' : ''}`}
                        onClick={() => {
                            setImportMode(false);
                            setParsedImportError(false); // Clear error when switching modes
                        }}
                    >
                        Calculate for Me
                    </button>
                    <button
                        className={`mode-btn ${importMode ? 'active' : ''}`}
                        onClick={() => {
                            setImportMode(true);
                            setParsedImportError(false); // Clear error when switching modes
                        }}
                    >
                        I Have a Coach's Plan
                    </button>
                </div>

                {importMode ? (
                    <div className="step-card animate-slide-up import-card">
                        <h3><FileText size={20} className="inline-icon" /> Import Coach's Plan</h3>
                        <p className="editor-desc mb-md">Scan a photo or PDF of your plan, or paste the text — AI extracts your targets automatically.</p>

                        {/* File upload */}
                        <input ref={planFileRef} id="onboard-plan-file" type="file"
                            accept="image/*,application/pdf,text/plain,.pdf,.txt,.doc,.docx"
                            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', zIndex: -1 }}
                            onChange={handlePlanFileUpload} />
                        <label htmlFor="onboard-plan-file"
                            onClick={e => isUploadingFile && e.preventDefault()}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px', borderRadius: '12px', border: '1.5px dashed rgba(231,156,74,0.45)', background: 'rgba(231,156,74,0.06)', color: isUploadingFile ? 'var(--primary-light)' : 'rgba(255,255,255,0.6)', cursor: isUploadingFile ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-primary)', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box', marginBottom: 14 }}>
                            {isUploadingFile ? <><Loader2 size={18} className="spin-icon" /> Scanning with AI...</> : <><Upload size={17} /> Scan plan photo or PDF</>}
                        </label>
                        {fileUploadError && <p style={{ color: '#f08090', fontSize: '0.8rem', margin: '0 0 10px', lineHeight: 1.4 }}>⚠️ {fileUploadError}</p>}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>or paste text</span>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                        </div>

                        {/*
                          Explicit inline colors here — CSS variables like var(--text-primary) are
                          not always resolved in Messenger / FB in-app browsers, causing
                          invisible text (white-on-white or black-on-black). Hard-coded values fix it.
                        */}
                        <textarea
                            placeholder="e.g. 2100 calories, 160g protein, 200g carbs, 70g fats"
                            value={rawPlanText}
                            onChange={(e) => { setRawPlanText(e.target.value); setParsedImportError(false); }}
                            rows={5}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: 'rgba(0,0,0,0.45)',
                                border: '1px solid rgba(255,255,255,0.14)',
                                borderRadius: '10px', padding: '12px 14px',
                                color: '#ffffff',
                                caretColor: '#ffffff',
                                fontSize: '0.92rem',
                                fontFamily: 'system-ui, sans-serif',
                                lineHeight: 1.5, resize: 'vertical', outline: 'none'
                            }}
                        />

                        {parsedImportError && (
                            <div className="error-msg">Could not extract the plan. Make sure Calories and Protein are stated clearly.</div>
                        )}

                        {rawPlanText.length > 10 && !parsedImportError && (() => {
                            try {
                                const result = parseCoachPlan(rawPlanText);
                                if (!result.isValid) return null;
                                const p = result.plan;
                                return (
                                    <div className="live-preview glass-panel" style={{ marginTop: 10 }}>
                                        <div className="preview-title">
                                            <CheckCircle size={16} className="inline-icon" />
                                            {result.isAiDerived ? 'AI Derived:' : 'Extracted:'}
                                        </div>
                                        <div className="preview-grid">
                                            <span>🔥 {p.calories || '-'} kcal</span>
                                            <span>🥩 {p.protein || '-'}g Prot</span>
                                            <span>🍞 {p.carbs || '-'}g Carb</span>
                                            <span>🥑 {p.fats || '-'}g Fat</span>
                                        </div>
                                    </div>
                                );
                            } catch { return null; }
                        })()}
                    </div>
                ) : (
                    <>
                        {step === 1 && (
                            <div className="step-card animate-slide-up">
                                <h3><User size={20} className="inline-icon" /> Basics</h3>

                                <div className="input-group">
                                    <label>First Name</label>
                                    <input type="text" placeholder="e.g. John" value={data.name} onChange={e => updateData('name', e.target.value)} />
                                </div>

                                <div className="input-group">
                                    <label>Age</label>
                                    <input type="number" placeholder="e.g. 28" value={data.age} onChange={e => updateData('age', e.target.value)} />
                                </div>

                                <div className="input-group">
                                    <label>Sex</label>
                                    <div className="btn-group">
                                        <button
                                            className={`toggle-btn ${data.gender === 'male' ? 'selected' : ''}`}
                                            onClick={() => updateData('gender', 'male')}
                                        >Male</button>
                                        <button
                                            className={`toggle-btn ${data.gender === 'female' ? 'selected' : ''}`}
                                            onClick={() => updateData('gender', 'female')}
                                        >Female</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="step-card animate-slide-up">
                                <h3><Scale size={20} className="inline-icon" /> Measurements</h3>

                                <div className="input-group">
                                    <label>Height (cm)</label>
                                    <input type="number" placeholder="e.g. 175" value={data.height} onChange={e => updateData('height', e.target.value)} />
                                </div>

                                <div className="input-group">
                                    <label>Weight (kg)</label>
                                    <input type="number" placeholder="e.g. 75" value={data.weight} onChange={e => updateData('weight', e.target.value)} />
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="step-card animate-slide-up">
                                <h3><Activity size={20} className="inline-icon" /> Activity Level</h3>

                                <div className="options-list">
                                    {[
                                        { id: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise' },
                                        { id: 'light', label: 'Lightly Active', desc: 'Light exercise 1-3 days/week' },
                                        { id: 'moderate', label: 'Moderately Active', desc: 'Moderate exercise 3-5 days/week' },
                                        { id: 'active', label: 'Very Active', desc: 'Hard exercise 6-7 days/week' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            className={`option-card ${data.activityLevel === opt.id ? 'selected' : ''}`}
                                            onClick={() => updateData('activityLevel', opt.id)}
                                        >
                                            <div className="opt-title">{opt.label}</div>
                                            <div className="opt-desc">{opt.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="step-card animate-slide-up">
                                <h3><Target size={20} className="inline-icon" /> Your Goal</h3>

                                <div className="options-list">
                                    {[
                                        { id: 'lose', label: 'Weight Loss', desc: 'Caloric deficit to shed fat' },
                                        { id: 'recomp', label: 'Body Recomposition', desc: 'Maintain weight, build muscle, lose fat' },
                                        { id: 'gain', label: 'Weight/Muscle Gain', desc: 'Caloric surplus to build mass' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            className={`option-card ${data.goal === opt.id ? 'selected' : ''}`}
                                            onClick={() => updateData('goal', opt.id)}
                                        >
                                            <div className="opt-title">{opt.label}</div>
                                            <div className="opt-desc">{opt.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="onboarding-footer">
                {(!importMode && step > 1) && (
                    <button className="back-btn" onClick={() => setStep(step - 1)}>Back</button>
                )}
                <button
                    className="next-btn"
                    onClick={handleNext}
                >
                    {importMode ? 'Import Plan' : (step === 4 ? 'Generate Plan' : 'Next')} <ArrowRight size={18} />
                </button>
            </div>

            {/* Escape hatch for existing users who land here incorrectly */}
            <button
                onClick={async () => { await supabase.auth.signOut(); }}
                style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    fontSize: '0.75rem', cursor: 'pointer', marginTop: '16px',
                    fontFamily: 'var(--font-primary)', opacity: 0.7, padding: '4px 8px'
                }}
            >
                Already set up? Sign out →
            </button>
        </div>
    );
}
