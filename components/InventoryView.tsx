
import React, { useState, useEffect, useRef } from 'react';
import { InventarioItem, InventoryMovement, UserSession } from '../types';
import { 
  getStoredInventory, 
  setStoredInventory, 
  getInventoryMovements, 
  setInventoryMovements, 
  getStoredSalePrices, 
  setStoredSalePrices, 
  getStoredWholesalePrices,
  setStoredWholesalePrices,
  getCompanyData, 
  getInventoryAtDate 
} from '../utils/storage';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

interface InventoryViewProps {
  currentUser: UserSession;
  forcedLocation?: 'MAIN' | 'MZT' | 'TAB';
}

type AdjustmentType = 'CONTEO' | 'ENVIO' | 'COMPRA' | 'OTROS';

const InventoryView: React.FC<InventoryViewProps> = ({ currentUser, forcedLocation }) => {
  const isManuel = currentUser.username?.toLowerCase() === 'manuel';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [location, setLocation] = useState<'MAIN' | 'MZT' | 'TAB'>(forcedLocation || 'MAIN');
  const [activeTab, setActiveTab] = useState<'STOCK' | 'PRICES' | 'MOVEMENTS'>('STOCK');
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});
  const [salePrices, setSalePrices] = useState<Record<string, number>>({});
  const [wholesalePrices, setWholesalePrices] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [search, setSearch] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [isExporting, setIsExporting] = useState(false);

  // Estados para Ajuste de Inventario
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventarioItem | null>(null);
  const [targetQty, setTargetQty] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<AdjustmentType>('CONTEO');
  const [adjustRef, setAdjustRef] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newProd, setNewProd] = useState({ codigo: '', descripcion: '', precio: 0, precioMayoreo: 0, weight: 0 });

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showStockImportModal, setShowStockImportModal] = useState(false);
  const [showPriceImportModal, setShowPriceImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [priceImportText, setPriceImportText] = useState('');
  const [adjustmentPercent, setAdjustmentPercent] = useState<string>('0');
  const [adjustmentTarget, setAdjustmentTarget] = useState<'PÚBLICO' | 'MAYOREO' | 'AMBOS'>('PÚBLICO');

  const company = getCompanyData(location);

  useEffect(() => { refreshData(); }, [location, reportDate, activeTab]);

  const refreshData = () => {
    setInventory(getInventoryAtDate(reportDate, location));
    setSalePrices(getStoredSalePrices(location));
    setWholesalePrices(getStoredWholesalePrices(location));
    setMovements(getInventoryMovements()
      .filter(m => m.referencia.includes(`(${location})`))
      .sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    );
  };

  const updatePrice = (codigo: string, precio: number, type: 'PUBLIC' | 'WHOLESALE') => {
    if (isManuel) return;
    if (type === 'PUBLIC') {
      const updated = { ...salePrices, [codigo]: precio };
      setSalePrices(updated);
      setStoredSalePrices(updated, location);
    } else {
      const updated = { ...wholesalePrices, [codigo]: precio };
      setWholesalePrices(updated);
      setStoredWholesalePrices(updated, location);
    }
  };

  const toggleHideMaterial = (codigo: string) => {
    const currentInv = getStoredInventory(location);
    if (currentInv[codigo]) {
      currentInv[codigo].oculto = !currentInv[codigo].oculto;
      setStoredInventory(currentInv, location);
      refreshData();
    }
  };

  const handleBulkAdjustment = () => {
    const factor = 1 + (parseFloat(adjustmentPercent) / 100);
    
    if (adjustmentTarget === 'PÚBLICO' || adjustmentTarget === 'AMBOS') {
      const updated = { ...salePrices };
      Object.keys(updated).forEach(k => updated[k] = parseFloat((updated[k] * factor).toFixed(2)));
      setSalePrices(updated);
      setStoredSalePrices(updated, location);
    }
    
    if (adjustmentTarget === 'MAYOREO' || adjustmentTarget === 'AMBOS') {
      const updated = { ...wholesalePrices };
      Object.keys(updated).forEach(k => updated[k] = parseFloat((updated[k] * factor).toFixed(2)));
      setWholesalePrices(updated);
      setStoredWholesalePrices(updated, location);
    }

    setShowBulkModal(false);
    setAdjustmentPercent('0');
  };

  const handleStockBulkImport = () => {
    const lines = importText.split('\n');
    const currentInv = getStoredInventory(location);
    let updatedCount = 0;
    let errorCount = 0;
    const newMovements: InventoryMovement[] = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // Split by tab, comma or space
      const parts = trimmed.split(/[\t,;]/);
      if (parts.length < 2) return;

      const sku = parts[0].trim().toUpperCase();
      const qty = parseFloat(parts[1].trim());

      if (currentInv[sku] && !isNaN(qty)) {
        const oldQty = currentInv[sku].cantidadFisica;
        const diff = qty - oldQty;
        
        if (diff !== 0) {
          currentInv[sku].cantidadFisica = qty;
          currentInv[sku].fechaToma = new Date().toLocaleDateString();

          newMovements.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            sku: sku,
            cantidad: Math.abs(diff),
            tipo: diff > 0 ? 'IN' : 'OUT',
            fecha: new Date().toISOString(),
            referencia: `Importación Masiva (${location})`
          });
          updatedCount++;
        }
      } else {
        errorCount++;
      }
    });

    if (updatedCount > 0) {
      setStoredInventory(currentInv, location);
      const currentMovements = getInventoryMovements();
      setInventoryMovements([...newMovements, ...currentMovements]);
      alert(`Se actualizaron ${updatedCount} productos. ${errorCount > 0 ? `No se encontraron ${errorCount} SKUs.` : ''}`);
      setShowStockImportModal(false);
      setImportText('');
      refreshData();
    } else {
      alert("No se procesó ningún cambio. Verifique que los SKUs existan y el formato sea correcto (SKU [TAB] CANTIDAD).");
    }
  };

  const downloadStockTemplate = () => {
    const data = (Object.values(inventory) as InventarioItem[]).map(i => ({
      "CÓDIGO": i.codigo,
      "DESCRIPCIÓN": i.descripcion,
      "NUEVA_EXISTENCIA": 0
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, `Plantilla_Inventario_${location}.xlsx`);
  };

  const handlePriceBulkImport = () => {
    const lines = priceImportText.split('\n');
    const updatedSalePrices = { ...salePrices };
    const updatedWholesalePrices = { ...wholesalePrices };
    let count = 0;
    let errorCount = 0;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      const parts = trimmed.split(/[\t,;]/);
      if (parts.length < 2) return;

      const sku = parts[0].trim().toUpperCase();
      const publicPrice = parseFloat(parts[1]?.trim() || "0");
      const wholesalePrice = parseFloat(parts[2]?.trim() || parts[1]?.trim() || "0"); // If only 2 columns, use same price

      if (sku && !isNaN(publicPrice)) {
        updatedSalePrices[sku] = publicPrice;
        updatedWholesalePrices[sku] = wholesalePrice;
        count++;
      } else {
        errorCount++;
      }
    });

    if (count > 0) {
      setStoredSalePrices(updatedSalePrices, location);
      setStoredWholesalePrices(updatedWholesalePrices, location);
      setSalePrices(updatedSalePrices);
      setWholesalePrices(updatedWholesalePrices);
      alert(`Se actualizaron precios de ${count} productos. ${errorCount > 0 ? `Se omitieron ${errorCount} líneas inválidas.` : ''}`);
      setShowPriceImportModal(false);
      setPriceImportText('');
      refreshData();
    } else {
      alert("No se procesó ningún cambio. Verifique el formato (SKU [TAB] P.PUBLICO [TAB] P.MAYOREO).");
    }
  };

  const downloadPriceTemplate = () => {
    const data = (Object.values(inventory) as InventarioItem[]).map(i => ({
      "CÓDIGO": i.codigo,
      "DESCRIPCIÓN": i.descripcion,
      "PRECIO_PUBLICO": salePrices[i.codigo] || 0,
      "PRECIO_MAYOREO": wholesalePrices[i.codigo] || 0
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Precios");
    XLSX.writeFile(wb, `Plantilla_Precios_${location}.xlsx`);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const updatedSalePrices = { ...salePrices };
        const updatedWholesalePrices = { ...wholesalePrices };
        let count = 0;

        data.forEach(row => {
          const code = (row["CÓDIGO"] || row["codigo"] || row["Codigo"])?.toString().toUpperCase().trim();
          const publicPrice = parseFloat(row["P. PÚBLICO"] || row["p. publico"] || row["Precio Publico"] || 0);
          const wholesalePrice = parseFloat(row["P. MAYOREO"] || row["p. mayoreo"] || row["Precio Mayoreo"] || 0);

          if (code) {
            updatedSalePrices[code] = publicPrice;
            updatedWholesalePrices[code] = wholesalePrice;
            count++;
          }
        });

        setStoredSalePrices(updatedSalePrices, location);
        setStoredWholesalePrices(updatedWholesalePrices, location);
        setSalePrices(updatedSalePrices);
        setWholesalePrices(updatedWholesalePrices);
        alert(`Se han actualizado ${count} productos correctamente.`);
        refreshData();
      } catch (err) {
        console.error(err);
        alert("Error al procesar el archivo Excel. Verifique el formato.");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsBinaryString(file);
  };

  const handleAddNewProduct = () => {
    const code = newProd.codigo.toUpperCase();
    const newItem: InventarioItem = {
      codigo: code,
      descripcion: newProd.descripcion.toUpperCase(),
      pesoUnitario: newProd.weight,
      cantidadFisica: 0,
      fechaToma: new Date().toLocaleDateString(),
      observaciones: "Alta manual",
      oculto: false
    };
    const updatedInv = { ...getStoredInventory(location), [code]: newItem };
    setStoredInventory(updatedInv, location);
    updatePrice(code, newProd.precio, 'PUBLIC');
    updatePrice(code, newProd.precioMayoreo, 'WHOLESALE');
    setNewProd({ codigo: '', descripcion: '', precio: 0, precioMayoreo: 0, weight: 0 });
    setShowAddModal(false);
    refreshData();
  };

  const openAdjustment = (item: InventarioItem) => {
    setAdjustItem(item);
    setTargetQty(item.cantidadFisica);
    setAdjustType('CONTEO');
    setAdjustRef('');
    setShowAdjustModal(true);
  };

  const finalizeAdjustment = () => {
    if (!adjustItem) return;
    
    const diff = targetQty - adjustItem.cantidadFisica;
    if (diff === 0) {
      setShowAdjustModal(false);
      return;
    }

    const currentInv = getStoredInventory(location);
    const updated = { 
      ...currentInv, 
      [adjustItem.codigo]: { ...adjustItem, cantidadFisica: targetQty, fechaToma: new Date().toLocaleDateString() } 
    };
    
    const reasonText = 
      adjustType === 'CONTEO' ? 'Discrepancia en conteo' :
      adjustType === 'ENVIO' ? `Envío (Folio: ${adjustRef})` :
      adjustType === 'COMPRA' ? `Compra (Ref: ${adjustRef})` :
      `Ajuste Manual: ${adjustRef}`;

    const movement: InventoryMovement = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      sku: adjustItem.codigo,
      cantidad: Math.abs(diff),
      tipo: diff > 0 ? 'IN' : 'OUT',
      fecha: new Date().toISOString(),
      referencia: `${reasonText} (${location})`
    };

    setStoredInventory(updated, location);
    const currentMovements = getInventoryMovements();
    setInventoryMovements([movement, ...currentMovements]);
    
    setShowAdjustModal(false);
    refreshData();
  };

  const deleteMaterial = (codigo: string) => {
    if (confirm(`¿Estás seguro de eliminar el material ${codigo} del catálogo?`)) {
      const currentInv = getStoredInventory(location);
      const { [codigo]: _, ...rest } = currentInv;
      setStoredInventory(rest, location);
      refreshData();
    }
  };

  const formatReportDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', 
      month: 'long', 
      year: 'numeric'
    });
  };

  const exportToExcel = () => {
    const data = (Object.values(inventory) as InventarioItem[])
      .filter(i => !i.oculto)
      .map(item => ({
        "CÓDIGO": item.codigo,
        "DESCRIPCIÓN": item.descripcion,
        "EXISTENCIA": item.cantidadFisica,
        "PESO U. (KG)": item.pesoUnitario,
        "P. PÚBLICO": salePrices[item.codigo] || 0,
        "P. MAYOREO": wholesalePrices[item.codigo] || 0
      }));

    const ws = XLSX.utils.json_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [
      [company.nombre],
      [`REPORTE DE INVENTARIO - SUCURSAL: ${location === 'MAIN' ? 'MOCHIS' : (location === 'MZT' ? 'MAZATLÁN' : 'TABLAROCA')}`],
      [`FECHA DE CORTE: ${formatReportDate(reportDate).toUpperCase()}`],
      [""],
    ], { origin: "A1" });

    XLSX.utils.sheet_add_json(ws, data, { origin: "A5", skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, `Inventario_${location}_Corte_${reportDate}.xlsx`);
  };

  const exportToPDF = async (targetId: string, fileName: string) => {
    const element = document.getElementById(targetId);
    if (!element) return;
    setIsExporting(true);
    window.scrollTo(0, 0);
    
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
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasHeightInPdf = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = canvasHeightInPdf;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, canvasHeightInPdf);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - canvasHeightInPdf;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, canvasHeightInPdf);
        heightLeft -= pdfHeight;
      }

      pdf.save(`${fileName}_${location}_${reportDate}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const filteredItems = (Object.values(inventory) as InventarioItem[]).filter(item => {
    const matchesSearch = item.codigo.toLowerCase().includes(search.toLowerCase()) || 
                          item.descripcion.toLowerCase().includes(search.toLowerCase());
    if (activeTab === 'STOCK') {
      return matchesSearch && !item.oculto;
    }
    return matchesSearch;
  });

  const visibleItems = (Object.values(inventory) as InventarioItem[])
    .filter(item => !item.oculto)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  return (
    <div className="space-y-6">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleExcelImport} 
        accept=".xlsx, .xls, .csv" 
        className="hidden" 
      />
      {!forcedLocation && !isManuel && (
        <div className="bg-slate-900 p-1.5 lg:p-2 rounded-2xl flex shadow-xl w-full lg:max-w-md mx-auto no-pdf overflow-x-auto no-scrollbar">
          <button onClick={() => setLocation('MAIN')} className={`flex-1 py-2 lg:py-3 rounded-lg lg:rounded-xl font-black text-[8px] lg:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap px-3 ${location === 'MAIN' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Principal (Mochis)</button>
          <button onClick={() => setLocation('MZT')} className={`flex-1 py-2 lg:py-3 rounded-lg lg:rounded-xl font-black text-[8px] lg:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap px-3 ${location === 'MZT' ? 'bg-cyan-500 text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Suc. Mazatlán</button>
          <button onClick={() => setLocation('TAB')} className={`flex-1 py-2 lg:py-3 rounded-lg lg:rounded-xl font-black text-[8px] lg:text-[10px] uppercase tracking-widest transition-all whitespace-nowrap px-3 ${location === 'TAB' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Suc. +Tablaroca</button>
        </div>
      )}

      <div className="bg-white p-4 lg:p-6 rounded-2xl border shadow-sm flex flex-col lg:flex-row justify-between items-center gap-4 no-pdf">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-full lg:w-auto overflow-x-auto no-scrollbar">
           <button onClick={() => setActiveTab('STOCK')} className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'STOCK' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Existencias</button>
           {!isManuel && (
             <button onClick={() => setActiveTab('PRICES')} className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'PRICES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Catálogo de Precios</button>
           )}
           <button onClick={() => setActiveTab('MOVEMENTS')} className={`flex-1 lg:flex-none px-4 py-2 rounded-lg text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'MOVEMENTS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Movimientos</button>
        </div>
        <div className="flex flex-col lg:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="flex gap-2 w-full lg:w-auto justify-center lg:justify-start">
            <button onClick={exportToExcel} className="flex-1 lg:flex-none p-3 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-all border border-green-100" title="Exportar a Excel">
              <i className="fas fa-file-excel"></i>
            </button>
            <button 
              onClick={() => {
                if (activeTab === 'PRICES') exportToPDF('price-catalog-pdf', 'Catalogo_Precios');
                else exportToPDF('inventory-report-pdf', 'Inventario');
              }} 
              className="flex-1 lg:flex-none p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all border border-red-100" 
              title="Exportar a PDF"
            >
              <i className="fas fa-file-pdf"></i>
            </button>
          </div>
          <div className="relative w-full lg:w-64">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-xs font-bold uppercase outline-none focus:border-blue-500" />
          </div>
        </div>
      </div>

      {activeTab === 'PRICES' && (
        <div className="space-y-4 lg:space-y-6 animate-in fade-in">
           <div className="flex flex-col lg:flex-row justify-between items-center bg-white p-4 lg:p-6 rounded-2xl border shadow-sm gap-4 no-pdf">
            <div className="text-center lg:text-left">
              <p className="text-[8px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest">Edición de Precios ({location === 'MAIN' ? 'Mochis' : 'Mazatlán'})</p>
            </div>
            <div className="flex flex-wrap justify-center lg:justify-end gap-2 w-full lg:w-auto">
              <button onClick={() => setShowPriceImportModal(true)} className="flex-1 lg:flex-none bg-indigo-50 text-indigo-600 border border-indigo-100 px-4 lg:px-6 py-2.5 lg:py-3 rounded-xl font-black text-[8px] lg:text-[10px] uppercase hover:bg-indigo-100 transition-all flex items-center justify-center gap-2">
                <i className="fas fa-paste"></i> Importar Masivo
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex-1 lg:flex-none bg-emerald-50 text-emerald-600 border border-emerald-100 px-4 lg:px-6 py-2.5 lg:py-3 rounded-xl font-black text-[8px] lg:text-[10px] uppercase hover:bg-emerald-100 transition-all flex items-center justify-center gap-2">
                <i className="fas fa-file-excel"></i> Excel
              </button>
              <button onClick={() => setShowBulkModal(true)} className="flex-1 lg:flex-none bg-slate-100 text-slate-600 px-4 lg:px-6 py-2.5 lg:py-3 rounded-xl font-black text-[8px] lg:text-[10px] uppercase hover:bg-slate-200 transition-all">Ajuste %</button>
              <button onClick={() => setShowAddModal(true)} className="flex-1 lg:flex-none bg-blue-600 text-white px-4 lg:px-6 py-2.5 lg:py-3 rounded-xl font-black text-[8px] lg:text-[10px] uppercase shadow-lg hover:bg-blue-700 transition-all">Nuevo</button>
            </div>
          </div>

          <div className="bg-white p-4 lg:p-8 border shadow-2xl rounded-2xl lg:rounded-sm w-full mx-auto overflow-x-auto">
            <table className="w-full border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-800 uppercase bg-slate-50">
                  <th className="py-2 lg:py-4 text-left text-[8pt] lg:text-[9pt] font-black w-[15%] px-2">Código</th>
                  <th className="py-2 lg:py-4 text-left text-[8pt] lg:text-[9pt] font-black w-[35%] px-2">Descripción</th>
                  <th className="py-2 lg:py-4 text-right text-[8pt] lg:text-[9pt] font-black w-[15%] px-2">P. Público ($)</th>
                  <th className="py-2 lg:py-4 text-right text-[8pt] lg:text-[9pt] font-black w-[15%] px-2">P. Mayoreo ($)</th>
                  <th className="py-2 lg:py-4 text-center text-[8pt] lg:text-[9pt] font-black no-pdf w-[15%] px-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 uppercase">
                {filteredItems.map(item => (
                  <tr key={item.codigo} className={`hover:bg-slate-50 group ${item.oculto ? 'opacity-40' : ''}`}>
                    <td className="py-3 px-2 text-[9pt] lg:text-[10pt] font-bold">{item.codigo}</td>
                    <td className="py-3 px-2 text-[8pt] lg:text-[9pt] text-slate-500">{item.descripcion}</td>
                    <td className="py-3 px-2 text-right">
                       <input 
                        type="number" step="any"
                        value={salePrices[item.codigo] || 0} 
                        onChange={e => updatePrice(item.codigo, parseFloat(e.target.value) || 0, 'PUBLIC')} 
                        className="w-20 lg:w-24 text-right py-1.5 px-2 font-black text-blue-700 bg-slate-50 border border-slate-100 rounded-lg outline-none focus:border-blue-500 text-xs lg:text-sm" 
                       />
                    </td>
                    <td className="py-3 px-2 text-right">
                       <input 
                        type="number" step="any"
                        value={wholesalePrices[item.codigo] || 0} 
                        onChange={e => updatePrice(item.codigo, parseFloat(e.target.value) || 0, 'WHOLESALE')} 
                        className="w-20 lg:w-24 text-right py-1.5 px-2 font-black text-green-700 bg-slate-50 border border-slate-100 rounded-lg outline-none focus:border-green-500 text-xs lg:text-sm" 
                       />
                    </td>
                    <td className="py-3 px-2 text-center no-pdf">
                        <div className="flex justify-center gap-1">
                          <button 
                            onClick={() => toggleHideMaterial(item.codigo)} 
                            className={`p-2 transition-colors ${item.oculto ? 'text-slate-400' : 'text-blue-500 hover:text-blue-700'}`}
                            title={item.oculto ? "Mostrar en listas" : "Ocultar de listas"}
                          >
                            <i className={`fas ${item.oculto ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                          </button>
                          <button 
                            onClick={() => deleteMaterial(item.codigo)} 
                            className="text-red-300 hover:text-red-600 transition-colors p-2"
                            title="Eliminar material"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'STOCK' && (
        <div className="bg-white p-4 lg:p-8 rounded-2xl border shadow-sm animate-in fade-in">
           <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="font-black uppercase text-slate-800 text-center lg:text-left text-sm lg:text-base">Existencias en Almacén ({location === 'MAIN' ? 'Mochis' : (location === 'MZT' ? 'Mazatlán' : 'Tablaroca')})</h3>
                <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 w-full lg:w-auto">
                  <button onClick={() => setShowStockImportModal(true)} className="flex-1 lg:flex-none bg-indigo-50 text-indigo-600 px-4 py-2.5 rounded-xl font-black text-[8px] lg:text-[10px] uppercase hover:bg-indigo-100 transition-all border border-indigo-100 flex items-center justify-center gap-2">
                    <i className="fas fa-file-import"></i> Importar Masivo
                  </button>
                  <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="flex-1 lg:flex-none p-2.5 border rounded-xl font-black text-[10px] uppercase outline-none focus:border-blue-500" />
                </div>
           </div>
           <div className="overflow-x-auto">
             <table className="w-full min-w-[500px]">
                <thead><tr className="border-b text-[9px] lg:text-[10px] font-black uppercase text-slate-400"><th className="py-4 text-left px-2">Producto</th><th className="py-4 text-center px-2">Físico Actual</th><th className="py-4 text-right px-2">Acción</th></tr></thead>
                <tbody className="divide-y uppercase text-xs font-bold">
                  {filteredItems.map(item => (
                     <tr key={item.codigo}>
                       <td className="py-4 px-2"><p className="font-black text-xs lg:text-sm">{item.codigo}</p><p className="text-[8px] lg:text-[10px] text-slate-400">{item.descripcion}</p></td>
                       <td className="py-4 px-2 text-center font-black text-blue-600 text-base lg:text-lg">{item.cantidadFisica}</td>
                       <td className="py-4 px-2 text-right">
                         <button onClick={() => openAdjustment(item)} className="bg-slate-900 text-white px-3 lg:px-4 py-2 rounded-lg font-black text-[8px] lg:text-[9px] uppercase hover:bg-black transition-all">Actualizar</button>
                       </td>
                     </tr>
                  ))}
                </tbody>
             </table>
           </div>
        </div>
      )}

      {activeTab === 'MOVEMENTS' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden animate-in fade-in">
           <div className="overflow-x-auto">
             <table className="w-full text-left min-w-[700px]">
               <thead className="bg-slate-900 text-white text-[8px] lg:text-[9px] font-black uppercase tracking-widest">
                 <tr><th className="px-4 lg:px-6 py-4">Fecha</th><th className="px-4 lg:px-6 py-4">SKU</th><th className="px-4 lg:px-6 py-4 text-center">Tipo</th><th className="px-4 lg:px-6 py-4 text-center">Cant</th><th className="px-4 lg:px-6 py-4">Referencia / Motivo</th></tr>
               </thead>
               <tbody className="divide-y divide-slate-100 text-[10px] lg:text-xs font-bold uppercase">
                 {movements.slice(0, 100).map(m => (
                 <tr key={m.id}>
                   <td className="px-6 py-4 text-slate-400">{new Date(m.fecha).toLocaleString()}</td>
                   <td className="px-6 py-4 font-black">{m.sku}</td>
                   <td className="px-6 py-4 text-center">
                     <span className={`px-2 py-0.5 rounded text-[9px] font-black ${m.tipo === 'IN' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{m.tipo}</span>
                   </td>
                   <td className="px-6 py-4 text-center font-black">{m.cantidad}</td>
                   <td className="px-6 py-4 text-slate-500 italic">{m.referencia}</td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
        </div>
      )}

      {/* MODAL AJUSTE DE EXISTENCIAS */}
      {showAdjustModal && adjustItem && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[700] p-4">
          <div className="bg-white rounded-3xl p-10 space-y-6 w-full max-w-md shadow-2xl border-4 border-white animate-in zoom-in duration-200">
             <div className="text-center">
               <h4 className="text-2xl font-black uppercase tracking-tighter">Actualizar Stock</h4>
               <p className="text-[10px] font-black text-blue-600 uppercase mt-1">{adjustItem.codigo}</p>
             </div>

             <div className="space-y-4">
                <div>
                   <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block ml-1">Nueva Cantidad Física</label>
                   <input 
                      type="number" 
                      autoFocus
                      value={targetQty} 
                      onChange={e => setTargetQty(parseFloat(e.target.value) || 0)} 
                      className="w-full p-4 border rounded-2xl font-black text-2xl text-center bg-slate-50 shadow-inner" 
                   />
                </div>

                <div>
                   <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block ml-1">Motivo del Ajuste</label>
                   <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setAdjustType('CONTEO')} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${adjustType === 'CONTEO' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>Discrepancia</button>
                      <button onClick={() => setAdjustType('ENVIO')} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${adjustType === 'ENVIO' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>Envío</button>
                      <button onClick={() => setAdjustType('COMPRA')} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${adjustType === 'COMPRA' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>Compra</button>
                      <button onClick={() => setAdjustType('OTROS')} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${adjustType === 'OTROS' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>Otros</button>
                   </div>
                </div>

                {(adjustType !== 'CONTEO') && (
                  <div className="animate-in slide-in-from-top-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block ml-1">Detalle (Folio / Motivo)</label>
                    <input 
                      type="text" 
                      value={adjustRef || ""} 
                      onChange={e => setAdjustRef(e.target.value.toUpperCase())} 
                      className="w-full p-3 border rounded-xl font-bold uppercase text-xs shadow-inner" 
                      placeholder={adjustType === 'ENVIO' ? "Ingrese Folio..." : "Ingrese Motivo..."}
                    />
                  </div>
                )}
             </div>

             <div className="flex flex-col gap-3 pt-4">
                <button onClick={finalizeAdjustment} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-black transition-all">Confirmar Actualización</button>
                <button onClick={() => setShowAdjustModal(false)} className="w-full bg-slate-100 text-slate-500 py-4 rounded-2xl font-black uppercase text-xs">Cancelar</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTACIÓN MASIVA DE STOCK */}
      {showStockImportModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[700] p-4">
          <div className="bg-white rounded-3xl p-8 space-y-6 w-full max-w-2xl shadow-2xl border-4 border-white animate-in zoom-in duration-200">
             <div className="text-center">
               <h4 className="text-2xl font-black uppercase tracking-tighter">Importar Existencias ({location})</h4>
               <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Pegue columnas desde Excel (SKU y Cantidad)</p>
             </div>

             <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black text-slate-400 uppercase block ml-1">Datos a Importar (SKU [TAB] CANTIDAD)</label>
                  <button onClick={downloadStockTemplate} className="text-blue-600 text-[9px] font-black uppercase hover:underline">Descargar Plantilla Excel</button>
                </div>
                <textarea 
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder="EJEMPLO:&#10;POSTE4	50&#10;CANAL3	120"
                  className="w-full h-64 p-4 border rounded-2xl font-mono text-sm bg-slate-50 shadow-inner outline-none focus:border-indigo-500"
                />
                <p className="text-[9px] font-bold text-slate-400 italic">* Solo se actualizarán productos que ya existan en el catálogo. Se generará un movimiento de ajuste automático.</p>
             </div>

             <div className="flex flex-col md:flex-row gap-3 pt-4">
                <button onClick={() => setShowStockImportModal(false)} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black uppercase text-xs">Cancelar</button>
                <button onClick={handleStockBulkImport} className="flex-2 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-indigo-700 transition-all">Procesar Importación</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTACIÓN MASIVA DE PRECIOS */}
      {showPriceImportModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[700] p-4">
          <div className="bg-white rounded-3xl p-8 space-y-6 w-full max-w-2xl shadow-2xl border-4 border-white animate-in zoom-in duration-200">
             <div className="text-center">
               <h4 className="text-2xl font-black uppercase tracking-tighter">Importar Catálogo de Precios ({location})</h4>
               <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Pegue columnas desde Excel (SKU, P.Público, P.Mayoreo)</p>
             </div>

             <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black text-slate-400 uppercase block ml-1">Datos a Importar (SKU [TAB] P.PÚB [TAB] P.MAY)</label>
                  <button onClick={downloadPriceTemplate} className="text-blue-600 text-[9px] font-black uppercase hover:underline">Descargar Plantilla Precios</button>
                </div>
                <textarea 
                  value={priceImportText}
                  onChange={e => setPriceImportText(e.target.value)}
                  placeholder="EJEMPLO:&#10;POSTE4	150.50	140.00&#10;CANAL3	95.00	88.00"
                  className="w-full h-64 p-4 border rounded-2xl font-mono text-sm bg-slate-50 shadow-inner outline-none focus:border-indigo-500"
                />
                <p className="text-[9px] font-bold text-slate-400 italic">* Si solo pega 2 columnas, el precio de mayoreo será igual al público. Solo se actualizan productos existentes.</p>
             </div>

             <div className="flex flex-col md:flex-row gap-3 pt-4">
                <button onClick={() => setShowPriceImportModal(false)} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black uppercase text-xs">Cancelar</button>
                <button onClick={handlePriceBulkImport} className="flex-2 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-indigo-700 transition-all">Actualizar Precios</button>
             </div>
          </div>
        </div>
      )}

      {/* ÁREA OCULTA PARA PDF DE EXISTENCIAS (ARIAL 10) */}
      <div id="inventory-report-pdf" className="fixed -left-[9999px] top-0 bg-white p-12 w-[210mm] flex flex-col space-y-4" style={{ fontFamily: 'Arial, sans-serif' }}>
        <div className="flex justify-between border-b-2 border-slate-900 pb-6 items-center">
          <div className="flex gap-4 items-center">
            {company.logoUrl && <img src={company.logoUrl} alt="Logo" className="w-16 h-16 object-contain" />}
            <div>
              <h2 className="text-xl font-black uppercase leading-none" style={{ fontFamily: 'Arial, sans-serif' }}>{company.nombre}</h2>
              <p className="text-[9pt] font-bold text-slate-500 uppercase mt-1 tracking-widest">Reporte de Inventario - Sucursal {location === 'MAIN' ? 'Mochis' : (location === 'MZT' ? 'Mazatlán' : 'Tablaroca')}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8pt] font-black text-slate-400 uppercase tracking-widest mb-1">Corte Seleccionado:</p>
            <p className="text-[11pt] font-black uppercase text-blue-600">{formatReportDate(reportDate)}</p>
          </div>
        </div>

        <div className="w-full flex justify-center py-2">
            <table className="w-[98%] text-left border-collapse" style={{ fontSize: '10pt', fontFamily: 'Arial, sans-serif' }}>
              <thead>
                <tr className="border-b border-slate-800 uppercase font-black text-[8pt] text-slate-600 bg-slate-50">
                  <th className="py-2 px-2">CÓDIGO</th>
                  <th className="py-2 px-2">DESCRIPCIÓN</th>
                  <th className="py-2 px-2 text-center">CANT.</th>
                  <th className="py-2 px-2 text-center">PESO U.</th>
                  <th className="py-2 px-2 text-right">PRECIO PÚB.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map(item => (
                  <tr key={item.codigo}>
                    <td className="py-1.5 px-2 font-black text-slate-900">{item.codigo}</td>
                    <td className="py-1.5 px-2 uppercase text-slate-500 truncate max-w-[280px]">{item.descripcion}</td>
                    <td className="py-1.5 px-2 text-center font-black text-blue-700">{item.cantidadFisica}</td>
                    <td className="py-1.5 px-2 text-center text-slate-400">{(item.pesoUnitario ?? 0).toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right font-black">$ {(salePrices[item.codigo] || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
        <div className="mt-auto pt-12 flex justify-between items-end opacity-40 border-t border-slate-100">
           <p className="text-[7pt] font-black uppercase tracking-widest italic">Documento de control interno GML. Verificado por sistema central.</p>
           <div className="text-center w-48">
             <div className="border-t border-slate-900 mb-1"></div>
             <p className="text-[7pt] font-black uppercase">Firma Almacenista</p>
           </div>
        </div>
      </div>

      {/* ÁREA OCULTA PARA PDF DE CATÁLOGO DE PRECIOS (ARIAL 10) */}
      <div id="price-catalog-pdf" className="fixed -left-[9999px] top-0 bg-white p-12 w-[210mm] flex flex-col space-y-4" style={{ fontFamily: 'Arial, sans-serif' }}>
        <div className="flex justify-between border-b-2 border-slate-900 pb-6 items-center">
          <div className="flex gap-4 items-center">
            {company.logoUrl && <img src={company.logoUrl} alt="Logo" className="w-16 h-16 object-contain" />}
            <div>
              <h2 className="text-xl font-black uppercase leading-none" style={{ fontFamily: 'Arial, sans-serif' }}>{company.nombre}</h2>
              <p className="text-[9pt] font-bold text-slate-500 uppercase mt-1 tracking-widest">Catálogo de Precios de Venta - Sucursal {location === 'MAIN' ? 'Mochis' : (location === 'MZT' ? 'Mazatlán' : 'Tablaroca')}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8pt] font-black text-slate-400 uppercase tracking-widest mb-1">Fecha de Emisión:</p>
            <p className="text-[11pt] font-black uppercase text-indigo-600">{new Date().toLocaleDateString('es-MX', {day: '2-digit', month: 'long', year: 'numeric'})}</p>
          </div>
        </div>

        <div className="w-full flex justify-center py-2">
            <table className="w-[100%] text-left border-collapse" style={{ fontSize: '10pt', fontFamily: 'Arial, sans-serif' }}>
              <thead>
                <tr className="border-b border-slate-800 uppercase font-black text-[8pt] text-slate-600 bg-slate-50">
                  <th className="py-2 px-2">CÓDIGO</th>
                  <th className="py-2 px-2">DESCRIPCIÓN DEL MATERIAL</th>
                  <th className="py-2 px-2 text-right">P. PÚBLICO ($)</th>
                  <th className="py-2 px-2 text-right">P. MAYOREO ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map(item => (
                  <tr key={item.codigo}>
                    <td className="py-1.5 px-2 font-black text-slate-900">{item.codigo}</td>
                    <td className="py-1.5 px-2 uppercase text-slate-500 truncate max-w-[320px]">{item.descripcion}</td>
                    <td className="py-1.5 px-2 text-right font-black text-blue-700">$ {(salePrices[item.codigo] || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                    <td className="py-1.5 px-2 text-right font-black text-green-700">$ {(wholesalePrices[item.codigo] || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        <div className="mt-auto pt-12 text-center border-t border-slate-100">
           <p className="text-[9pt] font-black uppercase tracking-widest mb-2 text-slate-900">** PRECIOS SIN IVA **</p>
           <div className="opacity-40">
             <p className="text-[7pt] font-black uppercase tracking-widest italic mb-2">Precios sujetos a cambio sin previo aviso. Lista generada por sistema GML.</p>
             <p className="text-[8pt] font-black uppercase">{company.direccion} | Tel: {company.telefono}</p>
           </div>
        </div>
      </div>

      {/* MODALES */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[600] p-4">
          <div className="bg-white rounded-3xl p-10 text-center space-y-8 max-w-sm shadow-2xl border-4 border-white animate-in zoom-in duration-200">
            <h4 className="text-2xl font-black uppercase tracking-tighter">Ajuste Masivo %</h4>
            <div className="space-y-1 text-left">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">¿Qué precio ajustar?</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                    {['PÚBLICO', 'MAYOREO', 'AMBOS'].map(t => (
                        <button key={t} onClick={() => setAdjustmentTarget(t as any)} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${adjustmentTarget === t ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>{t}</button>
                    ))}
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block">Porcentaje (+ o -)</label>
                <input type="number" value={adjustmentPercent} onChange={e => setAdjustmentPercent(e.target.value)} className="w-full text-center p-4 text-4xl font-black border rounded-2xl bg-slate-50 outline-none focus:border-blue-500" />
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={handleBulkAdjustment} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-black transition-all active:scale-95">Aplicar Ajuste</button>
              <button onClick={() => setShowBulkModal(false)} className="w-full bg-slate-100 text-slate-400 py-4 rounded-2xl font-black text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[600] p-4">
          <div className="bg-white rounded-3xl p-10 space-y-6 w-full max-w-lg shadow-2xl border-4 border-white animate-in zoom-in duration-200">
            <h4 className="text-2xl font-black uppercase tracking-tighter text-center">Registrar Nuevo Material</h4>
            <div className="space-y-4 text-left">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2">SKU / CÓDIGO</label>
                <input type="text" value={newProd.codigo} onChange={e => setNewProd({...newProd, codigo: e.target.value.toUpperCase()})} className="w-full p-4 border rounded-2xl font-black uppercase shadow-inner" placeholder="EJ: POSTE4" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2">DESCRIPCIÓN</label>
                <input type="text" value={newProd.descripcion} onChange={e => setNewProd({...newProd, descripcion: e.target.value.toUpperCase()})} className="w-full p-4 border rounded-2xl font-bold uppercase shadow-inner" placeholder="EJ: POSTE METÁLICO 4 CAL 20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2">P. PÚBLICO</label>
                  <input type="number" value={newProd.precio} onChange={e => setNewProd({...newProd, precio: parseFloat(e.target.value) || 0})} className="w-full p-4 border rounded-2xl font-black text-blue-600 shadow-inner" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2">P. MAYOREO</label>
                  <input type="number" value={newProd.precioMayoreo} onChange={e => setNewProd({...newProd, precioMayoreo: parseFloat(e.target.value) || 0})} className="w-full p-4 border rounded-2xl font-black text-green-600 shadow-inner" />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
                <button onClick={handleAddNewProduct} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-blue-700">Añadir al Catálogo</button>
                <button onClick={() => setShowAddModal(false)} className="w-full bg-slate-100 text-slate-500 py-4 rounded-2xl font-black uppercase text-xs">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryView;
