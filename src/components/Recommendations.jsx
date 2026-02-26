import React from 'react';
import { X, CheckCircle, Info } from 'lucide-react';
import './Recommendations.css';

export default function Recommendations({ isVisible, onClose, suggestionData, onSelectOption }) {
    if (!isVisible || !suggestionData) return null;

    return (
        <div className="recommendations-overlay">
            <div className="recommendations-panel glass-panel animate-slide-up">
                <div className="panel-header">
                    <div className="agent-badge">MealMe Suggestion</div>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="panel-content">
                    <p className="ai-response">"{suggestionData.message}"</p>

                    <div className="options-container">
                        {suggestionData.options.map((option, idx) => (
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
