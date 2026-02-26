import React, { useState, useRef } from 'react';
import { ArrowRight, Activity, Target, User, Scale, Ruler, FileText, CheckCircle, Upload, Loader2 } from 'lucide-react';
import { calculateBMR, calculateTDEE, generateMacroPlan, parseCoachPlan } from '../utils/calculations';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import './Onboarding.css';

// Set up PDF worker using unpkg CDN based on the installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function Onboarding({ onComplete }) {
    const [step, setStep] = useState(1);
    const [data, setData] = useState({
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
    const [isExtracting, setIsExtracting] = useState(false);
    const fileInputRef = useRef(null);

    const updateData = (field, value) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const calculateMacros = () => {
        const bmr = calculateBMR(data.weight, data.height, data.age, data.gender);
        const tdee = calculateTDEE(bmr, data.activityLevel);
        return generateMacroPlan(data.weight, tdee, data.goal);
    };

    const extractTextFromPDF = async (arrayBuffer) => {
        const loadingTask = pdfjsLib.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            fullText += strings.join(' ') + ' ';
        }
        return fullText;
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsExtracting(true);
        setParsedImportError(false);

        try {
            if (file.type === "application/pdf" || file.name.toLowerCase().endsWith('.pdf')) {
                const arrayBuffer = await file.arrayBuffer();
                const text = await extractTextFromPDF(arrayBuffer);
                setRawPlanText(text);
            } else if (file.name.toLowerCase().endsWith('.docx') || file.type.includes("wordprocessingml.document")) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                setRawPlanText(result.value);
            } else {
                // Assume basic text or csv
                const text = await file.text();
                setRawPlanText(text);
            }
        } catch (error) {
            console.error("Error reading file:", error);
            setParsedImportError(true);
            setRawPlanText("Failed to read document text. Please try pasting instead.");
        } finally {
            setIsExtracting(false);
            if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
        }
    };

    const handleNext = () => {
        if (importMode) {
            const result = parseCoachPlan(rawPlanText);
            if (result.isValid) {
                onComplete(result.plan);
            } else {
                setParsedImportError(true);
            }
            return;
        }

        if (step < 4) {
            setStep(step + 1);
        } else {
            const plan = calculateMacros();
            onComplete(plan);
        }
    };

    return (
        <div className="onboarding-container">
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
                        <p className="editor-desc mb-md">Paste your raw text, or upload a PDF/DOCX. Our AI will automatically extract your Calories, Protein, Carbs, and Fats.</p>

                        <div className="upload-section">
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept=".txt,.csv,.pdf,.doc,.docx"
                                onChange={handleFileUpload}
                            />
                            <button
                                className="upload-btn"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isExtracting}
                            >
                                {isExtracting ? (
                                    <><Loader2 size={16} className="spinner" /> Analyzing Document...</>
                                ) : (
                                    <><Upload size={16} /> Upload Document</>
                                )}
                            </button>
                        </div>

                        <div className="divider-text">OR PASTE TEXT</div>

                        <textarea
                            className="plan-textarea"
                            placeholder="e.g. Here is your plan for the week: 2100 calories, 160g protein, 200g carbs, 70g fats."
                            value={rawPlanText}
                            onChange={(e) => {
                                setRawPlanText(e.target.value);
                                setParsedImportError(false);
                            }}
                            rows={6}
                        />

                        {parsedImportError && !isExtracting && (
                            <div className="error-msg">
                                Could not automatically extract the plan targets. Please ensure Calories and Protein are stated clearly.
                            </div>
                        )}

                        {(rawPlanText.length > 10 && !parsedImportError && !isExtracting) && (
                            <div className="live-preview glass-panel">
                                {(() => {
                                    const result = parseCoachPlan(rawPlanText);
                                    if (!result.isValid) return null;
                                    const p = result.plan;

                                    return (
                                        <>
                                            <div className="preview-title">
                                                <CheckCircle size={16} className="inline-icon" />
                                                {result.isAiDerived ? "AI Derived (Meals Summarized):" : "AI Extracted (Explicit Numbers):"}
                                            </div>
                                            {result.isAiDerived && (
                                                <div className="text-sm text-secondary mb-2" style={{ fontSize: '0.8rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                                                    No explicit daily totals found. AI has estimated your daily macros by analyzing the food list in the document.
                                                </div>
                                            )}
                                            <div className="preview-grid">
                                                <span>🔥 {p.calories || '-'} kcal</span>
                                                <span>🥩 {p.protein || '-'}g Prot</span>
                                                <span>🍞 {p.carbs || '-'}g Carb</span>
                                                <span>🥑 {p.fats || '-'}g Fat</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {step === 1 && (
                            <div className="step-card animate-slide-up">
                                <h3><User size={20} className="inline-icon" /> Basics</h3>

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
        </div>
    );
}
