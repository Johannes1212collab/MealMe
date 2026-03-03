import React, { useState, useEffect, useRef } from 'react';
import { Mic, Loader2, Volume2, X, Send, Keyboard } from 'lucide-react';
import './VoiceAgent.css';

export default function VoiceAgent({ agentState, onAgentClick, onCancel, onSubmit, perMealTarget, plannedMeals }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [textInput, setTextInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);

    useEffect(() => {
        // Initialize Speech Recognition if supported
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;

            recognitionRef.current.onresult = (event) => {
                let currentTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    currentTranscript += event.results[i][0].transcript;
                }
                setTextInput(currentTranscript);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                setIsListening(false);
            };
        }
    }, []);

    // Collapse if agent starts processing OR speaking
    useEffect(() => {
        if (agentState === 'processing' || agentState === 'speaking') {
            setIsExpanded(false);
            setIsListening(false);
            if (recognitionRef.current) recognitionRef.current.stop();
        }
    }, [agentState]);

    const getIcon = () => {
        switch (agentState) {
            case 'listening': return <Mic className="animate-pulse" size={28} />;
            case 'processing': return <Loader2 className="animate-spin" size={28} />;
            case 'speaking': return <Volume2 className="animate-pulse" size={28} />;
            default: return <Mic size={28} />;
        }
    };

    const getStatusText = () => {
        if (isExpanded) return isListening ? 'Listening...' : 'Type or speak...';
        switch (agentState) {
            case 'listening': return 'Go ahead, I am listening...';
            case 'processing': return 'Thinking about your plan...';
            case 'speaking': return 'Here is a suggestion...';
            default: return 'Tap to ask MealMe';
        }
    };

    const handleOrbClick = () => {
        if (agentState === 'idle') {
            setIsExpanded(true);
        } else if (agentState === 'speaking') {
            if (onCancel) onCancel();
        }
    };

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert('Speech Recognition is not supported in this browser. Please type.');
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            setTextInput(''); // Clear previous text when starting new voice dictation
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    const handleSubmit = () => {
        if (!textInput.trim()) return;
        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
        onSubmit(textInput.trim(), { perMealTarget, plannedMeals });
        setTextInput('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    return (
        <div className="voice-agent-container">
            {agentState !== 'idle' && (
                <div className="voice-agent-status animate-fade-in">
                    {getStatusText()}
                </div>
            )}
            {isExpanded ? (
                <div className="voice-input-bar animate-expand">
                    <button className="close-bar-btn" onClick={() => setIsExpanded(false)}>
                        <X size={20} />
                    </button>

                    <input
                        type="text"
                        className="voice-text-input"
                        placeholder="e.g. I am at Starbucks..."
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />

                    <button
                        className={`mic-toggle-btn ${isListening ? 'listening' : ''}`}
                        onClick={toggleListening}
                    >
                        <Mic size={20} className={isListening ? 'animate-pulse' : ''} />
                    </button>

                    <button className="send-btn" onClick={handleSubmit} disabled={!textInput.trim()}>
                        <Send size={20} />
                    </button>
                </div>
            ) : (
                <button
                    className={`voice-orb ${agentState !== 'idle' ? 'active' : ''} state-${agentState}`}
                    onClick={handleOrbClick}
                >
                    {agentState !== 'idle' && (
                        <div className="orb-rings">
                            <div className="ring ring-1"></div>
                            <div className="ring ring-2"></div>
                            <div className="ring ring-3"></div>
                        </div>
                    )}
                    <div className="orb-core">
                        {getIcon()}
                    </div>
                </button>
            )}
        </div>
    );
}
