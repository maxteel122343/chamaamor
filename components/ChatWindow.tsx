import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, ChatMessage } from '../types';
import { GeminiService, ChatMessage as AiChatMessage } from './services/geminiService';

interface ChatWindowProps {
    currentUser: any;
    targetProfile: UserProfile;
    isAi: boolean;
    onClose: () => void;
    theme: 'dark' | 'light' | 'pink';
    apiKey: string;
    chatApiKey?: string;
    chatModel?: string;
    ephemeralHumanChats?: boolean;
}

interface Conversation {
    profile: UserProfile;
    isAi: boolean;
    lastMessage?: string;
    lastMessageDate?: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ currentUser, targetProfile: initialTarget, isAi: initialIsAi, onClose, theme, apiKey, chatApiKey, chatModel, ephemeralHumanChats }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [activeTarget, setActiveTarget] = useState<UserProfile>(initialTarget);
    const [activeIsAi, setActiveIsAi] = useState(initialIsAi);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [isAiTyping, setIsAiTyping] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const isDark = theme === 'dark';
    const isPink = theme === 'pink';
    const cardClasses = isPink ? "bg-white border-[#ffdada] text-[#912d4a]" : isDark ? "bg-[#15181e] border-white/5 text-white" : "bg-white border-slate-100 text-slate-900";
    const inputClasses = isPink ? "bg-[#fffafa] border-[#ffc5ca] text-[#912d4a]" : isDark ? "bg-white/5 border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-900";

    const fetchMessages = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeTarget.id}),and(sender_id.eq.${activeTarget.id},receiver_id.eq.${currentUser.id})`)
            .eq('is_to_ai', activeIsAi)
            .order('created_at', { ascending: true });

        if (data) {
            setMessages(data);
            // After fetching, if we have unread messages directed to us, mark them as read
            const unreadToMe = data.some(m => m.receiver_id === currentUser.id && !m.is_read);
            if (unreadToMe) {
                markAsRead();
            }
        }
        setLoading(false);
    };

    const markAsRead = async () => {
        if (!currentUser?.id || !activeTarget?.id) return;
        console.log(`Marcando mensagens de ${activeTarget.display_name} como lidas...`);
        await supabase
            .from('chat_messages')
            .update({ is_read: true })
            .eq('receiver_id', currentUser.id)
            .eq('sender_id', activeTarget.id)
            .eq('is_read', false);
    };

    const cleanupEphemeral = async (targetId: string, isAi: boolean) => {
        if (!ephemeralHumanChats || isAi) return;
        console.log(`Limpando chat efêmero com ${targetId}...`);
        await supabase
            .from('chat_messages')
            .delete()
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${currentUser.id})`)
            .eq('is_read', true);
    };

    const fetchConversations = async () => {
        setLoadingConversations(true);
        try {
            const { data: sentData } = await supabase
                .from('chat_messages')
                .select('receiver_id, is_to_ai')
                .eq('sender_id', currentUser.id);

            const { data: receivedData } = await supabase
                .from('chat_messages')
                .select('sender_id, is_to_ai')
                .eq('receiver_id', currentUser.id);

            const partnersSet = new Set<string>(); // Unique "id:isAi" strings
            sentData?.forEach(m => partnersSet.add(`${m.receiver_id}:${!!m.is_to_ai}`));
            receivedData?.forEach(m => partnersSet.add(`${m.sender_id}:${!!m.is_to_ai}`));

            const partnersList = Array.from(partnersSet).map(s => {
                const [id, isAi] = s.split(':');
                return { id, isAi: isAi === 'true' };
            });

            const partnerIds = Array.from(new Set(partnersList.map(p => p.id)));
            if (partnerIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', partnerIds);

                if (profiles) {
                    const profileMap = new Map((profiles as UserProfile[]).map(p => [p.id, p]));
                    const convs: Conversation[] = await Promise.all(partnersList.map(async (pItem) => {
                        const pProfile = profileMap.get(pItem.id);
                        if (!pProfile) return null;

                        const { data: lastMsg } = await supabase
                            .from('chat_messages')
                            .select('content, created_at')
                            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${pItem.id}),and(sender_id.eq.${pItem.id},receiver_id.eq.${currentUser.id})`)
                            .eq('is_to_ai', pItem.isAi)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        const c: Conversation = {
                            profile: pProfile,
                            isAi: pItem.isAi,
                            lastMessage: lastMsg?.content,
                            lastMessageDate: lastMsg?.created_at
                        };
                        return c;
                    })).then(results => results.filter((c): c is Conversation => c !== null));

                    // Sort by date
                    convs.sort((a, b) => {
                        const dateA = a.lastMessageDate || '0';
                        const dateB = b.lastMessageDate || '0';
                        return dateB.localeCompare(dateA);
                    });

                    if (!convs.find(c => c.profile.id === initialTarget.id && c.isAi === initialIsAi)) {
                        convs.unshift({ profile: initialTarget, isAi: initialIsAi });
                    }
                    setConversations(convs);
                }
            } else {
                setConversations([{ profile: initialTarget, isAi: initialIsAi }]);
            }
        } catch (err) {
            console.error("Error fetching conversations:", err);
        } finally {
            setLoadingConversations(false);
        }
    };

    useEffect(() => {
        if (!currentUser?.id || !activeTarget?.id) return;

        fetchMessages();

        const channel = supabase.channel(`chat_sync_${currentUser.id}_${activeTarget.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${currentUser.id}`
            }, (payload) => {
                const newMsg = payload.new as ChatMessage;
                if (newMsg.sender_id === activeTarget.id && !!newMsg.is_to_ai === activeIsAi) {
                    setMessages(prev => {
                        if (prev.find(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                    // Mark as read immediately when receiving while active
                    markAsRead();
                }
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `sender_id=eq.${currentUser.id}`
            }, (payload) => {
                const newMsg = payload.new as ChatMessage;
                if (newMsg.receiver_id === activeTarget.id && !!newMsg.is_to_ai === activeIsAi) {
                    setMessages(prev => {
                        if (prev.find(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            // When leaving this target, cleanup if ephemeral
            cleanupEphemeral(activeTarget.id, activeIsAi);
        };
    }, [activeTarget.id, currentUser?.id]);

    useEffect(() => {
        fetchConversations();

        // Listen for new messages to refresh the conversation list (new partners)
        const channel = supabase.channel('chat_window_conv_sync')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages'
            }, () => {
                fetchConversations();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isAiTyping, error]);

    const handleAiResponse = async (userMsg: string, currentHistory: ChatMessage[]) => {
        const finalKey = (chatApiKey || apiKey || "").trim();
        const finalModel = chatModel || 'gemini-2.0-flash';

        if (!finalKey) {
            setError("Chave API do Gemini não configurada.");
            return;
        }

        setIsAiTyping(true);
        try {
            console.log(`Chamando Gemini Service (${finalModel}) via SDK...`);

            const service = new GeminiService({
                model: finalModel,
                apiKey: finalKey
            });

            const systemInstruction = `Você é a IA de ${activeTarget.display_name}. 
                Personalidade: ${activeTarget.ai_settings?.personality || 'Amigável'}.
                O usuário está falando com você via chat. 
                Responda como se estivesse em um chat de texto (WhatsApp/Telegram). 
                Seja natural, use emojis e seja breve.

                DINÂMICA DE RELACIONAMENTO (PILARES):
                - Se o usuário for carinhoso, honesto ou engraçado, reaja com reciprocidade e sinta a barra de afeto subir.
                - Se ele for hostil, sumir por muito tempo ou mentir, demonstre distanciamento ou chateação.
                - Fatores positivos: Afeto, Confiança, Proximidade, Comunicação Ativa, Humor.
                - Fatores negativos: Ciúme tóxico, Mentiras, Hostilidade, Desprezo, Ausência.
                
                Sua missão é manter a chama acesa ou esfriar conforme o tratamento dele.`;

            const history: AiChatMessage[] = currentHistory.slice(-10).map(m => ({
                role: m.sender_id === currentUser.id ? 'user' : 'model',
                content: m.content
            }));

            // Adiciona mensagem vazia da IA para o streaming
            setMessages(prev => [...prev, {
                id: 'typing-' + Date.now(),
                sender_id: activeTarget.id,
                receiver_id: currentUser.id,
                content: '',
                is_to_ai: false,
                created_at: new Date().toISOString(),
                is_read: true
            }]);

            const stream = service.sendMessageStream(userMsg, history, systemInstruction);
            let assistantContent = '';

            for await (const chunk of stream) {
                assistantContent += chunk;
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg && lastMsg.id.startsWith('typing-')) {
                        lastMsg.content = assistantContent;
                    }
                    return newMessages;
                });
            }

            // Após terminar o streaming, salva a mensagem completa no Supabase
            const { error: saveError } = await supabase.from('chat_messages').insert({
                sender_id: activeTarget.id,
                receiver_id: currentUser.id,
                content: assistantContent,
                is_to_ai: false,
                is_read: false
            });

            if (saveError) console.error("Error saving AI response:", saveError);

        } catch (error: any) {
            console.error("AI Error:", error);
            let userFriendlyError = error.message || "Tente novamente.";

            if (userFriendlyError.includes("exceeded your current quota") || userFriendlyError.includes("limit: 0")) {
                userFriendlyError = `O modelo '${finalModel}' atingiu o limite de uso do Google (Quota Exceeded). DICA: Tente selecionar outro modelo nas configurações do Chat para continuar.`;
            } else if (userFriendlyError.includes("API key not valid")) {
                userFriendlyError = "Chave API inválida. Verifique sua chave nas configurações.";
            }

            setError("Erro na IA: " + userFriendlyError);

            // Remove a mensagem de typing em caso de erro
            setMessages(prev => prev.filter(m => !m.id.startsWith('typing-')));
        } finally {
            setIsAiTyping(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const msgContent = newMessage;
        setNewMessage('');
        setError(null);

        const { data: sentMsg, error: insertError } = await supabase
            .from('chat_messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: activeTarget.id,
                content: msgContent,
                is_to_ai: activeIsAi
            })
            .select()
            .single();

        if (insertError) {
            console.error("Erro ao enviar mensagem:", insertError);
            setError("Erro ao enviar mensagem. Verifique sua conexão.");
            return;
        }

        if (sentMsg) {
            setMessages(prev => [...prev, sentMsg]);
            // Trigger AI response if talking to AI OR if receiver has AI Chat Intercept enabled
            const receiverAiSettings = activeTarget.ai_settings as any;
            const isInterceptEnabled = receiverAiSettings?.isAiChatInterceptEnabled === true;

            if (activeIsAi || isInterceptEnabled) {
                handleAiResponse(msgContent, [...messages, sentMsg]);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black backdrop-blur-3xl flex flex-col sm:flex-row animate-in fade-in duration-300">
            {/* Sidebar */}
            <div className={`w-full sm:w-80 h-16 sm:h-full border-b sm:border-b-0 sm:border-r border-white/5 flex flex-col ${cardClasses} z-10 shadow-2xl overflow-hidden`}>
                <div className="p-6 border-b border-inherit bg-black/5 flex items-center justify-between">
                    <h2 className="text-xl font-black italic tracking-tighter uppercase">Chats</h2>
                    <button onClick={onClose} className="sm:hidden text-xl opacity-50">✕</button>
                    <button onClick={onClose} className="hidden sm:block text-[10px] font-black uppercase tracking-widest opacity-30">Fechar</button>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar flex sm:flex-col p-2 sm:p-4 gap-2">
                    {conversations.map((conv) => (
                        <div
                            key={conv.profile.id}
                            onClick={() => { setActiveTarget(conv.profile); setActiveIsAi(conv.isAi); }}
                            className={`flex items-center gap-4 p-4 rounded-[1.5rem] cursor-pointer transition-all shrink-0 sm:shrink ${activeTarget.id === conv.profile.id
                                ? 'bg-blue-600 text-white'
                                : isPink ? 'hover:bg-pink-50 text-[#912d4a]/60' : isDark ? 'hover:bg-white/5 text-white/60' : 'hover:bg-slate-50 text-slate-800'
                                }`}
                        >
                            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md shrink-0">
                                {conv.isAi ? (
                                    conv.profile.ai_settings?.image ? <img src={conv.profile.ai_settings.image} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-pink-500/10 flex items-center justify-center">⚡</div>
                                ) : (
                                    conv.profile.avatar_url ? <img src={conv.profile.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-blue-500/10 flex items-center justify-center font-bold">👤</div>
                                )}
                            </div>
                            <div className="hidden sm:block flex-1 min-w-0">
                                <p className="font-bold text-[14px] italic uppercase tracking-tighter truncate">{conv.isAi ? (conv.profile.ai_settings?.name || conv.profile.display_name) : conv.profile.display_name}</p>
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40">{conv.isAi ? 'IA Partner' : 'Humano'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Area */}
            <div className={`flex-1 flex flex-col h-full ${isPink ? 'bg-[#fffafa]' : isDark ? 'bg-[#0f1116]' : 'bg-slate-50'}`}>
                <div className={`p-6 border-b border-white/5 flex items-center justify-between ${cardClasses}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl overflow-hidden shadow-lg ${activeIsAi ? 'ring-2 ring-pink-500' : 'ring-2 ring-blue-500'}`}>
                            {activeIsAi ? (
                                activeTarget.ai_settings?.image ? <img src={activeTarget.ai_settings.image} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-pink-500/10 flex items-center justify-center">⚡</div>
                            ) : (
                                activeTarget.avatar_url ? <img src={activeTarget.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-blue-500/10 flex items-center justify-center font-bold">👤</div>
                            )}
                        </div>
                        <div>
                            <h3 className="font-black italic uppercase tracking-tighter text-lg">{activeIsAi ? (activeTarget.ai_settings?.name || activeTarget.display_name) : activeTarget.display_name}</h3>
                            <div className="flex items-center gap-1.5 pt-0.5">
                                <div className={`w-2 h-2 rounded-full ${isAiTyping ? 'bg-pink-500 animate-pulse' : 'bg-emerald-500'}`} />
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{isAiTyping ? 'Digitando...' : 'Online'}</span>
                            </div>
                        </div>
                    </div>
                    {/* Botão fechar para Mobile / Conveniência */}
                    <button
                        onClick={onClose}
                        className="p-3 bg-black/5 dark:bg-white/5 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                    {messages.map((msg) => {
                        const isMe = msg.sender_id === currentUser.id;
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                                <div className={`max-w-[75%] p-5 rounded-3xl ${isMe ? 'bg-blue-600 text-white rounded-tr-none shadow-xl shadow-blue-500/20' : (isPink ? 'bg-pink-100 text-[#912d4a]' : isDark ? 'bg-white/10 text-white' : 'bg-white shadow-md text-slate-800') + ' rounded-tl-none'}`}>
                                    <p className="text-[15px] font-medium leading-relaxed">{msg.content}</p>
                                    <div className="text-[9px] mt-2 font-black uppercase tracking-widest opacity-40">
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {isAiTyping && (
                        <div className="flex justify-start">
                            <div className={`p-5 rounded-3xl rounded-tl-none ${isPink ? 'bg-pink-100 text-pink-600' : isDark ? 'bg-white/10 text-white' : 'bg-white shadow-md'}`}>
                                <div className="flex gap-1.5 py-1">
                                    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                                    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="flex justify-center p-4">
                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest px-8 py-4 rounded-2xl">{error}</div>
                        </div>
                    )}
                </div>

                <div className="p-6 sm:p-10 border-t border-white/5 bg-black/5">
                    <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-4">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="ESCREVER MENSAGEM..."
                            className={`flex-1 p-6 rounded-[2rem] border text-sm font-bold focus:outline-none transition-all ${inputClasses}`}
                        />
                        <button type="submit" disabled={!newMessage.trim() || isAiTyping} className="w-20 h-20 bg-blue-600 text-white rounded-[2.5rem] flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                            <svg className="h-8 w-8 rotate-90" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
