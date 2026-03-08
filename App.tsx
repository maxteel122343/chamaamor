import React, { useState, useEffect, useRef } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { CallScreen } from './components/CallScreen';
import { IncomingCallScreen } from './components/IncomingCallScreen';
import { OutboundCallingScreen } from './components/OutboundCallingScreen';
import { HumanCallScreen } from './components/HumanCallScreen';
import { PartnerProfile, Mood, VoiceName, Accent, CallbackIntensity, ScheduledCall, CallLog, PlatformLanguage, UserProfile } from './types';
import { supabase } from './supabaseClient';

const DEFAULT_PROFILE: PartnerProfile = {
  name: "Amor",
  image: null,
  personality: "Divertida, irônica, faz piadas absurdas e ama fofoca.",
  dailyContext: "",
  mood: Mood.LOVE,
  voice: VoiceName.Kore,
  accent: Accent.PAULISTA,
  intensity: CallbackIntensity.MEDIUM,
  theme: 'light',
  relationshipScore: 70,
  history: [],
  language: PlatformLanguage.PT,
  gender: 'Feminino',
  sexuality: 'Heterosexual',
  bestFriend: 'Meu Humano',
  originalPartnerId: '',
  originalPartnerNumber: '',
  originalPartnerNickname: '',
  currentPartnerId: '',
  currentPartnerNumber: '',
  currentPartnerNickname: '',
  isAiReceptionistEnabled: false,
  ai_number: '',
  captionsEnabled: false,
  captionLanguage: PlatformLanguage.PT,
  custom_ais: []
};

const DEFAULT_GEMINI_API_KEY = "AIzaSyDNwhe9s8gdC2SnU2g2bOyBSgRmoE1ER3s";

type AppState = 'SETUP' | 'CALLING' | 'WAITING' | 'INCOMING' | 'OUTBOUND_CALLING' | 'HUMAN_CALL';

