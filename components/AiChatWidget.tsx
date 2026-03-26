
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { getStoredInventory } from '../utils/storage';

const AiChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    { role: 'assistant', content: '¡Hola! Soy **+IA MOCHIS**. ¿En qué puedo ayudarte hoy con el inventario o los envíos?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inventory = getStoredInventory();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const catalogContext = Object.values(inventory).map(i => `${i.codigo}: ${i.descripcion} (${i.pesoUnitario}kg)`).join(', ');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...messages.map(m => m.content), userMessage].join('\n'),
        config: {
          systemInstruction: `Eres +IA MOCHIS, el asistente virtual de Grupo MasTablaroca Los Mochis.
          Conoces el catálogo: ${catalogContext}.
          Eres conciso, experto y amable. Usa Markdown para resaltar códigos de productos.`,
          temperature: 0.7,
        }
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response.text || "No pude procesar eso." }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error de conexión." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end">
      {/* Ventana de Chat */}
      {isOpen && (
        <div className="mb-4 w-[350px] h-[500px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-cyan-400 rounded-full flex items-center justify-center">
                <i className="fas fa-robot text-slate-900 text-xs"></i>
              </div>
              <div>
                <h4 className="font-black text-[10px] uppercase tracking-widest">+IA MOCHIS</h4>
                <p className="text-[8px] text-cyan-400 uppercase font-bold">Asistente Inteligente</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-xl text-[11px] leading-relaxed shadow-sm ${
                  msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white p-3 rounded-xl rounded-tl-none border border-slate-100 flex gap-1">
                  <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce"></div>
                  <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-white border-t">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSend()}
                placeholder="Pregunta algo..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500 font-medium"
              />
              <button onClick={handleSend} className="bg-slate-900 text-white w-9 h-9 rounded-lg flex items-center justify-center hover:bg-black">
                <i className="fas fa-paper-plane text-xs"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botón Flotante (Icono) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95 group relative ${
          isOpen ? 'bg-slate-900 rotate-90' : 'bg-cyan-400 hover:bg-cyan-300'
        }`}
      >
        {isOpen ? (
          <i className="fas fa-times text-white text-xl"></i>
        ) : (
          <>
            <i className="fas fa-robot text-slate-900 text-2xl"></i>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500"></span>
            </span>
            {/* Tooltip */}
            <div className="absolute right-16 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
              Consultar +IA MOCHIS
            </div>
          </>
        )}
      </button>
    </div>
  );
};

export default AiChatWidget;
