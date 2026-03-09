import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { LocationInvite, UserProfile, PartnerProfile, CallLog, TransportMode, InviteStatus } from '../types';

interface InvitesTabProps {
    user: any;
    profile: PartnerProfile;
    isDark: boolean;
    currentUserProfile?: UserProfile | null;
    onCallPartner: () => void;
    onOpenChat: (target: UserProfile, isAi: boolean) => void;
}

export const InvitesTab: React.FC<InvitesTabProps> = ({ user, profile, isDark, currentUserProfile, onCallPartner, onOpenChat }) => {
    const [receivedInvites, setReceivedInvites] = useState<LocationInvite[]>([]);
    const [sentInvites, setSentInvites] = useState<LocationInvite[]>([]);
    const [activeSubTab, setActiveSubTab] = useState<'received' | 'sent'>('received');
    const [loading, setLoading] = useState(true);
    const [editingInvite, setEditingInvite] = useState<LocationInvite | null>(null);
    const [editForm, setEditForm] = useState({
        title: '',
        address: '',
        trigger_at: '',
        transport_mode: 'car' as TransportMode,
        estimated_time: 15,
        description: ''
    });

    const cardClasses = isDark ? "bg-[#15181e] border-white/5" : "bg-white border-slate-100 shadow-sm";
    const itemClasses = isDark ? "hover:bg-white/5 border-white/5 bg-[#0b0c10]" : "hover:bg-slate-50 border-slate-100 bg-white shadow-sm";
    const inputClasses = isDark ? "bg-white/5 border-white/10 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500";

    useEffect(() => {
        if (user) {
            fetchInvites();
            const channel = supabase.channel('invites_tab_comprehensive')
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'invites'
                }, () => fetchInvites())
                .subscribe();
            return () => { channel.unsubscribe(); };
        }
    }, [user]);

    const fetchInvites = async () => {
        setLoading(true);
        
        // Fetch Received
        const { data: recData } = await supabase
            .from('invites')
            .select('*')
            .eq('receiver_id', user.id)
            .order('created_at', { ascending: false });

        if (recData) {
            const enriched = await Promise.all(recData.map(async (inv) => {
                const { data: p } = await supabase.from('profiles').select('*').eq('id', inv.sender_id).single();
                return { ...inv, sender_profile: p };
            }));
            setReceivedInvites(enriched);
        }

        // Fetch Sent
        const { data: sentData } = await supabase
            .from('invites')
            .select('*')
            .eq('sender_id', user.id)
            .order('created_at', { ascending: false });

        if (sentData) {
            const enriched = await Promise.all(sentData.map(async (inv) => {
                const { data: p } = await supabase.from('profiles').select('*').eq('id', inv.receiver_id).single();
                return { ...inv, receiver_profile: p }; // We'll add this to LocationInvite or handle specifically
            }));
            setSentInvites(enriched as any);
        }
        
        setLoading(false);
    };

    const handleAction = async (invite: LocationInvite, status: InviteStatus) => {
        setLoading(true);
        const { error } = await supabase.from('invites').update({ status }).eq('id', invite.id);

        if (!error && status === 'accepted') {
            await supabase.from('reminders').insert({
                owner_id: user.id,
                title: `📅 Encontro: ${invite.title} (@ ${invite.address})`,
                trigger_at: invite.trigger_at,
                description: invite.description,
                location_data: {
                    address: invite.address,
                    transport_mode: invite.transport_mode,
                    estimated_time: invite.estimated_time,
                    prepare_minutes_before: 30
                },
                invite_id: invite.id
            });

            const newLog: CallLog = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                durationSec: 0,
                moodEnd: profile.mood,
                notes: `Aceitou convite para "${invite.title}" em ${invite.address}. Compromisso agendado para ${new Date(invite.trigger_at).toLocaleString()}.`
            };
            
            const updatedProfile = { ...profile, history: [...profile.history, newLog] };
            await supabase.from('profiles').update({ ai_settings: updatedProfile }).eq('id', user.id);
            alert("Convite aceito! Compromisso adicionado à sua agenda.");
        }

        if (!error && status === 'canceled') {
            alert("Convite cancelado.");
        }

        fetchInvites();
    };

    const startEditing = (invite: LocationInvite) => {
        setEditingInvite(invite);
        setEditForm({
            title: invite.title,
            address: invite.address,
            trigger_at: new Date(invite.trigger_at).toISOString().slice(0, 16),
            transport_mode: invite.transport_mode || 'car',
            estimated_time: invite.estimated_time || 15,
            description: invite.description || ''
        });
    };

    const handleUpdateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingInvite) return;
        setLoading(true);

        const { error } = await supabase.from('invites').update({
            title: editForm.title,
            address: editForm.address,
            trigger_at: new Date(editForm.trigger_at).toISOString(),
            transport_mode: editForm.transport_mode,
            estimated_time: editForm.estimated_time,
            description: editForm.description
        }).eq('id', editingInvite.id);

        if (!error) {
            alert("Convite atualizado com sucesso!");
            setEditingInvite(null);
            fetchInvites();
        } else {
            alert("Erro ao atualizar convite.");
        }
        setLoading(false);
    };

    const currentList = activeSubTab === 'received' ? receivedInvites : sentInvites;

    return (
        <div className="w-full flex flex-col gap-8 pt-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter italic uppercase">Central de Convites</h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Administre seus encontros sociais</p>
                </div>
                
                <div className="flex gap-2 p-1.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-white/5">
                    <button 
                        onClick={() => setActiveSubTab('received')}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'received' ? 'bg-blue-600 text-white shadow-lg' : 'opacity-40 hover:opacity-100'}`}
                    >
                        RECEBIDOS ({receivedInvites.length})
                    </button>
                    <button 
                        onClick={() => setActiveSubTab('sent')}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'sent' ? 'bg-pink-600 text-white shadow-lg' : 'opacity-40 hover:opacity-100'}`}
                    >
                        ENVIADOS ({sentInvites.length})
                    </button>
                </div>
            </div>

            <div className={`p-8 rounded-[3rem] border min-h-[500px] ${cardClasses}`}>
                {loading && currentList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 opacity-20">
                        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando convites...</p>
                    </div>
                ) : currentList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 opacity-20 italic">
                        <span className="text-5xl mb-6">📩</span>
                        <p className="text-xs font-bold uppercase tracking-widest">Nenhum convite encontrado nesta aba</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {currentList.map(inv => (
                            <div key={inv.id} className={`p-6 rounded-[2.5rem] border flex flex-col gap-6 transition-all group ${itemClasses} ${inv.status === 'pending' ? 'border-primary shadow-lg shadow-primary/5' : 'opacity-60'} ${inv.status === 'canceled' ? 'grayscale' : ''}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-slate-200 overflow-hidden border-2 border-white/20">
                                            {activeSubTab === 'received' ? (
                                                inv.sender_profile?.avatar_url ? <img src={inv.sender_profile.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                                            ) : (
                                                (inv as any).receiver_profile?.avatar_url ? <img src={(inv as any).receiver_profile.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">🤝</div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-widest opacity-30">
                                                {activeSubTab === 'received' ? `De: ${inv.sender_profile?.nickname || inv.sender_profile?.display_name}` : `Para: ${(inv as any).receiver_profile?.nickname || (inv as any).receiver_profile?.display_name}`}
                                            </p>
                                            <h4 className={`text-lg font-black italic tracking-tighter uppercase ${activeSubTab === 'received' ? 'text-blue-600' : 'text-pink-600'}`}>{inv.title}</h4>
                                        </div>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${inv.status === 'pending' ? 'bg-blue-600 text-white' : inv.status === 'accepted' ? 'bg-emerald-500 text-white' : inv.status === 'canceled' ? 'bg-slate-500 text-white' : 'bg-red-500 text-white'}`}>
                                        {inv.status === 'pending' ? 'Pendente' : inv.status === 'accepted' ? 'Aceito' : inv.status === 'canceled' ? 'Cancelado' : 'Negado'}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <span className="text-lg">📍</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase opacity-30">Onde</span>
                                            <span className="text-xs font-bold">{inv.address}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="text-lg">⏰</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase opacity-30">Quando</span>
                                            <span className="text-xs font-bold">{new Date(inv.trigger_at).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                    {inv.description && (
                                        <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-dashed border-white/5 italic">
                                            <p className="text-[10px] opacity-60 leading-relaxed font-bold">"{inv.description}"</p>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4 border-t border-dashed border-white/10 flex items-center justify-between gap-3">
                                    {activeSubTab === 'received' ? (
                                        inv.status === 'pending' ? (
                                            <>
                                                <button onClick={() => handleAction(inv, 'rejected')} className="flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] opacity-40 hover:opacity-100 transition-all">Recusar</button>
                                                <button onClick={() => handleAction(inv, 'accepted')} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all">Aceitar Convite</button>
                                            </>
                                        ) : (
                                            <div className="flex gap-3 w-full">
                                                <button 
                                                    onClick={() => inv.sender_profile && onOpenChat(inv.sender_profile, false)}
                                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-pink-500/10 text-pink-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-pink-500 hover:text-white transition-all shadow-lg"
                                                >
                                                    💬 Mensagem
                                                </button>
                                                <button onClick={() => onCallPartner()} className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-500/10 text-blue-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all">
                                                    📞 Ligar
                                                </button>
                                            </div>
                                        )
                                    ) : (
                                        inv.status !== 'canceled' && (
                                            <>
                                                <button onClick={() => startEditing(inv)} className="flex-1 py-3 text-[9px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-all border border-white/10 rounded-xl hover:bg-white/5">Editar</button>
                                                <button 
                                                    onClick={() => {
                                                        if (confirm("Deseja realmente cancelar este convite?")) {
                                                            handleAction(inv, 'canceled');
                                                        }
                                                    }} 
                                                    className="flex-1 py-3 bg-red-500/10 text-red-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                                                >
                                                    Cancelar
                                                </button>
                                            </>
                                        )
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Sent Invite Modal */}
            {editingInvite && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className={`w-full max-w-lg p-10 rounded-[3.5rem] border ${cardClasses} shadow-2xl transform animate-in slide-in-from-bottom-8 duration-500`}>
                        <div className="mb-8">
                            <h3 className="text-2xl font-black italic tracking-tighter uppercase text-pink-500">Editar Convite</h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-30">A atualização será vista pelo outro usuário</p>
                        </div>

                        <form onSubmit={handleUpdateInvite} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-2 ml-4">Atividade</label>
                                    <input
                                        type="text"
                                        value={editForm.title}
                                        onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                                        className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none ${inputClasses}`}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-2 ml-4">Quando</label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.trigger_at}
                                        onChange={e => setEditForm({ ...editForm, trigger_at: e.target.value })}
                                        className={`w-full p-4 rounded-2xl text-xs font-bold border outline-none ${inputClasses}`}
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-2 ml-4">Endereço</label>
                                <input
                                    type="text"
                                    value={editForm.address}
                                    onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                    className={`w-full p-4 rounded-2xl text-xs font-bold border outline-none ${inputClasses}`}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-2 ml-4">Transporte</label>
                                    <select 
                                        value={editForm.transport_mode}
                                        onChange={e => setEditForm({ ...editForm, transport_mode: e.target.value as TransportMode })}
                                        className={`w-full p-4 rounded-2xl text-xs font-bold border outline-none ${inputClasses}`}
                                    >
                                        <option value="car">🚗 Carro</option>
                                        <option value="foot">🚶 A pé</option>
                                        <option value="bus">🚌 Ônibus</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-2 ml-4">Tempo Est. (min)</label>
                                    <input
                                        type="number"
                                        value={editForm.estimated_time}
                                        onChange={e => setEditForm({ ...editForm, estimated_time: Number(e.target.value) })}
                                        className={`w-full p-4 rounded-2xl text-sm font-bold border outline-none ${inputClasses}`}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-pink-600 block mb-2 ml-4">Descrição</label>
                                <textarea
                                    value={editForm.description}
                                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                    className={`w-full p-4 rounded-2xl text-xs font-bold border outline-none resize-none h-24 ${inputClasses}`}
                                />
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setEditingInvite(null)} className="flex-1 py-5 font-black uppercase tracking-widest text-[10px] opacity-30 hover:opacity-100 transition-all">Cancelar</button>
                                <button type="submit" className="flex-1 py-5 bg-pink-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-pink-500/20 hover:scale-105 active:scale-95 transition-all">Salvar Alterações</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
