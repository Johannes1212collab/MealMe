import React, { useState, useEffect, useRef } from 'react';
import { Target, Flame, Activity, Settings2, ChevronDown, ChevronUp, CalendarDays, RotateCcw, ClipboardList, Upload, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../utils/api';
import './Dashboard.css';

export default function Dashboard({ macroPlan, consumedMacros, mealResponses, onPlanUpdate, onLogHistoricalMeal, onCoachPlanUpdate }) {
    const [isEditingProtein, setIsEditingProtein] = useState(false);
    const [expandedMealIndex, setExpandedMealIndex] = useState(null);
    const [weeklyHistory, setWeeklyHistory] = useState([]);
    const [selectedHistoryDate, setSelectedHistoryDate] = useState(null);
    const [isEditingCoachPlan, setIsEditingCoachPlan] = useState(false);
    const [coachPlanDraft, setCoachPlanDraft] = useState({ calories: '', protein: '', carbs: '', fats: '', tdee: '' });
    const [isUploadingPlan, setIsUploadingPlan] = useState(false);
    const planFileInputRef = useRef(null);

    useEffect(() => {
        const saved = localStorage.getItem('mealme_weekly_history');
        if (saved) {
            setWeeklyHistory(JSON.parse(saved));
        }
    }, []);

    const totalWeeklyDeficit = weeklyHistory.reduce((sum, day) => sum + day.netDeficit, 0);
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

    const [localProtein, setLocalProtein] = useState(plan.protein);

    // Real consumed values
    const consumed = consumedMacros || {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0
    };

    const handleProteinChange = (e) => {
        setLocalProtein(parseInt(e.target.value));
    };

    const handleSaveProtein = () => {
        setIsEditingProtein(false);
        if (onPlanUpdate) {
            onPlanUpdate(localProtein);
        }
    };

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
        setIsEditingCoachPlan(true);
    };

    const handlePlanFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
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
                body: JSON.stringify({ base64Data, mimeType: file.type, remainingMacros: {} })
            });
            const result = await response.json();
            if (result.status === 'success' && result.data) {
                const d = result.data;
                setCoachPlanDraft(prev => {
                    const protein = d.protein || prev.protein;
                    const carbs = d.carbs || prev.carbs;
                    const fats = d.fats || prev.fats;
                    // Standard Atwater 4-4-9 model: 1g carb=4kcal, 1g protein=4kcal, 1g fat=9kcal
                    const calculatedCals = Math.round((protein * 4) + (carbs * 4) + (fats * 9));
                    return {
                        calories: calculatedCals,
                        protein,
                        carbs,
                        fats,
                        tdee: d.tdee || prev.tdee,
                    };
                });
            }
        } catch (err) {
            console.error('Plan file upload error:', err);
        } finally {
            setIsUploadingPlan(false);
            if (planFileInputRef.current) planFileInputRef.current.value = '';
        }
    };

    return (
        <div className="dashboard-container">
            {isEditingCoachPlan && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ClipboardList size={20} color="var(--primary-light)" /> Coach's Plan
                        </h3>

                        {/* File Upload Section */}
                        <input ref={planFileInputRef} type="file" accept="image/*,application/pdf,text/plain,.pdf,.txt" style={{ display: 'none' }} onChange={handlePlanFileUpload} />
                        <button
                            onClick={() => planFileInputRef.current?.click()}
                            disabled={isUploadingPlan}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px', borderRadius: '12px', border: '1.5px dashed rgba(45,212,191,0.4)', background: 'rgba(45,212,191,0.05)', color: isUploadingPlan ? '#2dd4bf' : 'var(--text-secondary)', cursor: isUploadingPlan ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-primary)', fontSize: '0.9rem', transition: 'all 0.2s ease', width: '100%' }}
                        >
                            {isUploadingPlan
                                ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Scanning file with AI...</>
                                : <><Upload size={18} /> Scan Coach's Plan (PDF, image, or text)</>}
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>or enter manually</span>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                        </div>

                        {[['Daily Calories (kcal)', 'calories'], ['Protein (g)', 'protein'], ['Carbs (g)', 'carbs'], ['Fats (g)', 'fats'], ['TDEE (kcal)', 'tdee']].map(([label, key]) => (
                            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{label}</label>
                                <input
                                    type="number"
                                    value={coachPlanDraft[key]}
                                    onChange={(e) => setCoachPlanDraft(prev => ({ ...prev, [key]: e.target.value }))}
                                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '1rem', fontFamily: 'var(--font-primary)' }}
                                />
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button onClick={() => setIsEditingCoachPlan(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-primary)' }}>Cancel</button>
                            <button onClick={handleSaveCoachPlan} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, var(--primary-light) 0%, #00d2ff 100%)', color: '#000', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font-primary)' }}>Save Plan</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="greeting" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="text-gradient">Good Evening, Alex</h1>
                    <p className="subtitle">Daily Goal: {plan.tdee} kcal TDEE | Target: {plan.calories} kcal</p>
                </div>
                <button
                    onClick={openCoachEditor}
                    title="Edit Coach Plan"
                    style={{ background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.3)', borderRadius: '10px', padding: '8px 14px', color: 'var(--primary-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontFamily: 'var(--font-primary)', whiteSpace: 'nowrap' }}>
                    <ClipboardList size={16} /> Coach Plan
                </button>
            </div>

            <div className="stats-grid">
                <div className="stat-card glass-panel">
                    <div className="stat-icon kcal"><Flame size={20} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{consumed.calories}</span>
                        <span className="stat-label">/ {plan.calories} kcal</span>
                    </div>
                </div>

                <div className="stat-card glass-panel interactive" onClick={() => !isEditingProtein && setIsEditingProtein(true)}>
                    <div className="stat-icon prot"><Target size={20} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{consumed.protein}g</span>
                        <span className="stat-label">/ {plan.protein}g Protein</span>
                    </div>
                    {!isEditingProtein && <Settings2 size={16} className="edit-icon" />}
                </div>

                <div className="stat-card glass-panel full-width">
                    <div className="stat-icon carbs"><Activity size={20} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{consumed.carbs}g</span>
                        <span className="stat-label">/ {plan.carbs}g Carbs</span>
                    </div>
                    <div className="stat-info ml-auto">
                        <span className="stat-value">{consumed.fats}g</span>
                        <span className="stat-label">/ {plan.fats}g Fats</span>
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

            {
                isEditingProtein && (
                    <div className="protein-editor glass-panel animate-slide-up">
                        <div className="editor-header">
                            <h3>Adjust Protein Target</h3>
                            <span className="badge">Fixed Calories</span>
                        </div>
                        <p className="editor-desc">Everything else will adjust to maintain your {plan.calories} kcal limit.</p>

                        <div className="slider-container">
                            <input
                                type="range"
                                min="50"
                                max="300"
                                step="5"
                                value={localProtein}
                                onChange={handleProteinChange}
                                className="protein-slider"
                            />
                            <div className="slider-val text-gradient">{localProtein}g</div>
                        </div>

                        <div className="editor-actions">
                            <button className="cancel-btn" onClick={() => { setLocalProtein(plan.protein); setIsEditingProtein(false); }}>Cancel</button>
                            <button className="save-btn" onClick={handleSaveProtein}>Save Changes</button>
                        </div>
                    </div>
                )
            }

            <div className="todays-plan glass-panel">
                <div className="plan-header">
                    <h3>Today's Coach Plan</h3>
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
                                        <div className="plan-item-macros animate-slide-up">
                                            <span>🔥 {meal.macros.cals}kcal</span>
                                            <span>🥩 {meal.macros.protein}g Prot</span>
                                            <span>🍞 {meal.macros.carbs}g Carb</span>
                                            <span>🥑 {meal.macros.fats}g Fat</span>
                                        </div>
                                    )}
                                </li>
                            );
                        })
                    )}
                </ul>
            </div>
        </div >
    );
}
