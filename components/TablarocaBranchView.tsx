
import React, { useState, useEffect } from 'react';
import { Partida, Cliente, InventarioItem, Gastos, UserSession, PaymentMethod, SaleRecord, CompanyData, PaymentDetail } from '../types';
import { bulkLoadTablarocaCatalog, getStoredInventory, getStoredSalePrices, getStoredWholesalePrices, getStoredClients, deductFromInventory, getCompanyData, setCompanyData, saveSaleToHistory, getStoredSalesHistory } from '../utils/storage';
import { TABLAROCA_INITIAL_CATALOG } from '../utils/tablaroca_catalog';
import AnalysisView from './AnalysisView';
import DeliveryView from './DeliveryView';
import InventoryView from './InventoryView';
import PurchasingView from './PurchasingView';
import ProductManagementView from './ProductManagementView';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

interface TablarocaBranchViewProps {
  currentUser: UserSession;
}

type TablarocaTab = 'POS' | 'INVENTORY' | 'QUOTES' | 'SHIPPING' | 'PURCHASING' | 'HISTORY' | 'COMPANY' | 'PRODUCTS';

const TablarocaBranchView: React.FC<TablarocaBranchViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<TablarocaTab>('POS');

  const handleLoadCatalog = () => {
    if (confirm("¿Cargar el catálogo inicial de productos? Esto no borrará lo que ya tengas, solo agregará los nuevos.")) {
      bulkLoadTablarocaCatalog(TABLAROCA_INITIAL_CATALOG);
      alert("Catálogo cargado con éxito.");
      window.location.reload();
    }
  };
  
  // POS States
  const [posSearch, setPosSearch] = useState('');
  const [cart, setCart] = useState<Partida[]>([]);
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});
  const [salePrices, setSalePrices] = useState<Record<string, number>>({});
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastTicket, setLastTicket] = useState<{items: Partida[], folio: string, subtotal: number, iva: number, total: number, metodoPago: PaymentMethod, pagos?: PaymentDetail[]} | null>(null);
  const [searchQuantities, setSearchQuantities] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO');
  const [showPriceTypeModal, setShowPriceTypeModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingPriceType, setPendingPriceType] = useState<'PUBLIC' | 'WHOLESALE' | 'AS_IS' | null>(null);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentDetail[]>([
    { metodo: 'EFECTIVO', monto: 0 },
    { metodo: 'TARJETA', monto: 0 },
    { metodo: 'TRANSFERENCIA', monto: 0 }
  ]);

  const [exportStartDate, setExportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleExportExcel = () => {
    const filteredSales = salesHistory.filter(sale => {
      const saleDate = sale.fecha.split('T')[0];
      return saleDate >= exportStartDate && saleDate <= exportEndDate;
    });

    if (filteredSales.length === 0) {
      alert("No hay ventas en el rango de fechas seleccionado.");
      return;
    }

    const data = filteredSales.flatMap(sale => 
      sale.items.map(i => ({
        Fecha: new Date(sale.fecha).toLocaleString('es-MX'),
        Folio: sale.folio,
        Vendedor: sale.vendedor,
        'Metodo Pago': sale.metodoPago,
        SKU: i.codigo,
        Descripcion: i.descripcion,
        'Clave SAT': i.claveSAT || "",
        Cantidad: i.cantidad,
        'Precio Unit': i.ventaUnit,
        Importe: i.cantidad * i.ventaUnit,
        Subtotal: sale.subtotal,
        IVA: sale.iva,
        Total: sale.total
      }))
    );

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, `Ventas_TAB_${exportStartDate}_a_${exportEndDate}.xlsx`);
  };

  const handleExportTxt = () => {
    const filteredSales = salesHistory.filter(sale => {
      const saleDate = sale.fecha.split('T')[0];
      return saleDate >= exportStartDate && saleDate <= exportEndDate;
    });

    if (filteredSales.length === 0) {
      alert("No hay ventas en el rango de fechas seleccionado.");
      return;
    }

    let content = "REPORTE DE VENTAS TABLAROCA\n";
    content += `Periodo: ${exportStartDate} al ${exportEndDate}\n`;
    content += "--------------------------------------------------\n\n";

    filteredSales.forEach(sale => {
      content += `Folio: ${sale.folio} | Fecha: ${new Date(sale.fecha).toLocaleString('es-MX')}\n`;
      content += `Vendedor: ${sale.vendedor} | Pago: ${sale.metodoPago}\n`;
      content += `Total: $ ${sale.total.toFixed(2)}\n`;
      content += "Productos:\n";
      sale.items.forEach(i => {
        content += `  - [${i.codigo}] ${i.descripcion} | SAT: ${i.claveSAT || 'N/A'} | Cant: ${i.cantidad} | Unit: $ ${i.ventaUnit.toFixed(2)} | Sub: $ ${(i.cantidad * i.ventaUnit).toFixed(2)}\n`;
      });
      content += "--------------------------------------------------\n";
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ventas_TAB_${exportStartDate}_a_${exportEndDate}.txt`;
    link.click();
  };
  const [wholesalePrices, setWholesalePrices] = useState<Record<string, number>>({});
  
  // History States
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);

  // Shared View States
  const [quotePartidas, setQuotePartidas] = useState<Partida[]>([]);
  const [quoteClient, setQuoteClient] = useState<Cliente | null>(null);
  const [quoteFolio, setQuoteFolio] = useState('');
  const [quoteExpenses, setQuoteExpenses] = useState<Gastos>({ operativos: 0, envio: 0, otros: 0 });
  const [quoteMode, setQuoteMode] = useState<'ANALYSIS' | 'QUOTE'>('QUOTE');
  const [shipItems, setShipItems] = useState<Partida[]>([]);
  const [shipFolio, setShipFolio] = useState('');
  const [shipComments, setShipComments] = useState('');
  const [shipClient, setShipClient] = useState<Cliente | null>(null);

  // Company State
  const [company, setCompany] = useState<CompanyData>(getCompanyData('TAB'));

  useEffect(() => {
    setInventory(getStoredInventory('TAB'));
    setSalePrices(getStoredSalePrices('TAB'));
    setWholesalePrices(getStoredWholesalePrices('TAB'));
    setCompany(getCompanyData('TAB'));
    if (activeTab === 'HISTORY') {
      setSalesHistory(getStoredSalesHistory().filter(s => s.sucursal === 'TAB'));
    }
  }, [activeTab]);

  const addToCart = (item: InventarioItem) => {
    const qtyToAdd = searchQuantities[item.codigo] || 1;
    const existing = cart.find(c => c.codigo === item.codigo);
    if (existing) {
      setCart(cart.map(c => c.codigo === item.codigo ? { ...c, cantidad: c.cantidad + qtyToAdd, pesoTotal: (c.cantidad + qtyToAdd) * c.pesoUnit } : c));
    } else {
      const price = salePrices[item.codigo] || 0;
      setCart([...cart, { 
        id: Math.random().toString(), 
        codigo: item.codigo, 
        descripcion: item.descripcion, 
        cantidad: qtyToAdd, 
        ventaUnit: price, 
        costoUnit: 0, 
        pesoUnit: item.pesoUnitario, 
        pesoTotal: item.pesoUnitario * qtyToAdd, 
        utilidadTotal: 0,
        claveSAT: item.claveSAT
      }]);
    }
    setPosSearch('');
    setSearchQuantities(prev => { const newState = { ...prev }; delete newState[item.codigo]; return newState; });
  };

  const handlePOSSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && posSearch) {
      const match = filteredPOS.find(i => i.codigo.toLowerCase() === posSearch.toLowerCase()) || filteredPOS[0];
      if (match) addToCart(match);
    }
  };

  const updateCartQty = (id: string, newQty: number) => {
    setCart(cart.map(c => { if (c.id === id) { const qty = Math.max(0.1, newQty); return { ...c, cantidad: qty, pesoTotal: qty * c.pesoUnit }; } return c; }));
  };

  const printTicketPDF = async (ticketData: any) => {
    setLastTicket(ticketData);
    setIsPrinting(true);
    setTimeout(async () => {
      const element = document.getElementById('pos-ticket-printable-tab');
      if (!element) return;
      try {
        const canvas = await html2canvas(element, { scale: 3, backgroundColor: '#ffffff', useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF('p', 'mm', [80, 200]);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Ticket_TAB_${ticketData.folio}.pdf`);
      } finally { 
        setIsPrinting(false); 
      }
    }, 500);
  };

  const handlePOSFinalize = () => {
    if (cart.length === 0) return;
    setShowPriceTypeModal(true);
  };

  const executePOSFinalize = async (priceType: 'PUBLIC' | 'WHOLESALE' | 'AS_IS', finalPayments?: PaymentDetail[]) => {
    let finalCart = [...cart];
    
    if (priceType === 'WHOLESALE') {
      finalCart = cart.map(item => ({
        ...item,
        ventaUnit: wholesalePrices[item.codigo] || item.ventaUnit
      }));
    } else if (priceType === 'PUBLIC') {
      finalCart = cart.map(item => ({
        ...item,
        ventaUnit: salePrices[item.codigo] || item.ventaUnit
      }));
    }

    const subtotal = finalCart.reduce((acc, i) => acc + (i.cantidad * i.ventaUnit), 0);
    const iva = subtotal * 0.16;
    const total = subtotal + iva;
    const folio = `TAB-${Date.now().toString().slice(-6)}`;
    
    // Determine primary payment method for backward compatibility
    const primaryPayment = finalPayments && finalPayments.length > 0 
      ? (finalPayments.length === 1 ? finalPayments[0].metodo : 'EFECTIVO') 
      : paymentMethod;

    const sale: SaleRecord = {
      id: Date.now().toString(),
      folio,
      fecha: new Date().toISOString(),
      sucursal: 'TAB',
      items: finalCart,
      subtotal,
      iva,
      total,
      metodoPago: primaryPayment,
      pagos: finalPayments,
      vendedor: currentUser.username
    };

    saveSaleToHistory(sale);
    
    const ticketData = { items: finalCart, folio, subtotal, iva, total, metodoPago: primaryPayment, pagos: finalPayments };
    
    finalCart.forEach(item => deductFromInventory(item.codigo, item.cantidad, `Venta POS Folio: ${folio}`, 'TAB'));
    
    setShowPriceTypeModal(false);
    setShowPaymentModal(false);
    
    // Automatic printing
    await printTicketPDF(ticketData);
    
    setCart([]);
    setPaymentMethod('EFECTIVO');
    setPaymentBreakdown([
      { metodo: 'EFECTIVO', monto: 0 },
      { metodo: 'TARJETA', monto: 0 },
      { metodo: 'TRANSFERENCIA', monto: 0 }
    ]);
    setInventory(getStoredInventory('TAB'));
  };

  const filteredPOS = (Object.values(inventory) as InventarioItem[]).filter(i => 
    !i.oculto && (i.codigo.toLowerCase().includes(posSearch.toLowerCase()) || i.descripcion.toLowerCase().includes(posSearch.toLowerCase()))
  ).slice(0, 10);

  const currentSubtotal = cart.reduce((acc, i) => acc + (i.cantidad * i.ventaUnit), 0);
  const currentIVA = currentSubtotal * 0.16;
  const currentTotal = currentSubtotal + currentIVA;

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    setCompanyData(company, 'TAB');
    alert('Datos de empresa actualizados para SUC. +TABLAROCA');
  };

  return (
    <div className="flex flex-col h-full space-y-4 lg:space-y-6">
      <div className="bg-indigo-900 rounded-2xl lg:rounded-[2rem] p-4 lg:p-8 text-white flex flex-col lg:flex-row justify-between items-center shadow-2xl relative overflow-hidden gap-4">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none hidden lg:block"><i className="fas fa-building text-9xl"></i></div>
        <div className="z-10 text-center lg:text-left flex flex-col lg:flex-row items-center gap-4">
          <div>
            <h2 className="text-xl lg:text-3xl font-black uppercase tracking-tighter">SUC. +TABLAROCA</h2>
            <p className="text-indigo-300 text-[8px] lg:text-[10px] font-black uppercase tracking-[0.3em] mt-1">Gestión Independiente | +Tablaroca</p>
          </div>
          <button 
            onClick={handleLoadCatalog}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[8px] lg:text-[9px] font-black uppercase tracking-widest transition-all shadow-lg border border-indigo-400/30"
          >
            <i className="fas fa-upload mr-2"></i> Cargar Catálogo
          </button>
        </div>
        <div className="flex gap-2 z-10 overflow-x-auto no-scrollbar pb-2 w-full lg:w-auto justify-start lg:justify-end">
          {(['POS', 'HISTORY', 'INVENTORY', 'PRODUCTS', 'QUOTES', 'SHIPPING', 'PURCHASING', 'COMPANY'] as TablarocaTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === tab ? 'bg-indigo-500 text-white shadow-xl' : 'bg-indigo-800 text-indigo-300 hover:text-white'
              }`}
            >
              {tab === 'POS' && 'Caja'}
              {tab === 'HISTORY' && 'Historial'}
              {tab === 'INVENTORY' && 'Existencias'}
              {tab === 'PRODUCTS' && 'Productos'}
              {tab === 'QUOTES' && 'Cotizador'}
              {tab === 'SHIPPING' && 'Envíos'}
              {tab === 'PURCHASING' && 'Compras'}
              {tab === 'COMPANY' && 'Empresa'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'POS' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8 h-full animate-in fade-in">
             <div className="lg:col-span-2 space-y-4 lg:space-y-6">
              <div className="bg-white p-4 lg:p-10 rounded-2xl lg:rounded-3xl border shadow-sm space-y-4 lg:space-y-8">
                <div className="relative">
                  <label className="block text-[8px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 lg:mb-3">Buscar por SKU o Nombre (+ ENTER)</label>
                  <div className="relative">
                    <i className="fas fa-search absolute left-4 lg:left-6 top-1/2 -translate-y-1/2 text-slate-300 text-lg lg:text-xl"></i>
                    <input 
                      type="text" 
                      value={posSearch} 
                      onChange={e => setPosSearch(e.target.value)} 
                      onKeyDown={handlePOSSearchKeyDown}
                      placeholder="SKU O DESCRIPCIÓN..." 
                      className="w-full pl-12 lg:pl-16 pr-4 lg:pr-8 py-4 lg:py-6 rounded-xl lg:rounded-2xl border-2 border-slate-50 outline-none focus:border-indigo-500 font-black text-base lg:text-xl uppercase shadow-inner" 
                    />
                  </div>
                  {posSearch && (
                    <div className="absolute z-50 w-full mt-2 bg-white border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in">
                      {filteredPOS.map(i => (
                        <div key={i.codigo} className="w-full p-6 text-left hover:bg-indigo-50 border-b flex justify-between items-center group transition-colors">
                          <div className="flex-1">
                            <p className="font-black text-lg text-slate-900 uppercase">{i.codigo} <span className="text-[10px] text-green-600 ml-2">En Stock: {i.cantidadFisica}</span></p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{i.descripcion}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <input type="number" value={searchQuantities[i.codigo] || 1} onChange={e => setSearchQuantities({...searchQuantities, [i.codigo]: parseFloat(e.target.value) || 1})} className="w-16 p-2 text-center border rounded-lg font-black" />
                            <div className="text-right min-w-[100px]">
                              <p className="font-black text-xl">$ {(salePrices[i.codigo] || 0).toLocaleString()}</p>
                              <button onClick={() => addToCart(i)} className="mt-1 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase">Añadir</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-2xl lg:rounded-[2.5rem] p-6 lg:p-8 flex flex-col shadow-2xl text-white">
               <h3 className="text-lg lg:text-xl font-black uppercase tracking-tighter mb-4 lg:mb-6 border-b border-slate-800 pb-4 flex items-center justify-between">
                 <span>Cuenta Actual</span>
                 <i className="fas fa-shopping-basket text-indigo-400"></i>
               </h3>
               
               <div className="flex-1 space-y-3 lg:space-y-4 overflow-y-auto pr-2 min-h-[200px] lg:min-h-[250px]">
                {cart.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600">
                    <i className="fas fa-ghost text-4xl mb-4"></i>
                    <p className="uppercase font-black text-xs">Caja vacía</p>
                  </div>
                )}
                {cart.map(item => (
                    <div key={item.id} className="flex justify-between items-center group bg-slate-800/40 p-3 rounded-xl border border-slate-800/50">
                      <div className="flex-1">
                        <p className="font-black text-xs uppercase text-indigo-400">{item.codigo}</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase truncate max-w-[140px]">{item.descripcion}</p>
                        <div className="flex gap-2 mt-2">
                           <input type="number" value={item.cantidad} onChange={e => updateCartQty(item.id, parseFloat(e.target.value) || 0)} className="bg-slate-800 w-14 text-[10px] font-black p-1 rounded text-center outline-none focus:ring-1 focus:ring-indigo-500" />
                           <span className="text-[10px] text-slate-400 font-bold">$ {item.ventaUnit.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-sm">$ {(item.cantidad * item.ventaUnit).toLocaleString()}</p>
                        <button onClick={() => setCart(cart.filter(c => c.id !== item.id))} className="text-[8px] text-red-400 font-black uppercase mt-1">Quitar</button>
                      </div>
                    </div>
                ))}
               </div>

               <div className="mt-6 space-y-4 border-t border-slate-800 pt-4">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Forma de Pago:</label>
                  <div className="grid grid-cols-3 gap-2">
                     {(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as PaymentMethod[]).map(m => (
                       <button key={m} onClick={() => setPaymentMethod(m)} className={`py-2 rounded-lg text-[8px] font-black uppercase border transition-all ${paymentMethod === m ? 'bg-indigo-500 text-white border-indigo-500 shadow-lg' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>{m}</button>
                     ))}
                  </div>
               </div>

               <div className="border-t border-slate-800 pt-6 mt-6 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase">
                    <span>Subtotal:</span>
                    <span>$ {currentSubtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase">
                    <span>IVA (16%):</span>
                    <span>$ {currentIVA.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between items-end mb-4 pt-2 border-t border-slate-800">
                    <span className="text-[8px] lg:text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total:</span>
                    <p className="text-2xl lg:text-4xl font-black text-white">$ {currentTotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                  </div>
                  <button onClick={handlePOSFinalize} disabled={cart.length === 0} className="w-full bg-indigo-500 text-white py-4 lg:py-5 rounded-xl lg:rounded-2xl font-black uppercase text-[10px] lg:text-xs shadow-xl active:scale-95 hover:bg-indigo-400 transition-all">Finalizar y Ticket PDF</button>
               </div>
            </div>
          </div>
        )}

        {showPriceTypeModal && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[700] p-4">
            <div className="bg-white rounded-3xl p-10 space-y-8 w-full max-w-md shadow-2xl border-4 border-white animate-in zoom-in duration-200">
               <div className="text-center">
                 <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                   <i className="fas fa-tags"></i>
                 </div>
                 <h4 className="text-2xl font-black uppercase tracking-tighter">Finalizar Venta</h4>
                 <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Seleccione el tipo de precios para esta venta</p>
               </div>

               <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={() => {
                      setPendingPriceType('WHOLESALE');
                      setShowPriceTypeModal(false);
                      const subtotal = cart.reduce((acc, i) => acc + (i.cantidad * (wholesalePrices[i.codigo] || i.ventaUnit)), 0);
                      const total = subtotal * 1.16;
                      setPaymentBreakdown([
                        { metodo: 'EFECTIVO', monto: total },
                        { metodo: 'TARJETA', monto: 0 },
                        { metodo: 'TRANSFERENCIA', monto: 0 }
                      ]);
                      setShowPaymentModal(true);
                    }}
                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-black transition-all flex items-center justify-between px-8"
                  >
                    <span>Aplicar Precios Mayoreo</span>
                    <i className="fas fa-star text-yellow-400"></i>
                  </button>
                  
                  <button 
                    onClick={() => {
                      setPendingPriceType('PUBLIC');
                      setShowPriceTypeModal(false);
                      const subtotal = cart.reduce((acc, i) => acc + (i.cantidad * (salePrices[i.codigo] || i.ventaUnit)), 0);
                      const total = subtotal * 1.16;
                      setPaymentBreakdown([
                        { metodo: 'EFECTIVO', monto: total },
                        { metodo: 'TARJETA', monto: 0 },
                        { metodo: 'TRANSFERENCIA', monto: 0 }
                      ]);
                      setShowPaymentModal(true);
                    }}
                    className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-between px-8"
                  >
                    <span>Aplicar Precios Público</span>
                    <i className="fas fa-users"></i>
                  </button>

                  <button 
                    onClick={() => {
                      setPendingPriceType('AS_IS');
                      setShowPriceTypeModal(false);
                      const subtotal = cart.reduce((acc, i) => acc + (i.cantidad * i.ventaUnit), 0);
                      const total = subtotal * 1.16;
                      setPaymentBreakdown([
                        { metodo: 'EFECTIVO', monto: total },
                        { metodo: 'TARJETA', monto: 0 },
                        { metodo: 'TRANSFERENCIA', monto: 0 }
                      ]);
                      setShowPaymentModal(true);
                    }}
                    className="w-full bg-slate-100 text-slate-600 py-5 rounded-2xl font-black uppercase text-xs hover:bg-slate-200 transition-all flex items-center justify-between px-8"
                  >
                    <span>Mantener Precios Actuales</span>
                    <i className="fas fa-check"></i>
                  </button>
               </div>

               <button 
                 onClick={() => setShowPriceTypeModal(false)}
                 className="w-full text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors"
               >
                 Cancelar / Seguir Editando
               </button>
            </div>
          </div>
        )}

        {showPaymentModal && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[700] p-4">
            {(() => {
              const totalDue = pendingPriceType ? (cart.reduce((acc, i) => acc + (i.cantidad * (pendingPriceType === 'WHOLESALE' ? (wholesalePrices[i.codigo] || i.ventaUnit) : pendingPriceType === 'PUBLIC' ? (salePrices[i.codigo] || i.ventaUnit) : i.ventaUnit)), 0) * 1.16) : 0;
              const totalPaid = paymentBreakdown.reduce((acc, p) => acc + p.monto, 0);
              const change = totalPaid > totalDue ? totalPaid - totalDue : 0;

              return (
                <div className="bg-white rounded-3xl p-10 space-y-8 w-full max-w-md shadow-2xl border-4 border-white animate-in zoom-in duration-200">
                   <div className="text-center">
                     <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                       <i className="fas fa-wallet"></i>
                     </div>
                     <h4 className="text-2xl font-black uppercase tracking-tighter">Forma de Pago</h4>
                     <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Total a Pagar: $ {totalDue.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                   </div>

                   <div className="space-y-4">
                      {paymentBreakdown.map((p, idx) => (
                        <div key={p.metodo} className="space-y-2">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{p.metodo}</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                            <input 
                              type="number" 
                              value={p.monto || ''} 
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                const newBreakdown = [...paymentBreakdown];
                                newBreakdown[idx].monto = val;
                                setPaymentBreakdown(newBreakdown);
                              }}
                              className="w-full pl-8 pr-4 py-4 rounded-2xl border-2 border-slate-50 outline-none focus:border-indigo-500 font-bold text-lg" 
                            />
                          </div>
                        </div>
                      ))}
                   </div>

                   <div className="pt-4 border-t">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Suma de Pagos:</span>
                        <span className={`text-lg font-black ${totalPaid >= totalDue - 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                          $ {totalPaid.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                        </span>
                      </div>

                      {change > 0 && (
                        <div className="flex justify-between items-center mb-6 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                          <span className="text-[10px] font-black text-indigo-600 uppercase">Cambio a entregar:</span>
                          <span className="text-xl font-black text-indigo-700">
                            $ {change.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                          </span>
                        </div>
                      )}

                      <button 
                        disabled={totalPaid < totalDue - 0.01}
                        onClick={() => {
                          if (pendingPriceType) {
                            executePOSFinalize(pendingPriceType, paymentBreakdown.filter(p => p.monto > 0));
                          }
                        }}
                        className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Confirmar Pago y Finalizar
                      </button>
                   </div>

                   <button 
                     onClick={() => setShowPaymentModal(false)}
                     className="w-full text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors"
                   >
                     Regresar
                   </button>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'HISTORY' && (
          <div className="bg-white p-8 rounded-3xl border shadow-sm animate-in fade-in">
             <div className="flex flex-col md:flex-row justify-between items-center mb-6 border-b pb-6 gap-4">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter">Historial de Ventas TABLAROCA</h3>
                  <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">Últimos 100 movimientos</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-2xl border">
                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1">Desde</label>
                    <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} className="text-xs font-bold p-2 rounded-lg border outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1">Hasta</label>
                    <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} className="text-xs font-bold p-2 rounded-lg border outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex gap-2 self-end">
                    <button onClick={handleExportExcel} className="bg-green-600 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase flex items-center gap-2 hover:bg-green-700 transition-all">
                      <i className="fas fa-file-excel"></i> Excel
                    </button>
                    <button onClick={handleExportTxt} className="bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase flex items-center gap-2 hover:bg-slate-800 transition-all">
                      <i className="fas fa-file-alt"></i> TXT
                    </button>
                  </div>
                </div>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                   <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                      <tr>
                        <th className="px-6 py-4">Fecha</th>
                        <th className="px-6 py-4">Folio</th>
                        <th className="px-6 py-4">Pago</th>
                        <th className="px-6 py-4 text-right">Subtotal</th>
                        <th className="px-6 py-4 text-right">IVA (16%)</th>
                        <th className="px-6 py-4 text-right">Total</th>
                        <th className="px-6 py-4 text-center">Ticket</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y text-xs font-bold uppercase">
                      {salesHistory.map(sale => (
                        <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                           <td className="px-6 py-4 text-slate-500 font-mono">{new Date(sale.fecha).toLocaleString('es-MX')}</td>
                           <td className="px-6 py-4 text-indigo-600 font-black">{sale.folio}</td>
                           <td className="px-6 py-4 font-black">{sale.metodoPago}</td>
                           <td className="px-6 py-4 text-right text-slate-400">$ {(sale.subtotal || sale.total/1.16).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                           <td className="px-6 py-4 text-right text-slate-400">$ {(sale.iva || (sale.total - (sale.total/1.16))).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                           <td className="px-6 py-4 text-right font-black text-sm">$ {sale.total.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                           <td className="px-6 py-4 text-center">
                             <button 
                                onClick={() => printTicketPDF({
                                  items: sale.items,
                                  folio: sale.folio,
                                  subtotal: sale.subtotal || sale.total / 1.16,
                                  iva: sale.iva || (sale.total - (sale.total/1.16)),
                                  total: sale.total,
                                  metodoPago: sale.metodoPago
                                })} 
                                className="text-slate-400 hover:text-indigo-600 transition-colors p-2"
                             >
                               <i className="fas fa-file-pdf text-lg"></i>
                             </button>
                           </td>
                        </tr>
                      ))}
                      {salesHistory.length === 0 && <tr><td colSpan={7} className="py-20 text-center text-slate-300 uppercase italic font-black">No hay ventas registradas</td></tr>}
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'INVENTORY' && <InventoryView currentUser={currentUser} forcedLocation="TAB" />}
        {activeTab === 'PRODUCTS' && <ProductManagementView currentUser={currentUser} location="TAB" />}
        {activeTab === 'QUOTES' && <AnalysisView currentUser={currentUser} partidas={quotePartidas} setPartidas={setQuotePartidas} selectedClient={quoteClient} setSelectedClient={setQuoteClient} quoteFolio={quoteFolio} setQuoteFolio={setQuoteFolio} sessionExpenses={quoteExpenses} setSessionExpenses={setQuoteExpenses} mode={quoteMode} setMode={setQuoteMode} onClear={() => { setQuotePartidas([]); setQuoteFolio(''); setQuoteClient(null); }} location="TAB" />}
        {activeTab === 'SHIPPING' && <DeliveryView currentUser={currentUser} items={shipItems} setItems={setShipItems} quoteNumber={shipFolio} setQuoteNumber={setShipFolio} comments={shipComments} setComments={setShipComments} selectedClient={shipClient} setSelectedClient={setShipClient} onClear={() => { setShipItems([]); setShipFolio(''); setShipClient(null); }} location="TAB" />}
        {activeTab === 'PURCHASING' && <PurchasingView currentUser={currentUser} branch="TAB" />}
        
        {activeTab === 'COMPANY' && (
          <div className="bg-white p-10 rounded-3xl border shadow-sm animate-in slide-in-from-bottom duration-500">
            <h3 className="text-2xl font-black uppercase tracking-tighter mb-8 flex items-center gap-3">
              <i className="fas fa-building text-indigo-600"></i> Configuración de Empresa (+TABLAROCA)
            </h3>
            <form onSubmit={handleSaveCompany} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Comercial</label>
                <input type="text" value={company.nombre} onChange={e => setCompany({...company, nombre: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-50 outline-none focus:border-indigo-500 font-bold" required />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">RFC</label>
                <input type="text" value={company.rfc} onChange={e => setCompany({...company, rfc: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-50 outline-none focus:border-indigo-500 font-bold uppercase" required />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección Fiscal</label>
                <input type="text" value={company.direccion} onChange={e => setCompany({...company, direccion: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-50 outline-none focus:border-indigo-500 font-bold" required />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                <input type="text" value={company.telefono} onChange={e => setCompany({...company, telefono: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-50 outline-none focus:border-indigo-500 font-bold" required />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico</label>
                <input type="email" value={company.correo} onChange={e => setCompany({...company, correo: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-50 outline-none focus:border-indigo-500 font-bold" required />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Leyenda en Documentos</label>
                <textarea value={company.leyenda} onChange={e => setCompany({...company, leyenda: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-50 outline-none focus:border-indigo-500 font-bold h-24" required />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-indigo-700 transition-all active:scale-95">Guardar Cambios</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* HIDDEN AREA FOR TICKET PDF */}
      <div id="pos-ticket-printable-tab" className={`fixed -left-[9999px] top-0 bg-white text-black p-6 w-[80mm] flex flex-col items-center font-mono ${isPrinting ? 'block' : 'hidden'}`}>
         <div className="text-center mb-4">
           {company.logoUrl && <img src={company.logoUrl} alt="Logo" className="w-16 h-16 object-contain mx-auto mb-2 grayscale" />}
           <h2 className="text-sm font-black uppercase leading-tight">{company.nombre}</h2>
           <p className="text-[8px] uppercase">{company.direccion}</p>
           <p className="text-[8px] uppercase">Sucursal +Tablaroca</p>
         </div>

         <div className="w-full border-t border-dashed border-black my-2"></div>
         <div className="w-full flex justify-between text-[8px] mb-1 font-black uppercase">
            <span>Folio: {lastTicket?.folio}</span>
            <span>{new Date().toLocaleDateString('es-MX')}</span>
         </div>
          <div className="w-full flex flex-col text-[8px] mb-2 font-black uppercase">
            <div className="flex justify-between">
              <span>Vend: {currentUser.username}</span>
            </div>
            <div className="mt-1 border-t border-black/10 pt-1">
              <span className="block mb-0.5">Formas de Pago:</span>
              {lastTicket?.pagos && lastTicket.pagos.length > 0 ? (
                lastTicket.pagos.map((p, idx) => (
                  <div key={idx} className="flex justify-between ml-2">
                    <span>- {p.metodo}:</span>
                    <span>$ {p.monto.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between ml-2">
                  <span>- {lastTicket?.metodoPago}:</span>
                  <span>$ {lastTicket?.total.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

         <table className="w-full text-[8px] border-collapse mb-2">
            <thead>
              <tr className="border-b border-black">
                <th className="text-left py-1">Item</th>
                <th className="text-center py-1">Cant</th>
                <th className="text-right py-1">Importe</th>
              </tr>
            </thead>
            <tbody>
              {lastTicket?.items.map((i, idx) => (
                <tr key={idx} className="align-top">
                  <td className="py-1 uppercase text-[7px] leading-tight pr-1">{i.codigo}</td>
                  <td className="text-center py-1">{i.cantidad}</td>
                  <td className="text-right py-1">$ {(i.cantidad * i.ventaUnit).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
         </table>

         <div className="w-full border-t border-dashed border-black my-2"></div>
         
         <div className="w-full space-y-0.5 text-[8px] uppercase">
            <div className="flex justify-between">
               <span>Subtotal:</span>
               <span>$ {(lastTicket?.subtotal ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
               <span>IVA (16%):</span>
               <span>$ {(lastTicket?.iva ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-xs pt-1 border-t border-black">
               <span>TOTAL:</span>
               <span>$ {(lastTicket?.total ?? 0).toFixed(2)}</span>
            </div>
            {lastTicket?.pagos && lastTicket.pagos.length > 0 && (
              <>
                <div className="flex justify-between pt-1">
                   <span>RECIBIDO:</span>
                   <span>$ {lastTicket.pagos.reduce((acc, p) => acc + p.monto, 0).toFixed(2)}</span>
                </div>
                {lastTicket.pagos.reduce((acc, p) => acc + p.monto, 0) > lastTicket.total && (
                  <div className="flex justify-between font-black">
                     <span>CAMBIO:</span>
                     <span>$ {(lastTicket.pagos.reduce((acc, p) => acc + p.monto, 0) - lastTicket.total).toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
         </div>

         <div className="mt-8 text-[7px] text-center italic uppercase leading-tight">
            <p className="font-black">¡Gracias por su compra!</p>
            <p className="mt-2">Favor de revisar su mercancía.</p>
            <p className="mt-4 font-black">*** Ticket sin valor fiscal ***</p>
         </div>
      </div>
    </div>
  );
};

export default TablarocaBranchView;
