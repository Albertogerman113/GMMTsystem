
import React, { useState, useEffect } from 'react';
import { InventarioItem, UserSession } from '../types';
import { getStoredInventory, setStoredInventory } from '../utils/storage';
import * as XLSX from 'xlsx';

interface ProductManagementViewProps {
  currentUser: UserSession;
  location: 'MAIN' | 'MZT' | 'TAB';
}

const ProductManagementView: React.FC<ProductManagementViewProps> = ({ currentUser, location }) => {
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [newProd, setNewProd] = useState({ codigo: '', descripcion: '', weight: 0, claveSAT: '' });
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  useEffect(() => {
    refreshData();
  }, [location]);

  const refreshData = () => {
    setInventory(getStoredInventory(location));
  };

  const handleAddProduct = () => {
    if (!newProd.codigo.trim()) return;
    const code = newProd.codigo.toUpperCase();
    const ni: InventarioItem = { 
      codigo: code, 
      descripcion: newProd.descripcion.toUpperCase(), 
      pesoUnitario: newProd.weight, 
      cantidadFisica: 0, 
      fechaToma: "Nuevo", 
      observaciones: "Alta desde gestión de productos",
      oculto: false,
      claveSAT: newProd.claveSAT
    };
    const updated = { ...getStoredInventory(location), [code]: ni };
    setStoredInventory(updated, location);
    setNewProd({ codigo: '', descripcion: '', weight: 0, claveSAT: '' });
    setShowAddModal(false);
    refreshData();
  };

  const handleBulkImport = () => {
    const lines = importText.split('\n');
    const currentInv = getStoredInventory(location);
    let count = 0;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      const parts = trimmed.split(/[\t,;]/);
      if (parts.length < 2) return;

      const sku = parts[0].trim().toUpperCase();
      const desc = parts[1].trim().toUpperCase();
      const weight = parseFloat(parts[2]?.trim() || "0");
      const sat = parts[3]?.trim() || "";

      if (sku) {
        currentInv[sku] = {
          codigo: sku,
          descripcion: desc,
          pesoUnitario: weight,
          cantidadFisica: currentInv[sku]?.cantidadFisica || 0,
          fechaToma: currentInv[sku]?.fechaToma || "Importado",
          observaciones: currentInv[sku]?.observaciones || "Importación Masiva",
          oculto: currentInv[sku]?.oculto || false,
          claveSAT: sat || currentInv[sku]?.claveSAT
        };
        count++;
      }
    });

    if (count > 0) {
      setStoredInventory(currentInv, location);
      alert(`Se han importado/actualizado ${count} productos correctamente.`);
      setShowImportModal(false);
      setImportText('');
      refreshData();
    }
  };

  const downloadTemplate = () => {
    const data = (Object.values(inventory) as InventarioItem[]).map(i => ({
      "CÓDIGO": i.codigo,
      "DESCRIPCIÓN": i.descripcion,
      "PESO_UNITARIO": i.pesoUnitario,
      "CLAVE_SAT": i.claveSAT || ""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `Plantilla_Productos_${location}.xlsx`);
  };

  const confirmDelete = () => {
    if (!itemToDelete) return;
    const currentInv = getStoredInventory(location);
    const { [itemToDelete]: _, ...rest } = currentInv;
    setStoredInventory(rest, location);
    setItemToDelete(null);
    refreshData();
  };

  const filteredItems = (Object.values(inventory) as InventarioItem[])
    .filter(i => i.codigo.toLowerCase().includes(search.toLowerCase()) || i.descripcion.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => a.codigo.localeCompare(b.codigo));

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in p-2 md:p-0">
      <div className="flex flex-col lg:flex-row justify-between items-center bg-white p-4 md:p-6 rounded-2xl border shadow-sm gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          <h3 className="text-base md:text-lg font-black uppercase tracking-tighter text-slate-800 w-full sm:w-auto text-center sm:text-left">Gestión de Productos ({location})</h3>
          <div className="relative flex-1 w-full sm:w-64">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-xs font-bold uppercase outline-none focus:border-blue-500 shadow-sm" 
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <button onClick={() => setShowImportModal(true)} className="w-full sm:w-auto bg-indigo-50 text-indigo-600 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-indigo-100 transition-all border border-indigo-100 flex items-center justify-center gap-2">
            <i className="fas fa-file-import"></i> Importar Masivo
          </button>
          <button onClick={() => setShowAddModal(true)} className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
            <i className="fas fa-plus"></i> Nuevo Producto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredItems.map(item => (
          <div key={item.codigo} className="p-4 bg-white border rounded-xl relative group flex flex-col gap-3 shadow-sm hover:shadow-md transition-all">
            <button onClick={() => setItemToDelete(item.codigo)} className="absolute top-2 right-2 text-red-300 hover:text-red-500 transition-opacity opacity-0 group-hover:opacity-100"><i className="fas fa-trash-alt"></i></button>
            <div>
              <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">SKU / CÓDIGO</label>
              <p className="font-black text-slate-900 text-sm uppercase">{item.codigo}</p>
            </div>
            <div>
              <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">DESCRIPCIÓN</label>
              <input 
                type="text" 
                value={item.descripcion || ""} 
                onChange={e => {
                  const updated = { ...getStoredInventory(location), [item.codigo]: { ...item, descripcion: (e.target.value || "").toUpperCase() } };
                  setStoredInventory(updated, location);
                  refreshData();
                }}
                className="w-full p-2 text-xs border rounded bg-slate-50 font-bold uppercase focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Peso Unit. (KG)</label>
              <input 
                type="number" 
                step="any" 
                value={item.pesoUnitario ?? 0} 
                onChange={e => {
                  const updated = { ...getStoredInventory(location), [item.codigo]: { ...item, pesoUnitario: parseFloat(e.target.value) || 0 } };
                  setStoredInventory(updated, location);
                  refreshData();
                }}
                className="w-full p-2 text-xs border rounded bg-slate-50 font-bold focus:border-blue-500 outline-none" 
              />
            </div>
            <div>
              <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Clave SAT</label>
              <input 
                type="text" 
                value={item.claveSAT || ""} 
                onChange={e => {
                  const updated = { ...getStoredInventory(location), [item.codigo]: { ...item, claveSAT: e.target.value } };
                  setStoredInventory(updated, location);
                  refreshData();
                }}
                className="w-full p-2 text-xs border rounded bg-slate-50 font-bold focus:border-blue-500 outline-none" 
                placeholder="Ej. 30101800"
              />
            </div>
          </div>
        ))}
      </div>

      {/* MODAL: NUEVO PRODUCTO */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[700] p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 space-y-6 shadow-2xl animate-in zoom-in duration-200">
            <h4 className="text-xl font-black text-slate-800 uppercase tracking-widest text-center">Nuevo Producto</h4>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">SKU / CÓDIGO</label>
                <input autoFocus type="text" value={newProd.codigo || ""} onChange={e => setNewProd({...newProd, codigo: (e.target.value || "").toUpperCase()})} className="w-full p-3 border rounded-xl font-bold uppercase shadow-inner" placeholder="CÓDIGO (SKU)" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">DESCRIPCIÓN</label>
                <input type="text" value={newProd.descripcion || ""} onChange={e => setNewProd({...newProd, descripcion: (e.target.value || "").toUpperCase()})} className="w-full p-3 border rounded-xl font-bold uppercase shadow-inner" placeholder="DESCRIPCIÓN TÉCNICA" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">PESO UNITARIO (KG)</label>
                <input type="number" value={newProd.weight ?? 0} onChange={e => setNewProd({...newProd, weight: parseFloat(e.target.value) || 0})} className="w-full p-3 border rounded-xl font-bold shadow-inner" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">CLAVE SAT</label>
                <input type="text" value={newProd.claveSAT || ""} onChange={e => setNewProd({...newProd, claveSAT: e.target.value})} className="w-full p-3 border rounded-xl font-bold shadow-inner" placeholder="Ej. 30101800" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={handleAddProduct} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-xs uppercase shadow-lg hover:bg-blue-700">Registrar Producto</button>
              <button onClick={() => setShowAddModal(false)} className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-black text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMPORTACIÓN MASIVA */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[700] p-4">
          <div className="bg-white rounded-3xl p-8 space-y-6 w-full max-w-2xl shadow-2xl border-4 border-white animate-in zoom-in duration-200">
             <div className="text-center">
               <h4 className="text-2xl font-black uppercase tracking-tighter">Importar Catálogo de Productos ({location})</h4>
               <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Pegue columnas desde Excel (SKU, Descripción, Peso, Clave SAT)</p>
             </div>

             <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black text-slate-400 uppercase block ml-1">Datos a Importar (SKU [TAB] DESC [TAB] PESO [TAB] SAT)</label>
                  <button onClick={downloadTemplate} className="text-blue-600 text-[9px] font-black uppercase hover:underline">Descargar Plantilla Excel</button>
                </div>
                <textarea 
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder="EJEMPLO:&#10;POSTE4	POSTE METALICO 4	0.85	30101500&#10;CANAL3	CANAL METALICO 3	0.60	30101500"
                  className="w-full h-64 p-4 border rounded-2xl font-mono text-sm bg-slate-50 shadow-inner outline-none focus:border-indigo-500"
                />
                <p className="text-[9px] font-bold text-slate-400 italic">* Si el producto ya existe, se actualizará su descripción y peso. No afecta existencias ni precios.</p>
             </div>

             <div className="flex flex-col md:flex-row gap-3 pt-4">
                <button onClick={() => setShowImportModal(false)} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black uppercase text-xs">Cancelar</button>
                <button onClick={handleBulkImport} className="flex-2 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-indigo-700 transition-all">Procesar Importación</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR BORRADO */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-[800] p-4">
           <div className="bg-white rounded-3xl p-10 text-center space-y-8 max-sm shadow-2xl border-4 border-white animate-in zoom-in duration-200">
             <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-3xl">
               <i className="fas fa-trash-alt"></i>
             </div>
             <h4 className="text-xl font-black uppercase tracking-tighter">¿Eliminar Producto?</h4>
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Se eliminará {itemToDelete} del catálogo de esta sucursal.</p>
             <div className="flex flex-col gap-3">
               <button onClick={confirmDelete} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg">SÍ, Eliminar</button>
               <button onClick={() => setItemToDelete(null)} className="w-full bg-slate-100 text-slate-600 py-3 rounded-2xl font-black text-xs uppercase">Cancelar</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagementView;
