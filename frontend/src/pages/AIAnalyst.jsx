import { useState, useRef, useEffect } from "react";
import { Send, Plus, MessageCircle, Shield } from "lucide-react";
import { aiApi } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AiOrb from "@/components/shared/AiOrb";
import NorthStar from "@/components/shared/NorthStar";

const WELCOME = {
  role: "assistant",
  content:
    "Oi 👋 Sou a Norby, sua analista financeira. Posso analisar seus gastos, sugerir economias e responder dúvidas sobre suas finanças. No que posso ajudar hoje?",
};

// Agrupa sessões por recência (Hoje / 7 dias / Anteriores) usando updated_at.
function groupSessions(sessions) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenAgo = new Date(startToday);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const groups = [
    { key: "hoje", label: "Hoje", items: [] },
    { key: "semana", label: "7 dias anteriores", items: [] },
    { key: "antes", label: "Anteriores", items: [] },
  ];
  for (const s of sessions) {
    const d = s.updated_at ? new Date(s.updated_at) : null;
    if (d && d >= startToday) groups[0].items.push(s);
    else if (d && d >= sevenAgo) groups[1].items.push(s);
    else groups[2].items.push(s);
  }
  return groups.filter((g) => g.items.length > 0);
}

export default function AIAnalyst() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [insight, setInsight] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    aiApi.getSessions().then((r) => setSessions(r.data)).catch(() => {});
    aiApi.getInsight().then((r) => setInsight(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function newConversation() {
    if (loading) return;
    setMessages([WELCOME]);
    setSessionId(null);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await aiApi.chat({ message: input, session_id: sessionId });
      setSessionId(res.data.session_id);
      aiApi.getSessions().then((r) => setSessions(r.data)).catch(() => {});
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.data.response },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Erro ao conectar com a IA. Tente novamente.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function openSession(id) {
    if (id === sessionId || loading) return;
    setLoading(true);
    try {
      const res = await aiApi.getSession(id);
      setMessages(res.data.messages);
      setSessionId(id);
    } catch {
      setMessages([
        { role: "assistant", content: "Não foi possível carregar esta conversa." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const grouped = groupSessions(sessions);
  const insightLine = insight?.summary_text?.split("|")[0]?.trim();

  return (
    <div className="flex h-[calc(100vh-3rem)] gap-4">
      {/* Painel de sessões (interno à página — não é a sidebar do app) */}
      <div className="w-64 shrink-0 glass-card p-4 flex flex-col gap-3 overflow-hidden">
        <button
          onClick={newConversation}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-norby-teal text-norby-night text-sm font-semibold hover:bg-norby-teal-soft transition-colors active:scale-[0.98]"
        >
          <Plus size={16} /> Nova conversa
        </button>

        <div className="flex flex-col gap-4 overflow-y-auto flex-1 -mx-1 px-1">
          {grouped.length === 0 ? (
            <p className="text-xs text-norby-ivory/40 text-center px-2 mt-4 leading-relaxed">
              Suas conversas com a Norby aparecem aqui.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.key}>
                <p className="microlabel px-2 mb-1.5">{group.label}</p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((s) => {
                    const active = sessionId === s.session_id;
                    return (
                      <button
                        key={s.session_id}
                        onClick={() => openSession(s.session_id)}
                        className={`flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl text-[13px] transition-colors ${
                          active
                            ? "bg-norby-teal/12 text-norby-teal"
                            : "text-norby-ivory/60 hover:text-norby-ivory hover:bg-white/5"
                        }`}
                      >
                        <MessageCircle
                          size={14}
                          className={`shrink-0 ${active ? "" : "text-norby-ivory/35"}`}
                        />
                        <span className="truncate">
                          {s.first_message || "Conversa"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 glass-card flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.07]">
          <div className="relative shrink-0">
            <AiOrb size={38} pulse={false} />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-norby-income border-2 border-norby-surface" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-norby-ivory">Norby AI</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-norby-income animate-pulse" />
              <span className="text-xs text-norby-income">
                online · pronta pra ajudar
              </span>
            </div>
          </div>
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-[760px] mx-auto flex flex-col gap-5">
            {/* Insight do dia (só em conversa nova) */}
            {sessionId === null && insightLine && (
              <div className="relative overflow-hidden rounded-2xl rounded-tl-md bg-norby-teal/[0.07] border border-norby-teal/25 p-5">
                <div
                  className="absolute -top-10 -right-8 w-40 h-28 rounded-full pointer-events-none opacity-[0.12]"
                  style={{ background: "#2DB5A3", filter: "blur(70px)" }}
                />
                <span className="relative inline-flex items-center gap-1.5 rounded-full bg-norby-teal px-2.5 py-1 text-[10px] font-semibold text-norby-night tracking-widest mb-3">
                  <NorthStar size={10} color="#07100F" /> INSIGHT DO DIA
                </span>
                <p className="relative text-[15px] leading-relaxed text-norby-ivory/90 text-pretty">
                  {insightLine}
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <AiOrb size={30} pulse={false} className="mr-2.5 mt-0.5" />
                )}
                <div
                  className={`max-w-[78%] px-4 py-3 text-[14px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-norby-teal text-norby-night rounded-2xl rounded-tr-md font-medium"
                      : "bg-norby-surface2 text-norby-ivory/90 rounded-2xl rounded-tl-md border border-white/[0.07]"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2.5">
                <AiOrb size={30} />
                <div className="bg-norby-surface2 border border-white/[0.07] rounded-2xl rounded-tl-md px-4 py-3.5 flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-norby-ivory/40 animate-pulse"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-6 pt-3 pb-5 border-t border-white/[0.07]">
          <div className="max-w-[760px] mx-auto">
            <div className="flex items-center gap-2 bg-norby-surface2 border border-white/10 rounded-2xl pl-4 pr-2 py-2 focus-within:border-norby-teal/50 transition-colors">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Pergunte qualquer coisa sobre suas finanças…"
                className="flex-1 border-0 bg-transparent px-0 h-9 text-norby-ivory placeholder:text-norby-ivory/40 focus-visible:ring-0 focus-visible:border-0"
              />
              <Button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                size="icon-lg"
                className="rounded-xl bg-norby-teal hover:bg-norby-teal-soft text-norby-night shrink-0 disabled:opacity-40"
              >
                <Send size={17} />
                <span className="sr-only">Enviar</span>
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-norby-ivory/35 mt-2.5">
              <Shield size={11} />
              A Norby usa seus dados com segurança e nunca compartilha nada.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
