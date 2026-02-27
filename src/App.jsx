import React, { useState, useEffect, useRef } from 'react';
import { Camera, Download, X } from 'lucide-react';
import './App.css';
import Dashboard from './components/Dashboard';
import VoiceAgent from './components/VoiceAgent';
import Recommendations from './components/Recommendations';
import CameraScanner from './components/CameraScanner';
import AnalysisResults from './components/AnalysisResults';
import Onboarding from './components/Onboarding';
import Auth from './components/Auth';
import { supabase } from './utils/supabase';
import { recalculateMacrosWithNewProtein } from './utils/calculations';
import { API_BASE_URL } from './utils/api';

function App() {
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userMacroPlan, setUserMacroPlan] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [weeklyHistory, setWeeklyHistory] = useState(() => {
    const stored = localStorage.getItem('mealme_weekly_history');
    return stored ? JSON.parse(stored) : [];
  });
  const [consumedMacros, setConsumedMacros] = useState({ calories: 0, protein: 0, carbs: 0, fats: 0 });
  const [mealResponses, setMealResponses] = useState([]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const [session, setSession] = useState(null);

  // PWA install prompt
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setShowInstallBanner(false));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  useEffect(() => {
    const fetchProfile = async (userId) => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
        if (data.macro_plan && Object.keys(data.macro_plan).length > 0) {
          setUserMacroPlan(data.macro_plan);
          setIsOnboarded(true);
          if (data.macro_plan.name) setDisplayName(data.macro_plan.name);
        }
        if (data.consumed_macros && Object.keys(data.consumed_macros).length > 0) {
          setConsumedMacros(data.consumed_macros);
        }
        if (data.meal_responses && data.meal_responses.length > 0) {
          setMealResponses(data.meal_responses);
        }
        if (data.last_active_date) {
          localStorage.setItem('mealme_current_date', data.last_active_date);
        }
        if (data.weekly_history) {
          localStorage.setItem('mealme_weekly_history', JSON.stringify(data.weekly_history));
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const [agentState, setAgentState] = useState('idle'); // idle, listening, processing, speaking
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [suggestionData, setSuggestionData] = useState(null);

  // New States for Camera feature
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisType, setAnalysisType] = useState('meal'); // 'meal' or 'ingredients'

  // Ref for speech synthesis to allow cancellation
  const synthRef = useRef(window.speechSynthesis);

  // Sync state to Supabase whenever it changes
  useEffect(() => {
    if (!session) return;
    const syncToCloud = async () => {
      await supabase.from('profiles').update({
        macro_plan: userMacroPlan || {},
        consumed_macros: consumedMacros,
        meal_responses: mealResponses,
        last_active_date: localStorage.getItem('mealme_current_date') || new Date().toLocaleDateString(),
        weekly_history: JSON.parse(localStorage.getItem('mealme_weekly_history') || '[]')
      }).eq('id', session.user.id);
    };
    syncToCloud();
  }, [isOnboarded, userMacroPlan, consumedMacros, mealResponses, session]);

  // Midnight Rollover Script
  useEffect(() => {
    if (!userMacroPlan) return; // Wait until onboarded to trigger rollover logic

    const todayStr = new Date().toLocaleDateString();
    const storedDate = localStorage.getItem('mealme_current_date');

    if (storedDate && storedDate !== todayStr) {
      // Date mismatch detected! Execute midnight rollover.
      const surplusDeficit = userMacroPlan.calories - consumedMacros.calories;

      const savedHistory = localStorage.getItem('mealme_weekly_history');
      let historyArray = savedHistory ? JSON.parse(savedHistory) : [];

      historyArray.push({
        date: storedDate,
        targetCals: userMacroPlan.calories,
        consumedCals: consumedMacros.calories,
        netDeficit: surplusDeficit,
        meals: mealResponses
      });

      // Maintain trailing 7 days
      if (historyArray.length > 7) {
        historyArray = historyArray.slice(historyArray.length - 7);
      }
      localStorage.setItem('mealme_weekly_history', JSON.stringify(historyArray));

      // Reset the current day's trackers
      setConsumedMacros({ calories: 0, protein: 0, carbs: 0, fats: 0 });
      setMealResponses([]);
    }

    // Always log today's date
    localStorage.setItem('mealme_current_date', todayStr);
  }, [userMacroPlan]); // Runs once when userMacroPlan becomes available

  const handleOnboardingComplete = (planData) => {
    setUserMacroPlan(planData);
    if (planData.name) setDisplayName(planData.name);
    setIsOnboarded(true);
  };

  const handleUpdateProtein = (newProtein) => {
    const updatedPlan = recalculateMacrosWithNewProtein(userMacroPlan, newProtein);
    setUserMacroPlan(updatedPlan);
  };

  const handleAgentCancel = () => {
    if ('speechSynthesis' in window) {
      synthRef.current.cancel();
    }
    setAgentState('idle');
  };

  const handleAIRequest = async (userInput) => {
    if (!userInput) return;

    setAgentState('processing');
    setShowRecommendations(false);

    const remainingMacros = {
      calories: Math.max(0, userMacroPlan.calories - consumedMacros.calories),
      protein: Math.max(0, userMacroPlan.protein - consumedMacros.protein),
      carbs: Math.max(0, userMacroPlan.carbs - consumedMacros.carbs),
      fats: Math.max(0, userMacroPlan.fats - consumedMacros.fats)
    };

    try {
      const storedHistory = localStorage.getItem('mealme_weekly_history');
      const weeklyHistory = storedHistory ? JSON.parse(storedHistory) : [];

      const response = await fetch(`${API_BASE_URL}/api/llm-knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName: userInput,
          remainingMacros: remainingMacros,
          weeklyHistory: weeklyHistory
        })
      });

      const data = await response.json();
      console.log("Backend AI Response:", data);

      handleAIResponse(data);
    } catch (err) {
      console.error("Failed to hit backend LLM service:", err);
      handleAIResponse({ error: true });
    }
  };

  const handleAIResponse = (backendData) => {
    if (backendData.error || backendData.status === 'error' || !backendData.data) {
      setShowRecommendations(false);
      setAgentState('idle');
      if ('speechSynthesis' in window) {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance("I'm sorry, I couldn't connect to my brain.");
        synthRef.current.speak(utterance);
      }
      return;
    }

    setSuggestionData(backendData.data);
    setShowRecommendations(true);
    setAgentState('speaking');

    if ('speechSynthesis' in window) {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(backendData.data.message);
      utterance.rate = 1.0;
      utterance.pitch = 1.1;

      const voices = synthRef.current.getVoices();
      const femaleVoice = voices.find(voice => voice.name.includes('Female') || voice.name.includes('Samantha') || voice.name.includes('Google UK English Female'));
      if (femaleVoice) utterance.voice = femaleVoice;

      utterance.onend = () => setAgentState('idle');
      synthRef.current.speak(utterance);
    } else {
      setTimeout(() => setAgentState('idle'), 5000);
    }
  };

  // Camera Flow Handlers
  const openCamera = () => {
    setIsCameraOpen(true);
    // Beep sound
    if ('speechSynthesis' in window) {
      synthRef.current.cancel();
    }
  };

  const handlePhotoCaptured = (mode, backendResponse) => {
    console.log("Backend Vision Output:", backendResponse);
    setAnalysisType(mode);
    setIsCameraOpen(false);

    if (backendResponse.error || !backendResponse.name) {
      // Fallback or error handling
      setShowAnalysis(false);
      if ('speechSynthesis' in window) {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance("Sorry, I had trouble analyzing that image.");
        synthRef.current.speak(utterance);
      }
      return;
    }

    setShowAnalysis(true);
    setSuggestionData(backendResponse); // Store dynamic result

    // Simulate AI announcing what it sees
    if ('speechSynthesis' in window) {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(backendResponse.description || `Looks like a ${backendResponse.name}.`);
      synthRef.current.speak(utterance);
    }
  };

  const handleAddFoodToPlan = (result) => {
    setShowAnalysis(false);
    // Use the passed result (which may be corrected) or fall back to suggestionData
    const data = result || suggestionData;
    if (data && (data.name || data.title)) {
      setConsumedMacros(prev => ({
        calories: prev.calories + (data.cals || 0),
        protein: prev.protein + (data.protein || 0),
        carbs: prev.carbs + (data.carbs || 0),
        fats: prev.fats + (data.fats || 0)
      }));

      setMealResponses(prev => [...prev, {
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        desc: data.name || data.title,
        status: 'completed',
        macros: {
          cals: data.cals || 0,
          protein: data.protein || 0,
          carbs: data.carbs || 0,
          fats: data.fats || 0
        }
      }]);
    }
  };

  const handleReaddMeal = (meal) => {
    const m = meal.macros || {};
    setConsumedMacros(prev => ({
      calories: prev.calories + (m.cals || 0),
      protein: prev.protein + (m.protein || 0),
      carbs: prev.carbs + (m.carbs || 0),
      fats: prev.fats + (m.fats || 0)
    }));
    setMealResponses(prev => [...prev, {
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      desc: meal.desc + ' (re-added)',
      status: 'completed',
      macros: { cals: m.cals || 0, protein: m.protein || 0, carbs: m.carbs || 0, fats: m.fats || 0 }
    }]);
  };

  const handleSelectRecommendation = (selectedOption) => {
    // Accumulate the chosen AI macros into the daily consumed total
    setConsumedMacros(prev => ({
      calories: prev.calories + (selectedOption.cals || 0),
      protein: prev.protein + (selectedOption.protein || 0),
      carbs: prev.carbs + (selectedOption.carbs || 0),
      fats: prev.fats + (selectedOption.fats || 0)
    }));

    // Push the chosen option to the visual log
    setMealResponses(prev => [...prev, {
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      desc: selectedOption.title,
      status: 'completed',
      macros: {
        cals: selectedOption.cals || 0,
        protein: selectedOption.protein || 0,
        carbs: selectedOption.carbs || 0,
        fats: selectedOption.fats || 0
      }
    }]);

    setShowRecommendations(false);
    setAgentState('idle');
  };

  useEffect(() => {
    if ('speechSynthesis' in window) {
      synthRef.current.getVoices();
      window.speechSynthesis.onvoiceschanged = () => synthRef.current.getVoices();
    }
    return () => synthRef.current.cancel();
  }, []);

  const remainingMacros = {
    calories: Math.max(0, (userMacroPlan?.calories || 2000) - consumedMacros.calories),
    protein: Math.max(0, (userMacroPlan?.protein || 150) - consumedMacros.protein),
    carbs: Math.max(0, (userMacroPlan?.carbs || 200) - consumedMacros.carbs),
    fats: Math.max(0, (userMacroPlan?.fats || 70) - consumedMacros.fats)
  };

  if (!isOnboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const handleLogHistoricalMeal = (meal) => {
    setConsumedMacros(prev => ({
      calories: prev.calories + meal.macros.cals,
      protein: prev.protein + meal.macros.protein,
      carbs: prev.carbs + meal.macros.carbs,
      fats: prev.fats + meal.macros.fats
    }));

    setMealResponses(prev => [...prev, {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      desc: meal.desc || meal.name || 'Historical Meal Logged',
      macros: meal.macros,
      status: 'completed'
    }]);
  };

  const handleUpdateCoachPlan = (newPlan) => {
    setUserMacroPlan(newPlan);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setDisplayName(trimmed);
    setIsEditingName(false);
    // Persist name inside the macro_plan JSON in Supabase
    if (session && userMacroPlan) {
      await supabase.from('profiles').update({
        macro_plan: { ...userMacroPlan, name: trimmed }
      }).eq('id', session.user.id);
    }
  };

  const handleFileAnalysisComplete = (data) => {
    if (!data || data.error) {
      if ('speechSynthesis' in window) {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance('Sorry, I had trouble analyzing that file.');
        synthRef.current.speak(utterance);
      }
      return;
    }
    // Reuse the same AnalysisResults modal as the camera flow
    setAnalysisType('meal');
    setSuggestionData(data);
    setShowAnalysis(true);
    if ('speechSynthesis' in window) {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(data.description || `Found ${data.name}.`);
      synthRef.current.speak(utterance);
    }
  };

  if (!session) {
    return <Auth onSession={setSession} />;
  }

  if (!isOnboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="app-container">
      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 16px', background: 'linear-gradient(90deg, rgba(231,156,74,0.15), rgba(193,108,240,0.1))',
          borderBottom: '1px solid rgba(231,156,74,0.25)', gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={15} color="var(--primary-light)" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontFamily: 'var(--font-primary)' }}>
              Get the full app experience — install MealMe on your device.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={handleInstallApp}
              style={{ padding: '5px 14px', borderRadius: '20px', border: 'none', background: 'var(--primary-light)', color: '#0e0c13', fontSize: '0.78rem', fontWeight: '700', fontFamily: 'var(--font-primary)', cursor: 'pointer' }}
            >
              Install App
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <header className="header">
        <div className="app-logo text-gradient">MealMe</div>
        <div className="header-actions" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-primary)', fontSize: '0.85rem' }}>
            Sign Out
          </button>
          <div style={{ position: 'relative' }}>
            <div
              className="profile-pic"
              onClick={() => { setIsEditingName(v => !v); setNameInput(displayName || ''); }}
              style={{ cursor: 'pointer', userSelect: 'none' }}
              title="Edit name"
            >
              {(displayName || session?.user?.email || '?')[0].toUpperCase()}
            </div>
            {isEditingName && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: 'rgba(21,18,32,0.98)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '14px', padding: '16px', width: '220px', zIndex: 999,
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)'
              }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px', fontFamily: 'var(--font-primary)' }}>Display Name</p>
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  placeholder="Your first name"
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)',
                    fontSize: '0.9rem', fontFamily: 'var(--font-primary)', outline: 'none', marginBottom: '10px'
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setIsEditingName(false)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-primary)', fontSize: '0.82rem' }}>Cancel</button>
                  <button onClick={handleSaveName} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: 'var(--gradient-main)', color: '#fff', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font-primary)', fontSize: '0.82rem' }}>Save</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <Dashboard
          macroPlan={userMacroPlan}
          consumedMacros={consumedMacros}
          mealResponses={mealResponses}
          userName={displayName || session?.user?.email?.split('@')[0] || 'there'}
          weeklyHistory={weeklyHistory}
          onPlanUpdate={handleUpdateProtein}
          onReaddMeal={handleReaddMeal}
          onCoachPlanUpdate={handleUpdateCoachPlan}
        />  </main>

      <div className="action-bar">
        <VoiceAgent
          agentState={agentState}
          onCancel={handleAgentCancel}
          onSubmit={handleAIRequest}
        />
        <button className="floating-camera-btn" onClick={openCamera} aria-label="Scan Food">
          <Camera size={24} />
        </button>
      </div>

      <Recommendations
        isVisible={showRecommendations}
        onClose={() => setShowRecommendations(false)}
        suggestionData={suggestionData}
        onSelectOption={handleSelectRecommendation}
        onReaddMeal={handleReaddMeal}
      />

      <CameraScanner
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handlePhotoCaptured}
        remainingMacros={remainingMacros}
      />

      <AnalysisResults
        isVisible={showAnalysis}
        onClose={() => setShowAnalysis(false)}
        resultData={suggestionData}
        onAdd={handleAddFoodToPlan}
        onResultUpdate={(corrected) => setSuggestionData(corrected)}
      />
    </div>
  );
}

export default App;
