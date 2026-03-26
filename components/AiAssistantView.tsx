
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { getStoredInventory, getCompanyData } from '../utils/storage';

const AiAssistantView: React.FC = () => {
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    { role: 'assistant', content: 'Hola, soy **+IA MOCHIS**. Estoy aquí para ayudarte con cálculos de peso, dudas sobre el inventario de MasTablaroca o procesos de envío. ¿En qué puedo apoyarte hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const inventory = getStoredInventory();
  const company = getCompanyData();

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
      
      // Contexto dinámico basado en el catálogo actual
      const catalogContext = Object.values(inventory).map(i => `${i.codigo}: ${i.descripcion} (${i.pesoUnitario}kg)`).join(', ');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...messages.map(m => m.content), userMessage].join('\n'),
        config: {
          systemInstruction: `Eres +IA MOCHIS, el asistente virtual oficial de Grupo MasTablaroca Los Mochis.
          Tus funciones:
          1. Ayudar al personal (Admin y Karo) con dudas de pesos de materiales.
          2. Conoces el catálogo actual: ${catalogContext}.
          3. Eres experto en construcción ligera (tablaroca, perfiles, etc.).
          4. Siempre mantienes un tono profesional, amable y eficiente.
          5. Las respuestas deben ser concisas y en formato Markdown si es necesario usar tablas o listas.
          6. No revelas información confidencial de costos a menos que se te pregunte específicamente sobre la lógica de la app.
          7. Si no sabes algo sobre el stock actual, recuerda que el usuario puede verlo en la sección de Inventario.`,
          temperature: 0.7,
        }
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response.text || "Lo siento, tuve un problema al procesar tu solicitud." }]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Error de conexión con +IA MOCHIS. Por favor, intenta de nuevo." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const suggestions = [
    "¿Cuánto pesa un Poste 6 calibre 20?",
    "¿Cómo calculo el peso total de un envío?",
    "Explícame qué materiales tengo en catálogo",
    "¿Qué empresa es MasTablaroca?"
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header del Asistente */}
      <div className="bg-slate-900 rounded-t-2xl p-6 flex items-center justify-between border-b border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-cyan-400 rounded-full flex items-center justify-center shadow-lg shadow-cyan-400/20">
            <i className="fas fa-robot text-slate-900 text-xl animate-bounce"></i>
          </div>
          <div>
            <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
              +IA MOCHIS <span className="bg-cyan-400/10 text-cyan-400 text-[8px] px-2 py-0.5 rounded-full border border-cyan-400/20">SISTEMA INTELIGENTE</span>
            </h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase">Online & Procesando Datos</p>
          </div>
        </div>
        <i className="fas fa-microchip text-slate-700 text-2xl"></i>
      </div>

      {/* Área de Chat */}
      <div 
        ref={scrollRef}
        className="flex-1 bg-white border-x overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in zoom-in duration-300`}>
            <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-none font-medium' 
                : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
            }`}>
              <div className="text-xs leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl p-4 rounded-tl-none border border-slate-200 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-100"></div>
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-200"></div>
            </div>
          </div>
        )}
      </div>

      {/* Sugerencias y Input */}
      <div className="bg-slate-50 border p-6 rounded-b-2xl shadow-inner">
        {messages.length < 3 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {suggestions.map((s, i) => (
              <button 
                key={i} 
                onClick={() => { setInput(s); }}
                className="bg-white border border-slate-200 px-4 py-2 rounded-full text-[10px] font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all uppercase tracking-tighter"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Escribe una pregunta para +IA MOCHIS..."
            className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-5 py-3 outline-none focus:border-blue-500 font-bold text-sm transition-all"
          />
          <button 
            onClick={handleSend}
            disabled={isTyping}
            className="bg-slate-900 text-white w-12 h-12 rounded-xl flex items-center justify-center hover:bg-black transition-all active:scale-95 disabled:opacity-50"
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantView;