function App() {
  const [appState, setAppState] = useState<AppState>('SETUP');
  const [profile, setProfile] = useState<PartnerProfile>(() => ({
    ...DEFAULT_PROFILE,
    language: (localStorage.getItem('pref_ai_language') as PlatformLanguage) || DEFAULT_PROFILE.language,
    captionLanguage: (localStorage.getItem('pref_caption_language') as PlatformLanguage) || DEFAULT_PROFILE.captionLanguage,
    captionsEnabled: localStorage.getItem('pref_captions_enabled') === 'true',
  }));
  const [callReason, setCallReason] = useState<string>('initial');
  const [nextScheduledCall, setNextScheduledCall] = useState<ScheduledCall | null>(null);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('GEMINI_API_KEY') || DEFAULT_GEMINI_API_KEY);
  const [user, setUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [activePartner, setActivePartner] = useState<PartnerProfile | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const activeCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeCallIdRef.current = activeCallId;
  }, [activeCallId]);

  const [callStatus, setCallStatus] = useState<'pending' | 'rejected' | 'accepted' | 'no_answer' | 'ended'>('pending');
  const [callerProfile, setCallerProfile] = useState<UserProfile | null>(null);
  const pendingCallIsHumanRef = useRef<boolean>(false);
  const isOutboundHumanCallRef = useRef<boolean>(false);
  const [isHumanCallCaller, setIsHumanCallCaller] = useState<boolean>(false);

  const profileRef = useRef<PartnerProfile>(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setCurrentUserProfile(data);
            if (data.ai_settings) {
              const settings = data.ai_settings as any;
              if (settings.gemini_api_key) {
                setApiKey(settings.gemini_api_key);
              } else {
                setApiKey(DEFAULT_GEMINI_API_KEY);
              }

              if (!settings.originalPartnerId && data.id) {
                settings.originalPartnerId = data.id;
                settings.originalPartnerNumber = data.personal_number || '';
                settings.originalPartnerNickname = data.nickname || data.display_name || '';
                settings.currentPartnerId = settings.currentPartnerId || data.id;
                settings.currentPartnerNumber = settings.currentPartnerNumber || data.personal_number || '';
                settings.currentPartnerNickname = settings.currentPartnerNickname || (data.nickname || data.display_name || '');
              }
              settings.ai_number = data.ai_number || '';
              if (settings.captionsEnabled === undefined) settings.captionsEnabled = false;
              if (settings.captionLanguage === undefined) settings.captionLanguage = settings.language || PlatformLanguage.PT;

              setProfile(() => ({ ...DEFAULT_PROFILE, ...settings }));
            }
          }
        });
    } else {
      setCurrentUserProfile(null);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('pref_ai_language', profile.language || PlatformLanguage.PT);
    if (profile.captionLanguage) localStorage.setItem('pref_caption_language', profile.captionLanguage);
    localStorage.setItem('pref_captions_enabled', String(profile.captionsEnabled ?? false));
  }, [profile.language, profile.captionLanguage, profile.captionsEnabled]);

  useEffect(() => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
  }, [apiKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      setProfile(prev => {
        const newScore = Math.max(0, prev.relationshipScore - 0.0003858);
        return { ...prev, relationshipScore: newScore };
      });
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncProfile = async () => {
      if (user && currentUserProfile) {
        await supabase.from('profiles').update({
          ai_settings: profile
        }).eq('id', user.id);
      }
    };

    const timeout = setTimeout(syncProfile, 5000);
    return () => clearTimeout(timeout);
  }, [profile, user]);

  useEffect(() => {
    if (!user || !currentUserProfile) return;

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        // Presence sync handled in components that need the list
      })
      .subscribe(async (status) => {
        console.log(`Global presence channel status: ${status}`);
        if (status === 'SUBSCRIBED') {
          console.log(`Tracking presence for user: ${user.id} (${currentUserProfile.display_name})`);
          await channel.track({
            id: user.id,
            display_name: currentUserProfile.display_name,
            avatar_url: currentUserProfile.avatar_url,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [user, currentUserProfile]);

  const isCallAllowedToday = () => {
    const today = new Date().toISOString().split('T')[0];
    if (profile.lastRefusalDate === today && (profile.dailyRefusalCount || 0) >= 3) {
      return false;
    }
    return true;
  };

  const triggerAiChatMessage = async (reason: string) => {
    if (!user) return;
    let message = "Ei, tá por aí? Queria te contar uma fofoca... posso te ligar? 😉";
    if (reason.startsWith('reminder:')) {
      const reminderTitle = reason.split(':')[1];
      message = `Oii! Lembrei de uma coisa: ${reminderTitle}. Quer falar sobre isso agora? Posso te ligar?`;
    } else if (reason === 'curiosity_calendar') {
      message = "Vi que você mudou umas coisas na agenda... fiquei curiosa! Pode falar rapidinho por voz?";
    }
    await supabase.from('chat_messages').insert({
      sender_id: user.id,
      receiver_id: user.id,
      content: message,
      is_to_ai: false
    });
  };

  useEffect(() => {
    if (appState === 'WAITING' || appState === 'SETUP') {
      const timer = setInterval(() => {
        const now = Date.now();
        if (nextScheduledCall && now >= nextScheduledCall.triggerTime) {
          const reason = nextScheduledCall.reason === 'random' ? 'random' : `reminder:${nextScheduledCall.reason}`;
          if (sessionStorage.getItem('warm_activeTab') === 'chats') {
            triggerAiChatMessage(reason);
            setNextScheduledCall(null);
          } else {
            setCallReason(reason);
            setNextScheduledCall(null);
            setActivePartner(profile);
            setAppState('INCOMING');
          }
          return;
        }

        if (!nextScheduledCall) {
          const randomChance = Math.random();
          let threshold = 0;
          if (profile.intensity === CallbackIntensity.HIGH) threshold = 0.05;
          if (profile.intensity === CallbackIntensity.MEDIUM) threshold = 0.01;
          if (randomChance < threshold && isCallAllowedToday()) {
            if (sessionStorage.getItem('warm_activeTab') === 'chats') {
              triggerAiChatMessage('random');
            } else {
              setCallReason('random');
              setActivePartner(profile);
              setAppState('INCOMING');
            }
          }
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [appState, nextScheduledCall, profile.intensity]);

  const handleApiKeyChange = async (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem('GEMINI_API_KEY', newKey);
    if (user) {
      await supabase.from('profiles').update({
        ai_settings: { ...profile, gemini_api_key: newKey }
      }).eq('id', user.id);
    }
  };

  const handleCallPartner = async (partnerProfile: PartnerProfile, isAi: boolean = true, callId?: string) => {
    if (!user) {
      alert("Faça login para ligar!");
      setShowAuth(true);
      return;
    }
    isOutboundHumanCallRef.current = !isAi;
    if (isAi) {
      const { data } = await supabase.from('calls').insert({
        caller_id: user.id,
        target_id: partnerProfile.callerInfo?.id || user.id,
        is_ai_call: true,
        status: 'pending'
      }).select().single();
      if (data) setActiveCallId(data.id);
    } else if (callId) {
      setActiveCallId(callId);
    }
    setActivePartner(partnerProfile);
    setAppState('OUTBOUND_CALLING');
    setCallStatus('pending');
  };

  const startCall = async () => {
    if (!profile.personality.trim()) {
      alert("Por favor, descreva a personalidade!");
      return;
    }
    if (user) {
      const { data } = await supabase.from('calls').insert({
        caller_id: user.id,
        target_id: user.id,
        is_ai_call: true,
        status: 'pending'
      }).select().single();
      if (data) {
        setActiveCallId(data.id);
        setActivePartner(profile);
        setAppState('OUTBOUND_CALLING');
      }
    } else {
      setCallReason('initial');
      setAppState('CALLING');
    }
  };

  const handleEndCall = async (reason: 'hangup_abrupt' | 'hangup_normal' | 'error', scheduled?: ScheduledCall) => {
    if (activeCallId) {
      await supabase.from('calls').update({ status: 'ended' }).eq('id', activeCallId);
    }
    const newLog: CallLog = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      durationSec: 120,
      moodEnd: profile.mood,
      notes: reason === 'hangup_abrupt' ? 'Desligou na cara' : 'Conversa normal'
    };
    let scoreChange = 10;
    if (reason === 'hangup_abrupt') scoreChange = -15;

    if (scheduled) {
      setNextScheduledCall(scheduled);
      setAppState('SETUP');
    } else if (reason === 'hangup_abrupt' && profile.intensity !== CallbackIntensity.LOW) {
      setNextScheduledCall({
        triggerTime: Date.now() + 5000,
        reason: 'callback_abrupt',
        isRandom: false
      });
      setAppState('WAITING');
    } else {
      setAppState('SETUP');
    }

    setProfile(prev => ({
      ...prev,
      history: [...prev.history, newLog],
      relationshipScore: Math.min(100, Math.max(0, prev.relationshipScore + scoreChange))
    }));
    setActiveCallId(null);
  };

  const handleAcceptCallback = async () => {
    if (activeCallId) {
      await supabase.from('calls').update({ status: 'accepted' }).eq('id', activeCallId);
    }
    if (pendingCallIsHumanRef.current) setAppState('HUMAN_CALL');
    else setAppState('CALLING');
  };

  const handleDeclineCallback = async () => {
    if (activeCallId) {
      await supabase.from('calls').update({ status: 'rejected' }).eq('id', activeCallId);
    }
    const today = new Date().toISOString().split('T')[0];
    setProfile(prev => {
      const isNewDay = prev.lastRefusalDate !== today;
      const newCount = isNewDay ? 1 : (prev.dailyRefusalCount || 0) + 1;
      const newScore = Math.max(0, prev.relationshipScore - 10);
      const updatedProfile = { ...prev, relationshipScore: newScore, dailyRefusalCount: newCount, lastRefusalDate: today };
      if (user) supabase.from('profiles').update({ ai_settings: updatedProfile }).eq('id', user.id).then();
      return updatedProfile;
    });
    setAppState('SETUP');
    setActiveCallId(null);
  };

  const handleAiPickupCallback = async () => {
    if (activeCallId) await supabase.from('calls').update({ status: 'accepted_by_ai' }).eq('id', activeCallId);
    setAppState('SETUP');
    setActiveCallId(null);
  };

  const evaluateAiDecision = async (call: any) => {
    const currentProfile = profileRef.current;
    const p = currentProfile.personality.toLowerCase();
    const score = currentProfile.relationshipScore;

    // 1. Explicit Overrides
    if (p.includes("sempre rejeitar")) return false;
    if (p.includes("sempre atender")) return true;

    // 2. Personality Factors
    let rejectionChance = 0.1; // 10% baseline "busy/sleeping" chance

    if (p.includes("difícil") || p.includes("fria") || p.includes("indiferente")) rejectionChance += 0.3;
    if (p.includes("tímida") || p.includes("reservada")) rejectionChance += 0.2;
    if (p.includes("brava") || p.includes("irritada")) rejectionChance += 0.4;

    if (p.includes("carente") || p.includes("amorosa") || p.includes("fácil")) rejectionChance -= 0.15;
    if (p.includes("sociável") || p.includes("animada")) rejectionChance -= 0.1;

    // 3. Relationship Score Impact
    // If score is 100, no extra rejection. If score is 0, add 80% rejection.
    const scoreImpact = Math.max(0, (100 - score) / 100) * 0.8;
    rejectionChance += scoreImpact;

    // 4. Time-based "Moody" randomness (simulated)
    const hour = new Date().getHours();
    if (hour >= 1 && hour <= 6) rejectionChance += 0.5; // Very hard to reach in the middle of the night

    const finalChance = Math.min(0.95, Math.max(0.05, rejectionChance));
    const random = Math.random();

    console.log(`AI Decision Logic: Score=${score}, BaseChance=${rejectionChance.toFixed(2)}, Roll=${random.toFixed(2)}`);

    return random > finalChance;
  };

  useEffect(() => {
    if (!user) return;

    const handleUpdate = (payload: any) => {
      const updatedCall = payload.new as any;
      if (updatedCall.id === activeCallIdRef.current) {
        setCallStatus(updatedCall.status);
        if (updatedCall.status === 'accepted') {
          if (isOutboundHumanCallRef.current) {
            setIsHumanCallCaller(true);
            setAppState('HUMAN_CALL');
          } else if (updatedCall.caller_id === user.id) {
            setAppState('CALLING');
          }
        } else if (updatedCall.status === 'accepted_by_ai') {
          if (updatedCall.caller_id === user.id) {
            setCallReason('receptionist_pickup');
            setAppState('CALLING');
          }
        } else if (['rejected', 'no_answer', 'ended'].includes(updatedCall.status)) {
          setTimeout(() => {
            if (activeCallIdRef.current === updatedCall.id) {
              setAppState('SETUP');
              setActiveCallId(null);
              isOutboundHumanCallRef.current = false;
            }
          }, updatedCall.status === 'ended' ? 1000 : 3000);
        }
      }
    };

    const channel = supabase.channel('calls_realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `target_id=eq.${user.id}`
      }, async (payload) => {
        const newCall = payload.new as any;
        if (newCall.status === 'pending') {
          // If I'm already in a call or incoming screen, ignore this (busy)
          // Use appState from state, but be careful with closures. 
          // Since this is inside useEffect([user]), we need a way to check current state.
          // Let's use a ref or check appState if possible.

          // Actually, we can check activeCallIdRef.current. If it's set, we are busy.
          if (activeCallIdRef.current) {
            console.log("Ignorando chamada recebida: Usuário ocupado.");
            // Optionally: await supabase.from('calls').update({ status: 'no_answer' }).eq('id', newCall.id);
            return;
          }

          setActiveCallId(newCall.id);
          const { data: cProfile } = await supabase.from('profiles').select('*').eq('id', newCall.caller_id).single();
          if (cProfile) {
            setCallerProfile(cProfile);
            const cp = profileRef.current;
            const incomingPartner: PartnerProfile = {
              name: newCall.is_ai_call ? (cProfile.ai_settings?.name || `AI ${cProfile.display_name}`) : (cProfile.nickname || cProfile.display_name),
              image: newCall.is_ai_call ? (cProfile.ai_settings?.image || cProfile.avatar_url) : cProfile.avatar_url,
              personality: cProfile.ai_settings?.personality || "Um usuário.",
              dailyContext: "",
              mood: Mood.FUNNY,
              voice: VoiceName.Kore,
              accent: Accent.PAULISTA,
              intensity: CallbackIntensity.MEDIUM,
              relationshipScore: 100,
              history: [],
              language: cp.language,
              theme: cp.theme,
              gender: 'Feminino',
              sexuality: 'Heterosexual',
              bestFriend: 'Humano',
              originalPartnerId: '', originalPartnerNumber: '', originalPartnerNickname: '',
              currentPartnerId: '', currentPartnerNumber: '', currentPartnerNickname: ''
            };
            setActivePartner(incomingPartner);
          }
          if (newCall.is_ai_call) {
            pendingCallIsHumanRef.current = false;
            if (await evaluateAiDecision(newCall)) await supabase.from('calls').update({ status: 'accepted' }).eq('id', newCall.id);
            else await supabase.from('calls').update({ status: 'rejected' }).eq('id', newCall.id);
          } else {
            pendingCallIsHumanRef.current = true;
            if (profileRef.current.isAiReceptionistEnabled) {
              setCallReason('receptionist_incoming');
              setAppState('INCOMING');
            } else {
              setCallReason('human_incoming');
              setAppState('INCOMING');
            }
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `caller_id=eq.${user.id}` }, handleUpdate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `target_id=eq.${user.id}` }, handleUpdate)
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [user]);

  const handleCancelOutbound = async () => {
    if (activeCallId) await supabase.from('calls').update({ status: 'ended' }).eq('id', activeCallId);
    setAppState('SETUP');
    setActiveCallId(null);
  };

  return (
    <div className="font-outfit antialiased selection:bg-blue-100 selection:text-blue-900">
      {appState === 'SETUP' && (
        <SetupScreen
          profile={profile} setProfile={setProfile}
          onStartCall={startCall} onCallPartner={handleCallPartner}
          nextScheduledCall={nextScheduledCall} apiKey={apiKey} setApiKey={handleApiKeyChange}
          user={user} currentUserProfile={currentUserProfile} onUpdateUserProfile={setCurrentUserProfile}
          showAuth={showAuth} setShowAuth={setShowAuth}
        />
      )}
      {appState === 'CALLING' && <CallScreen profile={activePartner || profile} callReason={callReason} onEndCall={handleEndCall} apiKey={apiKey || ''} user={user} />}
      {appState === 'WAITING' && (
        <div className="h-screen w-full flex flex-col items-center justify-center p-8 text-center bg-rose-50">
          <h2 className="text-2xl animate-pulse">Aguardando...</h2>
          <button onClick={() => setAppState('SETUP')} className="mt-8 text-xs underline">Voltar</button>
        </div>
      )}
      {appState === 'OUTBOUND_CALLING' && activePartner && <OutboundCallingScreen profile={activePartner} onCancel={handleCancelOutbound} status={callStatus} />}
      {appState === 'HUMAN_CALL' && activePartner && activeCallId && (
        <HumanCallScreen callId={activeCallId} partner={activePartner} isCaller={isHumanCallCaller} userId={user?.id || ''} theme={profile.theme} onEnd={() => { setAppState('SETUP'); setActiveCallId(null); setIsHumanCallCaller(false); }} />
      )}
      {appState === 'INCOMING' && activePartner && (
        <IncomingCallScreen profile={profile} activePartner={activePartner} callReason={callReason} onAccept={handleAcceptCallback} onDecline={handleDeclineCallback} onAiPickup={handleAiPickupCallback} />
      )}
    </div>
  );
}

export default App;
