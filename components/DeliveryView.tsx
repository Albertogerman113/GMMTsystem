
import { Partida, Cliente, InventarioItem, UserSession, GeneratedShipment } from '../types';
import { getStoredInventory, getStoredClients, saveShipmentToHistory, getShipmentsHistory, deductFromInventory, getCompanyData } from '../utils/storage';
import { parseQuotationPDF } from '../services/geminiService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import React, { useState, useEffect } from 'react';

interface DeliveryViewProps {
  currentUser: UserSession;
  items: Partida[];
  setItems: React.Dispatch<React.SetStateAction<Partida[]>>;
  quoteNumber: string;
  setQuoteNumber: React.Dispatch<React.SetStateAction<string>>;
  comments: string;
  setComments: React.Dispatch<React.SetStateAction<string>>;
  selectedClient: Cliente | null;
  setSelectedClient: React.Dispatch<React.SetStateAction<Cliente | null>>;
  onClear: () => void;
  isReadOnly?: boolean;
  location?: 'MAIN' | 'MZT' | 'TAB';
}

const DeliveryView: React.FC<DeliveryViewProps> = ({ 
  currentUser, items, setItems, quoteNumber, setQuoteNumber, comments, setComments, selectedClient, setSelectedClient, onClear, isReadOnly: forcedReadOnly = false, location = 'MAIN'
}) => {
  const company = getCompanyData(location as 'MAIN' | 'MZT' | 'TAB');
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});
  const [clients, setClients] = useState<Record<string, Cliente>>({});
  const [history, setHistory] = useState<GeneratedShipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFinalizedFromHistory, setIsFinalizedFromHistory] = useState(false);

  useEffect(() => { loadData(); }, [location]);

  const loadData = () => {
    setInventory(getStoredInventory(location as 'MAIN' | 'MZT' | 'TAB'));
    setClients(getStoredClients(location as 'MAIN' | 'MZT' | 'TAB'));
    setHistory(getShipmentsHistory());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (forcedReadOnly || isFinalizedFromHistory) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const result = await parseQuotationPDF(file) as { folio?: string, cliente?: string, partidas: any[] };
      
      if (result.folio) setQuoteNumber(result.folio);
      
      if (result.cliente) {
        const clientMatch = Object.values(clients).find((c: Cliente) => 
          c.nombre.toLowerCase().includes(result.cliente!.toLowerCase())
        );
        if (clientMatch) setSelectedClient(clientMatch);
      }

      const newItems: Partida[] = [];
      const invArray = Object.values(inventory) as InventarioItem[];

      result.partidas.forEach((p: any) => {
        const invItem = invArray.find(i => i.codigo === p.codigo);
        if (invItem) {
          newItems.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            codigo: invItem.codigo,
            descripcion: invItem.descripcion,
            cantidad: p.cantidad,
            ventaUnit: 0, costoUnit: 0, utilidadTotal: 0,
            pesoUnit: invItem.pesoUnitario,
            pesoTotal: p.cantidad * invItem.pesoUnitario
          });
        }
      });

      setItems(newItems);
    } catch (error) {
      console.error("Error parsing PDF:", error);
      alert("Error al procesar el PDF. Asegúrate de que sea una cotización válida.");
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const removeItem = (id: string) => {
    if (forcedReadOnly || isFinalizedFromHistory) return;
    setItems(items.filter(i => i.id !== id));
  };

  const addItemManual = (invItem: InventarioItem) => {
    if (forcedReadOnly || isFinalizedFromHistory) return;
    const existing = items.find(i => i.codigo === invItem.codigo);
    if (existing) {
      updateItemQty(existing.id, existing.cantidad + 1);
    } else {
      const newPartida: Partida = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        codigo: invItem.codigo,
        descripcion: invItem.descripcion,
        cantidad: 1,
        ventaUnit: 0, costoUnit: 0, utilidadTotal: 0,
        pesoUnit: invItem.pesoUnitario,
        pesoTotal: invItem.pesoUnitario,
      };
      setItems([...items, newPartida]);
    }
    setSearchTerm('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm) {
      const match = filteredInv.find(i => i.codigo.toLowerCase() === searchTerm.toLowerCase()) || filteredInv[0];
      if (match) addItemManual(match);
    }
  };

  const updateItemQty = (id: string, qty: number) => {
    if (forcedReadOnly || isFinalizedFromHistory) return;
    setItems(items.map(i => i.id === id ? { ...i, cantidad: qty, pesoTotal: qty * i.pesoUnit } : i));
  };

  const updateItemWeight = (id: string, weight: number) => {
    if (forcedReadOnly || isFinalizedFromHistory) return;
    setItems(items.map(i => i.id === id ? { ...i, pesoUnit: weight, pesoTotal: i.cantidad * weight } : i));
  };

  const downloadPDF = async (deduct: boolean) => {
    if ((forcedReadOnly || isFinalizedFromHistory) && deduct) return;
    const element = document.getElementById('shipment-area');
    if (!element || items.length === 0) return;
    setGenerating(true);
    element.classList.add('is-capturing');
    try {
      if (deduct) {
        items.forEach(i => deductFromInventory(i.codigo, i.cantidad, `Envío Folio: ${quoteNumber}`, location as 'MAIN' | 'MZT' | 'TAB'));
      }
      
      const shipment: GeneratedShipment = { 
        id: Date.now().toString(), 
        folio: quoteNumber || 'S/N', 
        fecha: new Date().toLocaleDateString('es-MX'), 
        usuario: currentUser.username, 
        cliente: selectedClient?.nombre || 'VENTA GENERAL', 
        pesoTotal: items.reduce((a, i) => a + i.pesoTotal, 0), 
        items: [...items], 
        comments,
        isFinalized: deduct || isFinalizedFromHistory
      };

      saveShipmentToHistory(shipment);
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, 210, (canvas.height * 210) / canvas.width);
      pdf.save(`Envio_${quoteNumber || 'DOC'}.pdf`);
      loadData();
    } finally { 
      element.classList.remove('is-capturing');
      setGenerating(false); 
    }
  };

  const loadFromHistory = (s: GeneratedShipment) => {
    setItems(s.items);
    setQuoteNumber(s.folio);
    setComments(s.comments);
    setSelectedClient(clients[s.cliente] || { nombre: s.cliente, direccion: "", contacto: "", telefono: "" });
    setIsFinalizedFromHistory(s.isFinalized);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredInv = (Object.values(inventory) as InventarioItem[]).filter(i => 
    !i.oculto && (i.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || i.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
  ).slice(0, 10);

  const totalWeight = items.reduce((acc, i) => acc + i.pesoTotal, 0);

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto p-2 md:p-0">
      {/* Indicador de Estado */}
      {(forcedReadOnly || isFinalizedFromHistory) && (
        <div className="bg-amber-50 border border-amber-200 p-3 md:p-4 rounded-xl flex flex-col sm:flex-row items-center gap-3 md:gap-4 animate-in fade-in">
          <i className="fas fa-lock text-amber-500 text-lg md:text-xl"></i>
          <div className="text-center sm:text-left">
            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-amber-600">Modo Solo Lectura / Registro Finalizado</p>
            <p className="text-[11px] md:text-xs font-bold text-amber-700">Este envío ya descontó inventario o se abrió desde un rol de producción. No se permiten cambios.</p>
          </div>
          <button onClick={() => { onClear(); setIsFinalizedFromHistory(false); }} className="w-full sm:w-auto sm:ml-auto bg-amber-600 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm">Nueva Hoja</button>
        </div>
      )}

      {/* Panel de Edición */}
      {!forcedReadOnly && !isFinalizedFromHistory && (
        <div className="bg-white p-4 md:p-6 rounded-2xl border shadow-sm space-y-4 no-pdf">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <h3 className="text-xs md:text-sm font-black uppercase tracking-widest text-slate-800">Datos del Envío</h3>
            <div className="flex gap-2 w-full sm:w-auto">
              <label className={`flex-1 sm:flex-none cursor-pointer bg-blue-50 text-blue-600 px-4 py-2.5 rounded-xl font-black uppercase text-[9px] md:text-[10px] flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
                {loading ? '...' : 'Cargar PDF'}
                <input type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload} disabled={loading} />
              </label>
              <button onClick={onClear} className="flex-1 sm:flex-none bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl font-black uppercase text-[9px] md:text-[10px] flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors">
                <i className="fas fa-trash-alt"></i> Limpiar
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
             <div><label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-1 block">Folio</label><input type="text" value={quoteNumber} onChange={e => setQuoteNumber(e.target.value.toUpperCase())} className="w-full p-2.5 border rounded-lg font-black text-xs uppercase" placeholder="REF-2025" /></div>
             <div><label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-1 block">Destinatario</label><select value={selectedClient?.nombre || ""} onChange={e => setSelectedClient(clients[e.target.value] || null)} className="w-full p-2.5 border rounded-lg font-bold text-xs uppercase"><option value="">-- CLIENTE --</option>{Object.keys(clients).sort().map(n => <option key={n} value={n}>{n}</option>)}</select></div>
             <div className="relative sm:col-span-2 md:col-span-1"><label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-1 block">Buscador (SKU o Nombre + Enter)</label><input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={handleSearchKeyDown} className="w-full p-2.5 border rounded-lg font-bold text-xs shadow-inner" placeholder="BUSCAR..." />
                {searchTerm && (
                  <div className="absolute z-50 w-full mt-2 bg-white border rounded-xl shadow-2xl overflow-hidden">
                    {filteredInv.map(i => <button key={i.codigo} onClick={() => addItemManual(i)} className="w-full p-3 text-left hover:bg-slate-50 border-b last:border-0 font-black text-[10px] uppercase flex justify-between items-center group">
                      <div className="flex flex-col text-left"><span className="text-slate-900 group-hover:text-blue-600 transition-colors">{i.codigo}</span><span className="text-[9px] text-slate-400 font-bold">{i.descripcion}</span></div>
                      <span className="text-slate-400 font-bold">Stock: {i.cantidadFisica}</span>
                    </button>)}
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Documento Imprimible */}
      <div id="shipment-area" className="bg-white p-8 border shadow-sm rounded-sm space-y-4 min-h-[297mm] w-full max-w-[210mm] mx-auto flex flex-col items-center" style={{ fontFamily: 'Arial, sans-serif' }}>
        <div className="w-full flex justify-between border-b border-slate-900 pb-2 items-center">
           <div className="flex gap-3 items-center">
             {company.logoUrl && <img src={company.logoUrl} alt="Logo" className="w-16 h-16 object-contain" />}
             <div className="text-left">
               <h1 className="text-xl font-black uppercase tracking-tighter leading-none" style={{ fontSize: '14pt' }}>Hoja de Envío</h1>
               <p className="text-[9pt] font-bold text-slate-600 uppercase">{company.nombre} ({location})</p>
             </div>
           </div>
           <div className="text-right">
             <p className="text-[8pt] font-black text-slate-400 uppercase tracking-widest">Folio</p>
             <p className="text-2xl font-black text-blue-600 leading-none">{quoteNumber || 'S/F'}</p>
           </div>
        </div>

        <div className="w-full grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200" style={{ fontSize: '9pt' }}>
           <div><p className="text-[7pt] font-black text-slate-400 uppercase mb-0.5">Destino:</p><p className="font-black text-slate-900 uppercase leading-tight" style={{ fontSize: '10pt' }}>{selectedClient?.nombre || 'MOSTRADOR / VENTA GENERAL'}</p><p className="text-[8pt] font-bold uppercase text-slate-500 mt-0.5">{selectedClient?.direccion || "DOMICILIO CONOCIDO"}</p></div>
           <div className="text-right flex flex-col justify-between items-end"><p className="font-black text-slate-900">Fecha: {new Date().toLocaleDateString('es-MX', {day: '2-digit', month: 'long', year: 'numeric'})}</p><p className="font-black text-blue-600 uppercase tracking-widest bg-white px-2 py-0.5 rounded-full border border-blue-100">Autorizó: {currentUser.username}</p></div>
        </div>

        <div className="w-full flex-1">
          <table className="w-full text-center border-collapse" style={{ fontSize: '10pt' }}>
            <thead className="border-b border-slate-900"><tr className="text-[8pt] font-black uppercase text-slate-600 tracking-wider"><th className="py-2 text-left">SKU</th><th className="py-2 text-left">Descripción</th><th className="py-2">Cant</th><th className="py-2">P. Unit</th><th className="py-2 text-right">P. Total</th><th className="py-2 w-8 no-pdf"></th></tr></thead>
            <tbody className="divide-y divide-slate-100 font-bold uppercase">
              {items.map(item => (
                <tr key={item.id}><td className="py-2 text-left font-black text-slate-900">{item.codigo}</td><td className="py-2 text-left text-[8pt] text-slate-500 font-bold leading-tight">{item.descripcion}</td>
                  <td className="py-2">
                    <input disabled={forcedReadOnly || isFinalizedFromHistory} type="number" value={item.cantidad ?? 0} onChange={e => updateItemQty(item.id, parseFloat(e.target.value) || 0)} className="w-12 text-center border-b font-black no-pdf disabled:bg-transparent disabled:border-none" />
                    <span className="pdf-visible font-black">{item.cantidad.toLocaleString()}</span>
                  </td>
                  <td className="py-2">
                    <input disabled={forcedReadOnly || isFinalizedFromHistory} type="number" value={item.pesoUnit ?? 0} onChange={e => updateItemWeight(item.id, parseFloat(e.target.value) || 0)} className="w-12 text-center border-b font-black no-pdf disabled:bg-transparent disabled:border-none" />
                    <span className="pdf-visible font-black">{(item.pesoUnit ?? 0).toFixed(2)}</span>
                  </td>
                  <td className="py-2 text-right font-black text-slate-900">{(item.pesoTotal ?? 0).toFixed(2)}</td>
                  <td className="py-2 text-right no-pdf">
                    {!forcedReadOnly && !isFinalizedFromHistory && (
                      <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 transition-colors">
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-900">
               <tr><td colSpan={4} className="py-4 text-right uppercase text-[8pt] font-black text-slate-400 pr-4">Peso Total:</td><td className="py-4 text-right font-black text-slate-900" style={{ fontSize: '14pt' }}>{totalWeight.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td><td className="no-pdf"></td></tr>
            </tfoot>
          </table>
          <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-left" style={{ fontSize: '9pt' }}>
            <h5 className="text-[7pt] font-black text-slate-500 uppercase mb-1">Observaciones:</h5>
            <textarea disabled={forcedReadOnly || isFinalizedFromHistory} value={comments} onChange={e => setComments(e.target.value)} className="w-full bg-transparent border-none p-0 outline-none italic text-slate-700 resize-none min-h-[40px]" placeholder="Notas adicionales..." />
          </div>

          {selectedClient?.nombre.toUpperCase().includes("GRUPO MAS TABLAROCA LOS MOCHIS") && (
            <div className="mt-4 p-3 border border-slate-300 rounded text-[7pt] text-slate-600 leading-tight">
              <p className="font-black mb-1">OPERACIÓN REALIZADA AL AMPARO DEL SIGUIENTE FUNDAMENTO LEGAL:</p>
              <p>1. Ley de Caminos, Puentes y Autotransporte Federal (LCPAF)</p>
              <p>Artículo 5, fracción III – Artículo 50</p>
              <p>Reglamento de Autotransporte Federal y Servicios Auxiliares</p>
              <p>Artículo 2, fracción VII – Artículo 36</p>
              <p>Código de Comercio / Comprobante de Propiedad</p>
            </div>
          )}
        </div>

        {/* Firmas de Recibo y Salida */}
        <div className="w-full grid grid-cols-2 gap-12 mt-12 pt-8 border-t border-slate-100">
          <div className="text-center">
            <div className="border-b border-slate-900 w-48 mx-auto mb-2 h-12"></div>
            <p className="text-[8pt] font-black uppercase text-slate-800">Entregado por (Salida)</p>
            <p className="text-[7pt] text-slate-400 font-bold uppercase tracking-widest">Almacén GML</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-900 w-48 mx-auto mb-2 h-12"></div>
            <p className="text-[8pt] font-black uppercase text-slate-800">Recibido por (Conformidad)</p>
            <p className="text-[7pt] text-slate-400 font-bold uppercase tracking-widest">Nombre y Firma del Cliente</p>
          </div>
        </div>

        <div className="mt-auto pt-4 opacity-30 text-[6pt] font-bold uppercase tracking-widest text-center w-full">
          Documento generado por sistema central GML. Verificado por {currentUser.username}.
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="flex justify-center gap-4 py-8 print:hidden no-pdf">
        <button onClick={() => downloadPDF(false)} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs shadow-xl flex items-center gap-3">
          <i className="fas fa-file-pdf"></i> Solo Descargar PDF
        </button>
        {!forcedReadOnly && !isFinalizedFromHistory && (
          <button onClick={() => downloadPDF(true)} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs shadow-xl flex items-center gap-3">
            <i className="fas fa-check-circle"></i> Finalizar y Descontar Stock
          </button>
        )}
      </div>

      {/* Historial de Envíos */}
      <div className="bg-white p-8 rounded-3xl border shadow-sm no-pdf animate-in fade-in">
        <h3 className="text-lg font-black uppercase tracking-tighter mb-6 flex items-center gap-2">
          <i className="fas fa-history text-blue-500"></i> Historial de Envíos
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Folio</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs font-bold uppercase">
              {history.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-500">{s.fecha}</td>
                  <td className="px-6 py-4 text-blue-600 font-black">{s.folio}</td>
                  <td className="px-6 py-4 truncate max-w-[150px]">{s.cliente}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black ${s.isFinalized ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                      {s.isFinalized ? 'FINALIZADO' : 'PENDIENTE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => loadFromHistory(s)} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[9px] font-black hover:bg-blue-100 transition-all uppercase">
                      {s.isFinalized ? 'Ver Detalle' : 'Abrir y Editar'}
                    </button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={5} className="py-20 text-center text-slate-300 italic font-black">No hay historial</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DeliveryView;
