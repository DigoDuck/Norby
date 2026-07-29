import { useState, useRef, useEffect } from "react";
import { Send, Plus, MessageCircle, Shield } from "lucide-react";
import { aiApi } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NorthStar from "@/components/shared/NorthStar";
import AiOrb from "@/components/shared/AiOrb";

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
  const showingWelcome = sessionId === null && messages.length === 1;

  const sessionsContent = (
    <>
      <button
        type="button"
        onClick={newConversation}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-accent-fill py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-fill/90 active:scale-[0.98]"
      >
        <Plus size={16} /> Nova conversa
      </button>

      <div className="-mx-1 flex flex-1 flex-col gap-4 overflow-y-auto px-1">
        {grouped.length === 0 ? (
          <p className="mt-4 px-2 text-center text-xs leading-relaxed text-content-3">
            Suas conversas com a Norby aparecem aqui.
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.key}>
              <p className="microlabel mb-1.5 px-2">{group.label}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((s) => {
                  const active = sessionId === s.session_id;
                  return (
                    <button
                      key={s.session_id}
                      type="button"
                      onClick={() => openSession(s.session_id)}
                      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors ${
                        active
                          ? "bg-accent/[0.12] text-accent"
                          : "text-content-2 hover:bg-state/5 hover:text-content"
                      }`}
                    >
                      <MessageCircle
                        size={14}
                        className={`shrink-0 ${active ? "" : "text-content-3"}`}
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
    </>
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4 lg:flex-row">
      {/* Painel de sessões (interno à página — não é a sidebar do app) */}
      <aside className="glass hidden w-72 shrink-0 flex-col gap-3 overflow-hidden p-4 lg:flex">
        {sessionsContent}
      </aside>

      <details className="glass shrink-0 p-4 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-content [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <MessageCircle size={16} className="text-accent" />
            Conversas anteriores
          </span>
          <span className="chip-neutral">{sessions.length}</span>
        </summary>
        <div className="mt-3 flex max-h-56 flex-col gap-3 overflow-hidden border-t border-line/[0.08] pt-3">
          {sessionsContent}
        </div>
      </details>

      {/* Chat */}
      <div className="glass flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line/[0.08] px-4 py-4 sm:px-6">
          <div className="relative shrink-0">
            <AiOrb size={32} pulse={false} />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-income" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-content">Norby AI</p>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-income" />
              <span className="text-xs text-income">
                online · pronta pra ajudar
              </span>
            </div>
          </div>
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="max-w-[760px] mx-auto flex flex-col gap-5">
            {showingWelcome && (
              <div className="flex flex-col items-center gap-4 py-2 text-center sm:py-5">
                <AiOrb size={72} />
                <p className="max-w-md text-sm leading-relaxed text-content-2">
                  Comece por uma dúvida sobre seus gastos, metas ou organização
                  financeira.
                </p>
              </div>
            )}

            {/* Insight do dia (só em conversa nova) */}
            {sessionId === null && insightLine && (
              <div className="inset-panel rounded-tl-md border-accent/25 p-5">
                <span className="chip-neutral mb-3 text-accent">
                  <NorthStar size={10} /> INSIGHT DO DIA
                </span>
                <p className="text-pretty text-[15px] leading-relaxed text-content">
                  {insightLine}
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`inset-panel max-w-[86%] px-4 py-3 text-[14px] leading-relaxed sm:max-w-[78%] ${
                    msg.role === "user"
                      ? "rounded-tr-md text-content"
                      : "rounded-tl-md border-l-2 border-l-accent/40 text-content"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2.5">
                <AiOrb size={28} />
                <div className="inset-panel rounded-tl-md border-l-2 border-l-accent/40 px-4 py-3 text-xs text-content-2">
                  Norby está analisando…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-line/[0.08] px-4 pb-5 pt-3 sm:px-6">
          <div className="max-w-[760px] mx-auto">
            <div className="inset-panel flex items-center gap-2 py-2 pl-4 pr-2 transition-colors focus-within:border-focus/60">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Pergunte qualquer coisa sobre suas finanças…"
                className="h-9 flex-1 border-0 bg-transparent px-0 text-content placeholder:text-content-3 focus-visible:border-0 focus-visible:ring-0"
              />
              <Button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                size="icon-lg"
                className="shrink-0 rounded-xl bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 disabled:opacity-40"
              >
                <Send size={17} />
                <span className="sr-only">Enviar</span>
              </Button>
            </div>
            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-content-3">
              <Shield size={11} />
              Seus dados financeiros são enviados ao Google Gemini para gerar as
              respostas. Nunca vendemos nem compartilhamos com terceiros.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
