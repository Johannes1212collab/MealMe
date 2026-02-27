import React from 'react';
import { X, CheckCircle, Info, History, Plus } from 'lucide-react';
import './Recommendations.css';

export default function Recommendations({ isVisible, onClose, suggestionData, onSelectOption, onReaddMeal }) {
    if (!isVisible || !suggestionData) return null;

    // Scenario 3: info-only response from history query
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

    // Scenario 1 & 2: loggable food options
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
