import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { Loader2, KeyRound, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import './Auth.css';

export default function Auth({ onSession }) {
    const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            if (mode === 'forgot') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                });
                if (error) throw error;
                setSuccessMsg('Password reset email sent! Check your inbox and follow the link to set a new password.');
                return;
            }

            if (mode === 'login') {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                if (data.session) onSession(data.session);
            } else {
                const { data, error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                if (data.session) {
                    onSession(data.session);
                } else {
                    setSuccessMsg('Account created! Please check your email for a confirmation link.');
                }
            }
        } catch (error) {
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (newMode) => {
        setMode(newMode);
        setErrorMsg('');
        setSuccessMsg('');
    };

    return (
        <div className="auth-wrapper">
            <div className="auth-box glass-panel animate-slide-up">
                <div className="auth-header">
                    <img src="/icon-192.png" alt="MealMe" style={{ width: 64, height: 64, borderRadius: '18px', objectFit: 'cover', marginBottom: '8px' }} />
                    <h1 className="text-gradient">MealMe</h1>
                    <p className="subtitle">
                        {mode === 'login' ? 'Welcome back to your journey'
                            : mode === 'signup' ? 'Start your transformation today'
                                : 'Reset your password'}
                    </p>
                </div>

                <form onSubmit={handleAuth} className="auth-form">
                    {errorMsg && <div className="auth-error">{errorMsg}</div>}
                    {successMsg && (
                        <div className="auth-error" style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle2 size={16} /> {successMsg}
                        </div>
                    )}

                    <div className="input-group">
                        <Mail size={18} className="input-icon" />
                        <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    {mode !== 'forgot' && (
                        <div className="input-group">
                            <KeyRound size={18} className="input-icon" />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>
                    )}

                    {/* Forgot password link — only shown on login screen */}
                    {mode === 'login' && (
                        <button
                            type="button"
                            onClick={() => switchMode('forgot')}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', alignSelf: 'flex-end', padding: '0 2px', fontFamily: 'var(--font-primary)' }}
                        >
                            Forgot password?
                        </button>
                    )}

                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : (
                            mode === 'login' ? 'Sign In' :
                                mode === 'signup' ? 'Create Account' :
                                    'Send Reset Email'
                        )}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </form>

                <div className="auth-footer">
                    {mode === 'forgot' ? (
                        <button className="toggle-auth-btn" onClick={() => switchMode('login')}>
                            ← Back to Sign In
                        </button>
                    ) : (
                        <button className="toggle-auth-btn" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
                            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
