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
import RetroAddMealModal from './components/RetroAddMealModal';
import MealCountPrompt from './components/MealCountPrompt';
import { supabase } from './utils/supabase';
import { recalculateMacrosWithNewProtein } from './utils/calculations';
import { API_BASE_URL } from './utils/api';

function App() {
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userMacroPlan, setUserMacroPlan] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [weeklyHistory, setWeeklyHistory] = useState([]);
  const [consumedMacros, setConsumedMacros] = useState({ calories: 0, protein: 0, carbs: 0, fiber: 0, fats: 0 });
  const [mealResponses, setMealResponses] = useState([]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [iosInstallType, setIosInstallType] = useState(null); // 'safari' | 'other-browser' | null
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');

  const [session, setSession] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [plannedMeals, setPlannedMeals] = useState(null); // null = not set today
  const [showMealCountPrompt, setShowMealCountPrompt] = useState(false);

  // PWA install prompt
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

    if (isIOS) {
      // iOS Safari: can add to home screen via Share sheet
      // iOS Firefox/Chrome: must open in Safari first
      setIosInstallType(isIOSSafari ? 'safari' : 'other-browser');
      setShowInstallBanner(true);
      return;
    }

    // Android / Desktop: use native beforeinstallprompt
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
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();

        // Check localStorage onboarding flag (per-user, keyed by userId)
        const localFlag = localStorage.getItem(`mealme_onboarded_${userId}`);

        if (data) {
          const hasMacroPlan = data.macro_plan && Object.keys(data.macro_plan).length > 0 && data.macro_plan.calories > 0;
          const hasOnboardedMarker = data.macro_plan?._onboarded === true;
          const hasAnyUsageData = (data.meal_responses && data.meal_responses.length > 0) ||
            (data.weekly_history && data.weekly_history.length > 0) ||
            (data.consumed_macros && data.consumed_macros.calories > 0);

          // User is onboarded if: real macro plan, _onboarded marker in DB, any usage data, OR localStorage flag
          if (hasMacroPlan || hasOnboardedMarker || hasAnyUsageData || localFlag === '1') {
            setIsOnboarded(true);
            // Write/refresh the flag so future loads are covered
            localStorage.setItem(`mealme_onboarded_${userId}`, '1');
          }

          if (hasMacroPlan) {
            setUserMacroPlan(data.macro_plan);
            if (data.macro_plan.name) setDisplayName(data.macro_plan.name);
          }

          // ── Date rollover check: done HERE before restoring state ──────────────────
          // This MUST happen before we call setMealResponses / setConsumedMacros,
          // because syncToCloud would otherwise race us and write last_active_date=today
          // with yesterday's meal data — making future loads think no rollover is needed.
          const todayStr = new Date().toLocaleDateString();
          const lastActive = data.last_active_date;
          const isNewDay = lastActive && lastActive !== todayStr;

          if (isNewDay) {
            // Archive yesterday into weekly history
            const yesterdayEntry = {
              date: lastActive,
              targetCals: data.macro_plan?.calories || 0,
              consumedCals: data.consumed_macros?.calories || 0,
              netDeficit: (data.macro_plan?.calories || 0) - (data.consumed_macros?.calories || 0),
              meals: data.meal_responses || []
            };
            const existingHistory = data.weekly_history || [];
            const updatedHistory = [...existingHistory, yesterdayEntry].slice(-7);
            setWeeklyHistory(updatedHistory);
            localStorage.setItem('mealme_weekly_history', JSON.stringify(updatedHistory));

            // Reset today's counters — do NOT load yesterday's stale meals/macros
            setConsumedMacros({ calories: 0, protein: 0, carbs: 0, fiber: 0, fats: 0 });
            setMealResponses([]);
            setPlannedMeals(null); // Reset meal plan on new day

            // Write clean state to Supabase immediately so syncToCloud sees correct data
            await supabase.from('profiles').update({
              weekly_history: updatedHistory,
              consumed_macros: { calories: 0, protein: 0, carbs: 0, fiber: 0, fats: 0 },
              meal_responses: [],
              last_active_date: todayStr
            }).eq('id', userId);
          } else {
            // Same day — restore normally
            const meals = (data.meal_responses && data.meal_responses.length > 0) ? data.meal_responses : null;
            if (meals) setMealResponses(meals);

            // Self-healing: recompute consumed totals from saved meal list if stored totals look wrong
            // This fixes desyncs where consumed_macros was zeroed but meal_responses still has data
            const storedMacros = data.consumed_macros;
            const storedCals = storedMacros?.calories || 0;
            const recomputedFromMeals = meals ? meals.reduce((acc, m) => ({
              calories: acc.calories + (m.macros?.cals || 0),
              protein: acc.protein + (m.macros?.protein || 0),
              carbs: acc.carbs + (m.macros?.carbs || 0),
              fiber: (acc.fiber || 0) + (m.macros?.fiber || 0),
              fats: acc.fats + (m.macros?.fats || 0),
            }), { calories: 0, protein: 0, carbs: 0, fiber: 0, fats: 0 }) : null;

            if (storedCals === 0 && recomputedFromMeals?.calories > 0) {
              // consumedMacros is zeroed but meals exist — recompute from meals (self-heal)
              console.warn('[MealMe] Detected consumed_macros desync — self-healing from meal_responses');
              setConsumedMacros(recomputedFromMeals);
            } else if (storedMacros && Object.keys(storedMacros).length > 0) {
              setConsumedMacros(storedMacros);
            }
          }

          if (data.weekly_history && data.weekly_history.length > 0 && !isNewDay) {
            setWeeklyHistory(data.weekly_history);
            localStorage.setItem('mealme_weekly_history', JSON.stringify(data.weekly_history));
          }
          // Restore planned meals for today
          if (data.planned_meals_date === new Date().toLocaleDateString() && data.planned_meals) {
            setPlannedMeals(data.planned_meals);
          }
          // Always stamp today's date locally
          localStorage.setItem('mealme_current_date', todayStr);
        } else if (localFlag === '1') {
          // Profile row missing but local flag says they onboarded — let them through
          setIsOnboarded(true);
        }
      } catch (err) {
        console.error('fetchProfile error:', err);
        // If Supabase fails entirely, fall back to local flag
        const localFlag = localStorage.getItem(`mealme_onboarded_${userId}`);
        if (localFlag === '1') setIsOnboarded(true);
      }
    };

    // Safety net: never hang on the splash screen longer than 6 seconds
    const loadingTimeout = setTimeout(() => setIsProfileLoading(false), 6000);

    // Use onAuthStateChange as the SINGLE source of truth.
    // INITIAL_SESSION fires exactly once at startup with the real auth state —
    // unlike getSession() which races against our async IndexedDB storage reads
    // and returns null before the stored token can be retrieved.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);

      if (event === 'INITIAL_SESSION') {
        // Authoritative startup state — only fires once
        if (session) {
          await fetchProfile(session.user.id);
        }
        clearTimeout(loadingTimeout);
        setIsProfileLoading(false);
      } else if (session) {
        // SIGNED_IN / TOKEN_REFRESHED / etc — refresh profile silently
        fetchProfile(session.user.id);
      }
    });

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const [agentState, setAgentState] = useState('idle'); // idle, listening, processing, speaking
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [suggestionData, setSuggestionData] = useState(null);
  const [streamingText, setStreamingText] = useState(''); // live SSE token accumulator

  // New States for Camera feature
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisType, setAnalysisType] = useState('meal'); // 'meal' or 'ingredients'

  // Retro-add meal modal state
  const [retroAddTarget, setRetroAddTarget] = useState(null); // { date: string } | null

  // Ref for speech synthesis to allow cancellation
  const synthRef = useRef(window.speechSynthesis);

  // ── Per-meal calorie budget (dynamic) ────────────────────────────────────────
  // Recalculates every time meals are logged or planned count changes
  const remainingMeals = Math.max((plannedMeals || 0) - mealResponses.length, 1);
  // Compute remaining calories from state so perMealTarget is always valid
  const remainingCalsToday = userMacroPlan
    ? Math.max(0, (userMacroPlan.calories || 0) - (consumedMacros.calories || 0))
    : 0;
  // perMealTarget is null when no meal count set — AI uses default sizing
  const perMealTarget = plannedMeals
    ? Math.round(remainingCalsToday / remainingMeals) || null
    : null;

  // ── URL param reader (push notification tap-through) ─────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mealPlan = params.get('mealPlan');
    const showPrompt = params.get('showMealPrompt');
    if (mealPlan && mealPlan !== 'prompt') {
      const count = mealPlan === '6plus' ? 6 : parseInt(mealPlan, 10);
      if (!isNaN(count)) handleMealCountSelect(count);
    } else if (showPrompt === '1' || mealPlan === 'prompt') {
      setShowMealCountPrompt(true);
    }
    // Clean URL without reloading
    if (params.has('mealPlan') || params.has('showMealPrompt')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Show meal count prompt on first open each day once onboarded ──────────────
  useEffect(() => {
    if (isOnboarded && !isProfileLoading && plannedMeals === null) {
      setShowMealCountPrompt(true);
    }
  }, [isOnboarded, isProfileLoading, plannedMeals]);

  // ── Register push subscription once user is signed in ────────────────────────
  useEffect(() => {
    if (!session?.user?.id) return;
    const registerPush = async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('SW not ready')), 10000))
        ]);
        // Fetch VAPID public key from server
        const keyRes = await fetch(`${API_BASE_URL}/api/push/vapid-key`);
        const { publicKey } = await keyRes.json();
        const existing = await reg.pushManager.getSubscription();
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        const { endpoint, keys } = sub.toJSON();
        await fetch(`${API_BASE_URL}/api/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        });
      } catch (err) {
        console.warn('Push subscription failed (non-fatal):', err.message);
      }
    };
    registerPush();
  }, [session?.user?.id]);

  // Helper: convert VAPID base64 public key to Uint8Array for push subscription
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
  };

  const handleMealCountSelect = async (count) => {
    setShowMealCountPrompt(false);
    if (!count) return; // user skipped
    setPlannedMeals(count);
    // Persist to Supabase
    if (session?.user?.id) {
      await supabase.from('profiles').update({
        planned_meals: count,
        planned_meals_date: new Date().toLocaleDateString()
      }).eq('id', session.user.id);
    }
  };

  // Sync state to Supabase whenever it changes
  // IMPORTANT: guard with isOnboarded — without this, the effect fires when session is first
  // set (before fetchProfile completes) and saves macro_plan:{} which overwrites the real plan.
  useEffect(() => {
    if (!session || !isOnboarded) return;
    const syncToCloud = async () => {
      const updatePayload = {
        macro_plan: userMacroPlan || {},
        consumed_macros: consumedMacros,
        meal_responses: mealResponses,
        last_active_date: new Date().toLocaleDateString(),
      };
      // SAFETY: never overwrite weekly_history with an empty array.
      // If React state is empty (e.g. during state initialisation or a reset),
      // leave the Supabase history column untouched.
      if (weeklyHistory.length > 0) {
        updatePayload.weekly_history = weeklyHistory;
      }
      await supabase.from('profiles').update(updatePayload).eq('id', session.user.id);
    };
    syncToCloud();
  }, [isOnboarded, userMacroPlan, consumedMacros, mealResponses, weeklyHistory, session]);


  // ── Visibility-change rollover: handles users who keep the app open past midnight ──
  useEffect(() => {
    const checkDateOnFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const todayStr = new Date().toLocaleDateString();
      const stored = localStorage.getItem('mealme_current_date');
      if (!stored || stored === todayStr) return;
      // New day detected while app was open — archive and reset
      setWeeklyHistory(prev => {
        const entry = {
          date: stored,
          targetCals: userMacroPlan?.calories || 0,
          consumedCals: consumedMacros.calories,
          netDeficit: (userMacroPlan?.calories || 0) - consumedMacros.calories,
          meals: mealResponses
        };
        return [...prev, entry].slice(-7);
      });
      setConsumedMacros({ calories: 0, protein: 0, carbs: 0, fiber: 0, fats: 0 });
      setMealResponses([]);
      localStorage.setItem('mealme_current_date', todayStr);
    };
    document.addEventListener('visibilitychange', checkDateOnFocus);
    return () => document.removeEventListener('visibilitychange', checkDateOnFocus);
  }, [userMacroPlan, consumedMacros, mealResponses]);

  const handleOnboardingComplete = (planData) => {
    // Embed the _onboarded marker directly into the plan so Supabase always
    // has a reliable signal, even if macro values are wiped by a future sync bug
    const markedPlan = { ...planData, _onboarded: true };
    setUserMacroPlan(markedPlan);
    if (planData.name) setDisplayName(planData.name);
    setIsOnboarded(true);

    // Write the flag to localStorage immediately (per-user key)
    if (session?.user?.id) {
      localStorage.setItem(`mealme_onboarded_${session.user.id}`, '1');
    }

    // Write directly to Supabase NOW — don't wait for the syncToCloud effect
    // This ensures the _onboarded signal is in the DB within milliseconds
    if (session?.user?.id) {
      supabase.from('profiles').update({
        macro_plan: markedPlan
      }).eq('id', session.user.id).then(({ error }) => {
        if (error) console.error('Failed to save onboarded marker:', error);
      });
    }
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
    setStreamingText('');

    const remainingMacros = {
      calories: Math.max(0, userMacroPlan.calories - consumedMacros.calories),
      protein: Math.max(0, userMacroPlan.protein - consumedMacros.protein),
      carbs: Math.max(0, userMacroPlan.carbs - consumedMacros.carbs),
      fats: Math.max(0, userMacroPlan.fats - consumedMacros.fats)
    };

    const storedHistory = localStorage.getItem('mealme_weekly_history');
    const weeklyHistory = storedHistory ? JSON.parse(storedHistory) : [];
    const body = JSON.stringify({
      restaurantName: userInput, remainingMacros, weeklyHistory, perMealTarget, plannedMeals
    });

    let streamSucceeded = false;
    try {
      // ── Streaming path ─────────────────────────────────────────────
      const resp = await fetch(`${API_BASE_URL}/api/llm-knowledge-stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      });
      if (!resp.ok || !resp.body) throw new Error('Stream not available');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accumulatedMessage = ''; // the extracted message text

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'status') {
              // Show status label while Gemini is thinking
              setStreamingText(ev.text);
            } else if (ev.type === 'chunk') {
              // Accumulate tokens; try to extract the "message" field as it streams
              accumulatedMessage += ev.text;
              // Try to pull out the message field value for a nicer display
              const msgMatch = accumulatedMessage.match(/"message"\s*:\s*"([^"]*)/s);
              if (msgMatch) setStreamingText(msgMatch[1]);
            } else if (ev.type === 'done') {
              streamSucceeded = true;
              setStreamingText('');
              console.log('Stream done:', ev.result);
              handleAIResponse({ status: 'success', data: ev.result });
            } else if (ev.type === 'error') {
              throw new Error(ev.message);
            }
          } catch { /* ignore parse errors on partial chunks */ }
        }
      }
    } catch (streamErr) {
      console.warn('Stream failed, falling back to standard endpoint:', streamErr.message);
    }

    if (!streamSucceeded) {
      // ── Fallback: non-streaming endpoint ─────────────────────────────────
      setStreamingText('Thinking...');
      try {
        const response = await fetch(`${API_BASE_URL}/api/llm-knowledge`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body
        });
        const data = await response.json();
        handleAIResponse(data);
      } catch (err) {
        console.error('Fallback also failed:', err);
        handleAIResponse({ error: true });
      } finally {
        setStreamingText('');
      }
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

    const d = backendData.data;

    // ── Portion Adjustment ──────────────────────────────────────
    if (d.type === 'portion') {
      const ref = (d.mealReference || '').toLowerCase();
      // Find most recent meal that matches the reference
      const matchedMeal = [...mealResponses].reverse().find(m =>
        m.desc && (m.desc.toLowerCase().includes(ref) || ref.includes(m.desc.toLowerCase().split(' ')[0]))
      ) || mealResponses[mealResponses.length - 1]; // fall back to most recent

      if (matchedMeal?.id) {
        handleEditMealPortion(matchedMeal.id, d.portionMultiplier ?? 0.5, d.portionNote || '');
      }

      if ('speechSynthesis' in window) {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(d.message);
        utterance.rate = 1.0; utterance.pitch = 1.1;
        const voices = synthRef.current.getVoices();
        const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google UK English Female'));
        if (femaleVoice) utterance.voice = femaleVoice;
        utterance.onend = () => setAgentState('idle');
        synthRef.current.speak(utterance);
      } else {
        setTimeout(() => setAgentState('idle'), 3000);
      }
      setShowRecommendations(false);
      return;
    }

    setSuggestionData(d);
    setShowRecommendations(true);
    setAgentState('speaking');

    if ('speechSynthesis' in window) {
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(d.message);
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

    // Menu mode returns a recommendations-format object (with .options), not a single food
    if (mode === 'menu') {
      if (backendResponse.error || !backendResponse.options?.length) {
        const errMsg = backendResponse.message || 'Could not read menu — try a clearer photo.';
        setCameraErrorMsg(errMsg);
        setTimeout(() => setCameraErrorMsg(''), 6000);
        return;
      }
      // Route to the Recommendations panel
      setSuggestionData(backendResponse);
      setShowRecommendations(true);
      setAgentState('speaking');
      if ('speechSynthesis' in window && backendResponse.response) {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(backendResponse.response);
        synthRef.current.speak(utterance);
        utterance.onend = () => setAgentState('idle');
      } else {
        setTimeout(() => setAgentState('idle'), 2000);
      }
      return;
    }

    if (backendResponse.error || !backendResponse.name) {
      const errMsg = backendResponse.message || JSON.stringify(backendResponse) || 'Analysis failed — no data returned';
      console.error('Vision error (full response):', JSON.stringify(backendResponse, null, 2));
      setShowAnalysis(false);
      setCameraErrorMsg(`Vision error: ${errMsg}`);
      setTimeout(() => setCameraErrorMsg(''), 10000);
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
        fiber: (prev.fiber || 0) + (data.fiber || 0),
        fats: prev.fats + (data.fats || 0)
      }));

      setMealResponses(prev => [...prev, {
        id: Date.now(),
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        desc: data.name || data.title,
        status: 'completed',
        macros: {
          cals: data.cals || 0,
          protein: data.protein || 0,
          carbs: data.carbs || 0,
          fiber: data.fiber || 0,
          fats: data.fats || 0
        },
        originalMacros: {
          cals: data.cals || 0,
          protein: data.protein || 0,
          carbs: data.carbs || 0,
          fiber: data.fiber || 0,
          fats: data.fats || 0
        },
        portionMultiplier: 1
      }]);
    }
  };

  // Edit the portion of a logged meal (e.g., ate half, shared)
  const handleEditMealPortion = (mealId, multiplier, note) => {
    setMealResponses(prev => {
      const updated = prev.map(meal => {
        if (meal.id !== mealId) return meal;
        const orig = meal.originalMacros || meal.macros;
        const newMacros = {
          cals: Math.round((orig.cals || 0) * multiplier),
          protein: Math.round((orig.protein || 0) * multiplier),
          carbs: Math.round((orig.carbs || 0) * multiplier),
          fiber: Math.round((orig.fiber || 0) * multiplier),
          fats: Math.round((orig.fats || 0) * multiplier),
        };
        return { ...meal, macros: newMacros, originalMacros: orig, portionMultiplier: multiplier, portionNote: note || '' };
      });
      // Recalculate consumed totals from scratch
      const totals = updated.reduce((acc, m) => ({
        calories: acc.calories + (m.macros?.cals || 0),
        protein: acc.protein + (m.macros?.protein || 0),
        carbs: acc.carbs + (m.macros?.carbs || 0),
        fiber: (acc.fiber || 0) + (m.macros?.fiber || 0),
        fats: acc.fats + (m.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fiber: 0, fats: 0 });
      setConsumedMacros(totals);
      return updated;
    });
  };

  const handleReaddMeal = (meal) => {
    const m = meal.macros || {};
    setConsumedMacros(prev => ({
      calories: prev.calories + (m.cals || 0),
      protein: prev.protein + (m.protein || 0),
      carbs: prev.carbs + (m.carbs || 0),
      fiber: (prev.fiber || 0) + (m.fiber || 0),
      fats: prev.fats + (m.fats || 0)
    }));
    setMealResponses(prev => [...prev, {
      id: Date.now(),
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      desc: meal.desc + ' (re-added)',
      status: 'completed',
      macros: { cals: m.cals || 0, protein: m.protein || 0, carbs: m.carbs || 0, fiber: m.fiber || 0, fats: m.fats || 0 },
      originalMacros: { cals: m.cals || 0, protein: m.protein || 0, carbs: m.carbs || 0, fiber: m.fiber || 0, fats: m.fats || 0 },
      portionMultiplier: 1
    }]);
  };

  const handleSelectRecommendation = (selectedOption) => {
    const isMultiVenue = !!selectedOption._venueLabel;

    // Accumulate the chosen AI macros into the daily consumed total
    setConsumedMacros(prev => ({
      calories: prev.calories + (selectedOption.cals || 0),
      protein: prev.protein + (selectedOption.protein || 0),
      carbs: prev.carbs + (selectedOption.carbs || 0),
      fiber: (prev.fiber || 0) + (selectedOption.fiber || 0),
      fats: prev.fats + (selectedOption.fats || 0)
    }));

    // Push the chosen option to the visual log — use venue-labelled title for multi-venue items
    setMealResponses(prev => [...prev, {
      id: Date.now(),
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      desc: selectedOption._venueLabel || selectedOption.title,
      status: 'completed',
      macros: {
        cals: selectedOption.cals || 0,
        protein: selectedOption.protein || 0,
        carbs: selectedOption.carbs || 0,
        fiber: selectedOption.fiber || 0,
        fats: selectedOption.fats || 0
      },
      originalMacros: {
        cals: selectedOption.cals || 0,
        protein: selectedOption.protein || 0,
        carbs: selectedOption.carbs || 0,
        fiber: selectedOption.fiber || 0,
        fats: selectedOption.fats || 0
      },
      portionMultiplier: 1
    }]);

    // For multi-venue: keep panel open so user can log each stop individually
    // For single-venue: close as usual
    if (!isMultiVenue) {
      setShowRecommendations(false);
      setAgentState('idle');
    }
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

  // ── Delete a meal from TODAY's log ─────────────────────────────────
  const handleDeleteTodayMeal = (mealId) => {
    setMealResponses(prev => {
      const updated = prev.filter(m => m.id !== mealId);
      // Recalculate consumed totals from scratch
      const totals = updated.reduce((acc, m) => ({
        calories: acc.calories + (m.macros?.cals || 0),
        protein: acc.protein + (m.macros?.protein || 0),
        carbs: acc.carbs + (m.macros?.carbs || 0),
        fiber: (acc.fiber || 0) + (m.macros?.fiber || 0),
        fats: acc.fats + (m.macros?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fiber: 0, fats: 0 });
      setConsumedMacros(totals);
      return updated;
    });
  };

  // ── Delete a meal from a HISTORICAL day ───────────────────────────
  const handleDeleteHistoricalMeal = (date, mealIndex) => {
    setWeeklyHistory(prev => {
      const updated = prev.map(day => {
        if (day.date !== date) return day;
        const newMeals = day.meals.filter((_, i) => i !== mealIndex);
        const newConsumedCals = newMeals.reduce((sum, m) => sum + (m.macros?.cals || 0), 0);
        return { ...day, meals: newMeals, consumedCals: newConsumedCals };
      });
      // Persist to Supabase immediately
      if (session) {
        supabase.from('profiles').update({ weekly_history: updated }).eq('id', session.user.id);
      }
      return updated;
    });
  };

  // ── Add a meal retroactively to a past day ────────────────────────
  const handleRetroAddMeal = (date, mealData) => {
    setWeeklyHistory(prev => {
      const updated = prev.map(day => {
        if (day.date !== date) return day;
        const newMeal = {
          id: Date.now(),
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          desc: mealData.desc,
          status: 'completed',
          macros: mealData.macros,
          originalMacros: mealData.macros,
          portionMultiplier: 1
        };
        const newMeals = [...(day.meals || []), newMeal];
        const newConsumedCals = newMeals.reduce((sum, m) => sum + (m.macros?.cals || 0), 0);
        return { ...day, meals: newMeals, consumedCals: newConsumedCals };
      });
      // Persist to Supabase immediately
      if (session) {
        supabase.from('profiles').update({ weekly_history: updated }).eq('id', session.user.id);
      }
      return updated;
    });
    setRetroAddTarget(null);
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

  if (isProfileLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)', gap: '16px'
      }}>
        <img src="/icon-192.png" alt="MealMe" style={{ width: 72, height: 72, borderRadius: '20px', animation: 'pulse 2s ease-in-out infinite' }} />
        <span style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-primary)', background: 'linear-gradient(135deg, #e79c4a 0%, #c16cf0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MealMe</span>
        <div style={{ width: 40, height: 3, borderRadius: 3, background: 'linear-gradient(90deg, #e79c4a, #c16cf0)', animation: 'pulse 1.5s ease-in-out infinite', marginTop: 4 }} />
      </div>
    );
  }

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <Download size={15} color="var(--primary-light)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontFamily: 'var(--font-primary)', lineHeight: 1.3 }}>
              {iosInstallType === 'safari'
                ? <>Tap <strong style={{ color: 'var(--primary-light)' }}>Share ↑</strong> then <strong style={{ color: 'var(--primary-light)' }}>Add to Home Screen</strong> to install MealMe</>
                : iosInstallType === 'other-browser'
                  ? <>Open MealMe in <strong style={{ color: 'var(--primary-light)' }}>Safari</strong> to install it on your home screen</>
                  : 'Get the full app experience — install MealMe on your device.'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {!iosInstallType && (
              <button
                onClick={handleInstallApp}
                style={{ padding: '5px 14px', borderRadius: '20px', border: 'none', background: 'var(--primary-light)', color: '#0e0c13', fontSize: '0.78rem', fontWeight: '700', fontFamily: 'var(--font-primary)', cursor: 'pointer' }}
              >
                Install App
              </button>
            )}
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
        <div className="app-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/icon-192.png" alt="MealMe" style={{ width: 30, height: 30, borderRadius: '8px', objectFit: 'cover' }} />
          <span className="text-gradient">MealMe</span>
        </div>
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
          onEditMealPortion={handleEditMealPortion}
          onDeleteTodayMeal={handleDeleteTodayMeal}
          onDeleteHistoricalMeal={handleDeleteHistoricalMeal}
          onRetroAddOpen={(date) => setRetroAddTarget({ date })}
        />  </main>

      <div className="action-bar">
        <VoiceAgent
          agentState={agentState}
          onCancel={handleAgentCancel}
          onSubmit={handleAIRequest}
          perMealTarget={perMealTarget}
          plannedMeals={plannedMeals}
          streamingText={streamingText}
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
        onEditMealPortion={handleEditMealPortion}
      />

      <CameraScanner
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handlePhotoCaptured}
        remainingMacros={remainingMacros}
        perMealTarget={perMealTarget}
        plannedMeals={plannedMeals}
      />

      <AnalysisResults
        isVisible={showAnalysis}
        onClose={() => setShowAnalysis(false)}
        resultData={suggestionData}
        onAdd={handleAddFoodToPlan}
        onResultUpdate={(corrected) => setSuggestionData(corrected)}
      />

      <RetroAddMealModal
        isOpen={!!retroAddTarget}
        targetDate={retroAddTarget?.date}
        onClose={() => setRetroAddTarget(null)}
        onConfirm={(mealData) => handleRetroAddMeal(retroAddTarget.date, mealData)}
      />
      {/* Camera analysis error toast */}
      {cameraErrorMsg && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(21,18,32,0.97)', border: '1px solid rgba(229,90,106,0.4)',
          borderRadius: '14px', padding: '12px 20px', zIndex: 500,
          color: '#f08090', fontSize: '0.85rem', fontFamily: 'var(--font-primary)',
          maxWidth: '88vw', textAlign: 'center', lineHeight: 1.4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
          animation: 'slideUp 0.25s ease'
        }}>
          ⚠️ {cameraErrorMsg}
        </div>
      )}

      {showMealCountPrompt && isOnboarded && (
        <MealCountPrompt onSelect={handleMealCountSelect} />
      )}
    </div>
  );
}

export default App;
