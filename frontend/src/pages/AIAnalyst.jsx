import { useState, useRef, useEffect } from "react";
import { BrainCircuit, Send, Plus } from "lucide-react";
import { aiApi } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NorbyMark from "@/components/shared/Logo";

export default function AIAnalyst() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    aiApi.getSessions().then((r) => setSessions(r.data));
    setMessages([
      {
        role: "assistant",
        content:
          "Olá, Sou Norby, seu assistente financeiro. Posso analisar seus gastos, sugerir economias e responder dúvidas sobre suas finanças. Como posso te ajudar hoje?",
      },
    ]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await aiApi.chat({ message: input, session_id: sessionId });
      setSessionId(res.data.session_id);
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

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      {/* Sidebar de sessões */}
      <div className="w-64 shrink-0 glass-card p-4 flex flex-col gap-3">
        <button
          onClick={() => {
            setMessages([]);
            setSessionId(null);
          }}
          className="flex items-center gap-2 w-full p-2.5 rounded-xl bg-norby-teal/15 border border-norby-teal/20 text-sm text-norby-teal hover:bg-norby-teal/25 transition-colors"
        >
          <Plus size={16} /> Nova conversa
        </button>
        <p className="text-xs text-norby-ivory/40 font-medium uppercase tracking-wider px-1">
          Histórico
        </p>
        <div className="flex flex-col gap-1 overflow-y-auto flex-1">
          {sessions.map((s) => (
            <button
              key={s.session_id}
              onClick={() => setSessionId(s.session_id)}
              className={`text-left p-2.5 rounded-xl text-xs transition-colors truncate ${
                sessionId === s.session_id
                  ? "bg-white/10 text-norby-ivory"
                  : "text-norby-ivory/40 hover:text-norby-ivory hover:bg-white/5"
              }`}
            >
              {s.first_message || "Conversa"}
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 glass-card flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-norby-teal flex items-center justify-center">
            <NorbyMark size={18} color="#07100F" />
          </div>
          <div>
            <p className="text-sm font-semibold text-norby-ivory">Norby AI</p>
            <p className="text-xs text-norby-ivory/50">Analista Financeiro</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-norby-income animate-pulse" />
            <span className="text-sm text-norby-ivory/60">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-norby-teal/15 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <BrainCircuit size={18} className="text-norby-teal" />
                </div>
              )}
              <div
                className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-norby-teal text-norby-night rounded-br-sm"
                    : "bg-white/5 text-norby-ivory/90 rounded-bl-sm border border-white/10"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-norby-teal/15 flex items-center justify-center">
                <BrainCircuit size={13} className="text-norby-teal" />
              </div>
              <div className="glass-card px-4 py-3 flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-norby-ivory/30 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/10">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Pergunte sobre seus gastos, metas ou peça dicas..."
              className="bg-white/5 border-white/10 text-norby-ivory placeholder:text-norby-ivory/40 focus-visible:ring-norby-teal"
            />
            <Button
              onClick={sendMessage}
              disabled={loading}
              className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night px-4"
            >
              <Send size={16} />
            </Button>
          </div>
          <p className="text-xs text-norby-ivory/40 text-center mt-2">
            Norby AI lê seus dados financeiros para respostas personalizadas
          </p>
        </div>
      </div>
    </div>
  );
}
