
import React, { useState, useEffect } from 'react';
import { Partida, Gastos, Cliente, InventarioItem, GeneratedQuote, UserSession, UserRole } from '../types';
import { parseQuotationPDF } from '../services/geminiService';
import { getStoredCosts, getStoredExpenses, getStoredInventory, getStoredSalePrices, getStoredClients, getQuotesHistory, saveQuoteToHistory, getCompanyData } from '../utils/storage';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface AnalysisViewProps {
  currentUser: UserSession;
  partidas: Partida[];
  setPartidas: React.Dispatch<React.SetStateAction<Partida[]>>;
  selectedClient: Cliente | null;
  setSelectedClient: React.Dispatch<React.SetStateAction<Cliente | null>>;
  quoteFolio: string;
  setQuoteFolio: React.Dispatch<React.SetStateAction<string>>;
  sessionExpenses: Gastos;
  setSessionExpenses: React.Dispatch<React.SetStateAction<Gastos>>;
  mode: 'ANALYSIS' | 'QUOTE';
  setMode: React.Dispatch<React.SetStateAction<'ANALYSIS' | 'QUOTE'>>;
  onClear: () => void;
  location?: 'MAIN' | 'MZT' | 'TAB';
}

const AnalysisView: React.FC<AnalysisViewProps> = ({
  currentUser, partidas, setPartidas, selectedClient, setSelectedClient, quoteFolio, setQuoteFolio, sessionExpenses, setSessionExpenses, mode, setMode, onClear, location = 'MAIN'
}) => {
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const company = getCompanyData(location as 'MAIN' | 'MZT' | 'TAB');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [history, setHistory] = useState<GeneratedQuote[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});
  const [clients, setClients] = useState<Record<string, Cliente>>({});
  const [salePrices, setSalePrices] = useState<Record<string, number>>({});
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  useEffect(() => { 
    loadData(); 
  }, [location]);

  const loadData = () => {
    setInventory(getStoredInventory(location as 'MAIN' | 'MZT' | 'TAB'));
    setClients(getStoredClients(location as 'MAIN' | 'MZT' | 'TAB'));
    setSalePrices(getStoredSalePrices(location as 'MAIN' | 'MZT' | 'TAB'));
    setHistory(getQuotesHistory());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const result = await parseQuotationPDF(file) as { folio?: string, cliente?: string, partidas: any[] };
      
      if (result.folio) setQuoteFolio(result.folio);
      
      if (result.cliente) {
        const clientMatch = Object.values(clients).find((c: Cliente) => 
          c.nombre.toLowerCase().includes(result.cliente!.toLowerCase())
        );
        if (clientMatch) setSelectedClient(clientMatch);
      }

      const newItems: Partida[] = [];
      const invArray = Object.values(inventory) as InventarioItem[];
      const costs = getStoredCosts();

      result.partidas.forEach((p: any) => {
        const invItem = invArray.find(i => i.codigo === p.codigo);
        if (invItem) {
          const systemPrice = selectedClient?.listaPrecios?.[invItem.codigo] || salePrices[invItem.codigo] || 0;
          const cost = costs[invItem.codigo] || 0;
          const pdfPrice = p.precio || p.ventaUnit || 0; 
          
          newItems.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            codigo: invItem.codigo,
            descripcion: invItem.descripcion,
            cantidad: p.cantidad,
            ventaUnit: pdfPrice > 0 ? pdfPrice : systemPrice, 
            costoUnit: cost,
            pesoUnit: invItem.pesoUnitario,
            pesoTotal: p.cantidad * invItem.pesoUnitario,
            utilidadTotal: ((pdfPrice > 0 ? pdfPrice : systemPrice) - cost) * p.cantidad
          });
        }
      });

      setPartidas(newItems);
    } catch (error) {
      console.error("Error parsing PDF:", error);
      alert("Error al procesar el PDF. Asegúrate de que sea una cotización válida.");
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const addItemManual = (invItem: InventarioItem) => {
    const systemPrice = selectedClient?.listaPrecios?.[invItem.codigo] || salePrices[invItem.codigo] || 0;
    const costs = getStoredCosts();
    const cost = costs[invItem.codigo] || 0;
    const newPartida: Partida = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      codigo: invItem.codigo,
      descripcion: invItem.descripcion,
      cantidad: 1,
      ventaUnit: systemPrice,
      costoUnit: cost,
      pesoUnit: invItem.pesoUnitario,
      pesoTotal: invItem.pesoUnitario,
      utilidadTotal: (systemPrice - cost)
    };
    setPartidas([...partidas, newPartida]);
    setSearchTerm('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm) {
      const match = filteredInv.find(i => i.codigo.toLowerCase() === searchTerm.toLowerCase()) || filteredInv[0];
      if (match) addItemManual(match);
    }
  };

  const updatePartida = (id: string, field: 'cantidad' | 'ventaUnit', value: number) => {
    setPartidas(partidas.map(p => {
      if (p.id !== id) return p;
      const newCant = field === 'cantidad' ? value : p.cantidad;
      const newVenta = field === 'ventaUnit' ? value : p.ventaUnit;
      return {
        ...p,
        [field]: value,
        pesoTotal: newCant * p.pesoUnit,
        utilidadTotal: (newVenta - p.costoUnit) * newCant
      };
    }));
  };

  const removePartida = (id: string) => setPartidas(partidas.filter(p => p.id !== id));

  const subtotal = partidas.reduce((acc, p) => acc + (p.cantidad * p.ventaUnit), 0);
  const totalCosto = partidas.reduce((acc, p) => acc + (p.cantidad * p.costoUnit), 0);
  const totalGastos = sessionExpenses.operativos + sessionExpenses.envio + sessionExpenses.otros;
  const utilidadBruta = subtotal - totalCosto;
  const utilidadNeta = utilidadBruta - totalGastos;
  const margenNeto = subtotal > 0 ? (utilidadNeta / subtotal) * 100 : 0;

  const iva = subtotal * 0.16;
  const total = subtotal + iva;
  const pesoTotalGeneral = partidas.reduce((acc, p) => acc + p.pesoTotal, 0);

  const downloadPDF = async () => {
    const element = document.getElementById('quote-document');
    if (!element) return;
    setLoading(true);
    element.classList.add('is-capturing');
    try {
      const newQuote: GeneratedQuote = { 
        id: Date.now().toString(), 
        folio: quoteFolio || 'S/F', 
        fecha: new Date().toLocaleDateString('es-MX'), 
        usuario: currentUser.username, 
        cliente: selectedClient?.nombre || 'VENTA GENERAL', 
        subtotal, iva, total, 
        items: partidas 
      };
      saveQuoteToHistory(newQuote);
      loadData();
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, (canvas.height * 210) / canvas.width);
      pdf.save(`Cotizacion_${quoteFolio || 'DOC'}.pdf`);
    } finally { 
      element.classList.remove('is-capturing');
      setLoading(false); 
    }
  };

  const loadFromHistory = (q: GeneratedQuote) => {
    setPartidas(q.items);
    setQuoteFolio(q.folio);
    const clientMatch = clients[q.cliente];
    setSelectedClient(clientMatch || null);
    setMode('QUOTE');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredInv = (Object.values(inventory) as InventarioItem[]).filter(i => 
    !i.oculto && (i.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || i.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
  ).slice(0, 10);

  return (
    <div className="space-y-4 md:space-y-6 p-2 md:p-0">
      <div className="flex flex-wrap gap-2 md:gap-4 print:hidden">
        {isAdmin && (
          <button onClick={() => setMode('ANALYSIS')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all ${mode === 'ANALYSIS' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border'}`}>Análisis Utilidades</button>
        )}
        <button onClick={() => setMode('QUOTE')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all ${mode === 'QUOTE' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 border'}`}>Modo Cotización</button>
        <label className={`flex-1 min-w-[150px] cursor-pointer bg-blue-50 text-blue-600 px-4 py-3 rounded-xl font-black uppercase text-[9px] md:text-[10px] flex items-center justify-center gap-2 shadow-lg hover:bg-blue-100 transition-all ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
          {loading ? 'Procesando...' : 'Cargar PDF'}
          <input type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload} disabled={loading} />
        </label>
        <button onClick={() => setShowConfirmClear(true)} className="flex-1 min-w-[100px] px-4 py-3 rounded-xl bg-red-600 text-white font-black text-[9px] md:text-[10px] uppercase shadow-lg hover:bg-red-700 transition-all flex items-center justify-center gap-2">
          <i className="fas fa-trash"></i> LIMPIAR
        </button>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 no-pdf">
          <div>
            <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Folio</label>
            <input type="text" value={quoteFolio} onChange={e => setQuoteFolio(e.target.value.toUpperCase())} className="w-full p-2.5 md:p-3 border rounded-xl font-black text-xs text-indigo-600 uppercase" placeholder="P EJ: COT-2025" />
          </div>
          <div>
            <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Cliente</label>
            <select value={selectedClient?.nombre || ""} onChange={e => setSelectedClient(clients[e.target.value] || null)} className="w-full p-2.5 md:p-3 border rounded-xl font-bold text-xs uppercase">
              <option value="">-- CLIENTE MOSTRADOR --</option>
              {Object.keys(clients).sort().map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="relative sm:col-span-2 lg:col-span-1">
            <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Buscador (SKU o Nombre + Enter)</label>
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={handleSearchKeyDown} className="w-full p-2.5 md:p-3 border rounded-xl font-bold text-xs" placeholder="Escriba para buscar..." />
            {searchTerm && (
              <div className="absolute z-50 w-full mt-2 bg-white border rounded-xl shadow-2xl overflow-hidden">
                {filteredInv.map(i => <button key={i.codigo} onClick={() => addItemManual(i)} className="w-full p-4 text-left hover:bg-indigo-50 border-b last:border-0 font-black text-[10px] uppercase flex justify-between items-center group">
                  <div className="flex flex-col text-left"><span className="text-slate-900 group-hover:text-indigo-600">{i.codigo}</span><span className="text-[9px] text-slate-400 font-bold">{i.descripcion}</span></div>
                  <span className="text-indigo-600">$ {salePrices[i.codigo] || 0}</span>
                </button>)}
              </div>
            )}
          </div>
      </div>

      {partidas.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div id="quote-document" className="bg-white p-8 border shadow-2xl rounded-sm w-full lg:flex-1 space-y-4 flex flex-col min-h-[11in]" style={{fontFamily: 'Arial, sans-serif', fontSize: '9pt'}}>
             {mode === 'QUOTE' ? (
               <>
                 <div className="flex justify-between border-b-4 border-slate-900 pb-4 items-start">
                    <div className="flex gap-4 items-start">
                       {company.logoUrl && <img src={company.logoUrl} alt="Logo" className="w-20 h-20 object-contain" />}
                       <div className="flex-1">
                          <h1 className="text-xl font-black tracking-tighter uppercase leading-none">{company.nombre}</h1>
                          <div className="mt-1.5 space-y-0.5">
                            <p className="text-[9pt] font-bold text-slate-600 uppercase">RFC: {company.rfc}</p>
                            <p className="text-[9pt] font-bold text-slate-600 uppercase">{company.direccion}</p>
                            <p className="text-[9pt] font-bold text-slate-600 uppercase">TEL: {company.telefono} | {company.correo}</p>
                          </div>
                          <p className="text-[9pt] font-black text-indigo-600 uppercase mt-2 tracking-widest border-t pt-1 inline-block">Cotización de Materiales</p>
                        </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className="text-[9pt] font-black text-slate-400 uppercase tracking-widest mb-0.5">Folio Documento</p>
                      <p className="text-xl font-black text-indigo-600 leading-none">{quoteFolio || 'S/N'}</p>
                      <p className="text-[9pt] font-bold mt-1 uppercase text-slate-500">{new Date().toLocaleDateString('es-MX', {day: '2-digit', month: 'long', year: 'numeric'})}</p>
                    </div>
                 </div>
                 
                 <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between">
                    <div>
                       <p className="text-[9pt] font-black text-slate-400 uppercase tracking-widest mb-0.5">Cliente:</p>
                       <p className="font-black text-slate-900 text-[11pt] uppercase leading-tight">{selectedClient?.nombre || 'VENTA AL PÚBLICO'}</p>
                       <p className="text-[9pt] uppercase text-slate-500 font-bold mt-0.5">{selectedClient?.direccion || 'DOMICILIO CONOCIDO'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9pt] font-black text-slate-400 uppercase tracking-widest mb-0.5">Vigencia</p>
                      <p className="text-[9pt] font-black text-slate-800 uppercase">15 DÍAS NATURALES</p>
                    </div>
                 </div>

                 <div className="flex-1">
                   <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-slate-900 text-[9pt] font-black uppercase text-slate-500 text-center">
                          <th className="py-2 text-left">Producto</th>
                          <th className="py-2">Cant</th>
                          <th className="py-2">Peso U.</th>
                          <th className="py-2">P. Unit.</th>
                          <th className="py-2 text-right">Importe</th>
                          <th className="py-2 w-10 no-pdf"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-[9pt] font-bold uppercase">
                         {partidas.map(p => (
                           <tr key={p.id}>
                             <td className="py-2 pr-4 flex flex-col">
                               <span className="font-black text-[9pt] text-slate-900">{p.codigo}</span>
                               <span className="text-slate-400 text-[9pt] font-bold mt-0.5 leading-tight">{p.descripcion}</span>
                             </td>
                             <td className="py-2 text-center min-w-[80px]">
                               <input type="number" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', parseFloat(e.target.value) || 0)} className="w-16 text-center border-b font-black no-pdf" />
                               <span className="pdf-visible font-black">{p.cantidad.toLocaleString()}</span>
                             </td>
                             <td className="py-2 text-center text-slate-400 text-[9pt]">
                               {p.pesoUnit.toFixed(2)} kg
                               <div className="text-[8pt] opacity-60">Total: {p.pesoTotal.toFixed(2)} kg</div>
                             </td>
                             <td className="py-2 text-center min-w-[100px]">
                               <input type="number" value={p.ventaUnit} onChange={e => updatePartida(p.id, 'ventaUnit', parseFloat(e.target.value) || 0)} className="w-20 text-center border-b font-black text-indigo-600 no-pdf" />
                               <span className="pdf-visible font-black text-indigo-600">$ {p.ventaUnit.toLocaleString()}</span>
                             </td>
                             <td className="py-2 text-right font-black text-[9pt]">$ {(p.cantidad * p.ventaUnit).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                             <td className="no-pdf pl-4"><button onClick={() => removePartida(p.id)} className="text-slate-300 hover:text-red-500 transition-colors"><i className="fas fa-times-circle"></i></button></td>
                           </tr>
                         ))}
                      </tbody>
                      <tfoot className="border-t-2 border-slate-900">
                         <tr>
                           <td colSpan={2} className="pt-4 text-slate-400 font-black uppercase text-[9pt] tracking-widest">Peso Total: {pesoTotalGeneral.toFixed(2)} KG</td>
                           <td className="pt-4 text-right text-slate-400 font-black uppercase text-[9pt] tracking-widest pr-4">Subtotal:</td>
                           <td className="pt-4 text-right font-black text-[12pt]">$ {subtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                           <td className="no-pdf"></td>
                         </tr>
                         <tr><td colSpan={3} className="text-right text-slate-400 font-black uppercase text-[9pt] tracking-widest pr-4">I.V.A. (16%):</td><td className="text-right font-black text-[12pt]">$ {iva.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td><td className="no-pdf"></td></tr>
                         <tr className="bg-slate-900 text-white"><td colSpan={3} className="p-2.5 text-right font-black uppercase tracking-[0.2em] text-[9pt]">Total Neto Cotizado:</td><td className="p-2.5 text-right text-2xl font-black tracking-tighter">$ {total.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td><td className="no-pdf"></td></tr>
                      </tfoot>
                    </table>
                 </div>
               <div className="mt-6 grid grid-cols-2 gap-6">
                  <div className="border-t-2 border-slate-900 pt-2 text-center">
                    <p className="text-[9pt] font-black uppercase text-slate-400 mb-4">Autorizado por</p>
                    <div className="h-8"></div>
                    <p className="text-[9pt] font-black uppercase text-slate-900">{company.nombre}</p>
                  </div>
                  <div className="border-t-2 border-slate-900 pt-2 text-center">
                    <p className="text-[9pt] font-black uppercase text-slate-400 mb-4">Aceptado por Cliente</p>
                    <div className="h-8"></div>
                    <p className="text-[9pt] font-black uppercase text-slate-900">{selectedClient?.nombre || 'FIRMA DE CONFORMIDAD'}</p>
                  </div>
               </div>

               <div className="mt-auto pt-6 border-t border-slate-100 text-center">
                  <p className="text-[9pt] font-bold text-slate-400 uppercase tracking-widest italic">"{company.leyenda}"</p>
                  <p className="text-[8pt] text-slate-300 font-bold mt-2 uppercase">Este documento es una cotización informativa y no representa un comprobante fiscal.</p>
               </div>
            </>
             ) : (
               <div className="space-y-8">
                 <div className="flex justify-between items-end border-b-2 pb-4">
                   <div>
                     <h2 className="text-2xl font-black uppercase tracking-tighter">Análisis de Rentabilidad</h2>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Folio: {quoteFolio || 'S/N'}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-[10px] font-black text-slate-400 uppercase">Fecha de Análisis</p>
                     <p className="font-bold">{new Date().toLocaleDateString()}</p>
                   </div>
                 </div>

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                   <div className="bg-slate-50 p-4 rounded-xl border">
                     <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Venta Total</p>
                     <p className="text-xl font-black text-slate-900">$ {subtotal.toLocaleString()}</p>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-xl border">
                     <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Costo Total</p>
                     <p className="text-xl font-black text-slate-900">$ {totalCosto.toLocaleString()}</p>
                   </div>
                   <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                     <p className="text-[9px] font-black text-blue-600 uppercase mb-1">Utilidad Neta</p>
                     <p className={`text-xl font-black ${utilidadNeta >= 0 ? 'text-green-600' : 'text-red-600'}`}>$ {utilidadNeta.toLocaleString()}</p>
                   </div>
                   <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                     <p className="text-[9px] font-black text-indigo-600 uppercase mb-1">Margen Neto</p>
                     <p className="text-xl font-black text-indigo-600">{margenNeto.toFixed(1)}%</p>
                   </div>
                 </div>

                 <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                     <thead>
                       <tr className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest">
                         <th className="p-3 rounded-tl-lg">Producto</th>
                         <th className="p-3 text-center">Cant</th>
                         <th className="p-3 text-center">Costo U.</th>
                         <th className="p-3 text-center">Venta U. (PDF)</th>
                         <th className="p-3 text-center">Venta Sist.</th>
                         <th className="p-3 text-center">Util. U.</th>
                         <th className="p-3 text-right rounded-tr-lg">Margen</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y text-[11px] font-bold uppercase">
                       {partidas.map(p => {
                         const systemPrice = selectedClient?.listaPrecios?.[p.codigo] || salePrices[p.codigo] || 0;
                         const utilU = p.ventaUnit - p.costoUnit;
                         const margU = p.ventaUnit > 0 ? (utilU / p.ventaUnit) * 100 : 0;
                         return (
                           <tr key={p.id} className="hover:bg-slate-50">
                             <td className="p-3">
                               <div className="font-black">{p.codigo}</div>
                               <div className="text-[9px] text-slate-400">{p.descripcion}</div>
                             </td>
                             <td className="p-3 text-center">
                               <input type="number" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', parseFloat(e.target.value) || 0)} className="w-12 text-center border-b bg-transparent font-black" />
                             </td>
                             <td className="p-3 text-center text-slate-400">$ {p.costoUnit.toLocaleString()}</td>
                             <td className="p-3 text-center">
                               <input type="number" value={p.ventaUnit} onChange={e => updatePartida(p.id, 'ventaUnit', parseFloat(e.target.value) || 0)} className="w-20 text-center border-b bg-transparent font-black text-blue-600" />
                             </td>
                             <td className="p-3 text-center text-indigo-600 font-black">$ {systemPrice.toLocaleString()}</td>
                             <td className={`p-3 text-center font-black ${utilU >= 0 ? 'text-green-600' : 'text-red-600'}`}>$ {utilU.toLocaleString()}</td>
                             <td className="p-3 text-right font-black">{margU.toFixed(1)}%</td>
                           </tr>
                         );
                       })}
                     </tbody>
                   </table>
                 </div>

                 <div className="bg-slate-50 p-6 rounded-2xl border space-y-4">
                   <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Gastos Adicionales de Operación</h4>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Gastos Operativos</label>
                       <input type="number" value={sessionExpenses.operativos} onChange={e => setSessionExpenses({...sessionExpenses, operativos: parseFloat(e.target.value) || 0})} className="w-full p-3 bg-white border rounded-xl font-black text-sm" />
                     </div>
                     <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Costo de Envío</label>
                       <input type="number" value={sessionExpenses.envio} onChange={e => setSessionExpenses({...sessionExpenses, envio: parseFloat(e.target.value) || 0})} className="w-full p-3 bg-white border rounded-xl font-black text-sm" />
                     </div>
                     <div>
                       <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Otros Gastos</label>
                       <input type="number" value={sessionExpenses.otros} onChange={e => setSessionExpenses({...sessionExpenses, otros: parseFloat(e.target.value) || 0})} className="w-full p-3 bg-white border rounded-xl font-black text-sm" />
                     </div>
                   </div>
                 </div>
               </div>
             )}
          </div>
          <div className="w-full lg:w-72 space-y-4 no-pdf sticky top-6">
             <button onClick={downloadPDF} disabled={loading || partidas.length === 0} className="w-full bg-slate-900 hover:bg-black text-white py-6 rounded-2xl font-black uppercase text-xs shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3">
               <i className="fas fa-file-pdf text-xl"></i> {loading ? 'GENERANDO...' : 'DESCARGAR PDF'}
             </button>
          </div>
        </div>
      )}

      {/* HISTORIAL DE COTIZACIONES */}
      <div className="bg-white p-8 rounded-3xl border shadow-sm no-pdf animate-in fade-in">
        <h3 className="text-lg font-black uppercase tracking-tighter mb-6 flex items-center gap-2">
          <i className="fas fa-history text-indigo-500"></i> Historial de Cotizaciones
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Folio</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs font-bold uppercase">
              {history.map(q => (
                <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-500">{q.fecha}</td>
                  <td className="px-6 py-4 text-indigo-600 font-black">{q.folio}</td>
                  <td className="px-6 py-4 truncate max-w-[150px]">{q.cliente}</td>
                  <td className="px-6 py-4 text-right font-black text-sm text-slate-900">$ {q.total.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => loadFromHistory(q)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-[9px] font-black hover:bg-indigo-100 transition-all uppercase">Abrir y Editar</button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={5} className="py-20 text-center text-slate-300 italic font-black">No hay historial</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showConfirmClear && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[500] p-4">
          <div className="bg-white rounded-3xl p-10 text-center space-y-6 max-w-sm shadow-2xl animate-in zoom-in">
            <h4 className="text-xl font-black uppercase">¿Vaciar Mesa de Trabajo?</h4>
            <p className="text-xs text-slate-400 font-bold uppercase">Se perderán los cambios no guardados en el PDF.</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { onClear(); setShowConfirmClear(false); }} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase text-xs">SÍ, LIMPIAR TODO</button>
              <button onClick={() => setShowConfirmClear(false)} className="w-full bg-slate-100 text-slate-400 py-3 rounded-2xl font-black uppercase text-xs">CANCELAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisView;
