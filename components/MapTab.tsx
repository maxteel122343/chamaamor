import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { PartnerProfile, UserProfile, Reminder, CallLog, Contact, TransportMode } from '../types';

interface MapTabProps {
    user: any;
    profile: PartnerProfile;
    setProfile: React.Dispatch<React.SetStateAction<PartnerProfile>>;
    currentUserProfile?: UserProfile | null;
    isDark: boolean;
}

export const MapTab: React.FC<MapTabProps> = ({ user, profile, setProfile, currentUserProfile, isDark }) => {
    const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [address, setAddress] = useState<string>('');
    const [cep, setCep] = useState<string>('');
    const [lastSearchedPlace, setLastSearchedPlace] = useState<{name: string, address: string} | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [transportMode, setTransportMode] = useState<TransportMode>('car');
    const [estimatedTime, setEstimatedTime] = useState<number>(15);
    const [favorites, setFavorites] = useState<{ id: string, name: string, address: string }[]>(() => {
        const saved = localStorage.getItem(`favorites_${user?.id || 'guest'}`);
        return saved ? JSON.parse(saved) : [];
    });
    const [scheduleData, setScheduleData] = useState({
        title: '',
        description: '',
        time: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
        ai_reminder_call: {
            enabled: false,
            interval: 'day' as 'week' | 'day' | 'hour' | 'same_day'
        }
    });

    useEffect(() => {
        if (user) {
            localStorage.setItem(`favorites_${user.id}`, JSON.stringify(favorites));
            supabase.from('profiles').update({ 
                ai_settings: { ...profile, favorite_locations: favorites } 
            }).eq('id', user.id).then();
        }
    }, [favorites, user]);

    useEffect(() => {
        if (profile.favorite_locations) {
            setFavorites(profile.favorite_locations as any);
        }
    }, []);

    const cardClasses = isDark ? "bg-[#15181e] border-white/5" : "bg-white border-slate-100 shadow-sm";
    const inputClasses = isDark ? "bg-white/5 border-white/10 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500";

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocation({ lat: latitude, lng: longitude });
                },
                (error) => {
                    console.error("Erro ao obter localização:", error);
                }
            );
        }
        fetchContacts();
    }, []);

    const fetchContacts = async () => {
        if (!user) return;
        const { data } = await supabase.from('contacts').select('*').eq('owner_id', user.id);
        if (data) {
            const enriched = await Promise.all(data.map(async (c) => {
                const { data: p } = await supabase.from('profiles').select('*').eq('id', c.target_id).single();
                return { ...c, profile: p };
            }));
            setContacts(enriched);
        }
    };

    const addLogToHistory = (message: string) => {
        const newLog: CallLog = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            durationSec: 0,
            moodEnd: profile.mood,
            notes: message
        };
        setProfile(prev => {
            const updated = { ...prev, history: [...prev.history, newLog] };
            if (user) {
                supabase.from('profiles').update({ ai_settings: updated }).eq('id', user.id).then();
            }
            return updated;
        });
    };

    const handleScheduleAtLocation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scheduleData.title || !scheduleData.time) return;

        setLoading(true);
        const locationAddress = address || searchQuery || 'Localização no Mapa';
        const { error } = await supabase.from('reminders').insert({
            owner_id: user.id,
            title: `📍 ${scheduleData.title} @ ${locationAddress}`,
            description: scheduleData.description,
            trigger_at: new Date(scheduleData.time).toISOString(),
            location_data: {
                address: locationAddress,
                cep: cep,
                transport_mode: transportMode,
                estimated_time: estimatedTime,
                prepare_minutes_before: 30
            },
            ai_reminder_call: scheduleData.ai_reminder_call
        });

        if (!error) {
            addLogToHistory(`Agendou um compromisso em um local específico: ${scheduleData.title}`);
            setShowScheduleModal(false);
            alert("Compromisso agendado com sucesso!");
        } else {
            alert("Erro ao agendar compromisso.");
        }
        setLoading(false);
    };

    const handleSendInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scheduleData.title || !scheduleData.time || !selectedContact) return;

        setLoading(true);
        const locationAddress = address || searchQuery || 'Localização no Mapa';
        
        const { error } = await supabase.from('invites').insert({
            sender_id: user.id,
            receiver_id: selectedContact.target_id,
            title: scheduleData.title,
            description: scheduleData.description,
            address: locationAddress,
            trigger_at: new Date(scheduleData.time).toISOString(),
            transport_mode: transportMode,
            estimated_time: estimatedTime,
            ai_reminder_call: scheduleData.ai_reminder_call
        });

        if (!error) {
            addLogToHistory(`Enviou um convite para o usuário ${selectedContact.profile?.nickname || selectedContact.profile?.display_name} para ir em "${scheduleData.title}" em ${locationAddress}.`);
            setShowInviteModal(false);
            alert("Convite enviado com sucesso!");
        } else {
            alert("Erro ao enviar convite.");
        }
        setLoading(false);
    };

    const toggleFavorite = (name: string, addr: string) => {
        const exists = favorites.find(f => f.name === name || f.address === addr);
        if (exists) {
            setFavorites(prev => prev.filter(f => f.id !== exists.id));
        } else {
            setFavorites(prev => [...prev, { id: Date.now().toString(), name: name || searchQuery, address: addr || searchQuery }]);
        }
    };

    const getMapUrl = () => {
        if (searchQuery) {
            return `https://maps.google.com/maps?q=${encodeURIComponent(searchQuery)}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
        }
        if (location) {
            return `https://maps.google.com/maps?q=${location.lat},${location.lng}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
        }
        return `https://maps.google.com/maps?q=Sao+Paulo&t=&z=10&ie=UTF8&iwloc=&output=embed`;
    };

    return (
        <div className="w-full flex flex-col gap-8 pt-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter italic uppercase">Mapa de Conexão</h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Localização & Agendamento Geográfico</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={`lg:col-span-2 rounded-[3rem] border overflow-hidden relative shadow-2xl h-[400px] md:h-[600px] ${cardClasses}`}>
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
                        {(showScheduleModal || showInviteModal) && (
                            <button 
                                onClick={() => {
                                    setAddress(searchQuery);
                                    const btn = document.getElementById('capture-btn');
                                    if (btn) {
                                        btn.innerText = '✅ LOCAL CAPTURADO';
                                        setTimeout(() => { if (btn) btn.innerText = '📍 CONFIRMAR LOCALIZAÇÃO'; }, 2000);
                                    }
                                }}
                                id="capture-btn"
                                className="px-8 py-4 bg-emerald-600 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 animate-in slide-in-from-bottom-4 duration-500"
                            >
                                📍 CONFIRMAR LOCALIZAÇÃO
                            </button>
                        )}
                    </div>

                    <div className="absolute top-6 left-6 right-6 z-10 flex flex-col gap-3">
                        <div className="flex gap-3">
                            <div className="relative flex-1 group">
                                <input
                                    type="text"
                                    placeholder="Buscar local para agendar..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            setLastSearchedPlace({ name: searchQuery, address: searchQuery });
                                        }
                                    }}
                                    className={`w-full p-6 pl-14 rounded-[2rem] text-sm font-bold border outline-none transition-all shadow-2xl ${inputClasses}`}
                                />
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl opacity-40 group-focus-within:opacity-100 transition-opacity">🔍</span>
                                {searchQuery && (
                                    <button 
                                        onClick={() => { setSearchQuery(''); setLastSearchedPlace(null); }}
                                        className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/10 flex items-center justify-center text-[10px] hover:bg-black/20"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            <button 
                                onClick={() => setLastSearchedPlace({ name: searchQuery, address: searchQuery })}
                                className="w-16 h-16 rounded-[2rem] bg-blue-600 text-white flex items-center justify-center text-xl shadow-xl shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all"
                            >
                                🎯
                            </button>
                        </div>

                        {lastSearchedPlace && (
                            <div className={`p-5 rounded-[2.5rem] border shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 ${cardClasses} max-w-sm ml-2`}>
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-xl shrink-0">
                                        📍
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <h4 className="text-[11px] font-black uppercase tracking-tight text-blue-600 truncate">{lastSearchedPlace.name}</h4>
                                        <p className="text-[9px] opacity-40 truncate">{lastSearchedPlace.address}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => {
                                            setScheduleData({ ...scheduleData, title: lastSearchedPlace.name });
                                            setAddress(lastSearchedPlace.address);
                                            setShowScheduleModal(true);
                                        }}
                                        className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-lg hover:scale-110 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
                                        title="Adicionar à Agenda"
                                    >
                                        📅
                                    </button>
                                    <button 
                                        onClick={() => toggleFavorite(lastSearchedPlace.name, lastSearchedPlace.address)}
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${favorites.some(f => f.name === lastSearchedPlace.name) ? 'bg-pink-600 text-white shadow-lg' : 'bg-white/5 opacity-50 hover:opacity-100 hover:scale-110'}`}
                                    >
                                        {favorites.some(f => f.name === lastSearchedPlace.name) ? '❤️' : '🤍'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <iframe
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        style={{ border: 0, filter: isDark ? 'invert(90%) hue-rotate(180deg) brightness(95%) contrast(90%)' : 'none' }}
                        src={getMapUrl()}
                        allowFullScreen
                    ></iframe>
                </div>

                <div className="flex flex-col gap-6">
                    <div className={`p-8 rounded-[3rem] border flex flex-col gap-6 ${cardClasses}`}>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center text-xl">📍</div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Sua Localização</p>
                                <h4 className="text-sm font-black italic tracking-tighter">
                                    {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Aguardando GPS..."}
                                </h4>
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-dashed border-white/10 italic">
                            <p className="text-[11px] opacity-60 leading-relaxed font-medium">
                                "Sua IA agora reconhece locais físicos. Ao adicionar um ponto à sua agenda, ela saberá sugerir o melhor horário para sair baseada no transporte escolhido."
                            </p>
                        </div>

                        <div className="space-y-4">
                            <h5 className="text-[10px] font-black uppercase tracking-widest opacity-30 px-2 flex justify-between items-center">
                                <span>Sugestões Rápidas</span>
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">IA READY</span>
                            </h5>
                            <button 
                                onClick={() => { setSearchQuery('Restaurante Romântico'); setShowScheduleModal(true); }}
                                className="w-full p-4 rounded-2xl bg-gradient-to-r from-pink-500/5 to-blue-500/5 hover:from-pink-500/10 hover:to-blue-500/10 border border-slate-500/10 text-left transition-all flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">🍷</span>
                                    <span className="text-xs font-bold italic tracking-tight uppercase opacity-70">Jantar Romântico</span>
                                </div>
                                <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                            </button>
                            <button 
                                onClick={() => { setSearchQuery('Shopping'); setShowScheduleModal(true); }}
                                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500/5 to-teal-500/5 hover:from-emerald-500/10 hover:to-teal-500/10 border border-slate-500/10 text-left transition-all flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">🛍️</span>
                                    <span className="text-xs font-bold italic tracking-tight uppercase opacity-70">Passeio no Shopping</span>
                                </div>
                                <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                            </button>
                        </div>

                        {favorites.length > 0 && (
                            <div className="space-y-4 pt-4 border-t border-dashed border-white/10">
                                <h5 className="text-[10px] font-black uppercase tracking-widest opacity-30 px-2 flex justify-between items-center">
                                    <span>Locais Favoritos</span>
                                    <span className="text-lg">⭐</span>
                                </h5>
                                <div className="grid grid-cols-1 gap-2">
                                    {favorites.map(fav => (
                                        <div key={fav.id} className="relative group/fav">
                                            <button 
                                                onClick={() => { setSearchQuery(fav.address); setLastSearchedPlace({name: fav.name, address: fav.address}); }}
                                                className="w-full p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-left transition-all flex flex-col gap-1"
                                            >
                                                <span className="text-[11px] font-black italic uppercase tracking-tight text-blue-500">{fav.name}</span>
                                                <span className="text-[9px] opacity-40 truncate">{fav.address}</span>
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setFavorites(prev => prev.filter(f => f.id !== fav.id)); }}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-red-500/10 text-red-500 opacity-0 group-hover/fav:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500 hover:text-white"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showScheduleModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
                    <div className={`w-full max-w-sm p-10 rounded-[3.5rem] border ${cardClasses} shadow-2xl`}>
                        <div className="mb-8">
                            <h3 className="text-2xl font-black italic tracking-tighter uppercase">Agendar no Local</h3>
                        </div>
                        <form onSubmit={handleScheduleAtLocation} className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">O que vamos fazer?</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Almoço especial"
                                    value={scheduleData.title}
                                    onChange={e => setScheduleData({ ...scheduleData, title: e.target.value })}
                                    className={`w-full p-5 rounded-[1.8rem] text-sm font-bold border outline-none transition-all ${inputClasses}`}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Local Escolhido</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={address || searchQuery}
                                        onChange={e => setAddress(e.target.value)}
                                        className={`w-full p-5 rounded-[1.8rem] text-xs font-bold border outline-none transition-all pr-12 ${inputClasses}`}
                                        required
                                    />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg">📍</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Transporte</label>
                                    <select 
                                        value={transportMode} 
                                        onChange={e => setTransportMode(e.target.value as TransportMode)}
                                        className={`w-full p-5 rounded-[1.8rem] text-xs font-bold border outline-none ${inputClasses}`}
                                    >
                                        <option value="car">🚗 Carro</option>
                                        <option value="foot">🚶 A pé</option>
                                        <option value="bus">🚌 Ônibus</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-3 ml-4">Quando?</label>
                                    <input
                                        type="datetime-local"
                                        value={scheduleData.time}
                                        onChange={e => setScheduleData({ ...scheduleData, time: e.target.value })}
                                        className={`w-full p-5 rounded-[1.8rem] text-xs font-bold border outline-none ${inputClasses}`}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex gap-4">
                                <button type="button" onClick={() => setShowScheduleModal(false)} className="flex-1 py-5 font-black uppercase text-[10px] opacity-30">Cancelar</button>
                                <button type="submit" className="flex-1 py-5 bg-blue-600 text-white rounded-[1.8rem] font-black uppercase text-[10px] shadow-xl shadow-blue-500/20">Confirmar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showInviteModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
                    <div className={`w-full max-w-lg p-10 rounded-[3.5rem] border ${cardClasses} shadow-2xl`}>
                        <h3 className="text-2xl font-black italic tracking-tighter uppercase text-pink-500 mb-8">Convidar para o Ponto</h3>
                        <form onSubmit={handleSendInvite} className="space-y-6">
                            <div className="max-h-[160px] overflow-y-auto pr-2 no-scrollbar space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-3 ml-4">Seus Contatos Ativos</label>
                                {contacts.length === 0 ? (
                                    <p className="text-[10px] text-center py-4 opacity-30 font-bold uppercase tracking-widest">Nenhum contato encontrado</p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {contacts.map(c => (
                                            <button 
                                                key={c.id}
                                                type="button"
                                                onClick={() => setSelectedContact(c)}
                                                className={`p-4 rounded-2xl flex items-center gap-3 border transition-all ${selectedContact?.id === c.id ? 'bg-pink-600 border-pink-600 text-white shadow-lg' : cardClasses + ' opacity-60 hover:opacity-100'}`}
                                            >
                                                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                                                    {c.profile?.avatar_url ? <img src={c.profile.avatar_url} className="w-full h-full object-cover" /> : '👤'}
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-tighter truncate">{c.profile?.nickname || c.profile?.display_name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-1.5 ml-4">Atividade / O que vamos fazer?</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Almoço especial"
                                        value={scheduleData.title}
                                        onChange={e => setScheduleData({ ...scheduleData, title: e.target.value })}
                                        className={`w-full p-4 rounded-[1.2rem] text-sm font-bold border outline-none transition-all ${inputClasses}`}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-1.5 ml-4">Quando?</label>
                                    <input
                                        type="datetime-local"
                                        value={scheduleData.time}
                                        onChange={e => setScheduleData({ ...scheduleData, time: e.target.value })}
                                        className={`w-full p-4 rounded-[1.2rem] text-xs font-bold border outline-none transition-all ${inputClasses}`}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-1.5 ml-4">Endereço do Local</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={address || searchQuery}
                                            onChange={e => setAddress(e.target.value)}
                                            className={`w-full p-4 rounded-[1.2rem] text-xs font-bold border outline-none transition-all pr-10 ${inputClasses}`}
                                            required
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm">📍</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-1.5 ml-4">CEP</label>
                                    <input
                                        type="text"
                                        placeholder="00000-000"
                                        value={cep}
                                        onChange={e => setCep(e.target.value)}
                                        className={`w-full p-4 rounded-[1.2rem] text-sm font-bold border outline-none transition-all ${inputClasses}`}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-1.5 ml-4">Transporte Sugestão</label>
                                    <select 
                                        value={transportMode} 
                                        onChange={e => setTransportMode(e.target.value as TransportMode)}
                                        className={`w-full p-4 rounded-[1.2rem] text-xs font-bold border outline-none appearance-none transition-all ${inputClasses}`}
                                    >
                                        <option value="car">🚗 Carro</option>
                                        <option value="foot">🚶 A pé</option>
                                        <option value="bus">🚌 Ônibus</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-1.5 ml-4">Tempo Est. (min)</label>
                                    <input
                                        type="number"
                                        value={estimatedTime}
                                        onChange={e => setEstimatedTime(Number(e.target.value))}
                                        className={`w-full p-4 rounded-[1.2rem] text-sm font-bold border outline-none transition-all ${inputClasses}`}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-1.5 ml-4">Descrição do Evento (Detalhes)</label>
                                <textarea
                                    placeholder="Ex: Leve roupas leves, será em ambiente aberto."
                                    value={scheduleData.description}
                                    onChange={e => setScheduleData({ ...scheduleData, description: e.target.value })}
                                    className={`w-full p-4 rounded-[1.2rem] text-xs font-bold border outline-none transition-all resize-none h-20 ${inputClasses}`}
                                />
                            </div>

                            {/* AI Reminder Toggle */}
                            <div className={`p-5 rounded-[1.5rem] border border-dashed flex items-center justify-between gap-4 ${scheduleData.ai_reminder_call.enabled ? 'border-pink-500 bg-pink-500/5' : 'border-white/10 opacity-60'}`}>
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">🤖</span>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase text-pink-600">Ligar para Lembrar</span>
                                        <span className="text-[8px] font-bold opacity-50 uppercase leading-none">A IA vai ligar para o usuário</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {scheduleData.ai_reminder_call.enabled && (
                                        <select 
                                            value={scheduleData.ai_reminder_call.interval}
                                            onChange={(e) => setScheduleData({
                                                ...scheduleData,
                                                ai_reminder_call: { ...scheduleData.ai_reminder_call, interval: e.target.value as any }
                                            })}
                                            className="p-2 rounded-xl bg-pink-500/10 text-[8px] font-black uppercase outline-none border-none"
                                        >
                                            <option value="week">1 Semana antes</option>
                                            <option value="day">1 Dia antes</option>
                                            <option value="hour">1 Hora antes</option>
                                            <option value="same_day">No mesmo dia</option>
                                        </select>
                                    )}
                                    <button 
                                        type="button"
                                        onClick={() => setScheduleData({
                                            ...scheduleData,
                                            ai_reminder_call: { ...scheduleData.ai_reminder_call, enabled: !scheduleData.ai_reminder_call.enabled }
                                        })}
                                        className={`w-10 h-6 rounded-full relative transition-all ${scheduleData.ai_reminder_call.enabled ? 'bg-pink-600' : 'bg-slate-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${scheduleData.ai_reminder_call.enabled ? 'left-5' : 'left-1'}`} />
                                    </button>
                                </div>
                            </div>

                            <div className="pt-2 flex gap-4">
                                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 py-5 font-black opacity-30 hover:opacity-100 transition-all uppercase tracking-[0.2em] text-[10px]">Cancelar</button>
                                <button type="submit" className="flex-1 py-5 bg-pink-600 text-white rounded-[1.8rem] font-black uppercase tracking-widest shadow-xl shadow-pink-500/30 hover:bg-pink-700 active:scale-95 transition-all text-[11px] disabled:opacity-50" disabled={loading || !selectedContact}>
                                    {loading ? '...' : 'Enviar Convite'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
