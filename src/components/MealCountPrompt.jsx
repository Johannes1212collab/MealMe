import React from 'react';
import './MealCountPrompt.css';

export default function MealCountPrompt({ onSelect }) {
    const options = [
        { count: 2, label: '2', sub: 'Two meals' },
        { count: 3, label: '3', sub: 'Three meals' },
        { count: 4, label: '4', sub: 'Four meals' },
        { count: 5, label: '5', sub: 'Five meals' },
        { count: 6, label: '6+', sub: 'Six or more' },
    ];

    return (
        <div className="mcp-overlay">
            <div className="mcp-panel">
                <div className="mcp-icon">🍽️</div>
                <h2 className="mcp-title">Plan your meals for today</h2>
                <p className="mcp-sub">MealMe will size every suggestion to fit your daily budget.</p>
                <div className="mcp-grid">
                    {options.map(o => (
                        <button key={o.count} className="mcp-btn" onClick={() => onSelect(o.count)}>
                            <span className="mcp-num">{o.label}</span>
                            <span className="mcp-sub-lbl">{o.sub}</span>
                        </button>
                    ))}
                </div>
                <button className="mcp-skip" onClick={() => onSelect(null)}>Skip for now</button>
            </div>
        </div>
    );
}
