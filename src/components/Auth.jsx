import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { Loader2, User, KeyRound, Mail, ArrowRight } from 'lucide-react';
import './Auth.css';

export default function Auth({ onSession }) {
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        try {
            if (isLogin) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                if (data.session) onSession(data.session);
            } else {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                if (data.session) {
                    onSession(data.session);
                } else {
                    setErrorMsg('Signup successful! Please check your email for a confirmation link.');
                }
            }
        } catch (error) {
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-wrapper">
            <div className="auth-box glass-panel animate-slide-up">
                <div className="auth-header">
                    <img src="/icon-192.png" alt="MealMe" style={{ width: 64, height: 64, borderRadius: '18px', objectFit: 'cover', marginBottom: '8px' }} />
                    <h1 className="text-gradient">MealMe</h1>
                    <p className="subtitle">{isLogin ? 'Welcome back to your journey' : 'Start your transformation today'}</p>
                </div>

                <form onSubmit={handleAuth} className="auth-form">
                    {errorMsg && <div className="auth-error">{errorMsg}</div>}

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

                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? 'Sign In' : 'Create Account')}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </form>

                <div className="auth-footer">
                    <button className="toggle-auth-btn" onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }}>
                        {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                    </button>
                </div>
            </div>
        </div>
    );
}
