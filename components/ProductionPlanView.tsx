
import React, { useState, useMemo, useEffect } from 'react';
import { Partida, BOM, InventarioItem, Cliente, ProductionRecord, UserSession } from '../types';
import { parseQuotationPDF } from '../services/geminiService';
import { getStoredInventory, getStoredClients, getStoredBOMs, getCompanyData, saveProductionRecord, getProductionHistory } from '../utils/storage';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ProductionPlanViewProps {
  jobs: any[];
  setJobs: React.Dispatch<React.SetStateAction<any[]>>;
  onClear: () => void;
  isReadOnly?: boolean;
  currentUser: UserSession;
}

const ProductionPlanView: React.FC<ProductionPlanViewProps> = ({ jobs, setJobs, onClear, isReadOnly = false, currentUser }) => {
  const company = getCompanyData();
  const [loading, setLoading] = useState(false);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});
  const [showClientModal, setShowClientModal] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [tempItems, setTempItems] = useState<Partida[]>([]);
  const [tempFolio, setTempFolio] = useState('');
  const [selectedClientName, setSelectedClientName] = useState('');
  const [customClientName, setCustomClientName] = useState('');
  const [activeTab, setActiveTab] = useState<'PLAN' | 'PRODUCED'>('PLAN');
  
  // States for "Produced" section
  const [productionHistory, setProductionHistory] = useState<ProductionRecord[]>([]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedPT, setSelectedPT] = useState<string>('');
  const [prodQty, setProdQty] = useState<number>(0);
  const [wasteQty, setWasteQty] = useState<number>(0);
  const [prodDate, setProdDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const clients = getStoredClients();

  useEffect(() => {
    setBoms(getStoredBOMs());
    setInventory(getStoredInventory());
    setProductionHistory(getProductionHistory());
  }, []);

  const executeClear = () => {
    onClear();
    setShowConfirmClear(false);
  };

  const removeJob = (id: string) => {
    if (isReadOnly) return;
    setJobs(jobs.filter(j => j.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    setLoading(true);
    try {
      const data = await parseQuotationPDF(files);
      const inv = getStoredInventory();
      const invList = Object.values(inv) as InventarioItem[];
      const mapped = data.partidas.map((item: any, idx: number) => {
        const codigoUpper = item.codigo?.toUpperCase().replace(/\s/g, '');
        const invItem = inv[codigoUpper] || invList.find(i => i.codigo === codigoUpper);
        return { 
          id: `${Date.now()}-${idx}`, 
          codigo: codigoUpper || item.codigo?.toUpperCase(), 
          descripcion: item.descripcion || invItem?.descripcion || "Producto", 
          cantidad: item.cantidad, 
          pesoUnit: invItem?.pesoUnitario || 0, 
          pesoTotal: item.cantidad * (invItem?.pesoUnitario || 0), 
          ventaUnit: 0, costoUnit: 0, utilidadTotal: 0 
        };
      });
      setTempItems(mapped);
      setTempFolio(data.folio || `ORD-${Date.now().toString().slice(-4)}`);
      setSelectedClientName(data.cliente || '');
      setShowClientModal(true);
    } catch (err: any) {
      if (err?.message?.includes('429')) {
        alert("Límite de cuota alcanzado. Espere 60 segundos antes de cargar para producción.");
      } else {
        alert("Error al cargar para producción: " + (err.message || "Archivo no procesable"));
      }
    } finally { setLoading(false); e.target.value = ''; }
  };

  const confirmJobAddition = () => {
    setJobs([...jobs, { 
      id: Date.now().toString(), 
      folio: tempFolio, 
      fecha: new Date().toLocaleDateString('es-MX'), 
      cliente: customClientName || selectedClientName || "PÚBLICO", 
      items: tempItems 
    }]);
    setShowClientModal(false);
    setTempItems([]);
    setTempFolio('');
    setSelectedClientName('');
    setCustomClientName('');
  };

  const consolidatedProducts = useMemo(() => {
    const summary: Record<string, { codigo: string, descripcion: string, cantidad: number, pesoTotal: number, hasBOM: boolean, clientes: Set<string> }> = {};
    jobs.forEach(j => j.items.forEach((i: any) => {
      const code = i.codigo;
      if (!summary[code]) {
        summary[code] = { 
          codigo: code, 
          descripcion: i.descripcion, 
          cantidad: 0, 
          pesoTotal: 0, 
          hasBOM: boms.some(b => b.codigoFinal === code),
          clientes: new Set<string>()
        };
      }
      summary[code].cantidad += i.cantidad;
      summary[code].pesoTotal += i.pesoTotal;
      summary[code].clientes.add(j.cliente);
    }));
    return Object.values(summary).sort((a, b) => b.cantidad - a.cantidad);
  }, [jobs, boms]);

  const consolidatedInsumos = useMemo(() => {
    const rawSummary: Record<string, number> = {};
    jobs.forEach(j => j.items.forEach((i: any) => {
      const itemBOM = boms.find(b => b.codigoFinal === i.codigo);
      if (itemBOM) {
        itemBOM.componentes.forEach(comp => {
          rawSummary[comp.codigo] = (rawSummary[comp.codigo] || 0) + (comp.cantidad * i.cantidad);
        });
      }
    }));
    return Object.entries(rawSummary).map(([codigo, total]) => ({ codigo, total }));
  }, [jobs, boms]);

  const downloadReport = async () => {
    const element = document.getElementById('production-report-content');
    if (!element) return;
    setLoading(true);
    element.classList.add('is-capturing-vertical');
    try {
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        width: 794 
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4'); 
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Plan_Maestro_Produccion_${new Date().toISOString().split('T')[0]}.pdf`);
    } finally { 
      element.classList.remove('is-capturing-vertical');
      setLoading(false); 
    }
  };

  const handleRecordProduction = () => {
    if (!selectedPT || prodQty <= 0) return;
    
    const newRecord: ProductionRecord = {
      id: Date.now().toString(),
      codigoPT: selectedPT,
      descripcion: inventory[selectedPT]?.descripcion || '',
      cantidad: prodQty,
      desperdicio: wasteQty,
      fecha: prodDate,
      usuario: currentUser.username
    };
    
    saveProductionRecord(newRecord);
    setProductionHistory(getProductionHistory());
    setInventory(getStoredInventory()); 
    setShowRecordModal(false);
    setSelectedPT('');
    setProdQty(0);
    setWasteQty(0);
    alert("Producción registrada e inventario actualizado (BOM explotado)");
  };

  const ptsWithBOM = boms.map(b => b.codigoFinal);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <style>{`
        .is-capturing-vertical {
          width: 210mm !important;
          font-family: Arial, sans-serif !important;
          font-size: 13.3px !important; 
          padding: 10mm !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
        }
        .is-capturing-vertical table {
          font-size: 13.3px !important;
          width: 100% !important;
        }
        .is-capturing-vertical h2 {
          font-size: 20px !important;
        }
        .is-capturing-vertical h4 {
          font-size: 15px !important;
        }
        .is-capturing-vertical .p-12 {
          padding: 1rem !important;
        }
      `}</style>

      <div className="bg-white p-8 rounded-3xl border shadow-sm flex flex-col lg:flex-row justify-between items-center gap-6 print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-500 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-amber-200">
            <i className="fas fa-industry"></i>
          </div>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tighter">Producción</h3>
            <div className="flex gap-4 mt-2">
              <button 
                onClick={() => setActiveTab('PLAN')}
                className={`text-[10px] font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'PLAN' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-400'}`}
              >
                Plan Maestro
              </button>
              <button 
                onClick={() => setActiveTab('PRODUCED')}
                className={`text-[10px] font-black uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'PRODUCED' ? 'border-amber-500 text-slate-900' : 'border-transparent text-slate-400'}`}
              >
                Producido
              </button>
            </div>
          </div>
        </div>
        {!isReadOnly && activeTab === 'PLAN' && (
          <div className="flex gap-3 w-full lg:w-auto">
            <button onClick={() => setShowConfirmClear(true)} className="flex-1 lg:flex-none bg-red-50 text-red-600 px-6 py-4 rounded-2xl font-black text-[10px] uppercase border border-red-100 hover:bg-red-100 transition-all flex items-center justify-center gap-2"><i className="fas fa-trash-alt"></i> Limpiar</button>
            <label className="flex-1 lg:flex-none bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase cursor-pointer hover:bg-black shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95">
              <i className="fas fa-file-upload"></i>
              {loading ? 'Cargando...' : 'Cargar Pedidos (PDF)'}
              <input type="file" className="hidden" multiple accept="application/pdf" onChange={handleFileUpload} />
            </label>
          </div>
        )}
        {!isReadOnly && activeTab === 'PRODUCED' && (
          <button 
            onClick={() => setShowRecordModal(true)}
            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase cursor-pointer hover:bg-black shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95"
          >
            <i className="fas fa-plus-circle"></i> Registrar Producción
          </button>
        )}
      </div>

      {activeTab === 'PLAN' ? (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-1 space-y-6 print:hidden">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><i className="fas fa-list-ol text-amber-500"></i> Órdenes en Cola ({jobs.length})</h4>
            <div className="space-y-4">
              {jobs.map(job => (
                <div key={job.id} className="bg-white p-5 rounded-2xl border shadow-sm hover:border-amber-200 transition-all group relative animate-in slide-in-from-left">
                  {!isReadOnly && (
                    <button onClick={() => removeJob(job.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-black text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg uppercase">{job.folio}</span>
                    <span className="text-[9px] font-bold text-slate-300">{job.fecha}</span>
                  </div>
                  <p className="font-black text-[10px] text-slate-900 uppercase truncate">{job.cliente}</p>
                  <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">{job.items.length} Partidas</p>
                </div>
              ))}
              {jobs.length === 0 && (
                <div className="p-10 text-center border-2 border-dashed rounded-3xl opacity-30">
                  <i className="fas fa-clipboard-list text-3xl mb-2"></i>
                  <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">No hay órdenes<br/>pendientes</p>
                </div>
              )}
            </div>
          </div>

          <div className="xl:col-span-3 space-y-8">
            {jobs.length > 0 ? (
              <div className="space-y-6">
                <div className="flex justify-end print:hidden">
                   <button onClick={downloadReport} className="bg-amber-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all flex items-center gap-3 hover:bg-amber-700">
                     <i className="fas fa-file-pdf"></i> DESCARGAR PLAN MAESTRO PDF
                   </button>
                </div>

                <div id="production-report-content" className="bg-white p-12 rounded-[1rem] border-2 border-slate-50 shadow-2xl space-y-8 overflow-hidden">
                  <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
                     <div className="flex gap-6 items-start">
                       {company.logoUrl && (
                         <img src={company.logoUrl} alt="Logo" className="w-24 h-24 object-contain" />
                       )}
                       <div>
                         <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 leading-none" style={{ fontFamily: 'Arial, sans-serif' }}>Plan Maestro de Producción</h2>
                         <p className="text-amber-500 font-black text-[9px] uppercase tracking-[0.2em] mt-1">{company.nombre}</p>
                       </div>
                     </div>
                     <div className="text-right">
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Generado el:</p>
                       <p className="text-sm font-black text-slate-900">{new Date().toLocaleDateString('es-MX')}</p>
                     </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] border-l-4 border-amber-500 pl-3" style={{ fontFamily: 'Arial, sans-serif' }}>I. Requerimiento Total de Materia Prima</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {consolidatedInsumos.map(insumo => (
                        <div key={insumo.codigo} className="bg-slate-50 p-4 rounded-xl border flex justify-between items-center transition-all">
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Cinta:</p>
                            <p className="font-black text-slate-900 uppercase text-xs">{insumo.codigo}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-amber-600 leading-none">{insumo.total.toLocaleString('es-MX', {minimumFractionDigits: 2})} <span className="text-[8px] text-slate-400 uppercase">KG</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] border-l-4 border-slate-900 pl-3" style={{ fontFamily: 'Arial, sans-serif' }}>II. Programación de Productos Finales</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left" style={{ fontFamily: 'Arial, sans-serif' }}>
                        <thead className="border-b border-slate-900 bg-slate-50">
                          <tr className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                            <th className="py-2 pl-2">Producto</th>
                            <th className="py-2">Cliente(s)</th>
                            <th className="py-2 text-center">Cant.</th>
                            <th className="py-2 text-center">Stock</th>
                            <th className="py-2 text-right pr-2">Peso (KG)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y font-bold uppercase text-[10px]">
                          {consolidatedProducts.map(prod => {
                            const stockActual = inventory[prod.codigo]?.cantidadFisica || 0;
                            return (
                              <tr key={prod.codigo} className="hover:bg-slate-50">
                                <td className="py-3 pl-2">
                                  <p className="font-black text-slate-900">{prod.codigo}</p>
                                  <p className="text-[7px] text-slate-400 truncate max-w-[120px]">{prod.descripcion}</p>
                                </td>
                                <td className="py-3">
                                  <p className="text-[7px] font-black text-slate-600 leading-tight break-words max-w-[150px]">
                                    {Array.from(prod.clientes).join(", ")}
                                  </p>
                                </td>
                                <td className="py-3 text-center">
                                  <span className="bg-slate-100 px-2 py-0.5 rounded text-[9px] font-black">{prod.cantidad.toLocaleString()}</span>
                                </td>
                                <td className="py-3 text-center">
                                  <span className={`text-[9px] font-black ${stockActual > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                                    {stockActual.toLocaleString()}
                                  </span>
                                </td>
                                <td className="py-3 text-right pr-2 font-black text-slate-600">{prod.pesoTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 flex justify-between items-center opacity-40">
                     <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Resumen técnico de producción interna GML.</p>
                     <p className="font-black text-slate-900 text-[10px] tracking-tighter">SISTEMA MAS TABLAROCA</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-40 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100 animate-in zoom-in duration-500">
                 <div className="w-32 h-32 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-8 text-amber-200 text-5xl">
                    <i className="fas fa-clipboard-check"></i>
                 </div>
                 <h3 className="text-2xl font-black text-slate-300 uppercase tracking-[0.4em]">Sin Datos de Producción</h3>
                 <p className="text-slate-400 text-[10px] font-black uppercase mt-6 tracking-widest leading-relaxed max-w-xs mx-auto">
                   Cargue los pedidos de los clientes en formato PDF para generar automáticamente el plan maestro.
                 </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b">
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Producto Terminado</th>
                  <th className="p-4 text-center">Cantidad</th>
                  <th className="p-4 text-center">Desperdicio</th>
                  <th className="p-4 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs font-bold uppercase">
                {productionHistory.map(record => (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-slate-500">{record.fecha}</td>
                    <td className="p-4">
                      <div className="font-black text-slate-900">{record.codigoPT}</div>
                      <div className="text-[9px] text-slate-400">{inventory[record.codigoPT]?.descripcion}</div>
                    </td>
                    <td className="p-4 text-center font-black text-blue-600">{record.cantidad.toLocaleString()}</td>
                    <td className="p-4 text-center font-black text-red-400">{record.desperdicio.toLocaleString()}</td>
                    <td className="p-4 text-right">
                      <span className="bg-green-100 text-green-600 px-2 py-1 rounded-lg text-[9px] font-black">COMPLETADO</span>
                    </td>
                  </tr>
                ))}
                {productionHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-20 text-center text-slate-300">
                      <i className="fas fa-history text-4xl mb-4 opacity-20"></i>
                      <p className="font-black uppercase tracking-widest text-[10px]">No hay registros de producción</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showRecordModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-[2.5rem] p-12 space-y-8 shadow-2xl w-full max-w-md border-4 border-white animate-in zoom-in duration-200">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto text-2xl mb-4">
                <i className="fas fa-box-open"></i>
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Registrar Producción</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Se descontará automáticamente la materia prima</p>
            </div>
            <div className="space-y-4">
               <div className="space-y-1">
                 <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Producto Terminado (PT)</label>
                 <select 
                   className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl font-black uppercase text-xs shadow-inner outline-none focus:border-blue-400 transition-all" 
                   value={selectedPT} 
                   onChange={e => setSelectedPT(e.target.value)}
                 >
                   <option value="">-- SELECCIONAR PT CON BOM --</option>
                   {ptsWithBOM.sort().map(n => <option key={n} value={n}>{n}</option>)}
                 </select>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Cantidad Producida</label>
                   <input 
                     type="number" 
                     className="w-full p-4 border-2 border-slate-100 rounded-2xl font-black uppercase text-xs shadow-inner outline-none focus:border-blue-400 transition-all" 
                     value={prodQty} 
                     onChange={e => setProdQty(parseFloat(e.target.value) || 0)} 
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Desperdicio</label>
                   <input 
                     type="number" 
                     className="w-full p-4 border-2 border-slate-100 rounded-2xl font-black uppercase text-xs shadow-inner outline-none focus:border-blue-400 transition-all" 
                     value={wasteQty} 
                     onChange={e => setWasteQty(parseFloat(e.target.value) || 0)} 
                   />
                 </div>
               </div>
               <div className="space-y-1">
                 <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Fecha de Producción</label>
                 <input 
                   type="date" 
                   className="w-full p-4 border-2 border-slate-100 rounded-2xl font-black uppercase text-xs shadow-inner outline-none focus:border-blue-400 transition-all" 
                   value={prodDate} 
                   onChange={e => setProdDate(e.target.value)} 
                 />
               </div>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <button 
                onClick={handleRecordProduction} 
                disabled={!selectedPT || prodQty <= 0}
                className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                FINALIZAR Y EXPLOTAR BOM
              </button>
              <button onClick={() => setShowRecordModal(false)} className="w-full bg-slate-100 text-slate-400 py-4 rounded-2xl font-black text-xs uppercase transition-all">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showClientModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-[2.5rem] p-12 space-y-8 shadow-2xl w-full max-w-md border-4 border-white animate-in zoom-in duration-200">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-2xl mb-4">
                <i className="fas fa-folder-plus"></i>
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Asignar Orden</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">¿A quién pertenece este pedido?</p>
            </div>
            <div className="space-y-4">
               <div className="space-y-1">
                 <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Seleccionar Cliente</label>
                 <select className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl font-black uppercase text-xs shadow-inner outline-none focus:border-amber-400 transition-all" value={selectedClientName} onChange={e => setSelectedClientName(e.target.value)}>
                   <option value="">-- ELEGIR DEL DIRECTORIO --</option>
                   {Object.keys(clients).sort().map(n => <option key={n} value={n}>{n}</option>)}
                 </select>
               </div>
               <div className="space-y-1">
                 <label className="text-[9px] font-black text-slate-400 uppercase ml-2">O Nombre de Proyecto Personalizado</label>
                 <div className="relative flex items-center">
                   <input type="text" className="w-full p-4 border-2 border-slate-100 rounded-2xl font-black uppercase text-xs shadow-inner outline-none focus:border-amber-400 transition-all" placeholder="EJ: OBRA MARINA MAZATLÁN" value={customClientName} onChange={e => setCustomClientName(e.target.value.toUpperCase())} />
                 </div>
               </div>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <button onClick={confirmJobAddition} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-black transition-all active:scale-95">AGREGAR AL PLAN MAESTRO</button>
              <button onClick={() => {setShowClientModal(false); setTempItems([]);}} className="w-full bg-slate-100 text-slate-400 py-4 rounded-2xl font-black text-xs uppercase transition-all">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmClear && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[400] p-4">
          <div className="bg-white rounded-3xl p-10 text-center space-y-8 max-w-sm shadow-2xl animate-in zoom-in duration-200">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-3xl">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h4 className="text-2xl font-black uppercase tracking-tighter">¿Vaciar Todo?</h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">Se eliminarán todas las órdenes acumuladas en la cola de producción actual.</p>
            <div className="flex flex-col gap-3">
              <button onClick={executeClear} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg">SÍ, Vaciar Ahora</button>
              <button onClick={() => setShowConfirmClear(false)} className="w-full bg-slate-100 text-slate-600 py-3 rounded-2xl font-black text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionPlanView;
