
import React, { useState, useEffect } from 'react';
import { Gastos, Cliente, InventarioItem, CompanyData, UserSession, UserRole } from '../types';
import * as XLSX from 'xlsx';
import { 
  getStoredCosts, setStoredCosts, 
  getStoredExpenses, setStoredExpenses, 
  getStoredClients, setStoredClients,
  getStoredInventory, setStoredInventory,
  getCompanyData, setCompanyData,
  copySyncTokenToClipboard,
  importFromSyncToken
} from '../utils/storage';

type TabId = 'COMPANY' | 'PRODUCTS' | 'COSTS' | 'EXPENSES' | 'CLIENTS' | 'CUSTOMER_PRICES' | 'BRIDGE';

interface SettingsViewProps {
  currentUser: UserSession;
}

const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const isAdmin = currentUser.role === UserRole.ADMIN;
  
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [expenses, setExpenses] = useState<Gastos>({ operativos: 0, envio: 0, otros: 0 });
  const [clients, setClients] = useState<Record<string, Cliente>>({});
  const [inventory, setInventory] = useState<Record<string, InventarioItem>>({});
  const [company, setCompany] = useState<CompanyData>(getCompanyData());
  const [pendingSync, setPendingSync] = useState(false);
  
  const [activeTab, setActiveTab] = useState<TabId>(isAdmin ? 'COMPANY' : 'BRIDGE');
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProdCode, setNewProdCode] = useState('');
  const [newProdDesc, setNewProdDesc] = useState('');

  const [selectedClientForPrices, setSelectedClientForPrices] = useState<string | null>(null);
  const [priceSearchTerm, setPriceSearchTerm] = useState('');

  const [itemToDelete, setItemToDelete] = useState<{type: 'client' | 'prod', id: string} | null>(null);
  
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTokenValue, setImportTokenValue] = useState('');
  const [importTarget, setImportTarget] = useState<'MAIN' | 'MZT' | 'TAB' | 'BOTH'>('BOTH');

  useEffect(() => {
    refreshAllStates();
  }, []);

  const refreshAllStates = () => {
    setCosts(getStoredCosts());
    setExpenses(getStoredExpenses());
    setClients(getStoredClients());
    setInventory(getStoredInventory());
    setCompany(getCompanyData());
  };

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const markChanged = () => setPendingSync(true);

  const saveCosts = () => { setStoredCosts(costs); markChanged(); notify('Precios actualizados'); };
  const saveExpenses = () => { setStoredExpenses(expenses); markChanged(); notify('Gastos fijos guardados'); };
  const saveCompany = () => { setCompanyData(company); markChanged(); notify('Datos empresa actualizados'); };
  const saveClients = () => { setStoredClients(clients); markChanged(); notify('Base de clientes guardada'); };
  const saveInventory = () => { setStoredInventory(inventory); markChanged(); notify('Catálogo sincronizado'); };

  const handleCustomerPriceImport = (e: React.ChangeEvent<HTMLInputElement>, clientName: string) => {
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

        const client = clients[clientName];
        if (!client) return;

        const updatedPrices = { ...(client.listaPrecios || {}) };
        let count = 0;

        data.forEach(row => {
          const code = (row["CÓDIGO"] || row["codigo"] || row["Codigo"])?.toString().toUpperCase().trim();
          const price = parseFloat(row["PRECIO"] || row["precio"] || row["Precio"] || 0);

          if (code) {
            updatedPrices[code] = price;
            count++;
          }
        });

        const updatedClients = { ...clients, [clientName]: { ...client, listaPrecios: updatedPrices } };
        setClients(updatedClients);
        setStoredClients(updatedClients);
        markChanged();
        notify(`Se han actualizado ${count} precios para ${clientName}`);
      } catch (err) {
        console.error(err);
        notify("Error al procesar el archivo Excel", "error");
      }
      e.target.value = "";
    };
    reader.readAsBinaryString(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      alert("Por favor sube un archivo en formato PNG");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setCompany({ ...company, logoUrl: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleCopySyncToken = async () => {
    await copySyncTokenToClipboard();
    setPendingSync(false);
    notify('¡Token de Sincronización Copiado!');
  };

  const processImportToken = () => {
    if (!importTokenValue.trim()) return;
    const success = importFromSyncToken(importTokenValue.trim(), importTarget);
    if (success) {
      notify(`¡Sincronización ${importTarget === 'BOTH' ? 'TOTAL' : importTarget} completada!`);
      refreshAllStates();
      setShowImportModal(false);
      setImportTokenValue('');
      setPendingSync(false);
    } else {
      notify('El token no es válido o está incompleto', 'error');
    }
  };

  const handleAddClient = () => {
    if (!newClientName.trim()) return;
    const nc = { nombre: newClientName, direccion: "", contacto: "", telefono: "" };
    const updated = { ...clients, [newClientName]: nc };
    setClients(updated);
    setStoredClients(updated);
    markChanged();
    setNewClientName('');
    setShowAddClient(false);
    notify('Cliente añadido');
  };

  const handleAddProduct = () => {
    if (!newProdCode.trim()) return;
    const code = newProdCode.toUpperCase();
    const ni = { 
      codigo: code, 
      descripcion: newProdDesc.toUpperCase(), 
      pesoUnitario: 0, 
      cantidadFisica: 0, 
      fechaToma: "Nuevo", 
      observaciones: "Alta desde configuración" 
    };
    const updated = { ...inventory, [code]: ni };
    setInventory(updated);
    setStoredInventory(updated);
    markChanged();
    setNewProdCode('');
    setNewProdDesc('');
    setShowAddProduct(false);
    notify('Producto añadido');
  };

  const confirmDelete = () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'client') {
      const { [itemToDelete.id]: _, ...rest } = clients;
      setClients(rest);
      setStoredClients(rest);
    } else {
      const { [itemToDelete.id]: _, ...rest } = inventory;
      setInventory(rest);
      setStoredInventory(rest);
    }
    markChanged();
    setItemToDelete(null);
    notify('Eliminado correctamente');
  };

  const allTabs: { id: TabId, label: string, icon: string, adminOnly: boolean }[] = [
    { id: 'COMPANY', label: 'Empresa', icon: 'fa-building', adminOnly: true },
    { id: 'PRODUCTS', label: 'Productos', icon: 'fa-box-open', adminOnly: true },
    { id: 'COSTS', label: 'Lista de Costos', icon: 'fa-tags', adminOnly: true },
    { id: 'EXPENSES', label: 'Gastos Fijos', icon: 'fa-wallet', adminOnly: true },
    { id: 'CLIENTS', label: 'Clientes', icon: 'fa-users', adminOnly: true },
    { id: 'CUSTOMER_PRICES', label: 'Costos por Cliente', icon: 'fa-file-invoice-dollar', adminOnly: true },
    { id: 'BRIDGE', label: 'Puente de Datos', icon: 'fa-project-diagram', adminOnly: false },
  ];

  const visibleTabs = allTabs.filter(tab => !tab.adminOnly || isAdmin);

  return (
    <div className="max-w-6xl mx-auto space-y-6 relative">
      {notification && (
        <div className={`fixed top-24 right-8 text-white px-6 py-4 rounded-xl shadow-2xl z-50 border animate-in slide-in-from-right duration-300 flex items-center gap-3 ${notification.type === 'success' ? 'bg-slate-900 border-blue-500' : 'bg-red-600 border-white'}`}>
          <i className={`fas ${notification.type === 'success' ? 'fa-check-circle text-blue-400' : 'fa-check-circle'}`}></i>
          <span className="font-bold text-sm uppercase tracking-widest">{notification.msg}</span>
        </div>
      )}

      <div className="flex border-b overflow-x-auto no-scrollbar bg-white rounded-t-xl">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-4 font-bold text-xs transition-all border-b-2 flex items-center gap-2 whitespace-nowrap uppercase tracking-widest ${
              activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <i className={`fas ${tab.icon}`}></i>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-b-xl border shadow-sm p-4 md:p-8 min-h-[500px]">
        {activeTab === 'BRIDGE' && (
          <div className="space-y-8 md:space-y-12 animate-in fade-in max-w-2xl mx-auto py-6 md:py-10">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto text-2xl md:text-3xl shadow-inner">
                <i className="fas fa-project-diagram"></i>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tighter">Puente de Datos GML</h3>
              <p className="text-slate-500 text-xs md:text-sm font-medium leading-relaxed">Sincroniza todas tus bases de datos (Catálogos, Clientes, BOMs, Empresa e Historiales) entre sucursales.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              <div className={`p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border-2 border-dashed flex flex-col items-center text-center space-y-4 md:space-y-6 transition-all ${pendingSync ? 'bg-blue-50 border-blue-400' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${pendingSync ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-800 text-white'}`}>
                  <i className="fas fa-sign-out-alt"></i>
                </div>
                <button 
                  onClick={handleCopySyncToken}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-black transition-all"
                >
                  GENERAR TOKEN DE SALIDA
                </button>
                <p className="text-[8px] font-black text-slate-400 uppercase">Copia todos tus datos locales actuales</p>
              </div>

              <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center text-center space-y-6">
                <div className="w-14 h-14 bg-green-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                  <i className="fas fa-sign-in-alt"></i>
                </div>
                <button 
                  onClick={() => setShowImportModal(true)}
                  className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-green-700 transition-all"
                >
                  IMPORTAR TOKEN DE ENTRADA
                </button>
                <p className="text-[8px] font-black text-slate-400 uppercase">Actualiza tu sistema con datos externos</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'CUSTOMER_PRICES' && isAdmin && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                <i className="fas fa-file-invoice-dollar text-blue-600"></i> Lista de Costos por Cliente
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-1 border-r pr-6 space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Seleccionar Cliente</label>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {Object.keys(clients).sort().map(name => (
                    <button
                      key={name}
                      onClick={() => setSelectedClientForPrices(name)}
                      className={`w-full text-left p-3 rounded-xl text-xs font-bold uppercase transition-all ${selectedClientForPrices === name ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-3 space-y-6">
                {selectedClientForPrices ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border">
                      <div>
                        <h4 className="font-black text-slate-800 uppercase tracking-tighter">Precios para: {selectedClientForPrices}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Actualice los precios específicos para este cliente</p>
                      </div>
                      <div className="flex gap-2">
                        <label className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase cursor-pointer hover:bg-emerald-700 shadow-md transition-all flex items-center gap-2">
                          <i className="fas fa-file-excel"></i> Importar Plantilla
                          <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={(e) => handleCustomerPriceImport(e, selectedClientForPrices)} />
                        </label>
                      </div>
                    </div>

                    <div className="relative">
                      <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
                      <input
                        type="text"
                        placeholder="Buscar producto..."
                        value={priceSearchTerm}
                        onChange={e => setPriceSearchTerm(e.target.value)}
                        className="w-full p-3 pl-12 border rounded-xl font-bold text-xs uppercase"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2">
                      {(Object.values(inventory) as InventarioItem[])
                        .filter(i => !i.oculto && (i.codigo.toLowerCase().includes(priceSearchTerm.toLowerCase()) || i.descripcion.toLowerCase().includes(priceSearchTerm.toLowerCase())))
                        .sort((a, b) => a.codigo.localeCompare(b.codigo))
                        .map(item => {
                          const client = clients[selectedClientForPrices];
                          const price = client.listaPrecios?.[item.codigo] || 0;
                          return (
                            <div key={item.codigo} className="p-4 bg-white border rounded-xl shadow-sm space-y-2">
                              <div className="flex justify-between items-start">
                                <label className="block text-[9px] font-black text-slate-400 uppercase truncate">{item.codigo}</label>
                                {price > 0 && <span className="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-black">PERSONALIZADO</span>}
                              </div>
                              <input
                                type="number"
                                step="any"
                                value={price}
                                onChange={e => {
                                  const newPrice = parseFloat(e.target.value) || 0;
                                  const updatedClients = {
                                    ...clients,
                                    [selectedClientForPrices]: {
                                      ...client,
                                      listaPrecios: { ...(client.listaPrecios || {}), [item.codigo]: newPrice }
                                    }
                                  };
                                  setClients(updatedClients);
                                  markChanged();
                                }}
                                className="w-full p-2 text-xs font-black border rounded focus:border-blue-500 outline-none"
                              />
                            </div>
                          );
                        })}
                    </div>
                    <div className="pt-4 border-t">
                      <button onClick={saveClients} className="bg-slate-900 text-white px-8 py-3 rounded-lg font-black uppercase text-xs shadow-lg hover:bg-black">Guardar Precios de Cliente</button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-20 bg-slate-50 rounded-[2rem] border-2 border-dashed">
                    <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 text-3xl">
                      <i className="fas fa-user-tag"></i>
                    </div>
                    <h4 className="text-xl font-black text-slate-300 uppercase tracking-widest">Seleccione un cliente</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Para gestionar sus precios específicos</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'COMPANY' && isAdmin && (
          <div className="space-y-6 max-w-4xl animate-in fade-in">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800">
              <i className="fas fa-building text-blue-600"></i> Identidad Corporativa
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Nombre Comercial</label>
                  <input type="text" value={company.nombre} onChange={e => setCompany({...company, nombre: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Dirección Matriz</label>
                  <input type="text" value={company.direccion} onChange={e => setCompany({...company, direccion: e.target.value})} className="w-full p-3 border rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Teléfono</label>
                    <input type="text" value={company.telefono} onChange={e => setCompany({...company, telefono: e.target.value})} className="w-full p-3 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">RFC</label>
                    <input type="text" value={company.rfc} onChange={e => setCompany({...company, rfc: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-lg font-mono" />
                  </div>
                </div>
              </div>
              <div className="space-y-6 bg-slate-50 p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Logo Corporativo (PNG)</h4>
                <div className="w-48 h-48 mx-auto bg-white rounded-xl border-2 border-white shadow-inner overflow-hidden flex items-center justify-center relative group">
                  {company.logoUrl ? (
                    <img src={company.logoUrl} alt="Logo Empresa" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <i className="fas fa-image text-slate-200 text-6xl"></i>
                  )}
                  <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white flex-col gap-2">
                    <i className="fas fa-camera text-2xl"></i>
                    <span className="text-[8px] font-black uppercase">Cambiar Logo</span>
                    <input type="file" className="hidden" accept="image/png" onChange={handleLogoUpload} />
                  </label>
                </div>
              </div>
            </div>
            <div className="pt-6 border-t">
               <button onClick={saveCompany} className="bg-slate-900 text-white px-12 py-4 rounded-xl font-black uppercase text-xs shadow-xl hover:bg-black">Guardar Cambios</button>
            </div>
          </div>
        )}

        {activeTab === 'PRODUCTS' && isAdmin && (
           <div className="space-y-6 animate-in fade-in">
              <div className="flex justify-between items-center">
                 <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                    <i className="fas fa-box-open text-blue-600"></i> Catálogo de Productos
                 </h3>
                 <button onClick={() => setShowAddProduct(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase">+ Nuevo Material</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {(Object.values(inventory) as InventarioItem[]).sort((a,b) => a.codigo.localeCompare(b.codigo)).map(item => (
                   <div key={item.codigo} className="p-4 bg-slate-50 border rounded-xl relative group flex flex-col gap-3">
                      <button onClick={() => setItemToDelete({type:'prod', id:item.codigo})} className="absolute top-2 right-2 text-red-300 hover:text-red-500 transition-opacity opacity-0 group-hover:opacity-100"><i className="fas fa-trash-alt"></i></button>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">SKU / CÓDIGO</label>
                        <p className="font-black text-slate-900 text-sm uppercase">{item.codigo}</p>
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">DESCRIPCIÓN</label>
                        <input 
                          type="text" 
                          value={item.descripcion} 
                          onChange={e => { setInventory({...inventory, [item.codigo]: {...item, descripcion: e.target.value.toUpperCase()}}); markChanged(); }}
                          className="w-full p-2 text-xs border rounded bg-white font-bold uppercase shadow-sm focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                         <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Peso Unit. (KG)</label>
                            <input 
                              type="number" 
                              step="any" 
                              value={item.pesoUnitario} 
                              onChange={e => { setInventory({...inventory, [item.codigo]: {...item, pesoUnitario: parseFloat(e.target.value) || 0}}); markChanged(); }} 
                              className="w-full p-2 text-xs border rounded bg-white font-bold shadow-sm focus:border-blue-500" 
                            />
                         </div>
                         <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Existencia</label>
                            <div className="p-2 text-xs bg-slate-100 rounded font-black text-slate-600 border border-slate-200">{item.cantidadFisica}</div>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
              <button onClick={saveInventory} className="bg-slate-900 text-white px-8 py-3 rounded-lg font-black uppercase text-xs shadow-lg hover:bg-black">Guardar Catálogo</button>
           </div>
        )}

        {activeTab === 'COSTS' && isAdmin && (
          <div className="space-y-6 animate-in fade-in">
             <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
               <i className="fas fa-tags text-blue-600"></i> Lista de Costos de Adquisición
             </h3>
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Object.keys(costs).sort().map(code => (
                  <div key={code} className="p-4 bg-slate-50 border rounded-xl space-y-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase truncate">{code}</label>
                    <input 
                      type="number" 
                      value={costs[code]} 
                      onChange={e => { setCosts({...costs, [code]: parseFloat(e.target.value) || 0}); markChanged(); }}
                      className="w-full p-2 text-xs font-black border rounded focus:border-blue-500 outline-none" 
                    />
                  </div>
                ))}
             </div>
             <button onClick={saveCosts} className="bg-slate-900 text-white px-8 py-3 rounded-lg font-black uppercase text-xs shadow-lg hover:bg-black">Guardar Costos</button>
          </div>
        )}

        {activeTab === 'EXPENSES' && isAdmin && (
          <div className="space-y-6 animate-in fade-in">
             <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
               <i className="fas fa-wallet text-blue-600"></i> Gastos Operativos Fijos
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Gastos Operativos ($)</label>
                   <input type="number" value={expenses.operativos} onChange={e => setExpenses({...expenses, operativos: parseFloat(e.target.value) || 0})} className="w-full p-4 border rounded-xl font-black text-blue-600 shadow-inner" />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Gastos de Envío ($)</label>
                   <input type="number" value={expenses.envio} onChange={e => setExpenses({...expenses, envio: parseFloat(e.target.value) || 0})} className="w-full p-4 border rounded-xl font-black text-blue-600 shadow-inner" />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Otros Gastos ($)</label>
                   <input type="number" value={expenses.otros} onChange={e => setExpenses({...expenses, otros: parseFloat(e.target.value) || 0})} className="w-full p-4 border rounded-xl font-black text-blue-600 shadow-inner" />
                </div>
             </div>
             <button onClick={saveExpenses} className="bg-slate-900 text-white px-12 py-4 rounded-xl font-black uppercase text-xs shadow-xl hover:bg-black">Guardar Gastos</button>
          </div>
        )}

        {activeTab === 'CLIENTS' && isAdmin && (
          <div className="space-y-6 animate-in fade-in">
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                  <i className="fas fa-users text-blue-600"></i> Directorio de Clientes
                </h3>
                <button onClick={() => setShowAddClient(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase shadow-md">+ Nuevo Cliente</button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.values(clients) as Cliente[]).sort((a,b) => a.nombre.localeCompare(b.nombre)).map(client => (
                  <div key={client.nombre} className="p-6 bg-slate-50 border rounded-2xl relative group space-y-4">
                     <button onClick={() => setItemToDelete({type:'client', id:client.nombre})} className="absolute top-4 right-4 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><i className="fas fa-trash-alt"></i></button>
                     <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nombre / Razón Social</label>
                        <p className="font-black text-slate-800 uppercase">{client.nombre}</p>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        <input type="text" value={client.direccion} onChange={e => { setClients({...clients, [client.nombre]: {...client, direccion: e.target.value}}); markChanged(); }} className="w-full p-2 text-xs border rounded bg-white" placeholder="Dirección" />
                        <div className="flex gap-2">
                          <input type="text" value={client.contacto} onChange={e => { setClients({...clients, [client.nombre]: {...client, contacto: e.target.value}}); markChanged(); }} className="flex-1 p-2 text-xs border rounded bg-white" placeholder="Correo" />
                          <input type="text" value={client.telefono} onChange={e => { setClients({...clients, [client.nombre]: {...client, telefono: e.target.value}}); markChanged(); }} className="flex-1 p-2 text-xs border rounded bg-white" placeholder="Teléfono" />
                        </div>
                     </div>
                  </div>
                ))}
             </div>
             <button onClick={saveClients} className="bg-slate-900 text-white px-8 py-3 rounded-lg font-black uppercase text-xs shadow-lg hover:bg-black">Guardar Directorio</button>
          </div>
        )}
      </div>

      {/* MODAL: IMPORTAR TOKEN MEJORADO */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[500] p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 space-y-8 shadow-2xl animate-in zoom-in duration-200">
            <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter text-center">Restaurar / Importar Datos</h4>
            
            <div className="space-y-4">
               <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">¿A qué sucursal afecta esta carga?</label>
                  <div className="grid grid-cols-4 gap-2">
                      <button onClick={() => setImportTarget('MAIN')} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${importTarget === 'MAIN' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>Principal (Mochis)</button>
                      <button onClick={() => setImportTarget('MZT')} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${importTarget === 'MZT' ? 'bg-cyan-500 text-slate-900 shadow-lg' : 'bg-slate-50 text-slate-400'}`}>Mazatlán</button>
                      <button onClick={() => setImportTarget('TAB')} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${importTarget === 'TAB' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>Tablaroca</button>
                      <button onClick={() => setImportTarget('BOTH')} className={`py-3 rounded-xl font-black text-[9px] uppercase transition-all ${importTarget === 'BOTH' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}>Sinc. Total (Todas)</button>
                  </div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-2 text-center">
                    {importTarget === 'MAIN' && "Actualiza Mochis y todos los catálogos maestros."}
                    {importTarget === 'MZT' && "Actualiza solo inventario y precios de Mazatlán."}
                    {importTarget === 'TAB' && "Actualiza solo inventario y precios de Tablaroca."}
                    {importTarget === 'BOTH' && "SOBREESCRIBE ABSOLUTAMENTE TODO EL SISTEMA."}
                  </p>
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Pegar Token de Sincronización</label>
                  <textarea 
                      className="w-full h-40 p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-[9px] outline-none focus:border-blue-500 transition-all resize-none shadow-inner"
                      placeholder="GML-SYNC:..."
                      value={importTokenValue}
                      onChange={e => setImportTokenValue(e.target.value)}
                  />
               </div>
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={processImportToken} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-blue-700">INICIAR PROCESAMIENTO</button>
              <button onClick={() => setShowImportModal(false)} className="w-full bg-slate-100 text-slate-400 py-4 rounded-2xl font-black text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AÑADIR CLIENTE */}
      {showAddClient && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-8 space-y-6 shadow-2xl">
            <h4 className="text-xl font-black text-slate-800 uppercase tracking-widest text-center">Nuevo Cliente</h4>
            <input autoFocus type="text" value={newClientName} onChange={e => setNewClientName(e.target.value.toUpperCase())} className="w-full p-3 border rounded-xl font-bold uppercase" placeholder="NOMBRE / PROYECTO" />
            <div className="flex flex-col gap-2">
              <button onClick={handleAddClient} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase shadow-lg">Registrar</button>
              <button onClick={() => setShowAddClient(false)} className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-black text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AÑADIR PRODUCTO */}
      {showAddProduct && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-8 space-y-6 shadow-2xl animate-in zoom-in duration-200">
            <h4 className="text-xl font-black text-slate-800 uppercase tracking-widest text-center">Nuevo Producto</h4>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">SKU / CÓDIGO</label>
                <input autoFocus type="text" value={newProdCode} onChange={e => setNewProdCode(e.target.value.toUpperCase())} className="w-full p-3 border rounded-xl font-bold uppercase shadow-inner" placeholder="CÓDIGO (SKU)" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">DESCRIPCIÓN</label>
                <input type="text" value={newProdDesc} onChange={e => setNewProdDesc(e.target.value.toUpperCase())} className="w-full p-3 border rounded-xl font-bold uppercase shadow-inner" placeholder="DESCRIPCIÓN TÉCNICA" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={handleAddProduct} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase shadow-lg">Agregar al Catálogo</button>
              <button onClick={() => { setShowAddProduct(false); setNewProdCode(''); setNewProdDesc(''); }} className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl font-black text-xs uppercase">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR BORRADO */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-[600] p-4">
           <div className="bg-white rounded-3xl p-10 text-center space-y-8 max-sm shadow-2xl border-4 border-white animate-in zoom-in duration-200">
             <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-3xl">
               <i className="fas fa-trash-alt"></i>
             </div>
             <h4 className="text-xl font-black uppercase tracking-tighter">¿Eliminar {itemToDelete.type === 'client' ? 'Cliente' : 'Producto'}?</h4>
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Esta acción no se puede deshacer.</p>
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

export default SettingsView;
