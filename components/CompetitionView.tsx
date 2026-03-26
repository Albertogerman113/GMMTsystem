
import React, { useState, useEffect } from 'react';
import { CompetitorReport, InventarioItem } from '../types';
import { parseCompetitorPDF } from '../services/geminiService';
import { getStoredInventory, getStoredSalePrices } from '../utils/storage';

const CompetitionView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<CompetitorReport[]>([]);
  const [salePrices, setSalePrices] = useState<Record<string, number>>({});
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});

  useEffect(() => {
    setSalePrices(getStoredSalePrices());
    setInventory(getStoredInventory());
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    setLoading(true);
    try {
      const result = await parseCompetitorPDF(files);
      if (result && result.reportes) {
        setReports([...reports, ...result.reportes]);
      }
    } catch (err: any) {
      alert("Error al analizar competencia: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const clearReports = () => setReports([]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-2xl border shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 animate-in fade-in">
        <div>
          <h3 className="text-2xl font-black uppercase tracking-tighter">Comparador de Precios</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Sube PDFs de CIASA o PLAFORAMA para comparar</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={clearReports} className="px-6 py-4 rounded-xl bg-slate-100 text-slate-400 font-black text-[10px] uppercase hover:bg-slate-200 transition-all">Limpiar</button>
          <label className="flex-1 md:flex-none bg-purple-600 text-white px-8 py-4 rounded-xl font-black text-[10px] uppercase cursor-pointer hover:bg-purple-700 shadow-xl shadow-purple-200 transition-all flex items-center justify-center gap-3">
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-file-upload'}`}></i>
            {loading ? 'Analizando...' : 'Cargar PDFs de Competencia'}
            <input type="file" className="hidden" multiple accept="application/pdf" onChange={handleFileUpload} disabled={loading} />
          </label>
        </div>
      </div>

      {reports.length > 0 ? (
        <div className="grid grid-cols-1 gap-8 animate-in slide-in-from-bottom-6">
          {reports.map((report, rIdx) => (
            <div key={rIdx} className="bg-white rounded-3xl border shadow-xl overflow-hidden">
              <div className="bg-slate-900 p-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center text-white text-xl">
                    <i className="fas fa-store"></i>
                  </div>
                  <div>
                    <h4 className="text-white font-black uppercase text-lg tracking-tighter leading-none">{report.empresa}</h4>
                    <p className="text-purple-400 text-[9px] font-black uppercase tracking-widest mt-1">Corte: {report.fecha}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Items Encontrados</span>
                  <p className="text-2xl font-black text-white leading-none">{report.items.length}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-400 text-[9px] uppercase font-black tracking-widest border-b">
                    <tr>
                      <th className="px-8 py-5">Código / SKU</th>
                      <th className="px-8 py-5">Descripción Original</th>
                      <th className="px-8 py-5 text-center">Precio Competencia</th>
                      <th className="px-8 py-5 text-center">Nuestro Precio</th>
                      <th className="px-8 py-5 text-right">Diferencia %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.items.map((item, iIdx) => {
                      const ourPrice = salePrices[item.codigo] || 0;
                      const diff = ourPrice > 0 ? ((ourPrice - item.precio) / item.precio) * 100 : 0;
                      const isCheaper = ourPrice > 0 && ourPrice < item.precio;

                      return (
                        <tr key={iIdx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-8 py-5">
                            <span className="font-black text-xs text-slate-900 group-hover:text-purple-600 transition-colors uppercase">{item.codigo}</span>
                          </td>
                          <td className="px-8 py-5">
                            <p className="text-[10px] text-slate-400 font-bold uppercase leading-tight max-w-xs">{item.descripcion}</p>
                          </td>
                          <td className="px-8 py-5 text-center">
                            <span className="font-black text-slate-700">$ {item.precio.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                          </td>
                          <td className="px-8 py-5 text-center">
                            {ourPrice > 0 ? (
                              <span className={`font-black ${isCheaper ? 'text-green-600' : 'text-red-600'}`}>
                                $ {ourPrice.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                              </span>
                            ) : (
                              <span className="text-[9px] font-black text-slate-300 uppercase">Sin Precio</span>
                            )}
                          </td>
                          <td className="px-8 py-5 text-right">
                            {ourPrice > 0 && (
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-black text-[10px] ${isCheaper ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                <i className={`fas ${isCheaper ? 'fa-caret-down' : 'fa-caret-up'}`}></i>
                                {Math.abs(diff).toFixed(1)}%
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-40 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-100 animate-in fade-in">
           <div className="w-24 h-24 bg-purple-50 text-purple-200 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
              <i className="fas fa-search-dollar"></i>
           </div>
           <h3 className="text-xl font-black text-slate-300 uppercase tracking-[0.4em]">Sin Datos de Mercado</h3>
           <p className="text-slate-400 text-xs font-bold uppercase mt-4 tracking-widest">Carga documentos de competidores para iniciar la comparativa</p>
        </div>
      )}
    </div>
  );
};

export default CompetitionView;
