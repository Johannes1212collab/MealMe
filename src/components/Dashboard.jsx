import React, { useState, useEffect, useRef } from 'react';
import { Target, Flame, Activity, Settings2, ChevronDown, ChevronUp, CalendarDays, RotateCcw, ClipboardList, Upload, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../utils/api';
import './Dashboard.css';

export default function Dashboard({ macroPlan, consumedMacros, mealResponses, userName, weeklyHistory = [], onPlanUpdate, onReaddMeal, onCoachPlanUpdate, onEditMealPortion }) {
    const [isEditingProtein, setIsEditingProtein] = useState(false); // kept for prop compatibility
    const [expandedMealIndex, setExpandedMealIndex] = useState(null);
    const [editingMacro, setEditingMacro] = useState(null); // 'protein' | 'carbs' | 'fats'
    const [macroInputValue, setMacroInputValue] = useState('');

    const [coachPlanDraft, setCoachPlanDraft] = useState({ calories: '', protein: '', carbs: '', fats: '', tdee: '' });
    const [isEditingCoachPlan, setIsEditingCoachPlan] = useState(false);
    const [isUploadingPlan, setIsUploadingPlan] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [selectedHistoryDate, setSelectedHistoryDate] = useState(null);
    const planFileInputRef = useRef(null); // MUST be declared — used in the plan scan input

    const totalWeeklyDeficit = weeklyHistory.reduce((sum, day) => sum + (day.netDeficit || 0), 0);
    const weeklyWeightLossPace = (totalWeeklyDeficit / 3500).toFixed(2);

    const toggleMealExpand = (index) => {
        setExpandedMealIndex(expandedMealIndex === index ? null : index);
    };

    // Use either the provided dynamic plan or fallback to mock data
    const plan = macroPlan || {
        calories: 2000,
        protein: 150,
        carbs: 200,
        fats: 65,
        tdee: 2200
    };


    // Real consumed values
    const consumed = consumedMacros || {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
    };

    const openMacroEdit = (macro) => {
        setEditingMacro(macro);
        setMacroInputValue(String(plan[macro]));
    };

    const cancelMacroEdit = () => setEditingMacro(null);

    const saveMacroEdit = () => {
        const newVal = parseInt(macroInputValue);
        if (!newVal || newVal < 1) { setEditingMacro(null); return; }
        const targetCals = plan.calories;
        let newPlan = { ...plan };

        const rebalanceOtherTwo = (lockedMacro, lockedG, macroA, calPerA, macroB, calPerB) => {
            const lockedCals = lockedG * (lockedMacro === 'fats' ? 9 : 4);
            const remaining = targetCals - lockedCals;
            if (remaining <= 0) return { [macroA]: 0, [macroB]: 0 };
            const currentACals = plan[macroA] * calPerA;
            const currentBCals = plan[macroB] * calPerB;
            const total = currentACals + currentBCals;
            if (total <= 0) {
                // Split evenly if both were 0
                return { [macroA]: Math.round(remaining / 2 / calPerA), [macroB]: Math.round(remaining / 2 / calPerB) };
            }
            return {
                [macroA]: Math.round((remaining * (currentACals / total)) / calPerA),
                [macroB]: Math.round((remaining * (currentBCals / total)) / calPerB),
            };
        };

        if (editingMacro === 'calories') {
            // Scale all three macros proportionally to the new calorie target
            if (plan.calories > 0) {
                const scale = newVal / plan.calories;
                newPlan = {
                    ...newPlan,
                    calories: newVal,
                    protein: Math.round(plan.protein * scale),
                    carbs: Math.round(plan.carbs * scale),
                    fats: Math.round(plan.fats * scale),
                };
            } else {
                newPlan = { ...newPlan, calories: newVal };
            }
        } else if (editingMacro === 'protein') {
            const others = rebalanceOtherTwo('protein', newVal, 'carbs', 4, 'fats', 9);
            newPlan = { ...newPlan, protein: newVal, ...others };
        } else if (editingMacro === 'carbs') {
            const others = rebalanceOtherTwo('carbs', newVal, 'protein', 4, 'fats', 9);
            newPlan = { ...newPlan, carbs: newVal, ...others };
        } else if (editingMacro === 'fats') {
            const others = rebalanceOtherTwo('fats', newVal, 'protein', 4, 'carbs', 4);
            newPlan = { ...newPlan, fats: newVal, ...others };
        }

        if (onCoachPlanUpdate) onCoachPlanUpdate(newPlan);
        setEditingMacro(null);
    };

    // Inline editor renderer used inside each macro stat-card
    const MacroInlineEditor = ({ macro, label, unit = 'g', hint }) => (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <input
                    type="number"
                    autoFocus
                    value={macroInputValue}
                    onChange={e => setMacroInputValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveMacroEdit(); if (e.key === 'Escape') cancelMacroEdit(); }}
                    style={{ width: 64, background: 'transparent', border: 'none', borderBottom: '2px solid var(--primary-light)', color: 'var(--text-primary)', fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-primary)', outline: 'none', padding: '2px 0' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{unit} {label}</span>
            </div>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{hint || `others rebalance to hit ${plan.calories} kcal`}</span>
            <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                <button onClick={cancelMacroEdit} style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'var(--font-primary)' }}>Cancel</button>
                <button onClick={saveMacroEdit} style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', background: 'var(--primary-light)', color: '#000', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-primary)' }}>Save</button>
            </div>
        </div>
    );

    const handleProteinChange = () => { }; // legacy no-op
    const handleSaveProtein = () => { }; // legacy no-op
    const localProtein = plan.protein; // legacy alias

    const handleSaveCoachPlan = () => {
        if (onCoachPlanUpdate) {
            onCoachPlanUpdate({
                calories: parseInt(coachPlanDraft.calories) || plan.calories,
                protein: parseInt(coachPlanDraft.protein) || plan.protein,
                carbs: parseInt(coachPlanDraft.carbs) || plan.carbs,
                fats: parseInt(coachPlanDraft.fats) || plan.fats,
                tdee: parseInt(coachPlanDraft.tdee) || plan.tdee,
            });
        }
        setIsEditingCoachPlan(false);
    };

    const openCoachEditor = () => {
        setCoachPlanDraft({
            calories: plan.calories,
            protein: plan.protein,
            carbs: plan.carbs,
            fats: plan.fats,
            tdee: plan.tdee || '',
        });
        setUploadError('');
        setIsEditingCoachPlan(true);
    };

    // Scan a file (photo or PDF) and auto-fill the draft form via Gemini AI
    const handlePlanFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadError('');
        setIsUploadingPlan(true);
        try {
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const response = await fetch(`${API_BASE_URL}/api/analyze-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64Data, mimeType: file.type, fileName: file.name, remainingMacros: {} })
            });
            const result = await response.json();
            if (result.status === 'success' && result.data) {
                const d = result.data;
                const protein = d.protein || 0;
                const carbs = d.carbs || 0;
                const fats = d.fats || 0;
                const cals = d.calories || Math.round((protein * 4) + (carbs * 4) + (fats * 9));
                setCoachPlanDraft(prev => ({
                    ...prev,
                    calories: cals,
                    protein,
                    carbs,
                    fats,
                    tdee: d.tdee || prev.tdee
                }));
                setUploadError('');
            } else {
                setUploadError(result.message || 'Could not extract targets from this file. Please fill in the fields manually.');
            }
        } catch (err) {
            console.error('Plan scan error:', err);
            setUploadError('Scan failed — check your connection. Fill in the fields manually below.');
        } finally {
            setIsUploadingPlan(false);
            if (planFileInputRef.current) planFileInputRef.current.value = '';
        }
    };


    return (
        <div className="dashboard-container">
            {isEditingCoachPlan && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ width: '100%', maxWidth: '420px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto', background: '#1a1625', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ClipboardList size={20} color="var(--primary-light)" /> Update Your Plan
                        </h3>

                        {/* ── Scan a file (image or PDF) → auto-fill fields ── */}
                        <input
                            ref={planFileInputRef}
                            id="plan-scan-input"
                            type="file"
                            accept="image/*,application/pdf,text/plain,.pdf,.txt,.doc,.docx"
                            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', zIndex: -1 }}
                            onChange={handlePlanFileUpload}
                        />
                        <label
                            htmlFor="plan-scan-input"
                            onClick={(e) => isUploadingPlan && e.preventDefault()}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px', borderRadius: '12px', border: '1.5px dashed rgba(231,156,74,0.45)', background: 'rgba(231,156,74,0.06)', color: isUploadingPlan ? 'var(--primary-light)' : 'var(--text-secondary)', cursor: isUploadingPlan ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-primary)', fontSize: '0.9rem', boxSizing: 'border-box', width: '100%' }}
                        >
                            {isUploadingPlan
                                ? <><Loader2 size={18} className="spin-icon" /> Scanning with AI...</>
                                : <><Upload size={18} /> Scan plan photo or PDF</>}
                        </label>
                        {uploadError && (
                            <p style={{ color: '#f08090', fontSize: '0.8rem', margin: 0, lineHeight: 1.4 }}>⚠️ {uploadError}</p>
                        )}
                        {/* Scanned preview */}
                        {!uploadError && !isUploadingPlan && coachPlanDraft.protein && (
                            <div style={{ background: 'rgba(45,212,191,0.07)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: '10px', padding: '12px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                <strong style={{ color: 'var(--text-primary)' }}>Scanned values:</strong><br />
                                {coachPlanDraft.calories} kcal &nbsp;·&nbsp; {coachPlanDraft.protein}g protein &nbsp;·&nbsp; {coachPlanDraft.carbs}g carbs &nbsp;·&nbsp; {coachPlanDraft.fats}g fats
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button onClick={() => setIsEditingCoachPlan(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-primary)' }}>Cancel</button>
                            <button onClick={handleSaveCoachPlan} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, var(--primary-light) 0%, #00d2ff 100%)', color: '#000', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font-primary)' }}>Save Plan</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="greeting" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="text-gradient">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {userName || 'there'}
                    </h1>
                    <p className="subtitle">Daily Goal: {plan.tdee} kcal TDEE | Target: {plan.calories} kcal</p>
                </div>
                <button
                    onClick={openCoachEditor}
                    title="Edit Coach Plan"
                    style={{ background: 'var(--primary-dim)', border: '1px solid rgba(231,156,74,0.3)', borderRadius: '10px', padding: '8px 14px', color: 'var(--primary-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontFamily: 'var(--font-primary)', whiteSpace: 'nowrap' }}>
                    <ClipboardList size={16} /> Upload a Plan
                </button>
            </div>

            <div className="stats-grid">
                <div className="stat-card glass-panel interactive" onClick={() => !editingMacro && openMacroEdit('calories')}>
                    <div className="stat-icon kcal"><Flame size={20} /></div>
                    {editingMacro === 'calories' ? (
                        <MacroInlineEditor macro="calories" label="kcal" unit="" hint="protein, carbs & fats scale proportionally" />
                    ) : (
                        <>
                            <div className="stat-info">
                                <span className="stat-value">{consumed.calories}</span>
                                <span className="stat-label">/ {plan.calories} kcal</span>
                            </div>
                            <Settings2 size={16} className="edit-icon" />
                        </>
                    )}
                </div>

                <div className="stat-card glass-panel interactive" onClick={() => !editingMacro && openMacroEdit('protein')}>
                    <div className="stat-icon prot"><Target size={20} /></div>
                    {editingMacro === 'protein' ? (
                        <MacroInlineEditor macro="protein" label="protein" />
                    ) : (
                        <>
                            <div className="stat-info">
                                <span className="stat-value">{consumed.protein}g</span>
                                <span className="stat-label">/ {plan.protein}g Protein</span>
                            </div>
                            <Settings2 size={16} className="edit-icon" />
                        </>
                    )}
                </div>

                {/* Carbs + Fats — each half is independently clickable */}
                <div className="stat-card glass-panel full-width" style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
                    <div
                        onClick={() => !editingMacro && openMacroEdit('carbs')}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '16px 14px', cursor: editingMacro ? 'default' : 'pointer', borderRight: '1px solid rgba(255,255,255,0.07)', minWidth: 0 }}
                    >
                        <div className="stat-icon carbs" style={{ flexShrink: 0 }}><Activity size={18} /></div>
                        {editingMacro === 'carbs' ? (
                            <MacroInlineEditor macro="carbs" label="carbs" />
                        ) : (
                            <>
                                <div className="stat-info" style={{ minWidth: 0 }}>
                                    <span className="stat-value">{consumed.carbs}g</span>
                                    <span className="stat-label">/ {plan.carbs}g Carbs</span>
                                </div>
                                <Settings2 size={13} className="edit-icon" style={{ flexShrink: 0 }} />
                            </>
                        )}
                    </div>
                    <div
                        onClick={() => !editingMacro && openMacroEdit('fats')}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '16px 14px', cursor: editingMacro ? 'default' : 'pointer', justifyContent: 'flex-end', minWidth: 0 }}
                    >
                        {editingMacro === 'fats' ? (
                            <MacroInlineEditor macro="fats" label="fats" />
                        ) : (
                            <>
                                <Settings2 size={13} className="edit-icon" style={{ flexShrink: 0 }} />
                                <div className="stat-info ml-auto" style={{ minWidth: 0 }}>
                                    <span className="stat-value">{consumed.fats}g</span>
                                    <span className="stat-label">/ {plan.fats}g Fats</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {weeklyHistory.length > 0 && (
                <div className="weekly-progress-card glass-panel animate-slide-up" style={{ marginTop: '20px', padding: '20px', backgroundImage: 'radial-gradient(circle at top right, rgba(45, 212, 191, 0.1), transparent 70%)', border: '1px solid rgba(45, 212, 191, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Activity size={16} color="var(--primary-light)" /> 7-Day Trailing Average
                        </h4>
                        <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-dark)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>{weeklyHistory.length} Days Logged</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                            <span style={{ display: 'block', fontSize: '2.2rem', fontWeight: '800', color: totalWeeklyDeficit > 0 ? 'var(--primary-light)' : 'var(--accent-red)', lineHeight: '1' }}>
                                {totalWeeklyDeficit > 0 ? '-' : '+'}{Math.abs(totalWeeklyDeficit)} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: '500' }}>kcal</span>
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>Accumulated Net Deficit</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ display: 'block', fontSize: '1.6rem', fontWeight: '700', color: 'var(--text-primary)', lineHeight: '1' }}>
                                {totalWeeklyDeficit > 0 ? '-' : '+'}{Math.abs(weeklyWeightLossPace)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '500' }}>lbs</span>
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>Projected Fat Loss</span>
                        </div>
                    </div>
                </div>
            )}

            {weeklyHistory.length > 0 && (
                <div className="history-browser glass-panel animate-slide-up" style={{ marginTop: '20px', padding: '20px' }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CalendarDays size={18} color="var(--primary-light)" /> Meal History
                    </h3>
                    <div className="history-chips-container" style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', scrollbarWidth: 'none' }}>
                        {weeklyHistory.map((day, idx) => (
                            <button
                                key={idx}
                                className={`history-chip ${selectedHistoryDate === day.date ? 'active' : ''}`}
                                onClick={() => setSelectedHistoryDate(selectedHistoryDate === day.date ? null : day.date)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    border: selectedHistoryDate === day.date ? '1px solid var(--primary-light)' : '1px solid rgba(255,255,255,0.1)',
                                    background: selectedHistoryDate === day.date ? 'rgba(45, 212, 191, 0.15)' : 'var(--bg-dark)',
                                    color: selectedHistoryDate === day.date ? 'var(--primary-light)' : 'var(--text-secondary)',
                                    whiteSpace: 'nowrap',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    fontFamily: 'var(--font-primary)'
                                }}
                            >
                                {day.date}
                            </button>
                        ))}
                    </div>

                    {selectedHistoryDate && (
                        <div className="historical-meals-list animate-slide-up" style={{ marginTop: '15px' }}>
                            {weeklyHistory.find(d => d.date === selectedHistoryDate)?.meals?.length > 0 ? (
                                <ul className="plan-list">
                                    {weeklyHistory.find(d => d.date === selectedHistoryDate).meals.map((meal, index) => (
                                        <li key={index} className="plan-item completed" style={{ marginBottom: '10px' }}>
                                            <div className="plan-item-header" style={{ alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div className="plan-desc" style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{meal.desc || meal.name}</div>
                                                    {meal.macros && (
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '10px' }}>
                                                            <span>🔥 {meal.macros.cals}</span>
                                                            <span>🥩 {meal.macros.protein}g</span>
                                                            <span>🍞 {meal.macros.carbs}g</span>
                                                            <span>🥑 {meal.macros.fats}g</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {meal.macros && (
                                                    <button
                                                        onClick={() => {
                                                            if (onLogHistoricalMeal) {
                                                                onLogHistoricalMeal(meal);
                                                                setSelectedHistoryDate(null);
                                                            }
                                                        }}
                                                        style={{
                                                            background: 'linear-gradient(135deg, var(--primary-light) 0%, #00d2ff 100%)',
                                                            border: 'none',
                                                            borderRadius: '8px',
                                                            padding: '6px 12px',
                                                            color: '#000',
                                                            fontWeight: '700',
                                                            fontSize: '0.8rem',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            fontFamily: 'var(--font-primary)'
                                                        }}
                                                    >
                                                        <RotateCcw size={14} /> Log
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', margin: '20px 0' }}>No meals logged on this date.</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="todays-plan glass-panel">
                <div className="plan-header">
                    <h3>Today's Log</h3>
                    <span className="badge">Active</span>
                </div>
                <ul className="plan-list">
                    {(!mealResponses || mealResponses.length === 0) ? (
                        <li className="plan-item pending">
                            <div className="plan-time">-</div>
                            <div className="plan-desc">Awaiting your first logged meal...</div>
                        </li>
                    ) : (
                        mealResponses.map((meal, index) => {
                            const isExpanded = expandedMealIndex === index;
                            const hasMacros = !!meal.macros;

                            return (
                                <li key={index} className={`plan-item ${meal.status === 'completed' ? 'completed' : 'pending'} ${isExpanded ? 'expanded' : ''}`}>
                                    <div className="plan-item-header" onClick={() => hasMacros && toggleMealExpand(index)} style={{ cursor: hasMacros ? 'pointer' : 'default' }}>
                                        <div className="plan-time">{meal.time}</div>
                                        <div className="plan-desc">{meal.desc}</div>
                                        {hasMacros && (
                                            <div className="expand-icon">
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </div>
                                        )}
                                    </div>
                                    {isExpanded && hasMacros && (
                                        <div className="plan-item-macros animate-slide-up" style={{ flexDirection: 'column', gap: '10px' }}>
                                            {/* Macro row */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'flex-start' }}>
                                                <span>🔥 {meal.macros.cals}kcal</span>
                                                <span>🥩 {meal.macros.protein}g Prot</span>
                                                <span>
                                                    🍞 {meal.macros.carbs}g Carb
                                                    {meal.macros.fiber > 0 && (
                                                        <span style={{ fontSize: '0.68rem', color: 'var(--accent-success)', marginLeft: '4px' }}>
                                                            ({meal.macros.fiber}g fiber)
                                                        </span>
                                                    )}
                                                </span>
                                                <span>🥑 {meal.macros.fats}g Fat</span>
                                            </div>

                                            {/* Portion editor — separate row below macros */}
                                            {onEditMealPortion && meal.id && (
                                                <div className="portion-editor" style={{ width: '100%' }}>
                                                    <span className="portion-label">
                                                        {meal.portionMultiplier && meal.portionMultiplier < 1
                                                            ? `Adjusted to ${Math.round(meal.portionMultiplier * 100)}%${meal.portionNote ? ` · ${meal.portionNote}` : ''}`
                                                            : 'How much did you eat?'}
                                                    </span>
                                                    <div className="portion-presets" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                                        {[['¼', 0.25, 'a quarter'], ['½', 0.5, 'half'], ['¾', 0.75, 'three quarters'], ['All', 1.0, '']].map(([label, val, note]) => (
                                                            <button
                                                                key={label}
                                                                className={`portion-btn${Math.abs((meal.portionMultiplier || 1) - val) < 0.01 ? ' active' : ''}`}
                                                                style={{ flex: '1', minWidth: '50px' }}
                                                                onClick={(e) => { e.stopPropagation(); onEditMealPortion(meal.id, val, note); }}
                                                            >
                                                                {label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })
                    )}
                </ul>
            </div>

            {/* Past 7 Days History Panel */}
            {weeklyHistory.length > 0 && (
                <div className="history-panel glass-panel">
                    <div className="plan-header">
                        <h3>Past 7 Days</h3>
                        <CalendarDays size={16} color="var(--text-secondary)" />
                    </div>
                    <div className="history-days">
                        {[...weeklyHistory].reverse().map((day, dayIdx) => (
                            <div key={dayIdx} className="history-day">
                                <button
                                    className="history-day-header"
                                    onClick={() => setSelectedHistoryDate(selectedHistoryDate === day.date ? null : day.date)}
                                >
                                    <span className="history-date">{day.date}</span>
                                    <span className="history-cal-summary">{day.consumedCals || 0} kcal eaten</span>
                                    {selectedHistoryDate === day.date ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {selectedHistoryDate === day.date && (
                                    <div className="history-meals">
                                        {(!day.meals || day.meals.length === 0) ? (
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '8px 4px' }}>No meals logged this day.</p>
                                        ) : (
                                            day.meals.map((meal, mIdx) => (
                                                <div key={mIdx} className="history-meal-row">
                                                    <div className="history-meal-info">
                                                        <span className="history-meal-name">{meal.desc}</span>
                                                        <span className="history-meal-time">{meal.time}</span>
                                                    </div>
                                                    <div className="history-meal-right">
                                                        {meal.macros && <span className="history-meal-cals">{meal.macros.cals} kcal</span>}
                                                        <button className="readd-btn" onClick={() => onReaddMeal && onReaddMeal(meal)}>
                                                            <RotateCcw size={11} /> Re-add
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
