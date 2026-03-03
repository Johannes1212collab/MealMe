import React, { useState } from 'react';
import { X, CheckCircle, Info, History, Plus, MapPin } from 'lucide-react';
import './Recommendations.css';

export default function Recommendations({ isVisible, onClose, suggestionData, onSelectOption, onReaddMeal }) {
    // Track which items have been logged in the multi-venue view
    const [loggedKeys, setLoggedKeys] = useState({});

    if (!isVisible || !suggestionData) return null;

    // ── History / info query ───────────────────────────────────────
    if (suggestionData.type === 'info') {
        return (
            <div className="recommendations-overlay">
                <div className="recommendations-panel glass-panel animate-slide-up">
                    <div className="panel-header">
                        <div className="agent-badge"><History size={13} style={{ marginRight: 5 }} />History</div>
                        <button className="close-btn" onClick={onClose}><X size={20} /></button>
                    </div>
                    <div className="panel-content">
                        <p className="ai-response">"{suggestionData.message}"</p>
                        {suggestionData.foundMeals && suggestionData.foundMeals.length > 0 && (
                            <div className="options-container">
                                {suggestionData.foundMeals.map((meal, idx) => (
                                    <div key={idx} className="option-card">
                                        <div className="option-header">
                                            <h4>{meal.desc}</h4>
                                            <div className="match-badge good">{meal.time}</div>
                                        </div>
                                        {meal.macros && (
                                            <div className="macro-badges">
                                                <span className="macro-badge cals">{meal.macros.cals} kcal</span>
                                                <span className="macro-badge prot">{meal.macros.protein}g P</span>
                                                <span className="macro-badge carbs">{meal.macros.carbs}g C</span>
                                            </div>
                                        )}
                                        <button className="select-btn" onClick={() => onReaddMeal && onReaddMeal(meal)}>
                                            <Plus size={16} /> Log This Again
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Multi-venue suggestion ─────────────────────────────────────
    if (suggestionData.type === 'multi_suggestion' && Array.isArray(suggestionData.venues)) {
        const allLogged = suggestionData.venues.every((_, vi) =>
            (suggestionData.venues[vi].options || []).some((_, oi) => loggedKeys[`${vi}-${oi}`])
        );

        return (
            <div className="recommendations-overlay">
                <div className="recommendations-panel glass-panel animate-slide-up">
                    <div className="panel-header">
                        <div className="agent-badge"><MapPin size={13} style={{ marginRight: 5 }} />Multi-Stop Plan</div>
                        <button className="close-btn" onClick={onClose}><X size={20} /></button>
                    </div>
                    <div className="panel-content">
                        <p className="ai-response">"{suggestionData.message}"</p>

                        {suggestionData.venues.map((venue, vi) => (
                            <div key={vi} style={{ marginBottom: '18px' }}>
                                {/* Venue header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    marginBottom: '10px', paddingBottom: '8px',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                                }}>
                                    <MapPin size={14} color="var(--primary-light)" />
                                    <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                        {venue.venue}
                                    </span>
                                    {venue.mealLabel && (
                                        <span style={{
                                            fontSize: '0.72rem', color: 'var(--text-muted)',
                                            background: 'rgba(255,255,255,0.06)', borderRadius: '10px',
                                            padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em'
                                        }}>
                                            {venue.mealLabel}
                                        </span>
                                    )}
                                </div>

                                <div className="options-container" style={{ marginBottom: 0 }}>
                                    {(venue.options || []).map((option, oi) => {
                                        const key = `${vi}-${oi}`;
                                        const isLogged = !!loggedKeys[key];
                                        return (
                                            <div key={oi} className="option-card" style={{ opacity: isLogged ? 0.55 : 1 }}>
                                                <div className="option-header">
                                                    <h4>{option.title}</h4>
                                                    <div className={`match-badge ${option.isPerfectMatch ? 'perfect' : 'good'}`}>
                                                        {isLogged ? 'Logged ✓' : option.isPerfectMatch ? 'Perfect Match' : 'Good Fit'}
                                                    </div>
                                                </div>
                                                <p className="option-desc">{option.description}</p>
                                                <div className="macro-badges">
                                                    <span className="macro-badge cals">{option.cals} kcal</span>
                                                    <span className="macro-badge prot">{option.protein}g P</span>
                                                    <span className="macro-badge carbs">{option.carbs}g C</span>
                                                </div>
                                                <button
                                                    className="select-btn"
                                                    disabled={isLogged}
                                                    onClick={() => {
                                                        onSelectOption({ ...option, _venueLabel: `${option.title} (${venue.venue})` });
                                                        setLoggedKeys(prev => ({ ...prev, [key]: true }));
                                                    }}
                                                    style={{ opacity: isLogged ? 0.4 : 1 }}
                                                >
                                                    <CheckCircle size={16} />
                                                    {isLogged ? 'Logged' : 'Log This'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {allLogged && (
                            <div className="coach-note" style={{ marginTop: '12px' }}>
                                <Info size={16} className="note-icon" />
                                <p>All stops logged! Your macros have been updated.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Single venue suggestion / log ──────────────────────────────
    return (
        <div className="recommendations-overlay">
            <div className="recommendations-panel glass-panel animate-slide-up">
                <div className="panel-header">
                    <div className="agent-badge">MealMe Suggestion</div>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="panel-content">
                    <p className="ai-response">"{suggestionData.message}"</p>

                    <div className="options-container">
                        {(suggestionData.options || []).map((option, idx) => (
                            <div key={idx} className="option-card">
                                <div className="option-header">
                                    <h4>{option.title}</h4>
                                    <div className={`match-badge ${option.isPerfectMatch ? 'perfect' : 'good'}`}>
                                        {option.isPerfectMatch ? 'Perfect Match' : 'Good Fit'}
                                    </div>
                                </div>

                                <p className="option-desc">{option.description}</p>

                                <div className="macro-badges">
                                    <span className="macro-badge cals">{option.cals} kcal</span>
                                    <span className="macro-badge prot">{option.protein}g P</span>
                                    <span className="macro-badge carbs">{option.carbs}g C</span>
                                </div>

                                <button className="select-btn" onClick={() => onSelectOption(option)}>
                                    <CheckCircle size={16} /> Choose This
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="coach-note">
                        <Info size={16} className="note-icon" />
                        <p>Your coach allows up to 2 "cheat" meals per week. This will count as one.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
