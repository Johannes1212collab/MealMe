import React, { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import './App.css';
import Dashboard from './components/Dashboard';
import VoiceAgent from './components/VoiceAgent';
import Recommendations from './components/Recommendations';
import CameraScanner from './components/CameraScanner';
import AnalysisResults from './components/AnalysisResults';
import Onboarding from './components/Onboarding';
import { recalculateMacrosWithNewProtein } from './utils/calculations';
import { API_BASE_URL } from './utils/api';

function App() {
  const [isOnboarded, setIsOnboarded] = useState(() => {
    return localStorage.getItem('mealme_onboarded') === 'true';
  });
  const [userMacroPlan, setUserMacroPlan] = useState(() => {
    const saved = localStorage.getItem('mealme_macroplan');
    return saved ? JSON.parse(saved) : null;
  });
  const [consumedMacros, setConsumedMacros] = useState(() => {
    const saved = localStorage.getItem('mealme_consumed_macros');
    return saved ? JSON.parse(saved) : { calories: 0, protein: 0, carbs: 0, fats: 0 };
  });
  const [mealResponses, setMealResponses] = useState(() => {
    const saved = localStorage.getItem('mealme_meal_responses');
    return saved ? JSON.parse(saved) : [];
  });

  const [agentState, setAgentState] = useState('idle'); // idle, listening, processing, speaking
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [suggestionData, setSuggestionData] = useState(null);

  // New States for Camera feature
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisType, setAnalysisType] = useState('meal'); // 'meal' or 'ingredients'

  // Ref for speech synthesis to allow cancellation
  const synthRef = useRef(window.speechSynthesis);

  // Sync state to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('mealme_onboarded', isOnboarded);
    if (userMacroPlan) localStorage.setItem('mealme_macroplan', JSON.stringify(userMacroPlan));
    localStorage.setItem('mealme_consumed_macros', JSON.stringify(consumedMacros));
    localStorage.setItem('mealme_meal_responses', JSON.stringify(mealResponses));
  }, [isOnboarded, userMacroPlan, consumedMacros, mealResponses]);

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
        netDeficit: surplusDeficit
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
      const response = await fetch(`${API_BASE_URL}/api/llm-knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName: userInput,
          remainingMacros: remainingMacros
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

  const handleAddFoodToPlan = () => {
    setShowAnalysis(false);

    // Add logic to save dynamic item
    if (suggestionData && (suggestionData.name || suggestionData.title)) {
      setConsumedMacros(prev => ({
        calories: prev.calories + (suggestionData.cals || 0),
        protein: prev.protein + (suggestionData.protein || 0),
        carbs: prev.carbs + (suggestionData.carbs || 0),
        fats: prev.fats + (suggestionData.fats || 0)
      }));

      setMealResponses(prev => [...prev, {
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        desc: suggestionData.name || suggestionData.title,
        status: 'completed',
        macros: {
          cals: suggestionData.cals || 0,
          protein: suggestionData.protein || 0,
          carbs: suggestionData.carbs || 0,
          fats: suggestionData.fats || 0
        }
      }]);
    }
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

  return (
    <div className="app-container">
      <header className="header">
        <div className="app-logo text-gradient">MealMe</div>
        <div className="profile-pic">A</div>
      </header>

      <main className="main-content">
        <Dashboard macroPlan={userMacroPlan} consumedMacros={consumedMacros} mealResponses={mealResponses} onPlanUpdate={handleUpdateProtein} />
      </main>

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
        resultData={suggestionData} // Pass the dynamic Gemini response
        onAdd={handleAddFoodToPlan}
      />
    </div>
  );
}

export default App;
