
import React, { useState, useEffect, useMemo } from 'react';
import { BOM, BOMComponent, InventarioItem } from '../types';
import { getStoredBOMs, setStoredBOMs, getStoredInventory } from '../utils/storage';

interface BOMViewProps {
  isReadOnly?: boolean;
}

const BOMView: React.FC<BOMViewProps> = ({ isReadOnly = false }) => {
  const [boms, setBoms] = useState<BOM[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});
  
  // Estados para nuevo BOM
  const [newBOMCode, setNewBOMCode] = useState('');
  const [newBOMDesc, setNewBOMDesc] = useState('');
  const [newComponents, setNewComponents] = useState<BOMComponent[]>([]);
  const [searchTermComp, setSearchTermComp] = useState('');
  const [searchTermMaster, setSearchTermMaster] = useState('');

  useEffect(() => {
    setBoms(getStoredBOMs());
    setInventory(getStoredInventory());
  }, []);

  const totalWeight = useMemo(() => {
    return newComponents.reduce((acc, comp) => {
      const item = inventory[comp.codigo];
      return acc + (item ? item.pesoUnitario * comp.cantidad : 0);
    }, 0);
  }, [newComponents, inventory]);

  const handleSelectMasterProduct = (item: InventarioItem) => {
    setNewBOMCode(item.codigo);
    setNewBOMDesc(item.descripcion);
    setSearchTermMaster('');
  };

  const handleAddComponent = (codigo: string) => {
    if (newComponents.some(c => c.codigo === codigo)) return;
    setNewComponents([...newComponents, { codigo, cantidad: 1 }]);
    setSearchTermComp('');
  };

  const handleRemoveComponent = (codigo: string) => {
    setNewComponents(newComponents.filter(c => c.codigo !== codigo));
  };

  const handleUpdateQty = (codigo: string, qty: number) => {
    setNewComponents(newComponents.map(c => 
      c.codigo === codigo ? { ...c, cantidad: Math.max(0.001, qty) } : c
    ));
  };

  const saveBOM = () => {
    if (isReadOnly) return;
    if (!newBOMCode || newComponents.length === 0) return;
    
    const newBOM: BOM = {
      id: Date.now().toString(),
      codigoFinal: newBOMCode.toUpperCase(),
      descripcion: newBOMDesc.toUpperCase(),
      componentes: newComponents,
      pesoTotalEst: totalWeight
    };

    const updated = [...boms, newBOM];
    setBoms(updated);
    setStoredBOMs(updated);
    resetForm();
  };

  const deleteBOM = (id: string) => {
    if (isReadOnly) return;
    const updated = boms.filter(b => b.id !== id);
    setBoms(updated);
    setStoredBOMs(updated);
  };

  const resetForm = () => {
    setNewBOMCode('');
    setNewBOMDesc('');
    setNewComponents([]);
    setSearchTermMaster('');
    setSearchTermComp('');
    setShowModal(false);
  };

  const filteredInventoryMaster = (Object.values(inventory) as InventarioItem[]).filter(item => 
    item.codigo.toLowerCase().includes(searchTermMaster.toLowerCase()) ||
    item.descripcion.toLowerCase().includes(searchTermMaster.toLowerCase())
  ).slice(0, 5);

  const filteredInventoryComp = (Object.values(inventory) as InventarioItem[]).filter(item => 
    item.codigo.toLowerCase().includes(searchTermComp.toLowerCase()) ||
    item.descripcion.toLowerCase().includes(searchTermComp.toLowerCase())
  ).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">BOMs - Ingeniería de Ensambles</h3>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Configuración de recetas maestras de productos</p>
        </div>
        {!isReadOnly && (
          <button 
            onClick={() => setShowModal(true)} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-black text-xs uppercase shadow-lg transition-all active:scale-95 flex items-center gap-2"
          >
            <i className="fas fa-plus"></i> Crear Nuevo Ensamble
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {boms.map(bom => (
          <div key={bom.id} className="bg-white border-2 border-slate-100 rounded-2xl shadow-sm hover:shadow-xl hover:border-blue-200 transition-all p-6 relative group overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
            {!isReadOnly && (
              <button 
                onClick={() => deleteBOM(bom.id)}
                className="absolute top-4 right-4 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <i className="fas fa-trash-alt"></i>
              </button>
            )}
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black">
                <i className="fas fa-project-diagram text-xs"></i>
              </div>
              <div>
                <h4 className="font-black text-slate-900 uppercase text-sm tracking-tighter">{bom.codigoFinal}</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase truncate max-w-[200px]">{bom.descripcion || 'Sin descripción'}</p>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <span>Componentes</span>
                <span>Cant</span>
              </div>
              {bom.componentes.map(comp => (
                <div key={comp.codigo} className="flex justify-between items-center text-[11px] font-bold py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-600 uppercase truncate pr-4">{comp.codigo}</span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800">{comp.cantidad}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-between items-center bg-slate-50 -mx-6 -mb-6 p-4">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Peso Estimado:</span>
               <span className="text-sm font-black text-blue-600">{bom.pesoTotalEst.toFixed(2)} KG</span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[250] p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in duration-200 shadow-2xl">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <i className="fas fa-blueprint text-blue-400 text-2xl"></i>
                <div>
                  <h4 className="text-lg font-black uppercase tracking-tighter">Nueva Lista de Materiales (BOM)</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Configurando Ensamble Maestro</p>
                </div>
              </div>
              <button onClick={resetForm} className="text-slate-400 hover:text-white transition-colors">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="relative">
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">1. Seleccionar Producto Final (Ensamble)</label>
                    <div className="relative">
                       <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
                       <input 
                         type="text" 
                         value={searchTermMaster}
                         onChange={e => setSearchTermMaster(e.target.value)}
                         className="w-full p-4 pl-12 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500 transition-all bg-white"
                         placeholder="Buscar en Inventario..."
                       />
                    </div>
                    {searchTermMaster && (
                       <div className="absolute z-20 w-full mt-2 bg-white border rounded-xl shadow-2xl overflow-hidden animate-in fade-in">
                         {filteredInventoryMaster.map(item => (
                           <button 
                             key={item.codigo}
                             onClick={() => handleSelectMasterProduct(item)}
                             className="w-full p-4 text-left hover:bg-slate-50 flex justify-between items-center border-b last:border-0"
                           >
                             <div>
                               <p className="font-black text-xs uppercase text-slate-900">{item.codigo}</p>
                               <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[250px]">{item.descripcion}</p>
                             </div>
                             <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">ELEGIR</span>
                           </button>
                         ))}
                       </div>
                    )}
                    {newBOMCode && (
                       <div className="mt-3 p-4 bg-blue-600 rounded-xl text-white shadow-lg animate-in slide-in-from-top-2">
                          <div className="flex justify-between items-start">
                             <div>
                                <p className="text-[9px] font-black uppercase opacity-60">Ensamble Seleccionado:</p>
                                <p className="font-black text-lg tracking-tighter">{newBOMCode}</p>
                                <p className="text-[10px] font-bold opacity-80 uppercase">{newBOMDesc}</p>
                             </div>
                             <i className="fas fa-check-circle text-xl"></i>
                          </div>
                       </div>
                    )}
                  </div>
                </div>

                <div className="relative pt-4 border-t-2 border-dashed border-slate-100">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">2. Buscar Componentes (Materias Primas)</label>
                  <div className="relative">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
                    <input 
                      type="text" 
                      value={searchTermComp}
                      onChange={e => setSearchTermComp(e.target.value)}
                      className="w-full p-4 pl-12 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500 transition-all shadow-inner bg-white"
                      placeholder="Escriba código o nombre..."
                    />
                  </div>
                  {searchTermComp && filteredInventoryComp.length > 0 && (
                    <div className="absolute z-10 w-full mt-2 bg-white border rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
                      {filteredInventoryComp.map(item => (
                        <button 
                          key={item.codigo}
                          onClick={() => handleAddComponent(item.codigo)}
                          className="w-full p-4 text-left hover:bg-blue-50 flex justify-between items-center transition-colors border-b last:border-0"
                        >
                          <div>
                            <p className="font-black text-xs uppercase text-slate-900">{item.codigo}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[200px]">{item.descripcion}</p>
                          </div>
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">AÑADIR</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border-2 border-slate-100 flex flex-col h-full min-h-[400px]">
                <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <i className="fas fa-list text-blue-600"></i> Componentes Seleccionados
                </h5>
                
                <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                  {newComponents.map(comp => {
                    const item = inventory[comp.codigo];
                    return (
                      <div key={comp.codigo} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between group animate-in slide-in-from-right duration-200">
                        <div className="flex-1">
                          <p className="text-xs font-black text-slate-900">{comp.codigo}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[150px]">{item?.descripcion || 'Sin nombre'}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center bg-slate-100 rounded-lg p-1">
                            <button onClick={() => handleUpdateQty(comp.codigo, comp.cantidad - 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-900">-</button>
                            <input 
                              type="number" 
                              step="any"
                              value={comp.cantidad}
                              onChange={e => handleUpdateQty(comp.codigo, parseFloat(e.target.value) || 0)}
                              className="w-16 text-center bg-transparent font-black text-xs outline-none"
                            />
                            <button onClick={() => handleUpdateQty(comp.codigo, comp.cantidad + 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-900">+</button>
                          </div>
                          <button onClick={() => handleRemoveComponent(comp.codigo)} className="text-red-300 hover:text-red-500 transition-colors">
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 pt-6 border-t-2 border-dashed border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Peso Total Acumulado</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tighter">{totalWeight.toFixed(2)} <span className="text-sm text-slate-400">KG</span></p>
                  </div>
                  <button 
                    onClick={saveBOM}
                    disabled={!newBOMCode || newComponents.length === 0}
                    className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black text-xs uppercase shadow-xl hover:bg-black disabled:opacity-50 transition-all active:scale-95"
                  >
                    Guardar Receta
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BOMView;
