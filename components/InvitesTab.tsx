import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { LocationInvite, UserProfile, PartnerProfile, CallLog } from '../types';

interface InvitesTabProps {
    user: any;
    profile: PartnerProfile;
    isDark: boolean;
    currentUserProfile?: UserProfile | null;
    onCallPartner: () => void;
    onOpenChat: (target: UserProfile, isAi: boolean) => void;
}

export const InvitesTab: React.FC<InvitesTabProps> = ({ user, profile, isDark, currentUserProfile, onCallPartner, onOpenChat }) => {
    const [invites, setInvites] = useState<LocationInvite[]>([]);
    const [loading, setLoading] = useState(true);

    const cardClasses = isDark ? "bg-[#15181e] border-white/5" : "bg-white border-slate-100 shadow-sm";
    const itemClasses = isDark ? "hover:bg-white/5 border-white/5 bg-[#0b0c10]" : "hover:bg-slate-50 border-slate-100 bg-white shadow-sm";

    useEffect(() => {
        if (user) {
            fetchInvites();
            const channel = supabase.channel('invites_tab')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'invites', filter: `receiver_id=eq.${user.id}` }, () => fetchInvites())
                .subscribe();
            return () => { channel.unsubscribe(); };
        }
    }, [user]);

    const fetchInvites = async () => {
        setLoading(true);
        // We need to fetch invites and join with sender profile
        // Since we can't easily do a join in a single simple query without complex setup, 
        // we'll fetch invites then fetch profiles for senders.
        const { data: inviteData, error } = await supabase
            .from('invites')
            .select('*')
            .eq('receiver_id', user.id)
            .order('created_at', { ascending: false });

        if (inviteData) {
            const invitesWithProfiles = await Promise.all(inviteData.map(async (inv) => {
                const { data: profileData } = await supabase.from('profiles').select('*').eq('id', inv.sender_id).single();
                return { ...inv, sender_profile: profileData };
            }));
            setInvites(invitesWithProfiles);
        }
        setLoading(false);
    };

    const handleAction = async (invite: LocationInvite, status: 'accepted' | 'rejected') => {
        setLoading(true);
        const { error } = await supabase.from('invites').update({ status }).eq('id', invite.id);

        if (!error && status === 'accepted') {
            // Create a reminder for the receiver
            await supabase.from('reminders').insert({
                owner_id: user.id,
                title: `📅 Encontro: ${invite.title} (@ ${invite.address})`,
                trigger_at: invite.trigger_at,
                location_data: {
                    address: invite.address,
                    transport_mode: invite.transport_mode,
                    estimated_time: invite.estimated_time,
                    prepare_minutes_before: 30 // Suggestion to get ready
                },
                invite_id: invite.id
            });

            // Log to history so IA knows
            const newLog: CallLog = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                durationSec: 0,
                moodEnd: profile.mood,
                notes: `Aceitou convite para "${invite.title}" em ${invite.address}. Compromisso agendado para ${new Date(invite.trigger_at).toLocaleString()}.`
            };
            
            // Sync AI history
            const updatedProfile = { ...profile, history: [...profile.history, newLog] };
            await supabase.from('profiles').update({ ai_settings: updatedProfile }).eq('id', user.id);
            alert("Convite aceito! Compromisso adicionado à sua agenda.");
        }

        fetchInvites();
    };

    return (
        <div className="w-full flex flex-col gap-8 pt-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter italic uppercase">Central de Convites</h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Encontros & Socialização</p>
                </div>
            </div>

            <div className={`p-8 rounded-[3rem] border min-h-[500px] ${cardClasses}`}>
                {loading && invites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 opacity-20">
                        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando convites...</p>
                    </div>
                ) : invites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 opacity-20 italic">
                        <span className="text-5xl mb-6">📩</span>
                        <p className="text-xs font-bold uppercase tracking-widest">Nenhum convite pendente</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {invites.map(inv => (
                            <div key={inv.id} className={`p-6 rounded-[2.5rem] border flex flex-col gap-6 transition-all group ${itemClasses} ${inv.status === 'pending' ? 'border-blue-500/20 shadow-lg shadow-blue-500/5' : 'opacity-60'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-slate-200 overflow-hidden border-2 border-white/20">
                                            {inv.sender_profile?.avatar_url ? (
                                                <img src={inv.sender_profile.avatar_url} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-widest opacity-30">De: {inv.sender_profile?.nickname || inv.sender_profile?.display_name}</p>
                                            <h4 className="text-lg font-black italic tracking-tighter uppercase text-blue-600">{inv.title}</h4>
                                        </div>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${inv.status === 'pending' ? 'bg-blue-600 text-white' : inv.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                        {inv.status === 'pending' ? 'Pendente' : inv.status === 'accepted' ? 'Aceito ✓' : 'Negado ✕'}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <span className="text-lg">📍</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase opacity-30">Endereço</span>
                                            <span className="text-xs font-bold">{inv.address}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="text-lg">⏰</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase opacity-30">Horário</span>
                                            <span className="text-xs font-bold">{new Date(inv.trigger_at).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                    {inv.transport_mode && (
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg">{inv.transport_mode === 'car' ? '🚗' : inv.transport_mode === 'foot' ? '🚶' : '🚌'}</span>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase opacity-30">Sugestão de Transporte</span>
                                                <span className="text-xs font-bold">{inv.transport_mode === 'car' ? 'Carro' : inv.transport_mode === 'foot' ? 'A pé' : 'Ônibus'} (~{inv.estimated_time} min)</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-dashed border-white/10 flex items-center justify-between gap-4">
                                    {inv.status === 'pending' ? (
                                        <>
                                            <button onClick={() => handleAction(inv, 'rejected')} className="flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] opacity-40 hover:opacity-100 transition-all">Recusar</button>
                                            <button onClick={() => handleAction(inv, 'accepted')} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all">Aceitar Convite</button>
                                        </>
                                    ) : (
                                        <div className="flex gap-3 w-full">
                                            <button 
                                                onClick={() => inv.sender_profile && onOpenChat(inv.sender_profile, false)}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-pink-500/10 text-pink-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-pink-500 hover:text-white transition-all"
                                            >
                                                <span>💬</span> Enviar Mensagem
                                            </button>
                                            <button 
                                                onClick={() => onCallPartner()} // Ideally we'd call the inviter, but currently onCallPartner calls the AI. 
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-500/10 text-blue-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all"
                                            >
                                                <span>📞</span> Ligar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
