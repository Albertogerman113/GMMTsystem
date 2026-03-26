
import React, { useState, useEffect, useRef } from 'react';
import { PurchaseOrder, PurchaseItem, InventarioItem, PurchaseStatus, UserSession, UserRole, PurchaseType } from '../types';
import { getStoredPurchases, setStoredPurchases, getStoredInventory, addToInventory, getCompanyData } from '../utils/storage';
import { parseQuotationPDF } from '../services/geminiService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

interface PurchasingViewProps {
  currentUser: UserSession;
  branch?: 'MAIN' | 'MZT' | 'TAB';
}

const PurchasingView: React.FC<PurchasingViewProps> = ({ currentUser, branch = 'MAIN' }) => {
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [activeTab, setActiveTab] = useState<PurchaseStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(false);
  const [showNewReq, setShowNewReq] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const company = getCompanyData();
  
  // Form State
  const [newOrder, setNewOrder] = useState<Partial<PurchaseOrder>>({
    tipo: 'EXTERNAL',
    proveedor: '',
    items: [],
    comentarios: '',
    costoSeguro: 0,
    costoManiobra: 0,
    folioCotizacionProveedor: ''
  });

  useEffect(() => {
    loadPurchases();
  }, []);

  const loadPurchases = () => {
    const all = getStoredPurchases();
    setPurchases(all.filter(p => p.sucursal === (branch as 'MAIN' | 'MZT' | 'TAB')));
  };

  const addItemToReq = (item: InventarioItem) => {
    const newItem: PurchaseItem = {
      id: Math.random().toString(),
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: 1,
      ventaUnit: 0,
      costoUnit: 0,
      pesoUnit: item.pesoUnitario,
      pesoTotal: item.pesoUnitario,
      utilidadTotal: 0
    };
    setNewOrder(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
    setSearchTerm('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm) {
      const match = filteredInv.find(i => i.codigo.toLowerCase() === searchTerm.toLowerCase()) || filteredInv[0];
      if (match) addItemToReq(match);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    setLoading(true);
    try {
      const data = await parseQuotationPDF(files);
      const inv = getStoredInventory(branch as 'MAIN' | 'MZT' | 'TAB');
      const mapped = data.partidas.map((item: any) => ({
        id: Math.random().toString(),
        codigo: item.codigo,
        descripcion: item.descripcion || inv[item.codigo]?.descripcion || "Material de Compra",
        cantidad: item.cantidad,
        costoUnit: item.ventaUnit,
        ventaUnit: 0, pesoUnit: 0, pesoTotal: 0, utilidadTotal: 0
      }));
      setNewOrder(prev => ({ 
        ...prev, 
        items: [...(prev.items || []), ...mapped],
        proveedor: data.cliente || prev.proveedor
      }));
    } catch (err) {
      alert("Error al procesar PDF con IA");
    } finally { setLoading(false); e.target.value = ''; }
  };

  const saveRequisition = () => {
    if (!newOrder.proveedor && newOrder.tipo === 'EXTERNAL') return alert("Ingrese proveedor");
    if (!newOrder.items?.length) return alert("Agregue materiales");

    const all = getStoredPurchases();
    
    const subtotalItems = (newOrder.items || []).reduce((a, b) => a + (b.cantidad * (b.costoUnit || 0)), 0);
    const subtotal = subtotalItems + (newOrder.costoSeguro || 0) + (newOrder.costoManiobra || 0);
    const total = subtotal * 1.16;

    if (selectedOrder) {
      // Update existing
      const idx = all.findIndex(p => p.id === selectedOrder.id);
      if (idx !== -1) {
        all[idx] = {
          ...selectedOrder,
          tipo: newOrder.tipo as PurchaseType,
          proveedor: newOrder.tipo === 'INTERNAL_TRANSFER' ? 'BODEGA PRINCIPAL' : (newOrder.proveedor || ''),
          items: newOrder.items as PurchaseItem[],
          totalEstimado: total,
          costoSeguro: newOrder.costoSeguro || 0,
          costoManiobra: newOrder.costoManiobra || 0,
          folioCotizacionProveedor: newOrder.folioCotizacionProveedor || '',
          comentarios: newOrder.comentarios || ''
        };
      }
    } else {
      // Create new
      const order: PurchaseOrder = {
        id: Date.now().toString(),
        folio: `REQ-${branch}-${Date.now().toString().slice(-4)}`,
        fecha: new Date().toLocaleDateString(),
        sucursal: branch as 'MAIN' | 'MZT' | 'TAB',
        tipo: newOrder.tipo as PurchaseType,
        proveedor: newOrder.tipo === 'INTERNAL_TRANSFER' ? 'BODEGA PRINCIPAL' : (newOrder.proveedor || ''),
        items: newOrder.items as PurchaseItem[],
        status: 'REQUISITION',
        totalEstimado: total,
        costoSeguro: newOrder.costoSeguro || 0,
        costoManiobra: newOrder.costoManiobra || 0,
        folioCotizacionProveedor: newOrder.folioCotizacionProveedor || '',
        comentarios: newOrder.comentarios || ''
      };
      all.push(order);
    }

    setStoredPurchases(all);
    setPurchases(all.filter(p => p.sucursal === (branch as 'MAIN' | 'MZT' | 'TAB')));
    setShowNewReq(false);
    setSelectedOrder(null);
    setNewOrder({ tipo: 'EXTERNAL', proveedor: '', items: [], comentarios: '', costoSeguro: 0, costoManiobra: 0, folioCotizacionProveedor: '' });
  };

  const printRequisition = async () => {
    setIsPrinting(true);
    setTimeout(async () => {
      if (!printRef.current) return;
      try {
        const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        const fileName = selectedOrder?.status === 'ORDERED' ? `ORDEN_COMPRA_${selectedOrder.folio}` : `REQUISICION_${selectedOrder?.folio || 'NUEVA'}`;
        pdf.save(`${fileName}.pdf`);
      } finally {
        setIsPrinting(false);
      }
    }, 500);
  };

  const exportToExcel = () => {
    if (!selectedOrder) return;
    
    const data = selectedOrder.items.map(item => ({
      'Código': item.codigo,
      'Descripción': item.descripcion,
      'Cantidad': item.cantidad,
      'Costo Unitario': item.costoUnit || 0,
      'Total': (item.cantidad * (item.costoUnit || 0))
    }));

    // Add extra costs to the excel if they exist
    if (selectedOrder.costoSeguro || selectedOrder.costoManiobra) {
      data.push({
        'Código': 'OTROS',
        'Descripción': 'Seguro',
        'Cantidad': 1,
        'Costo Unitario': selectedOrder.costoSeguro || 0,
        'Total': selectedOrder.costoSeguro || 0
      });
      data.push({
        'Código': 'OTROS',
        'Descripción': 'Maniobra',
        'Cantidad': 1,
        'Costo Unitario': selectedOrder.costoManiobra || 0,
        'Total': selectedOrder.costoManiobra || 0
      });
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orden de Compra");
    
    const fileName = selectedOrder.status === 'ORDERED' ? `OC_${selectedOrder.folio}.xlsx` : `REQ_${selectedOrder.folio}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const openOrder = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setNewOrder({
      tipo: order.tipo,
      proveedor: order.proveedor,
      items: order.items,
      comentarios: order.comentarios,
      costoSeguro: order.costoSeguro || 0,
      costoManiobra: order.costoManiobra || 0,
      folioCotizacionProveedor: order.folioCotizacionProveedor || ''
    });
    setShowNewReq(true);
  };

  const updateStatus = (id: string, newStatus: PurchaseStatus) => {
    const all = getStoredPurchases();
    const orderIdx = all.findIndex(p => p.id === id);
    if (orderIdx === -1) return;

    if (newStatus === 'RECEIVED' && all[orderIdx].status !== 'RECEIVED') {
      all[orderIdx].items.forEach(item => {
        addToInventory(item.codigo, item.cantidad, `Compra/Recepción Folio: ${all[orderIdx].folio}`, branch as 'MAIN' | 'MZT' | 'TAB');
      });
    }

    all[orderIdx].status = newStatus;
    setStoredPurchases(all);
    loadPurchases();
  };

  const inventory = getStoredInventory(branch as 'MAIN' | 'MZT' | 'TAB');
  const filteredInv = Object.values(inventory).filter(i => 
    i.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || i.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border shadow-sm flex justify-between items-center">
        <div>
          <h3 className="text-xl font-black uppercase tracking-tighter">Módulo de Compras / Abasto</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Sucursal: {branch === 'MAIN' ? 'Principal' : (branch === 'MZT' ? 'Mazatlán' : 'Tablaroca')}</p>
        </div>
        <button onClick={() => setShowNewReq(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase shadow-lg hover:bg-blue-700">Crear Requisición</button>
      </div>

      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: 'ALL', label: 'Todos' },
          { id: 'REQUISITION', label: 'Requisiciones' },
          { id: 'QUOTED', label: 'Cotizadas' },
          { id: 'ORDERED', label: 'Órdenes de Compra' },
          { id: 'RECEIVED', label: 'Recibidas' }
        ].map(s => (
          <button 
            key={s.id} 
            onClick={() => setActiveTab(s.id as any)}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === s.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {purchases.filter(p => activeTab === 'ALL' || p.status === activeTab).map(p => (
          <div key={p.id} onClick={() => openOrder(p)} className="bg-white p-6 rounded-2xl border-2 border-slate-50 shadow-sm space-y-4 hover:border-blue-200 transition-all group cursor-pointer">
            <div className="flex justify-between items-start">
              <span className="font-black text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase">{p.folio}</span>
              <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${
                p.status === 'RECEIVED' ? 'bg-green-100 text-green-600' : 
                p.status === 'REQUISITION' ? 'bg-amber-100 text-amber-600' : 
                p.status === 'ORDERED' ? 'bg-slate-900 text-white' : 'bg-blue-100 text-blue-600'
              }`}>
                {p.status === 'REQUISITION' ? 'Requisición' : 
                 p.status === 'QUOTED' ? 'Cotizada' : 
                 p.status === 'ORDERED' ? 'Orden de Compra' : 'Recibida'}
              </span>
            </div>
            
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proveedor / Fuente</p>
              <p className="font-black text-slate-900 uppercase truncate">{p.proveedor}</p>
            </div>

            <div className="space-y-1">
               {p.items.slice(0, 3).map((it, idx) => (
                 <div key={idx} className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <span>{it.codigo}</span>
                    <span>x{it.cantidad}</span>
                 </div>
               ))}
               {p.items.length > 3 && <p className="text-[8px] font-bold text-slate-300">+{p.items.length - 3} más...</p>}
            </div>

            <div className="pt-4 border-t border-slate-50 flex gap-2">
              {p.status === 'REQUISITION' && (
                <button onClick={() => updateStatus(p.id, 'QUOTED')} className="flex-1 bg-slate-900 text-white py-2 rounded-lg font-black text-[9px] uppercase">Cotizar</button>
              )}
              {p.status === 'QUOTED' && (
                <button onClick={() => updateStatus(p.id, 'ORDERED')} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-black text-[9px] uppercase">Generar OC</button>
              )}
              {p.status === 'ORDERED' && (
                <button onClick={() => updateStatus(p.id, 'RECEIVED')} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-black text-[9px] uppercase">Recibir Material</button>
              )}
            </div>
          </div>
        ))}
        {purchases.filter(p => activeTab === 'ALL' || p.status === activeTab).length === 0 && (
          <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed">
             <p className="text-slate-400 text-xs font-black uppercase tracking-widest">No hay registros en esta sección</p>
          </div>
        )}
      </div>

      {showNewReq && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[500] p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-4 border-white animate-in zoom-in duration-200">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h4 className="text-2xl font-black uppercase tracking-tighter">
                  {selectedOrder 
                    ? (selectedOrder.status === 'ORDERED' ? `Orden de Compra: ${selectedOrder.folio}` : `Requisición: ${selectedOrder.folio}`)
                    : 'Nueva Requisición'}
                </h4>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Suministros sucursal {branch}</p>
              </div>
              <div className="flex items-center gap-4">
                {selectedOrder && (
                  <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-black text-[10px] uppercase flex items-center gap-2">
                    <i className="fas fa-file-excel"></i> Excel
                  </button>
                )}
                <button onClick={printRequisition} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-black text-[10px] uppercase flex items-center gap-2">
                   <i className="fas fa-print"></i> PDF
                </button>
                <button onClick={() => { setShowNewReq(false); setSelectedOrder(null); setNewOrder({ tipo: 'EXTERNAL', proveedor: '', items: [], comentarios: '', costoSeguro: 0, costoManiobra: 0, folioCotizacionProveedor: '' }); }} className="text-slate-400 hover:text-white"><i className="fas fa-times text-2xl"></i></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo de Requisición</label>
                  <div className="flex gap-2">
                    <button 
                      disabled={selectedOrder && (selectedOrder.status === 'ORDERED' || selectedOrder.status === 'RECEIVED')}
                      onClick={() => setNewOrder({...newOrder, tipo: 'EXTERNAL'})} 
                      className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase ${newOrder.tipo === 'EXTERNAL' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                    >
                      Externo
                    </button>
                    {(branch === 'MZT' || branch === 'TAB') && (
                      <button 
                        disabled={selectedOrder && (selectedOrder.status === 'ORDERED' || selectedOrder.status === 'RECEIVED')}
                        onClick={() => setNewOrder({...newOrder, tipo: 'INTERNAL_TRANSFER'})} 
                        className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase ${newOrder.tipo === 'INTERNAL_TRANSFER' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                      >
                        Pedido Mochis
                      </button>
                    )}
                  </div>
                </div>

                {newOrder.tipo === 'EXTERNAL' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Proveedor</label>
                    <input 
                      disabled={selectedOrder && selectedOrder.status === 'RECEIVED'}
                      type="text" 
                      value={newOrder.proveedor} 
                      onChange={e => setNewOrder({...newOrder, proveedor: e.target.value.toUpperCase()})} 
                      className="w-full p-4 border rounded-2xl font-black uppercase shadow-inner disabled:bg-slate-50" 
                      placeholder="EJ: PANEL REY / CIASA" 
                    />
                  </div>
                )}

                {newOrder.tipo === 'EXTERNAL' && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Folio Cotización Proveedor</label>
                    <input 
                      disabled={selectedOrder && selectedOrder.status === 'RECEIVED'}
                      type="text" 
                      value={newOrder.folioCotizacionProveedor} 
                      onChange={e => setNewOrder({...newOrder, folioCotizacionProveedor: e.target.value.toUpperCase()})} 
                      className="w-full p-4 border rounded-2xl font-black uppercase shadow-inner disabled:bg-slate-50" 
                      placeholder="EJ: COT-12345" 
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Costo Seguro</label>
                    <input 
                      disabled={selectedOrder && selectedOrder.status === 'RECEIVED'}
                      type="number" 
                      value={newOrder.costoSeguro} 
                      onChange={e => setNewOrder({...newOrder, costoSeguro: parseFloat(e.target.value) || 0})} 
                      className="w-full p-4 border rounded-2xl font-black uppercase shadow-inner disabled:bg-slate-50" 
                      placeholder="0.00" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Costo Maniobra</label>
                    <input 
                      disabled={selectedOrder && selectedOrder.status === 'RECEIVED'}
                      type="number" 
                      value={newOrder.costoManiobra} 
                      onChange={e => setNewOrder({...newOrder, costoManiobra: parseFloat(e.target.value) || 0})} 
                      className="w-full p-4 border rounded-2xl font-black uppercase shadow-inner disabled:bg-slate-50" 
                      placeholder="0.00" 
                    />
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Añadir SKU o Descripción</label>
                  <input 
                    disabled={selectedOrder && (selectedOrder.status === 'ORDERED' || selectedOrder.status === 'RECEIVED')}
                    type="text" 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    onKeyDown={handleSearchKeyDown} 
                    className="w-full p-4 border rounded-2xl font-bold uppercase shadow-inner disabled:bg-slate-50" 
                    placeholder="BUSCAR..." 
                  />
                  {searchTerm && (
                    <div className="absolute z-10 w-full mt-2 bg-white border rounded-xl shadow-xl overflow-hidden">
                      {filteredInv.map(i => (
                        <button key={i.codigo} onClick={() => addItemToReq(i)} className="w-full p-3 text-left hover:bg-blue-50 border-b flex justify-between items-center group">
                          <div className="flex flex-col text-left">
                            <span className="text-slate-900 font-black uppercase group-hover:text-blue-600">{i.codigo}</span>
                            <span className="text-[8px] text-slate-400 font-bold uppercase">{i.descripcion}</span>
                          </div>
                          <i className="fas fa-plus text-blue-500"></i>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-4">
                   <p className="text-[10px] font-black text-slate-400 uppercase">Carga rápida mediante IA</p>
                   <label className={`bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-[9px] uppercase cursor-pointer block hover:bg-black transition-all ${selectedOrder && (selectedOrder.status === 'ORDERED' || selectedOrder.status === 'RECEIVED') ? 'opacity-50 pointer-events-none' : ''}`}>
                     {loading ? 'Procesando...' : 'Cargar Factura PDF'}
                     <input disabled={selectedOrder && (selectedOrder.status === 'ORDERED' || selectedOrder.status === 'RECEIVED')} type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload} />
                   </label>
                </div>
              </div>

              <div className="lg:col-span-2 bg-slate-50 p-8 rounded-3xl border shadow-inner flex flex-col h-full min-h-[400px]">
                <h5 className="font-black text-[11px] uppercase tracking-widest mb-6">Lista de Materiales Solicitados</h5>
                <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                   {newOrder.items?.map(item => (
                     <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between group">
                        <div className="flex-1">
                           <p className="font-black text-xs text-slate-900 uppercase">{item.codigo}</p>
                           <p className="text-[8px] font-bold text-slate-400 uppercase">{item.descripcion}</p>
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="flex flex-col items-center">
                             <label className="text-[8px] font-black text-slate-400 uppercase">Cant</label>
                             <input 
                               disabled={selectedOrder && selectedOrder.status === 'RECEIVED'}
                               type="number" 
                               value={item.cantidad} 
                               onChange={e => {
                                 const updated = newOrder.items?.map(it => it.id === item.id ? {...it, cantidad: parseFloat(e.target.value) || 0} : it);
                                 setNewOrder({...newOrder, items: updated});
                               }} 
                               className="w-16 p-1 border rounded text-center font-black text-xs disabled:bg-slate-50" 
                             />
                           </div>
                           <div className="flex flex-col items-center">
                             <label className="text-[8px] font-black text-slate-400 uppercase">Costo</label>
                             <input 
                               disabled={selectedOrder && selectedOrder.status === 'RECEIVED'}
                               type="number" 
                               value={item.costoUnit} 
                               onChange={e => {
                                 const updated = newOrder.items?.map(it => it.id === item.id ? {...it, costoUnit: parseFloat(e.target.value) || 0} : it);
                                 setNewOrder({...newOrder, items: updated});
                               }} 
                               className="w-20 p-1 border rounded text-center font-black text-xs disabled:bg-slate-50" 
                             />
                           </div>
                           <button 
                             disabled={selectedOrder && selectedOrder.status === 'RECEIVED'}
                             onClick={() => setNewOrder({...newOrder, items: newOrder.items?.filter(it => it.id !== item.id)})} 
                             className="text-red-300 hover:text-red-500 transition-colors disabled:opacity-30 mt-4"
                           >
                             <i className="fas fa-trash-alt"></i>
                           </button>
                        </div>
                     </div>
                   ))}
                </div>
                <div className="mt-8 pt-8 border-t border-slate-200 space-y-3">
                  <div className="bg-slate-100 p-4 rounded-2xl space-y-2 mb-4">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                      <span>Subtotal Materiales:</span>
                      <span>${(newOrder.items || []).reduce((a, b) => a + (b.cantidad * (b.costoUnit || 0)), 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                      <span>Otros Costos (Seguro + Maniobra):</span>
                      <span>${((newOrder.costoSeguro || 0) + (newOrder.costoManiobra || 0)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                      <span>IVA (16%):</span>
                      <span>${(((newOrder.items || []).reduce((a, b) => a + (b.cantidad * (b.costoUnit || 0)), 0) + (newOrder.costoSeguro || 0) + (newOrder.costoManiobra || 0)) * 0.16).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs font-black uppercase text-blue-600 border-t pt-2">
                      <span>Total Final:</span>
                      <span>${(((newOrder.items || []).reduce((a, b) => a + (b.cantidad * (b.costoUnit || 0)), 0) + (newOrder.costoSeguro || 0) + (newOrder.costoManiobra || 0)) * 1.16).toLocaleString()}</span>
                    </div>
                  </div>

                  {selectedOrder && selectedOrder.status === 'REQUISITION' && (
                    <button 
                      onClick={() => {
                        updateStatus(selectedOrder.id, 'ORDERED');
                        setSelectedOrder({ ...selectedOrder, status: 'ORDERED' });
                      }}
                      className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-black"
                    >
                      Convertir a Orden de Compra
                    </button>
                  )}
                  <button 
                    disabled={selectedOrder && selectedOrder.status === 'RECEIVED'}
                    onClick={saveRequisition} 
                    className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 disabled:bg-slate-400"
                  >
                    {selectedOrder ? 'Actualizar Registro' : 'Finalizar Requisición'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AREA IMPRIMIBLE OCULTA */}
      <div className="fixed -left-[9999px] top-0">
        <div ref={printRef} className="w-[210mm] p-12 bg-white text-black" style={{ fontFamily: 'Arial, sans-serif', fontSize: '11pt' }}>
          <div className="flex justify-between items-start border-b-2 border-black pb-6 mb-6">
            <div>
              <h1 className="text-3xl font-bold uppercase tracking-tight">{company.nombre}</h1>
              <p className="text-[10pt] mt-1">{company.direccion}</p>
              <p className="text-[10pt]">RFC: {company.rfc} | Tel: {company.telefono} | {company.correo}</p>
              <div className="mt-4">
                <h2 className="text-xl font-bold uppercase border-2 border-black px-4 py-1 inline-block">
                  {selectedOrder?.status === 'ORDERED' ? 'Orden de Compra' : 'Requisición de Material'}
                </h2>
              </div>
              {selectedOrder?.status === 'ORDERED' && selectedOrder.folioCotizacionProveedor && (
                <p className="mt-3 text-[10pt] font-bold uppercase">
                  Basada en cotización: <span className="border-b border-black px-1">{selectedOrder.folioCotizacionProveedor}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="border-2 border-black p-3 inline-block mb-2 text-center min-w-[150px]">
                <p className="text-[9pt] font-bold uppercase tracking-wider mb-1">FOLIO</p>
                <p className="text-xl font-bold">{selectedOrder?.folio || 'NUEVA'}</p>
              </div>
              <p className="text-[10pt] font-bold uppercase">Fecha: {selectedOrder?.fecha || new Date().toLocaleDateString()}</p>
              <p className="text-[10pt] font-bold uppercase">Estado: {selectedOrder?.status === 'ORDERED' ? 'ORDEN DE COMPRA' : 'REQUISICIÓN'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="border border-black p-4">
              <p className="text-[9pt] font-bold uppercase mb-1">Proveedor / Fuente:</p>
              <p className="text-[11pt] font-bold uppercase">{newOrder.proveedor || (newOrder.tipo === 'INTERNAL_TRANSFER' ? 'BODEGA PRINCIPAL' : 'NO ESPECIFICADO')}</p>
            </div>
            <div className="border border-black p-4">
              <p className="text-[9pt] font-bold uppercase mb-1">Sucursal Destino:</p>
              <p className="text-[11pt] font-bold uppercase">{branch === 'MAIN' ? 'LOS MOCHIS (MATRIZ)' : (branch === 'MZT' ? 'MAZATLÁN' : 'TABLAROCA')}</p>
            </div>
          </div>

          <table className="w-full mb-6 border-collapse">
            <thead>
              <tr className="border-y-2 border-black">
                <th className="p-2 text-left text-[10pt] font-bold uppercase">Código</th>
                <th className="p-2 text-left text-[10pt] font-bold uppercase">Descripción</th>
                <th className="p-2 text-center text-[10pt] font-bold uppercase">Cant.</th>
                <th className="p-2 text-right text-[10pt] font-bold uppercase">Costo Unit.</th>
                <th className="p-2 text-right text-[10pt] font-bold uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {newOrder.items?.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-300">
                  <td className="p-2 text-[10pt] font-bold">{item.codigo}</td>
                  <td className="p-2 text-[10pt]">{item.descripcion}</td>
                  <td className="p-2 text-center text-[10pt] font-bold">{item.cantidad}</td>
                  <td className="p-2 text-right text-[10pt]">${(item.costoUnit || 0).toLocaleString()}</td>
                  <td className="p-2 text-right text-[10pt] font-bold">${(item.cantidad * (item.costoUnit || 0)).toLocaleString()}</td>
                </tr>
              ))}
              {(newOrder.costoSeguro || 0) > 0 && (
                <tr className="border-b border-gray-300 bg-gray-50">
                  <td className="p-2 text-[10pt] font-bold">OTROS</td>
                  <td className="p-2 text-[10pt]">SEGURO DE MERCANCÍA</td>
                  <td className="p-2 text-center text-[10pt]">1</td>
                  <td className="p-2 text-right text-[10pt]">${(newOrder.costoSeguro || 0).toLocaleString()}</td>
                  <td className="p-2 text-right text-[10pt] font-bold">${(newOrder.costoSeguro || 0).toLocaleString()}</td>
                </tr>
              )}
              {(newOrder.costoManiobra || 0) > 0 && (
                <tr className="border-b border-gray-300 bg-gray-50">
                  <td className="p-2 text-[10pt] font-bold">OTROS</td>
                  <td className="p-2 text-[10pt]">SERVICIO DE MANIOBRA</td>
                  <td className="p-2 text-center text-[10pt]">1</td>
                  <td className="p-2 text-right text-[10pt]">${(newOrder.costoManiobra || 0).toLocaleString()}</td>
                  <td className="p-2 text-right text-[10pt] font-bold">${(newOrder.costoManiobra || 0).toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex justify-end mb-10">
            <div className="border-2 border-black p-4 min-w-[250px] space-y-1">
              <div className="flex justify-between text-[10pt]">
                <span>Subtotal:</span>
                <span>${(((newOrder.items || []).reduce((a, b) => a + (b.cantidad * (b.costoUnit || 0)), 0) + (newOrder.costoSeguro || 0) + (newOrder.costoManiobra || 0))).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[10pt]">
                <span>IVA (16%):</span>
                <span>${(((newOrder.items || []).reduce((a, b) => a + (b.cantidad * (b.costoUnit || 0)), 0) + (newOrder.costoSeguro || 0) + (newOrder.costoManiobra || 0)) * 0.16).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xl font-bold border-t border-black pt-2">
                <span>TOTAL:</span>
                <span>${(((newOrder.items || []).reduce((a, b) => a + (b.cantidad * (b.costoUnit || 0)), 0) + (newOrder.costoSeguro || 0) + (newOrder.costoManiobra || 0)) * 1.16).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {newOrder.comentarios && (
            <div className="mb-10">
              <p className="text-[9pt] font-bold uppercase mb-1">Comentarios / Observaciones:</p>
              <div className="p-4 border border-gray-300 text-[10pt] italic">
                {newOrder.comentarios}
              </div>
            </div>
          )}

          <div className="mt-24 flex justify-around">
            <div className="text-center w-64">
              <div className="border-t border-black pt-2">
                <p className="text-[10pt] font-bold uppercase">{currentUser.username}</p>
                <p className="text-[9pt] uppercase">Solicita</p>
              </div>
            </div>
            <div className="text-center w-64">
              <div className="border-t border-black pt-2">
                <p className="text-[10pt] font-bold uppercase">Gerencia / Compras</p>
                <p className="text-[9pt] uppercase">Autoriza</p>
              </div>
            </div>
          </div>

          <div className="mt-20 text-center text-[8pt] text-gray-400 uppercase tracking-widest">
            Documento Interno de Control de Abasto - Mastablaroca
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchasingView;
