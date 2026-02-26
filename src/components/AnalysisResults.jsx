import React from 'react';
import { X, CheckCircle, Flame, Target, Activity, ChefHat } from 'lucide-react';
import './AnalysisResults.css';

export default function AnalysisResults({ isVisible, onClose, resultData, onAdd }) {
    if (!isVisible || !resultData) return null;

    const isRecipe = resultData.type === 'ingredients';

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

    return (
        <div className="analysis-overlay">
            <div className="analysis-panel glass-panel animate-slide-up">
                <div className="panel-header">
                    <div className="agent-badge">
                        {isRecipe ? 'Generated Recipe' : 'Food Analysis'}
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
                        {resultData.name}
                    </h3>
                    <p className="food-desc">{resultData.description}</p>

                    <div className="macros-breakdown">
                        <div className="macro-box cals">
                            <Flame size={18} />
                            <span className="macro-val">{resultData.cals}</span>
                            <span className="macro-lbl">kcal</span>
                        </div>
                        <div className="macro-box prot">
                            <Target size={18} />
                            <span className="macro-val">{resultData.protein}g</span>
                            <span className="macro-lbl">Protein</span>
                        </div>
                        <div className="macro-box carbs">
                            <Activity size={18} />
                            <span className="macro-val">{resultData.carbs}g</span>
                            <span className="macro-lbl">Carbs</span>
                        </div>
                    </div>

                    <div className="ingredients-list">
                        <h4>AI Analysis Notes:</h4>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                            {parseMarkdown(resultData.details) || <p>A delicious looking meal successfully identified.</p>}
                        </div>
                    </div>

                    <button className="add-to-plan-btn" onClick={onAdd}>
                        <CheckCircle size={18} /> Add to Today's Plan
                    </button>
                </div>
            </div>
        </div>
    );
}
