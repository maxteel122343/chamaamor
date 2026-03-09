import React, { useRef, useState, useEffect } from 'react';
import { Mood, VoiceName, Accent, PartnerProfile, MOOD_EMOJIS, VOICE_META, ACCENT_META, CallbackIntensity, CallLog, ScheduledCall, PlatformLanguage, LANGUAGE_META, UserProfile, DEFAULT_RINGTONES } from '../types';
import { ContactList } from './ContactList';
import { AuthModal } from './AuthModal';
import { CalendarTab } from './CalendarTab';
import { MemoryHistorySection } from './MemoryHistorySection';
import { QuickChatTab } from './QuickChatTab';
import { supabase } from '../supabaseClient';
import { ChatWindow } from './ChatWindow';

interface SetupScreenProps {
    profile: PartnerProfile;
    setProfile: React.Dispatch<React.SetStateAction<PartnerProfile>>;
    onStartCall: () => void;
    nextScheduledCall: ScheduledCall | null;
    apiKey: string;
    setApiKey: (key: string) => void;
    user: any;
    currentUserProfile: UserProfile | null;
    onUpdateUserProfile: (profile: UserProfile) => void;
    onCallPartner: (profile: PartnerProfile, isAi: boolean, callId: string) => void;
    showAuth: boolean;
    setShowAuth: (show: boolean) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ profile, setProfile, onStartCall, onCallPartner, nextScheduledCall, apiKey, setApiKey, user, currentUserProfile, onUpdateUserProfile, showAuth, setShowAuth }) => {
    const [activeTab, setActiveTabState] = useState<'dashboard' | 'gallery' | 'contacts' | 'calendar' | 'memory' | 'config' | 'chats'>(() => {
        const saved = sessionStorage.getItem('warm_activeTab');
        return (saved as any) || 'dashboard';
    });

    const setActiveTab = (tab: 'dashboard' | 'gallery' | 'contacts' | 'calendar' | 'memory' | 'config' | 'chats') => {
        sessionStorage.setItem('warm_activeTab', tab);
        setActiveTabState(tab);
    };
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [isSavingImage, setIsSavingImage] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [apiStatus, setApiStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [showCreateAiModal, setShowCreateAiModal] = useState(false);
    const [newAi, setNewAi] = useState<Partial<PartnerProfile>>({
        name: '',
        image: null,
        personality: '',
        language: PlatformLanguage.PT,
        gender: 'Feminino',
        mood: Mood.LOVE,
        voice: VoiceName.Kore,
        accent: Accent.PAULISTA,
        intensity: CallbackIntensity.MEDIUM,
        sexuality: 'Heterosexual',
        bestFriend: '',
        relationshipScore: 100,
        history: []
    });
    const createAiFileInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const userFileInputRef = useRef<HTMLInputElement>(null);
    const historyInputRef = useRef<HTMLInputElement>(null);
    const ringtoneInputRef = useRef<HTMLInputElement>(null);
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

    const fetchUnreadMessages = async () => {
        if (!user) return;
        const { count } = await supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', user.id)
            .eq('is_read', false);
        setUnreadMessagesCount(count || 0);
    };

    useEffect(() => {
        if (!user) return;
        fetchUnreadMessages();

        const channel = supabase
            .channel('unread_messages_count')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_messages'
            }, () => {
                fetchUnreadMessages();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);
    const [activeChat, setActiveChatState] = useState<{ profile: UserProfile, isAi: boolean } | null>(() => {
        const saved = sessionStorage.getItem('warm_activeChat');
        return saved ? JSON.parse(saved) : null;
    });

    const setActiveChat = (chat: { profile: UserProfile, isAi: boolean } | null) => {
        if (chat) {
            sessionStorage.setItem('warm_activeChat', JSON.stringify(chat));
        } else {
            sessionStorage.removeItem('warm_activeChat');
        }
        setActiveChatState(chat);
    };

    const isDark = profile.theme === 'dark';
    const isPink = profile.theme === 'pink';
    const isLight = profile.theme === 'light';

    const themeClasses = isPink ? "bg-[#fffafa] text-[#912d4a]" : isLight ? "bg-[#f9f9fb] text-slate-900" : "bg-[#0b0c10] text-slate-100";
    const cardClasses = isPink ? "bg-white border-[#ffdada] shadow-[0_10px_40px_-15px_rgba(255,182,193,0.3)]" : isLight ? "bg-white border-slate-100 shadow-sm" : "bg-[#15181e] border-white/5 shadow-xl";
    const inputClasses = isPink ? "bg-[#fffcfc] border-[#ffc5ca] focus:border-rose-400 text-[#912d4a]" : isLight ? "bg-slate-50 border-slate-100 focus:border-blue-500 text-slate-900" : "bg-[#0b0c10] border-white/5 focus:border-blue-500 text-white";
    const borderClass = isPink ? "border-[#ffdada]" : isLight ? "border-slate-100" : "border-white/5";

    const getRelationshipStatus = (score: number) => {
        if (score < 20) return { label: 'Tóxica', color: 'text-blue-500', bar: 'bg-blue-500', tip: 'Cuidado! A relação está por um fio. Ligue e peça desculpas ou seja carinhoso.' };
        if (score < 50) return { label: 'Esfriando', color: 'text-cyan-500', bar: 'bg-cyan-500', tip: 'Vocês estão distantes. Tente puxar um assunto que ela gosta.' };
        if (score < 80) return { label: 'Estável', color: 'text-emerald-500', bar: 'bg-emerald-500', tip: 'Tudo indo bem. Que tal um elogio surpresa?' };
        return { label: 'Apaixonada', color: 'text-rose-500', bar: 'bg-rose-500', tip: 'O amor está no ar! Continue assim.' };
    };

    const status = getRelationshipStatus(profile.relationshipScore);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && user) {
            setIsSavingImage(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/ai_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

            if (uploadError) {
                alert("Erro ao fazer upload da imagem.");
                setIsSavingImage(false);
                return;
            }

            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
            updateProfileAndSync(prev => ({ ...prev, image: data.publicUrl }));
            setIsSavingImage(false);
        }
    };

    const downloadHistory = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile.history));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `history_${profile.name}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const uploadHistory = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const logs = JSON.parse(event.target?.result as string);
                if (Array.isArray(logs)) {
                    setProfile(prev => ({ ...prev, history: logs }));
                    alert("Histórico importado com sucesso!");
                }
            } catch (err) {
                alert("Erro ao ler arquivo.");
            }
        };
        reader.readAsText(file);
    };

    const clearHistory = () => {
        if (confirm("Tem certeza? Isso vai apagar a memória da relação.")) {
            setProfile(prev => ({ ...prev, history: [] }));
        }
    };

    const formatTime = (ms: number) => {
        const mins = Math.floor(ms / 60000);
        if (mins < 1) return "Agora";
        return `~${mins} min`;
    };

    const validateApiKey = async (key: string) => {
        if (!key) {
            setApiStatus('idle');
            return;
        }
        setIsValidating(true);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (response.ok) setApiStatus('valid');
            else setApiStatus('invalid');
        } catch (e) {
            setApiStatus('invalid');
        }
        setIsValidating(false);
    };

    const syncProfileToSupabase = async (newProfile: PartnerProfile) => {
        if (!user) return;
        await supabase.from('profiles').update({
            ai_settings: { ...newProfile, gemini_api_key: apiKey }
        }).eq('id', user.id);
    };

    const updateProfileAndSync = (updater: (prev: PartnerProfile) => PartnerProfile) => {
        setProfile(prev => {
            const updated = updater(prev);
            syncProfileToSupabase(updated);
            return updated;
        });
    };

    const toggleVisibility = async () => {
        if (!user || !currentUserProfile) return;
        const newStatus = !(currentUserProfile.is_searchable ?? true);
        onUpdateUserProfile({ ...currentUserProfile, is_searchable: newStatus });
        await supabase.from('profiles').update({ is_searchable: newStatus }).eq('id', user.id);
    };

    const handleUserImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && currentUserProfile && user) {
            setIsSavingImage(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/user_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

            if (uploadError) {
                alert("Erro ao fazer upload.");
                setIsSavingImage(false);
                return;
            }

            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
            onUpdateUserProfile({ ...currentUserProfile, avatar_url: data.publicUrl });
            setIsSavingImage(false);
        }
    };

    const handleRingtoneUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && user) {
            setIsSavingProfile(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/ringtone_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

            if (uploadError) {
                alert("Erro ao fazer upload do toque.");
                setIsSavingProfile(false);
                return;
            }

            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
            updateProfileAndSync(prev => ({ ...prev, ringtoneUrl: data.publicUrl, ringtoneName: file.name }));
            setIsSavingProfile(false);
        }
    };

    const saveUserProfile = async () => {
        if (!user || !currentUserProfile) return;
        setIsSavingProfile(true);
        const { error } = await supabase.from('profiles').update({
            display_name: currentUserProfile.display_name,
            nickname: currentUserProfile.nickname,
            avatar_url: currentUserProfile.avatar_url,
            status: 'online'
        }).eq('id', user.id);

        if (error) alert("Erro ao salvar perfil.");
        else setShowProfileModal(false);
        setIsSavingProfile(false);
    };

    const fetchNotifications = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (data) setNotifications(data);
    };

    const markNotificationAsRead = async (id: string) => {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        fetchNotifications();
    };

    const deleteNotification = async (id: string) => {
        await supabase.from('notifications').delete().eq('id', id);
        fetchNotifications();
    };

    React.useEffect(() => {
        if (user) {
            fetchNotifications();
            // Optional: Realtime subscription
            const channel = supabase.channel('notifications')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
                    fetchNotifications();
                })
                .subscribe();
            return () => { channel.unsubscribe(); };
        }
    }, [user]);

    const formatDisplayNumber = (number: string, isAi: boolean) => {
        if (!number) return "";
        const digits = number.replace(/\D/g, '');
        const prefix = isAi ? 'Ai-' : 'Hu-';
        const parts = digits.match(/.{1,3}/g) || [];
        return `${prefix}${parts.join(' ')}`;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            alert("Número copiado para a área de transferência!");
        }).catch(err => {
            console.error('Erro ao copiar: ', err);
        });
    };

    const handleCreateAiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && user) {
            setIsSavingImage(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/custom_ai_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);

            if (uploadError) {
                alert("Erro ao fazer upload da imagem.");
                setIsSavingImage(false);
                return;
            }

            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
            setNewAi(prev => ({ ...prev, image: data.publicUrl }));
            setIsSavingImage(false);
        }
    };

    const saveNewAiProfile = () => {
        if (!newAi.name || !newAi.personality) {
            alert("Nome e Personalidade são obrigatórios!");
            return;
        }

        const fullAi: PartnerProfile = {
            name: newAi.name!,
            image: newAi.image || null,
            personality: newAi.personality!,
            dailyContext: "",
            mood: newAi.mood || Mood.LOVE,
            voice: newAi.voice || VoiceName.Kore,
            accent: newAi.accent || Accent.PAULISTA,
            intensity: newAi.intensity || CallbackIntensity.MEDIUM,
            theme: isDark ? 'dark' : 'light',
            relationshipScore: 100,
            history: [],
            language: newAi.language || PlatformLanguage.PT,
            gender: newAi.gender || 'Feminino',
            sexuality: newAi.sexuality || 'Heterosexual',
            bestFriend: newAi.bestFriend || (currentUserProfile?.nickname || currentUserProfile?.display_name || 'Amigo'),
            originalPartnerId: user?.id || '',
            originalPartnerNumber: currentUserProfile?.personal_number || '',
            originalPartnerNickname: currentUserProfile?.nickname || currentUserProfile?.display_name || '',
            currentPartnerId: user?.id || '',
            currentPartnerNumber: currentUserProfile?.personal_number || '',
            currentPartnerNickname: currentUserProfile?.nickname || currentUserProfile?.display_name || '',
        };

        updateProfileAndSync(prev => ({
            ...prev,
            custom_ais: [...(prev.custom_ais || []), fullAi]
        }));

        setShowCreateAiModal(false);
        setActiveTab('gallery');
    };

    return (
        <div className={`min-h-screen ${themeClasses} transition-colors duration-700 font-sans tracking-tight overflow-x-hidden`}>

            {/* AI Creation Modal */}
            {showCreateAiModal && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-500 overflow-y-auto">
                    <div className={`w-full max-w-4xl my-auto p-6 md:p-12 rounded-[3.5rem] border shadow-[0_48px_80px_-20px_rgba(0,0,0,0.8)] transform animate-in slide-in-from-bottom-12 duration-700 ${cardClasses}`}>
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h3 className="text-3xl font-black italic tracking-tighter uppercase">Materializar Nova IA</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Configuração de Identidade Digital</p>
                            </div>
                            <button onClick={() => setShowCreateAiModal(false)} className="w-12 h-12 flex items-center justify-center opacity-30 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all text-2xl">✕</button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            {/* Left Column: Visual & Basic Info */}
                            <div className="space-y-10">
                                <div className="flex flex-col items-center gap-6">
                                    <div
                                        onClick={() => createAiFileInputRef.current?.click()}
                                        className={`w-40 h-40 rounded-[3rem] overflow-hidden border-4 border-blue-600/30 shadow-2xl transition-all hover:scale-105 cursor-pointer flex items-center justify-center ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}
                                    >
                                        {isSavingImage ? (
                                            <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        ) : newAi.image ? (
                                            <img src={newAi.image} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center opacity-20">
                                                <span className="text-5xl block mb-2">📸</span>
                                                <span className="text-[8px] font-black uppercase tracking-widest">Upload Avatar</span>
                                            </div>
                                        )}
                                    </div>
                                    <input ref={createAiFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCreateAiImageUpload} />
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Apelido da IA</label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Luna, Maya, Jarvis..."
                                            value={newAi.name}
                                            onChange={e => setNewAi(prev => ({ ...prev, name: e.target.value }))}
                                            className={`w-full p-6 rounded-[2rem] border text-lg font-bold italic tracking-tighter outline-none transition-all ${inputClasses}`}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest opacity-30 block mb-3 ml-4">Gênero</label>
                                            <input
                                                type="text"
                                                placeholder="Feminino"
                                                value={newAi.gender}
                                                onChange={e => setNewAi(prev => ({ ...prev, gender: e.target.value }))}
                                                className={`w-full p-5 rounded-[1.8rem] border text-sm font-bold outline-none transition-all ${inputClasses}`}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest opacity-30 block mb-3 ml-4">Idioma</label>
                                            <select
                                                value={newAi.language}
                                                onChange={e => setNewAi(prev => ({ ...prev, language: e.target.value as PlatformLanguage }))}
                                                className={`w-full p-5 rounded-[1.8rem] border text-sm font-bold outline-none transition-all ${inputClasses} appearance-none`}
                                            >
                                                {Object.entries(LANGUAGE_META).map(([key, meta]) => (
                                                    <option key={key} value={key}>{meta.flag} {meta.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest opacity-30 block mb-3 ml-4">Voz Sugerida</label>
                                            <select
                                                value={newAi.voice}
                                                onChange={e => setNewAi(prev => ({ ...prev, voice: e.target.value as VoiceName }))}
                                                className={`w-full p-5 rounded-[1.8rem] border text-sm font-bold outline-none transition-all ${inputClasses} appearance-none`}
                                            >
                                                {Object.entries(VOICE_META).map(([key, meta]) => (
                                                    <option key={key} value={key}>{meta.label} ({meta.gender === 'Male' ? 'M' : 'F'})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest opacity-30 block mb-3 ml-4">Sotaque</label>
                                            <select
                                                value={newAi.accent}
                                                onChange={e => setNewAi(prev => ({ ...prev, accent: e.target.value as Accent }))}
                                                className={`w-full p-5 rounded-[1.8rem] border text-sm font-bold outline-none transition-all ${inputClasses} appearance-none`}
                                            >
                                                {Object.entries(ACCENT_META).map(([key, meta]) => (
                                                    <option key={key} value={key}>{meta.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Personality & Prompt */}
                            <div className="space-y-8">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-4 ml-4">Prompt de Personalidade (Software Emocional)</label>
                                    <textarea
                                        placeholder="Ex: Você é uma garota gamer que ama RPG, é um pouco tímida mas fica muito animada falando sobre lore de jogos. Seu sotaque é paulista e você usa gírias de stream."
                                        value={newAi.personality}
                                        onChange={e => setNewAi(prev => ({ ...prev, personality: e.target.value }))}
                                        className={`w-full h-64 rounded-[2.5rem] p-8 text-[13px] font-medium border focus:outline-none transition-all resize-none ${inputClasses}`}
                                    />
                                    <p className="text-[9px] opacity-30 mt-3 ml-4 leading-relaxed">Este prompt define como a IA pensa, reage e se expressa durante a chamada.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-30 block mb-1 ml-4">Intensidade de Contato</label>
                                    <div className="flex gap-2">
                                        {Object.values(CallbackIntensity).map(intensity => (
                                            <button
                                                key={intensity}
                                                onClick={() => setNewAi(prev => ({ ...prev, intensity }))}
                                                className={`flex-1 py-4 rounded-[1.5rem] text-[9px] font-black uppercase tracking-widest border transition-all ${newAi.intensity === intensity ? 'bg-black dark:bg-white text-white dark:text-black border-transparent' : 'border-inherit opacity-40'}`}
                                            >
                                                {intensity.split(' ')[0]}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    onClick={saveNewAiProfile}
                                    className="w-full py-6 mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] shadow-2xl shadow-blue-500/40 hover:scale-[1.02] active:scale-95 transition-all text-[12px]"
                                >
                                    FInalizar Materialização ✨
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar - Vertical Navigation (Permanent) */}
            <aside
                className={`fixed left-0 top-0 h-full z-[80] transition-all duration-500 ease-in-out border-r shadow-2xl flex flex-col py-8 ${isSidebarExpanded ? 'w-56 md:w-64' : 'w-16 md:w-20'} ${isLight ? 'bg-white/95 border-slate-100' : 'bg-[#0b0c10]/95 border-white/5'} backdrop-blur-2xl`}
            >
                {/* Expand/Collapse Toggle Layer - Desktop: Hover, Mobile/All: Click managed by buttons below */}
                <div className={`mb-12 flex items-center gap-3 px-5 transition-all duration-500 ${isSidebarExpanded ? 'justify-start' : 'justify-center'}`}>
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex-shrink-0 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20">⚡</div>
                    {isSidebarExpanded && (
                        <h1 className="text-lg font-black tracking-tighter uppercase italic truncate animate-in fade-in slide-in-from-left-4 duration-500">
                            WARM <span className="text-blue-600">CONN</span>
                        </h1>
                    )}
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 w-full px-3 space-y-2 overflow-y-auto no-scrollbar">
                    {[
                        { id: 'contacts', label: 'Contatos', icon: '👤' },
                        { id: 'chats', label: 'Chats', icon: '💬', badge: unreadMessagesCount },
                        { id: 'dashboard', label: 'Início', icon: '🏠' },
                        { id: 'gallery', label: 'Galeria', icon: '🖼️' },
                        { id: 'calendar', label: 'Agenda', icon: '📅' },
                        { id: 'memory', label: 'Memória', icon: '🧠' },
                        { id: 'config', label: 'Ajustes', icon: '⚙️' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setActiveTab(tab.id as any);
                                setIsSidebarExpanded(false);
                            }}
                            className={`w-full group relative flex items-center gap-4 p-3.5 rounded-2xl transition-all duration-300 ${activeTab === tab.id
                                ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20'
                                : `opacity-40 hover:opacity-100 ${isLight ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`
                                }`}
                        >
                            <div className="relative">
                                <span className="text-xl flex-shrink-0 transition-transform group-hover:scale-110">{tab.icon}</span>
                                {tab.badge && tab.badge > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-blue-600 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-[#0b0c10] px-0.5 animate-in zoom-in duration-300">
                                        {tab.badge > 9 ? '9+' : tab.badge}
                                    </span>
                                )}
                            </div>
                            {isSidebarExpanded && (
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] truncate animate-in fade-in slide-in-from-left-4 duration-500">
                                    {tab.label}
                                </span>
                            )}
                            {!isSidebarExpanded && (
                                <div className="absolute left-full ml-4 px-3 py-1 bg-black text-white text-[10px] font-bold uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
                                    {tab.label}
                                </div>
                            )}
                        </button>
                    ))}
                </nav>

                {/* Theme Cycle at Sidebar Bottom */}
                <div className="px-3">
                    <button
                        onClick={() => {
                            const nextTheme = profile.theme === 'light' ? 'dark' : profile.theme === 'dark' ? 'pink' : 'light';
                            updateProfileAndSync(prev => ({ ...prev, theme: nextTheme }));
                        }}
                        className={`w-full p-3.5 rounded-2xl flex items-center gap-4 transition-all duration-300 border ${cardClasses} hover:bg-black/5 dark:hover:bg-white/5`}
                    >
                        <span className="text-xl flex-shrink-0">
                            {profile.theme === 'light' ? '🌙' : profile.theme === 'dark' ? '🌸' : '☀️'}
                        </span>
                        {isSidebarExpanded && (
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] truncate animate-in fade-in slide-in-from-left-4 duration-500">
                                {profile.theme === 'light' ? 'Modo Escuro' : profile.theme === 'dark' ? 'Modo Pink' : 'Modo Claro'}
                            </span>
                        )}
                    </button>
                </div>
            </aside>

            {/* Sidebar Overlay (Mobile Only) */}
            {isSidebarExpanded && (
                <div
                    onClick={() => setIsSidebarExpanded(false)}
                    className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[75] animate-in fade-in duration-300"
                />
            )}

            {/* Main Content Area */}
            <div className={`flex flex-col min-h-screen transition-all duration-500 ml-16 md:ml-20 w-[calc(100%-4rem)] md:w-[calc(100%-5rem)]`}>


                {/* Top Header - Controls & Profile */}
                <header className={`w-full sticky top-0 z-[60] px-3 md:px-8 py-3 md:py-6 flex justify-end items-center ${isPink ? 'bg-[#fffafa]/40' : isLight ? 'bg-[#f9f9fb]/80' : 'bg-[#0b0c10]/40'} backdrop-blur-xl transition-all`}>
                    <div className="flex items-center gap-2 md:gap-5">
                        {user && (
                            <button
                                onClick={() => setShowNotifications(true)}
                                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${cardClasses} hover:scale-105 active:scale-95`}
                            >
                                <span className="text-xl">🔔</span>
                                {notifications.filter(n => !n.is_read).length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-4 border-white dark:border-[#0b0c10] flex items-center justify-center text-[10px] text-white font-black">
                                        {notifications.filter(n => !n.is_read).length}
                                    </span>
                                )}
                            </button>
                        )}

                        {user ? (
                            <div className="flex items-center gap-2 md:gap-4 px-2 md:px-4 py-2 rounded-[2rem] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer group" onClick={() => setShowProfileModal(true)}>
                                <div className="hidden md:flex flex-col items-end">
                                    <span className="text-[11px] font-black uppercase tracking-widest truncate max-w-[120px]">{currentUserProfile?.display_name || "Usuário"}</span>
                                    <span className="text-[9px] opacity-40 font-black tracking-tighter text-blue-600">{formatDisplayNumber(currentUserProfile?.personal_number || "", false)}</span>
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-slate-200 border-2 border-white/20 overflow-hidden shadow-xl transition-transform group-hover:scale-110">
                                    {currentUserProfile?.avatar_url ? (
                                        <img src={currentUserProfile.avatar_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); supabase.auth.signOut(); }}
                                    className="ml-2 w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                    title="Sair"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setShowAuth(true)} className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all">Iniciar Sessão</button>
                        )}
                    </div>
                </header>

                {/* Dashboard Scroll Area */}
                <div className="flex-1 overflow-y-auto no-scrollbar pt-4 px-3 md:px-8 pb-24 flex flex-col items-center">
                    <div className="w-full max-w-5xl animate-in fade-in slide-in-from-bottom-8 duration-700">
                        {activeTab === 'dashboard' && (
                            <div className="flex flex-col gap-8">
                                {/* Nicknames and Identity Section */}
                                <div className={`w-full p-4 md:p-8 rounded-[2rem] md:rounded-[3rem] border relative overflow-hidden ${cardClasses}`}>
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full" />
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Identidade do Relacionamento</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* User Nickname */}
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center px-4">
                                                    <label className="text-[9px] font-black uppercase tracking-widest opacity-30">Seu Apelido Carinhoso</label>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-blue-500/60 font-mono tracking-tighter">
                                                            {formatDisplayNumber(currentUserProfile?.personal_number || '', false)}
                                                        </span>
                                                        <button
                                                            onClick={() => copyToClipboard(currentUserProfile?.personal_number || '')}
                                                            className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors opacity-40 hover:opacity-100"
                                                            title="Copiar Número"
                                                        >
                                                            <span className="text-[8px]">📋</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="relative group">
                                                    <input
                                                        type="text"
                                                        value={currentUserProfile?.nickname || ''}
                                                        onChange={(e) => onUpdateUserProfile({ ...currentUserProfile!, nickname: e.target.value })}
                                                        onBlur={() => saveUserProfile()}
                                                        className={`w-full p-5 rounded-[2rem] text-sm font-bold border transition-all ${inputClasses} border-opacity-30 focus:border-opacity-100 italic`}
                                                        placeholder="Como ela te chama? (ex: Bebê, Amor...)"
                                                    />
                                                    <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">👤</div>
                                                </div>
                                            </div>

                                            {/* AI Nickname */}
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center px-4">
                                                    <label className="text-[9px] font-black uppercase tracking-widest opacity-30">Apelido dela na Relação</label>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-pink-500/60 font-mono tracking-tighter">
                                                            {formatDisplayNumber(profile.ai_number || '', true)}
                                                        </span>
                                                        <button
                                                            onClick={() => copyToClipboard(profile.ai_number || '')}
                                                            className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors opacity-40 hover:opacity-100"
                                                            title="Copiar Número"
                                                        >
                                                            <span className="text-[8px]">📋</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="relative group">
                                                    <input
                                                        type="text"
                                                        value={profile.name || ''}
                                                        onChange={(e) => updateProfileAndSync(prev => ({ ...prev, name: e.target.value }))}
                                                        className={`w-full p-5 rounded-[2rem] text-sm font-bold border transition-all ${inputClasses} border-opacity-30 focus:border-opacity-100 italic`}
                                                        placeholder="Como você a chama? (ex: Vida, Princesa...)"
                                                    />
                                                    <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">✨</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-8 p-5 rounded-[2.5rem] bg-blue-500/5 border border-blue-500/10 text-center relative overflow-hidden group">
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                            <p className="text-[11px] font-bold text-blue-500/60 italic uppercase tracking-wider relative z-10">
                                                "Qual será o apelido carinhoso de vocês? Defina agora para tornar cada palavra mais especial."
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                                    {/* Pro Card: Relationship Status */}
                                    <div className={`p-5 md:p-8 rounded-[2rem] md:rounded-[3rem] border relative overflow-hidden flex flex-col justify-between min-h-[240px] md:min-h-[300px] ${cardClasses}`}>
                                        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 blur-[80px] rounded-full" />

                                        <div>
                                            <div className="flex justify-between items-center mb-6">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-30">Vínculo Emocional</p>
                                                <span className={`text-sm px-3 py-1 rounded-lg font-bold bg-blue-500/10 ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            </div>
                                            <h2 className="text-5xl font-black tracking-tighter mb-4 italic">
                                                {profile.relationshipScore}% <span className="text-lg font-bold not-italic opacity-20">SCORE</span>
                                            </h2>
                                            <div className="w-full h-1.5 bg-slate-100/10 rounded-full overflow-hidden mb-6">
                                                <div className={`h-full transition-all duration-1000 ${status.bar}`} style={{ width: `${profile.relationshipScore}%` }} />
                                            </div>
                                        </div>

                                        <div className={`p-5 rounded-[2rem] bg-blue-500/5 border border-blue-500/10 transition-all hover:bg-blue-500/10`}>
                                            <p className="text-xs leading-relaxed font-medium italic opacity-70">
                                                <span className="text-blue-500 font-bold not-italic uppercase mr-2 text-[10px]">Sugestão:</span>
                                                "{status.tip}"
                                            </p>
                                        </div>
                                    </div>

                                    {/* Call Control Center */}
                                    <div className="flex flex-col gap-6">
                                        {/* Identification Profiles */}
                                        <div className={`p-4 md:p-6 rounded-[2rem] md:rounded-[3rem] border flex items-center justify-between ${cardClasses}`}>
                                            <div className="flex items-center gap-3 w-[40%]">
                                                <div className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800">
                                                    {currentUserProfile?.avatar_url ? (
                                                        <img src={currentUserProfile.avatar_url} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                                                    )}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <p className="text-[10px] font-bold uppercase opacity-40">Você</p>
                                                    <p className="text-sm font-black truncate">{currentUserProfile?.nickname || currentUserProfile?.display_name || "Usuário"}</p>
                                                </div>
                                            </div>

                                            <div className="flex-1 flex justify-center">
                                                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                    <span className="text-blue-500 text-xs">⚡</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 text-right justify-end w-[40%]">
                                                <div className="overflow-hidden">
                                                    <p className="text-[10px] font-bold uppercase opacity-40">IA</p>
                                                    <p className="text-sm font-black text-blue-600 dark:text-blue-400 truncate">{profile.name || "Amor"}</p>
                                                </div>
                                                <div className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 border-2 border-blue-100 dark:border-blue-900">
                                                    {profile.image ? (
                                                        <img src={profile.image} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xl">📸</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className={`p-5 md:p-8 rounded-[2rem] md:rounded-[3rem] border flex flex-col gap-6 ${cardClasses} transform hover:scale-[1.02] transition-all cursor-pointer shadow-2xl shadow-blue-500/5`} onClick={onStartCall}>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xl shadow-xl shadow-blue-500/40 animate-pulse">
                                                        📞
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xl font-black tracking-tight">Iniciar Chamada</h3>
                                                        <p className="text-xs opacity-40 font-bold uppercase tracking-widest mt-0.5">Conexão via Voz AI</p>
                                                    </div>
                                                </div>
                                                <span className="text-2xl opacity-20 group-hover:opacity-100 transition-opacity">→</span>
                                            </div>
                                        </div>

                                        <div className={`p-4 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border ${cardClasses} flex-1`}>
                                            <div className="flex justify-between items-start mb-6">
                                                <p className="text-[11px] font-bold uppercase tracking-widest opacity-30">Status do Sistema</p>
                                                <div className="flex gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500/30" />
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                                                    <span className="text-xs font-bold opacity-30">Próxima Ligação</span>
                                                    <span className="text-sm font-bold text-blue-500">{nextScheduledCall ? formatTime(nextScheduledCall.triggerTime - Date.now()) : "Não Agendada"}</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                                                    <span className="text-xs font-bold opacity-30">Eficiência de Contato</span>
                                                    <span className="text-sm font-bold">94.8%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'calendar' && user && (
                            <div className="w-full max-w-2xl mx-auto"><CalendarTab user={user} profile={profile} setProfile={setProfile} currentUserProfile={currentUserProfile} isDark={isDark} /></div>
                        )}

                        {activeTab === 'memory' && user && (
                            <div className="w-full"><MemoryHistorySection user={user} profile={profile} currentUserProfile={currentUserProfile} isDark={isDark} /></div>
                        )}

                        {activeTab === 'contacts' && user && (
                            <div className="flex-1 w-full max-w-5xl overflow-y-auto no-scrollbar pb-24">
                                <ContactList currentUser={user} onCallPartner={onCallPartner} onOpenChat={(target, isAi) => setActiveChat({ profile: target, isAi })} isDark={isDark} />
                            </div>
                        )}

                        {activeTab === 'gallery' && (
                            <div className="w-full flex flex-col gap-10">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h2 className="text-4xl font-black tracking-tighter italic uppercase">Galeria de IA</h2>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Seus Perfis Criados</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setNewAi({
                                                name: '',
                                                image: null,
                                                personality: '',
                                                language: PlatformLanguage.PT,
                                                gender: 'Feminino',
                                                mood: Mood.LOVE,
                                                voice: VoiceName.Kore,
                                                accent: Accent.PAULISTA,
                                                intensity: CallbackIntensity.MEDIUM,
                                                sexuality: 'Heterosexual',
                                                bestFriend: currentUserProfile?.nickname || 'Meu Humano',
                                                relationshipScore: 100,
                                                history: []
                                            });
                                            setShowCreateAiModal(true);
                                        }}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all"
                                    >
                                        + Criar Novo Perfil
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                    {/* Default AI Card */}
                                    <div className={`group relative flex flex-col rounded-[2.5rem] overflow-hidden border-2 border-transparent hover:border-blue-600/30 transition-all duration-500 ${cardClasses} shadow-2xl h-[550px]`}>
                                        {/* Favorite Icon */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateProfileAndSync(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
                                            }}
                                            className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-xl transition-all hover:scale-110 active:scale-90"
                                        >
                                            {profile.isFavorite ? '❤️' : '🤍'}
                                        </button>

                                        {/* Info Icon */}
                                        <button className="absolute top-6 left-6 z-20 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-lg opacity-60 hover:opacity-100 transition-all">
                                            ℹ️
                                        </button>

                                        {/* Image Container */}
                                        <div className="relative h-2/3 overflow-hidden">
                                            {profile.image ? (
                                                <img src={profile.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={profile.name} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-6xl bg-slate-200">📸</div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                            <div className="absolute bottom-4 left-6">
                                                <span className="px-3 py-1 bg-blue-600 text-white text-[8px] font-black uppercase tracking-widest rounded-full">Principal</span>
                                            </div>
                                        </div>

                                        {/* Info Panel */}
                                        <div className="p-6 flex-1 flex flex-col justify-between">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-2xl font-black italic tracking-tighter uppercase leading-none">{profile.name}</h3>
                                                    <div className="flex items-center gap-1 mt-2 opacity-50">
                                                        <span className="text-[10px] font-bold uppercase tracking-widest">{profile.gender}</span>
                                                        <span>•</span>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest">{LANGUAGE_META[profile.language].label}</span>
                                                    </div>
                                                </div>

                                                {/* Relationship Score Circle */}
                                                <div className="relative w-12 h-12 flex items-center justify-center">
                                                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                                                        <circle cx="24" cy="24" r="20" className="stroke-current opacity-10" strokeWidth="4" fill="transparent" />
                                                        <circle
                                                            cx="24" cy="24" r="20"
                                                            className={`stroke-current ${getRelationshipStatus(profile.relationshipScore).color}`}
                                                            strokeWidth="4"
                                                            fill="transparent"
                                                            strokeDasharray={126}
                                                            strokeDashoffset={126 - (126 * profile.relationshipScore) / 100}
                                                            strokeLinecap="round"
                                                        />
                                                    </svg>
                                                    <span className="text-[10px] font-black">{Math.round(profile.relationshipScore)}</span>
                                                </div>
                                            </div>

                                            <div className="mt-4 flex flex-col gap-3">
                                                <div className="flex items-center gap-2 opacity-40">
                                                    <span className="text-lg">📞</span>
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{profile.callCount || 0} Chamadas Efetuadas</span>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setActiveChat({ 
                                                                profile: {
                                                                    id: user?.id || '',
                                                                    display_name: profile.name,
                                                                    personal_number: profile.currentPartnerNumber,
                                                                    ai_number: profile.ai_number || '',
                                                                    avatar_url: profile.image,
                                                                    ai_settings: profile as any
                                                                }, 
                                                                isAi: true 
                                                            }); 
                                                        }}
                                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-100 text-blue-600 dark:bg-blue-600/10 dark:text-blue-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-200 dark:hover:bg-blue-600/20 transition-all"
                                                    >
                                                        Chat ✈️
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onStartCall(); }}
                                                        className="flex-[1.5] flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                                                    >
                                                        Call 📞
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Custom AIs Cards */}
                                    {profile.custom_ais?.map((ai, index) => (
                                        <div key={index} className={`group relative flex flex-col rounded-[2.5rem] overflow-hidden border-2 border-transparent hover:border-pink-600/30 transition-all duration-500 ${cardClasses} shadow-2xl h-[550px]`}>
                                            {/* Favorite Icon */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const updated = [...(profile.custom_ais || [])];
                                                    updated[index] = { ...updated[index], isFavorite: !updated[index].isFavorite };
                                                    updateProfileAndSync(prev => ({ ...prev, custom_ais: updated }));
                                                }}
                                                className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-xl transition-all hover:scale-110 active:scale-90"
                                            >
                                                {ai.isFavorite ? '❤️' : '🤍'}
                                            </button>

                                            {/* Delete Icon */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm("Deseja excluir este perfil?")) {
                                                        updateProfileAndSync(prev => ({
                                                            ...prev,
                                                            custom_ais: prev.custom_ais?.filter((_, i) => i !== index) || []
                                                        }));
                                                    }
                                                }}
                                                className="absolute top-6 left-6 z-20 w-10 h-10 rounded-full bg-red-500/10 text-red-500 backdrop-blur-md flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                                            >
                                                ✕
                                            </button>

                                            {/* Image Container */}
                                            <div className="relative h-2/3 overflow-hidden">
                                                {ai.image ? (
                                                    <img src={ai.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={ai.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-6xl bg-slate-200">📸</div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                            </div>

                                            {/* Info Panel */}
                                            <div className="p-6 flex-1 flex flex-col justify-between">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="text-2xl font-black italic tracking-tighter uppercase leading-none">{ai.name}</h3>
                                                        <div className="flex items-center gap-1 mt-2 opacity-50">
                                                            <span className="text-[10px] font-bold uppercase tracking-widest">{ai.gender}</span>
                                                            <span>•</span>
                                                            <span className="text-[10px] font-bold uppercase tracking-widest">{LANGUAGE_META[ai.language].label}</span>
                                                        </div>
                                                    </div>

                                                    {/* Relationship Score Circle */}
                                                    <div className="relative w-12 h-12 flex items-center justify-center">
                                                        <svg className="absolute inset-0 w-full h-full -rotate-90">
                                                            <circle cx="24" cy="24" r="20" className="stroke-current opacity-10" strokeWidth="4" fill="transparent" />
                                                            <circle
                                                                cx="24" cy="24" r="20"
                                                                className={`stroke-current ${getRelationshipStatus(ai.relationshipScore || 100).color}`}
                                                                strokeWidth="4"
                                                                fill="transparent"
                                                                strokeDasharray={126}
                                                                strokeDashoffset={126 - (126 * (ai.relationshipScore || 100)) / 100}
                                                                strokeLinecap="round"
                                                            />
                                                        </svg>
                                                        <span className="text-[10px] font-black">{Math.round(ai.relationshipScore || 100)}</span>
                                                    </div>
                                                </div>

                                                <div className="mt-4 flex flex-col gap-3">
                                                    <div className="flex items-center gap-2 opacity-40">
                                                        <span className="text-lg">📞</span>
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{ai.callCount || 0} Chamadas Efetuadas</span>
                                                    </div>

                                                    {/* Action Buttons */}
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                setActiveChat({ 
                                                                    profile: {
                                                                        id: user?.id || '', // Note: custom AIs currently share the same chat context
                                                                        display_name: ai.name,
                                                                        personal_number: ai.currentPartnerNumber,
                                                                        ai_number: ai.ai_number || '',
                                                                        avatar_url: ai.image,
                                                                        ai_settings: ai as any
                                                                    }, 
                                                                    isAi: true 
                                                                }); 
                                                            }}
                                                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-pink-100 text-pink-600 dark:bg-pink-600/10 dark:text-pink-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-pink-200 dark:hover:bg-pink-600/20 transition-all"
                                                        >
                                                            Chat ✈️
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onCallPartner(ai, true, 'custom-' + index); }}
                                                            className="flex-[1.5] flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                                                        >
                                                            Call 📞
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Creation Trigger Card */}
                                    <button
                                        onClick={() => setShowCreateAiModal(true)}
                                        className={`flex flex-col items-center justify-center gap-4 p-8 rounded-[2.5rem] border-2 border-dashed border-inherit opacity-40 hover:opacity-100 hover:border-blue-600 hover:bg-blue-600/5 transition-all text-center min-h-[550px]`}
                                    >
                                        <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-4xl shadow-xl shadow-blue-600/20 transition-transform group-hover:scale-110">
                                            +
                                        </div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Materializar Nova IA</p>
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'config' && (
                            <div className="space-y-8 pb-20 max-w-2xl mx-auto">
                                {/* Create AI Profile Shortcut */}
                                <div className={`p-8 rounded-[3rem] border-2 border-blue-600/20 bg-blue-600/5 flex flex-col sm:flex-row items-center justify-between gap-6 overflow-hidden relative group`}>
                                    <div className="absolute -right-4 -bottom-4 text-8xl opacity-5 group-hover:scale-110 transition-transform duration-700 pointer-events-none">✨</div>
                                    <div className="text-center sm:text-left">
                                        <h3 className="text-lg font-black italic uppercase tracking-tighter">Novo Alter Ego AI</h3>
                                        <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Crie uma nova personalidade personalizada</p>
                                    </div>
                                    <button
                                        onClick={() => setShowCreateAiModal(true)}
                                        className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-blue-600/20 hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Criar Perfil
                                    </button>
                                </div>
                                <div className="flex flex-col items-center mb-12">
                                    <div className="relative group">
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`w-36 h-36 rounded-[3.5rem] p-1 border-2 border-blue-500 shadow-2xl cursor-pointer transition-all overflow-hidden bg-white dark:bg-white/5`}
                                        >
                                            <div className="w-full h-full rounded-[3rem] overflow-hidden flex items-center justify-center">
                                                {isSavingImage ? (
                                                    <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                ) : profile.image ? (
                                                    <img src={profile.image} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">📷</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center border-4 border-[#f9f9fb] dark:border-[#0b0c10] shadow-lg pointer-events-none">✏️</div>
                                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                    </div>
                                    <input
                                        type="text"
                                        value={profile.name}
                                        onChange={(e) => updateProfileAndSync(prev => ({ ...prev, name: e.target.value }))}
                                        className="mt-6 text-3xl font-black italic tracking-tighter bg-transparent border-none text-center outline-none w-full"
                                        placeholder="NOME DA PARCEIRA"
                                    />
                                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-30 mt-2">Personalização da Identidade</p>

                                    <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-sm">
                                        <div className="flex flex-col items-center">
                                            <input
                                                type="text"
                                                value={profile.gender}
                                                onChange={(e) => updateProfileAndSync(prev => ({ ...prev, gender: e.target.value }))}
                                                className="text-lg font-bold italic tracking-tighter bg-transparent border-b border-blue-500/20 text-center outline-none w-full pb-1 focus:border-blue-500 transition-colors"
                                                placeholder="GÊNERO"
                                            />
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mt-2">Gênero</p>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <input
                                                type="text"
                                                value={profile.sexuality}
                                                onChange={(e) => updateProfileAndSync(prev => ({ ...prev, sexuality: e.target.value }))}
                                                className="text-lg font-bold italic tracking-tighter bg-transparent border-b border-blue-500/20 text-center outline-none w-full pb-1 focus:border-blue-500 transition-colors"
                                                placeholder="SEXUALIDADE"
                                            />
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mt-2">Sexualidade</p>
                                        </div>
                                    </div>

                                    <div className="mt-8 flex flex-col items-center w-full max-w-sm">
                                        <input
                                            type="text"
                                            value={profile.bestFriend}
                                            onChange={(e) => updateProfileAndSync(prev => ({ ...prev, bestFriend: e.target.value }))}
                                            className="text-lg font-bold italic tracking-tighter bg-transparent border-b border-blue-500/20 text-center outline-none w-full pb-1 focus:border-blue-500 transition-colors"
                                            placeholder="MELHOR AMIGO"
                                        />
                                        <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mt-2">Melhor Amigo (Alfa)</p>
                                    </div>
                                </div>

                                {/* Section: Gemini Vision */}
                                <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-3xl rounded-full" />
                                    <div className="flex justify-between items-center mb-8">
                                        <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Gemini Engine AI</h3>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${apiStatus === 'valid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                            {apiStatus === 'valid' ? 'Conectado ✓' : 'Desconectado ✕'}
                                        </div>
                                    </div>
                                    <div className="space-y-6">
                                        <div className="relative">
                                            <input
                                                type="password"
                                                value={apiKey}
                                                onChange={(e) => { setApiKey(e.target.value); setApiStatus('idle'); }}
                                                onBlur={() => validateApiKey(apiKey)}
                                                className={`w-full p-5 rounded-[2rem] text-sm font-mono border ${inputClasses}`}
                                                placeholder="Enter Gemini API Key..."
                                            />
                                            <button onClick={() => validateApiKey(apiKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 font-bold text-xs hover:scale-105 transition-all">VERIFICAR</button>
                                        </div>
                                        <div className="flex justify-between items-center px-2">
                                            <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest leading-loose">Chave criptografada localmente.</p>
                                            <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-[10px] font-black text-blue-600 hover:opacity-70 transition-opacity">PEGAR CHAVE GRÁTIS →</a>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Chat AI Engine (Independent) */}
                                <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-pink-600/5 blur-3xl rounded-full" />
                                    <div className="flex justify-between items-center mb-8">
                                        <div>
                                            <h3 className="text-sm font-bold uppercase tracking-widest text-pink-600">Chat AI Engine</h3>
                                            <p className="text-[9px] font-bold opacity-30 uppercase mt-1 tracking-widest">Motor independente para mensagens de texto</p>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${profile.chat_gemini_api_key ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/5 opacity-50'}`}>
                                            {profile.chat_gemini_api_key ? 'Configurado ✓' : 'Usando Global'}
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-4">Modelo do Chat</label>
                                                <select
                                                    value={profile.chat_model || 'gemini-1.5-flash-latest'}
                                                    onChange={(e) => updateProfileAndSync(prev => ({ ...prev, chat_model: e.target.value }))}
                                                    className={`w-full p-5 rounded-[2rem] text-sm font-bold border ${inputClasses} appearance-none cursor-pointer`}
                                                >
                                                    <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash (Rápido & Estável)</option>
                                                    <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro (Inteligência Superior)</option>
                                                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Nova Geração)</option>
                                                    <option value="gemini-2.0-flash-lite-preview-02-05">Gemini 2.0 Flash Lite (Ultra Rápido)</option>
                                                    <option value="gemini-1.0-pro">Gemini 1.0 Pro (Econômico)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-4">API Key Específica (Opcional)</label>
                                                <input
                                                    type="password"
                                                    value={profile.chat_gemini_api_key || 'AIzaSyDaO7ij1YvJ60wTFdhw-W6JnadYUwi6H_4'}
                                                    onChange={(e) => updateProfileAndSync(prev => ({ ...prev, chat_gemini_api_key: e.target.value }))}
                                                    className={`w-full p-5 rounded-[2rem] text-sm font-mono border ${inputClasses}`}
                                                    placeholder="Usando chave padrão atualizada"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[9px] font-medium opacity-30 px-4 italic leading-relaxed text-center">
                                            Isso permite que você use uma chave ou modelo diferente para o chat de texto, sem afetar a performance da chamada de voz.
                                        </p>
                                    </div>
                                </div>

                                {/* Section: Voice & Accent */}
                                <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                    <h3 className="text-sm font-bold uppercase tracking-widest mb-10 opacity-30">Voz & Sotaque Profissional</h3>

                                    <div className="space-y-10">
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                            {Object.entries(ACCENT_META).map(([key, meta]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => updateProfileAndSync(prev => ({ ...prev, accent: key as Accent }))}
                                                    className={`p-3 rounded-2xl border flex flex-col items-center gap-3 transition-all ${profile.accent === key ? 'border-blue-600 bg-blue-600/5' : 'border-slate-100 hover:border-blue-300'}`}
                                                >
                                                    <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md">
                                                        <img src={meta.flagUrl} className="w-full h-full object-cover" />
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-tighter opacity-70">{meta.label}</span>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="space-y-6">
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 text-center">Timbres Femininos</p>
                                                <div className="flex flex-wrap justify-center gap-2">
                                                    {Object.values(VoiceName).filter(v => VOICE_META[v].gender === 'Female').map(voice => (
                                                        <button
                                                            key={voice}
                                                            onClick={() => updateProfileAndSync(prev => ({ ...prev, voice }))}
                                                            className={`px-5 py-3 rounded-full text-[11px] font-bold border transition-all ${profile.voice === voice ? 'bg-rose-600 border-rose-600 text-white shadow-xl shadow-rose-600/20 scale-105' : 'border-slate-100 hover:bg-slate-50'}`}
                                                        >
                                                            {voice}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 text-center">Timbres Masculinos</p>
                                                <div className="flex flex-wrap justify-center gap-2">
                                                    {Object.values(VoiceName).filter(v => VOICE_META[v].gender === 'Male').map(voice => (
                                                        <button
                                                            key={voice}
                                                            onClick={() => updateProfileAndSync(prev => ({ ...prev, voice }))}
                                                            className={`px-5 py-3 rounded-full text-[11px] font-bold border transition-all ${profile.voice === voice ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-600/20 scale-105' : 'border-slate-100 hover:bg-slate-50'}`}
                                                        >
                                                            {voice}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Language & Globalization */}
                                <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                    <h3 className="text-sm font-bold uppercase tracking-widest mb-10 opacity-30">Idiomas e Globalização</h3>

                                    <div className="space-y-8">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 ml-2">Idioma da Inteligência Artificial</p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                {Object.entries(LANGUAGE_META).map(([key, meta]) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => updateProfileAndSync(prev => ({ ...prev, language: key as PlatformLanguage }))}
                                                        className={`p-4 rounded-2xl flex items-center justify-center gap-3 transition-all border ${profile.language === key ? 'border-blue-600 bg-blue-600/5 shadow-inner' : 'border-slate-100 hover:border-blue-300 dark:border-white/5 dark:hover:border-white/20'}`}
                                                    >
                                                        <span className="text-lg">{meta.flag}</span>
                                                        <span className="text-xs font-bold uppercase tracking-widest opacity-70">{meta.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 ml-2">Idioma da Plataforma (Interface)</p>
                                            <p className="text-[9px] font-medium opacity-40 ml-2 mb-4 italic">Esta configuração altera apenas o conteúdo visual do aplicativo (Em breve).</p>
                                            {/* For now we can keep it disabled as a UI element until localized properly. If requested, just mock it. */}
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Ringtone / Toque Musical */}
                                <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                    <h3 className="text-sm font-bold uppercase tracking-widest mb-10 opacity-30">Toque Musical da Chamada</h3>

                                    <div className="space-y-8">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-6 ml-2 text-center sm:text-left">Sons Pré-definidos</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                                {DEFAULT_RINGTONES.map((rt) => (
                                                    <button
                                                        key={rt.id}
                                                        onClick={() => updateProfileAndSync(prev => ({ ...prev, ringtoneUrl: rt.url, ringtoneName: rt.name }))}
                                                        className={`p-5 rounded-2xl border flex flex-col items-center gap-3 transition-all relative overflow-hidden group ${profile.ringtoneUrl === rt.url ? 'border-blue-600 bg-blue-600/5 shadow-inner' : borderClass + ' hover:border-blue-300'}`}
                                                    >
                                                        {profile.ringtoneUrl === rt.url && (
                                                            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                                                        )}
                                                        <span className="text-2xl group-hover:scale-110 transition-transform">🔔</span>
                                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-70 text-center">{rt.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-dashed border-white/10">
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-6 ml-2 text-center sm:text-left">Upload de Toque Customizado</p>
                                            <input
                                                type="file"
                                                accept="audio/mp3,audio/wav,audio/mpeg"
                                                className="hidden"
                                                ref={ringtoneInputRef}
                                                onChange={handleRingtoneUpload}
                                            />
                                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                                <button
                                                    onClick={() => ringtoneInputRef.current?.click()}
                                                    className={`w-full sm:w-auto px-10 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3 ${isPink ? 'bg-pink-100 text-pink-600 shadow-pink-200/50' : 'bg-blue-600 text-white shadow-blue-500/20'}`}
                                                >
                                                    <span>📤</span>
                                                    Fazer Upload MP3
                                                </button>
                                                {profile.ringtoneName && (
                                                    <div className="flex flex-col">
                                                        <p className="text-[9px] font-bold uppercase tracking-wider opacity-30 mb-1">Toque Ativo</p>
                                                        <p className={`text-[11px] font-black uppercase tracking-widest ${isPink ? 'text-pink-600' : 'text-blue-500'}`}>
                                                            {profile.ringtoneName}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="mt-6 text-[9px] font-medium opacity-30 italic">O toque selecionado será reproduzido quando você receber uma chamada de voz da IA ou de outros usuários.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Personality & Context */}
                                <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                    <h3 className="text-sm font-bold uppercase tracking-widest mb-10 opacity-30">Motor de Personalidade</h3>
                                    <div className="space-y-8">
                                        <div>
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-blue-600 block mb-4 ml-4">Prompt de Comportamento</label>
                                            <textarea
                                                value={profile.personality}
                                                onChange={(e) => updateProfileAndSync(prev => ({ ...prev, personality: e.target.value }))}
                                                className={`w-full h-40 rounded-[2.5rem] p-8 text-[13px] font-medium border focus:outline-none transition-all resize-none ${inputClasses}`}
                                                placeholder="Descreva detalhadamente como a IA deve agir..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {Object.values(CallbackIntensity).map((intensity) => (
                                                <button
                                                    key={intensity}
                                                    onClick={() => updateProfileAndSync(prev => ({ ...prev, intensity }))}
                                                    className={`py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest border transition-all ${profile.intensity === intensity ? 'bg-black text-white' : 'border-slate-100 hover:bg-slate-50'}`}
                                                >
                                                    {intensity}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Relational Tracking */}
                                <div className={`p-10 rounded-[3rem] border ${cardClasses}`}>
                                    <div className="flex justify-between items-center mb-10">
                                        <h3 className="text-sm font-bold uppercase tracking-widest opacity-30">Relacionamentos & Vínculos</h3>
                                        <span className="text-[9px] font-black px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-lg">PROTOCOLO ALFA</span>
                                    </div>

                                    <div className="space-y-12">
                                        {/* Original Partner */}
                                        <div className={`p-6 rounded-[2rem] border ${inputClasses} border-opacity-30`}>
                                            <div className="flex items-center gap-3 mb-6">
                                                <span className="text-lg">🧬</span>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Parceiro Originário</p>
                                                    <p className="text-[8px] opacity-40 uppercase font-bold tracking-tighter">Vínculo Primário Imutável</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Apelido Original</p>
                                                    <input
                                                        type="text"
                                                        value={profile.originalPartnerNickname}
                                                        onChange={(e) => updateProfileAndSync(prev => ({ ...prev, originalPartnerNickname: e.target.value }))}
                                                        className="bg-transparent border-none font-bold text-sm outline-none w-full"
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">ID Originário</p>
                                                    <input
                                                        type="text"
                                                        value={profile.originalPartnerId}
                                                        className="bg-transparent border-none font-mono text-[10px] opacity-50 outline-none w-full"
                                                        readOnly
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Número Original</p>
                                                    <input
                                                        type="text"
                                                        value={profile.originalPartnerNumber}
                                                        onChange={(e) => updateProfileAndSync(prev => ({ ...prev, originalPartnerNumber: e.target.value }))}
                                                        className="bg-transparent border-none font-mono text-sm outline-none w-full italic"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Current Partner */}
                                        <div className={`p-6 rounded-[2rem] border ${inputClasses} border-blue-500/10 bg-blue-500/[0.02]`}>
                                            <div className="flex items-center gap-3 mb-6">
                                                <span className="text-lg">💞</span>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-pink-500">Parceiro Atual</p>
                                                    <p className="text-[8px] opacity-40 uppercase font-bold tracking-tighter">Foco de Interação em Tempo Real</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Apelido do Parceiro</p>
                                                    <input
                                                        type="text"
                                                        value={profile.currentPartnerNickname}
                                                        onChange={(e) => updateProfileAndSync(prev => ({ ...prev, currentPartnerNickname: e.target.value }))}
                                                        className="bg-transparent border-none font-bold text-sm outline-none w-full"
                                                        placeholder="Como a proporia IA te vê agora..."
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">ID do Parceiro Atual</p>
                                                    <input
                                                        type="text"
                                                        value={profile.currentPartnerId}
                                                        onChange={(e) => updateProfileAndSync(prev => ({ ...prev, currentPartnerId: e.target.value }))}
                                                        className="bg-transparent border-none font-mono text-[10px] outline-none w-full"
                                                        placeholder="ID do novo usuário..."
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Número do Parceiro Atual</p>
                                                    <input
                                                        type="text"
                                                        value={profile.currentPartnerNumber}
                                                        onChange={(e) => updateProfileAndSync(prev => ({ ...prev, currentPartnerNumber: e.target.value }))}
                                                        className="bg-transparent border-none font-mono text-sm outline-none w-full italic"
                                                        placeholder="Telefone do parceiro atual..."
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section: AI Chat Intercept / Interceptação de Chat */}
                                        <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                            <div className={`absolute top-0 right-0 w-32 h-32 ${profile.isAiChatInterceptEnabled ? 'bg-blue-600/10' : 'bg-slate-500/10'} blur-3xl rounded-full transition-all duration-700`} />
                                            <div className="flex justify-between items-start mb-6 relative z-10">
                                                <div>
                                                    <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Auto-Resposta da IA (Chat)</h3>
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30 mt-2 italic">A IA responde mensagens automaticamente</p>
                                                </div>
                                                <button
                                                    onClick={() => updateProfileAndSync(prev => ({ ...prev, isAiChatInterceptEnabled: !prev.isAiChatInterceptEnabled }))}
                                                    className={`w-16 h-8 rounded-full relative transition-all duration-500 shadow-inner ${profile.isAiChatInterceptEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-white/10'}`}
                                                >
                                                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-500 ${profile.isAiChatInterceptEnabled ? 'left-9 rotate-0' : 'left-1 -rotate-180'}`} />
                                                </button>
                                            </div>
                                            <div className="space-y-6 relative z-10">
                                                <div className={`p-8 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                    <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                                                        {profile.isAiChatInterceptEnabled
                                                            ? "Ativado: Todas as mensagens recebidas serão processadas e respondidas pela sua IA. O chat será unificado com a personalidade dela."
                                                            : "Desativado (Padrão): As mensagens de outros usuários cairão em um canal direto 'Humano-Humano', separado do chat da sua IA."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section: AI Receptionist / Guardian */}
                                        <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                            <div className={`absolute top-0 right-0 w-32 h-32 ${profile.isAiReceptionistEnabled ? 'bg-emerald-500/10' : 'bg-rose-500/10'} blur-3xl rounded-full transition-all duration-700`} />
                                            <div className="flex justify-between items-start mb-10 relative z-10">
                                                <div>
                                                    <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Recepcionista AI & Guardiã</h3>
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30 mt-2 italic">A IA intercepta chamadas de estranhos</p>
                                                </div>
                                                <button
                                                    onClick={() => updateProfileAndSync(prev => ({ ...prev, isAiReceptionistEnabled: !prev.isAiReceptionistEnabled }))}
                                                    className={`w-16 h-8 rounded-full relative transition-all duration-500 shadow-inner ${profile.isAiReceptionistEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/10'}`}
                                                >
                                                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-500 ${profile.isAiReceptionistEnabled ? 'left-9 rotate-0' : 'left-1 -rotate-180'}`} />
                                                </button>
                                            </div>
                                            <div className="space-y-6 relative z-10">
                                                <div className={`p-8 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                    <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                                                        {profile.isAiReceptionistEnabled
                                                            ? `Ativado: Sua IA atenderá chamadas de números desconhecidos. Ela perguntará quem é, dirá que ${profile.currentPartnerNickname || 'você'} não está e anotará recados. Cuidado: ela pode mostrar ciúmes se não gostar de quem ligou!`
                                                            : "Desativado: Você receberá todas as chamadas normalmente. A IA não interferirá no primeiro contato."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section: Ephemeral Chats / Chat Efêmero */}
                                        <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                            <div className={`absolute top-0 right-0 w-32 h-32 ${profile.ephemeralHumanChats !== false ? 'bg-amber-500/10' : 'bg-slate-500/10'} blur-3xl rounded-full transition-all duration-700`} />
                                            <div className="flex justify-between items-start mb-6 relative z-10">
                                                <div>
                                                    <h3 className="text-sm font-bold uppercase tracking-widest text-amber-600">Chat Efêmero (Humano-Humano)</h3>
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30 mt-2 italic">Mensagens somem após visualizadas</p>
                                                </div>
                                                <button
                                                    onClick={() => updateProfileAndSync(prev => ({ ...prev, ephemeralHumanChats: prev.ephemeralHumanChats === false ? true : false }))}
                                                    className={`w-16 h-8 rounded-full relative transition-all duration-500 shadow-inner ${profile.ephemeralHumanChats !== false ? 'bg-amber-500' : 'bg-amber-300 dark:bg-white/10'}`}
                                                >
                                                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-500 ${profile.ephemeralHumanChats !== false ? 'left-9 rotate-0' : 'left-1 -rotate-180'}`} />
                                                </button>
                                            </div>
                                            <div className="space-y-6 relative z-10">
                                                <div className={`p-8 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                    <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                                                        {profile.ephemeralHumanChats !== false
                                                            ? "Ativado por Padrão: Quando você conversa com outros humanos, as mensagens ficam visíveis apenas até serem lidas. Ao sair do chat, as mensagens lidas são apagadas permanentemente."
                                                            : "Desativado: O histórico de conversas entre humanos será preservado normalmente."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section: Privacy / Identidade Digital */}
                                        <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                            <div className={`absolute top-0 right-0 w-32 h-32 ${currentUserProfile?.is_searchable !== false ? 'bg-blue-500/10' : 'bg-red-500/10'} blur-3xl rounded-full transition-all duration-700`} />
                                            <div className="flex justify-between items-start mb-6 relative z-10">
                                                <div>
                                                    <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Identidade Digital e Busca</h3>
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30 mt-2 italic">Permitir ser encontrado na nuvem global</p>
                                                </div>
                                                <button
                                                    onClick={toggleVisibility}
                                                    className={`w-16 h-8 rounded-full relative transition-all duration-500 shadow-inner ${currentUserProfile?.is_searchable !== false ? 'bg-blue-600' : 'bg-slate-300 dark:bg-white/10'}`}
                                                >
                                                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-500 ${currentUserProfile?.is_searchable !== false ? 'left-9 rotate-0' : 'left-1 -rotate-180'}`} />
                                                </button>
                                            </div>
                                            <div className="space-y-6 relative z-10">
                                                <div className={`p-8 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                    <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                                                        {currentUserProfile?.is_searchable !== false
                                                            ? `Público: Você poderá ser encontrado na pesquisa global da rede pelo seu nome e número de telefone.`
                                                            : "Privado/Invisível: Nenhum outro usuário da plataforma será capaz de buscar ou encontrar seu contato publicamente."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section: Captions / Subtitles */}
                                        <div className={`p-10 rounded-[3rem] border ${cardClasses} relative overflow-hidden`}>
                                            <div className={`absolute top-0 right-0 w-32 h-32 ${profile.captionsEnabled ? 'bg-violet-500/10' : 'bg-slate-500/10'} blur-3xl rounded-full transition-all duration-700`} />
                                            <div className="flex justify-between items-start mb-6 relative z-10">
                                                <div>
                                                    <h3 className="text-sm font-bold uppercase tracking-widest text-blue-600">Legendas ao Vivo</h3>
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30 mt-2 italic">Transcrição e tradução do que a IA diz na chamada</p>
                                                </div>
                                                <button
                                                    onClick={() => updateProfileAndSync(prev => ({ ...prev, captionsEnabled: !prev.captionsEnabled }))}
                                                    className={`w-16 h-8 rounded-full relative transition-all duration-500 shadow-inner ${profile.captionsEnabled ? 'bg-violet-500' : 'bg-slate-300 dark:bg-white/10'}`}
                                                >
                                                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-500 ${profile.captionsEnabled ? 'left-9 rotate-0' : 'left-1 -rotate-180'}`} />
                                                </button>
                                            </div>
                                            {profile.captionsEnabled && (
                                                <div className="space-y-6 relative z-10">
                                                    <div className={`p-6 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                        <p className="text-[11px] font-medium leading-relaxed opacity-80 italic mb-6">
                                                            Escolha o idioma em que as legendas serão exibidas. Se diferente do idioma da IA, o texto será traduzido automaticamente.
                                                        </p>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 mb-4 ml-2">Idioma das Legendas</p>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                            {Object.entries(LANGUAGE_META).map(([key, meta]) => (
                                                                <button
                                                                    key={key}
                                                                    onClick={() => updateProfileAndSync(prev => ({ ...prev, captionLanguage: key as PlatformLanguage }))}
                                                                    className={`p-3 rounded-2xl flex items-center justify-center gap-2 transition-all border text-left ${(profile.captionLanguage ?? profile.language) === key
                                                                        ? 'border-violet-500 bg-violet-500/10 shadow-inner'
                                                                        : 'border-slate-100 hover:border-violet-300 dark:border-white/5 dark:hover:border-white/20'
                                                                        }`}
                                                                >
                                                                    <span className="text-base">{meta.flag}</span>
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{meta.label}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {!profile.captionsEnabled && (
                                                <div className="relative z-10">
                                                    <div className={`p-6 rounded-[2.5rem] border ${inputClasses} border-opacity-30`}>
                                                        <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                                                            Desativado: Nenhuma legenda será exibida durante a chamada.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'chats' && (
                            <div className="w-full h-[calc(100vh-200px)] md:h-[calc(100vh-280px)]"><QuickChatTab currentUser={user} profile={profile} onCallPartner={onCallPartner} onOpenChat={(target, isAi) => setActiveChat({ profile: target, isAi })} isDark={isDark} /></div>
                        )}
                    </div>
                </div>
            </div>

            {showAuth && <AuthModal onClose={() => setShowAuth(false)} isDark={isDark} />}

            {/* Notifications Modal */}
            {
                showNotifications && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-in fade-in duration-500">
                        <div className={`w-full max-w-md p-10 rounded-[4rem] border shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)] transform animate-in slide-in-from-bottom-12 duration-700 ${cardClasses}`}>
                            <div className="flex justify-between items-start mb-10">
                                <div>
                                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">Fluxos de Memória</h3>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Histórico de Interações</p>
                                </div>
                                <button onClick={() => setShowNotifications(false)} className="w-10 h-10 flex items-center justify-center opacity-30 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all text-xl">✕</button>
                            </div>

                            <div className="flex gap-2 mb-6">
                                <button onClick={downloadHistory} className={`p-3 rounded-2xl hover:bg-blue-500/10 text-blue-500 transition-all border ${borderClass}`}>📥 Exportar</button>
                                <button onClick={clearHistory} className={`p-3 rounded-2xl hover:bg-red-500/10 text-red-500 transition-all border ${borderClass}`}>🗑️ Limpar</button>
                            </div>

                            <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                                {profile.history.length === 0 ? (
                                    <p className="text-center py-12 opacity-20 italic text-sm">Nenhuma lembrança registrada.</p>
                                ) : (
                                    profile.history.slice().reverse().map(log => (
                                        <div key={log.id} className={`p-5 rounded-[2rem] border flex items-center gap-4 group transition-all hover:border-blue-500/30 ${isDark ? 'bg-[#0b0c10] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                            <div className="w-12 h-12 rounded-full bg-white dark:bg-white/5 flex items-center justify-center text-xl shadow-sm">
                                                {MOOD_EMOJIS[log.moodEnd]}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-bold truncate tracking-tight">{log.notes || "Conversa encerrada"}</p>
                                                <p className="text-[10px] opacity-40 font-bold uppercase mt-1">{new Date(log.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Profile Modal */}
            {
                showProfileModal && currentUserProfile && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-in fade-in duration-500">
                        <div className={`w-full max-w-md p-10 rounded-[4rem] border shadow-[0_48px_80px_-20px_rgba(0,0,0,0.6)] transform animate-in slide-in-from-bottom-12 duration-700 ${cardClasses}`}>
                            <div className="flex justify-between items-start mb-10">
                                <div>
                                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">Meu Perfil</h3>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Identidade e Conexões</p>
                                </div>
                                <button onClick={() => setShowProfileModal(false)} className="w-10 h-10 flex items-center justify-center opacity-30 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all text-xl">✕</button>
                            </div>

                            <div className="space-y-8">
                                {/* Photo Upload */}
                                <div className="flex flex-col items-center gap-6">
                                    <div
                                        onClick={() => userFileInputRef.current?.click()}
                                        className={`w-32 h-32 rounded-[2.5rem] overflow-hidden border-4 shadow-2xl transition-all hover:scale-105 cursor-pointer ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-white'}`}
                                    >
                                        {isSavingImage ? (
                                            <div className="w-full h-full flex items-center justify-center bg-blue-500/10">
                                                <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                            </div>
                                        ) : currentUserProfile.avatar_url ? (
                                            <img src={currentUserProfile.avatar_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-4xl opacity-10">📸</div>
                                        )}
                                    </div>
                                    <input ref={userFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUserImageUpload} />
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Clique para alterar foto</p>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Nome de Usuário</label>
                                        <input
                                            type="text"
                                            value={currentUserProfile.display_name || ''}
                                            onChange={e => onUpdateUserProfile({ ...currentUserProfile, display_name: e.target.value })}
                                            className={`w-full p-6 rounded-[2rem] border text-sm font-bold outline-none transition-all ${inputClasses}`}
                                            placeholder="Seu nome real"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Apelido Carinhoso (Para a IA)</label>
                                        <input
                                            type="text"
                                            value={currentUserProfile.nickname || ''}
                                            onChange={e => onUpdateUserProfile({ ...currentUserProfile, nickname: e.target.value })}
                                            className={`w-full p-6 rounded-[2rem] border text-sm font-bold outline-none transition-all ${inputClasses}`}
                                            placeholder="Ex: Amor, Vida, Bebê..."
                                        />
                                        <p className="text-[9px] opacity-30 mt-2 ml-4 lowercase">Como a AI deve chamar você durante as conversas</p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 pt-4">
                                        <div className={`p-5 rounded-[2rem] border flex items-center justify-between ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                                            <div>
                                                <p className="text-[9px] font-black opacity-30 uppercase tracking-widest italic mb-1">Meu Número</p>
                                                <p className="text-lg font-black italic tracking-tighter text-blue-600">
                                                    {formatDisplayNumber(currentUserProfile.personal_number, false)}
                                                </p>
                                            </div>
                                            <button onClick={() => copyToClipboard(currentUserProfile.personal_number)} className="p-3 bg-blue-600/10 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                                                📋
                                            </button>
                                        </div>
                                        <div className={`p-5 rounded-[2rem] border flex items-center justify-between ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                                            <div>
                                                <p className="text-[9px] font-black opacity-30 uppercase tracking-widest italic mb-1">Número da IA (Público)</p>
                                                <p className="text-lg font-black italic tracking-tighter text-pink-600">
                                                    {formatDisplayNumber(currentUserProfile.ai_number, true)}
                                                </p>
                                            </div>
                                            <button onClick={() => copyToClipboard(currentUserProfile.ai_number)} className="p-3 bg-pink-600/10 text-pink-600 rounded-xl hover:bg-pink-600 hover:text-white transition-all">
                                                📋
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={saveUserProfile}
                                    disabled={isSavingProfile}
                                    className="w-full py-6 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] shadow-2xl shadow-blue-500/40 hover:scale-[1.02] active:scale-95 transition-all text-[11px] disabled:opacity-50"
                                >
                                    {isSavingProfile ? "Salvando..." : "Salvar Alterações"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                activeChat && (
                    <ChatWindow
                        key={`${activeChat.profile.id}-${activeChat.isAi}`}
                        currentUser={user}
                        targetProfile={activeChat.profile}
                        isAi={activeChat.isAi}
                        onClose={() => setActiveChat(null)}
                        theme={profile.theme}
                        apiKey={apiKey}
                        chatApiKey={profile.chat_gemini_api_key}
                        chatModel={profile.chat_model}
                        ephemeralHumanChats={profile.ephemeralHumanChats !== false}
                    />
                )
            }

        </div >
    );
};
