
import { Cliente, InventarioItem, Gastos, CompanyData, GeneratedShipment, GeneratedQuote, BOM, InventoryMovement, PurchaseOrder, SaleRecord, ProductionRecord } from '../types';

const KEYS = {
  COSTS: 'mas_tablaroca_costs',
  SALE_PRICES_MAIN: 'mas_tablaroca_sales_main',
  SALE_PRICES_MZT: 'mas_tablaroca_sales_mzt',
  SALE_PRICES_TAB: 'mas_tablaroca_sales_tab',
  WHOLESALE_PRICES_MAIN: 'mas_tablaroca_wholesale_main',
  WHOLESALE_PRICES_MZT: 'mas_tablaroca_wholesale_mzt',
  WHOLESALE_PRICES_TAB: 'mas_tablaroca_wholesale_tab',
  EXPENSES: 'mas_tablaroca_expenses',
  CLIENTS: 'mas_tablaroca_clients',
  CLIENTS_MZT: 'mas_tablaroca_clients_mzt',
  CLIENTS_TAB: 'mas_tablaroca_clients_tab',
  INVENTORY_MAIN: 'mas_tablaroca_inventory_main',
  INVENTORY_MZT: 'mas_tablaroca_inventory_mzt',
  INVENTORY_TAB: 'mas_tablaroca_inventory_tab',
  MOVEMENTS: 'mas_tablaroca_movements',
  COMPANY: 'mas_tablaroca_company',
  COMPANY_TAB: 'mas_tablaroca_company_tab',
  HISTORY: 'mas_tablaroca_history',
  QUOTE_HISTORY: 'mas_tablaroca_quotes',
  BOMS: 'mas_tablaroca_boms',
  PURCHASES: 'mas_tablaroca_purchases',
  SALES_HISTORY: 'mas_tablaroca_sales_history',
  PRODUCTION_HISTORY: 'mas_tablaroca_production_history',
  SNAPSHOTS: 'mas_tablaroca_inventory_snapshots',
};

export const getStoredSalesHistory = (): SaleRecord[] => {
  const data = localStorage.getItem(KEYS.SALES_HISTORY);
  return data ? JSON.parse(data) : [];
};

export const getProductionHistory = (): ProductionRecord[] => {
  const data = localStorage.getItem(KEYS.PRODUCTION_HISTORY);
  return data ? JSON.parse(data) : [];
};

export const saveProductionRecord = (record: ProductionRecord) => {
  const history = getProductionHistory();
  localStorage.setItem(KEYS.PRODUCTION_HISTORY, JSON.stringify([record, ...history].slice(0, 100)));
  
  // Explotar BOM y actualizar inventario
  const boms = getStoredBOMs();
  const bom = boms.find(b => b.codigoFinal === record.codigoPT);
  
  if (bom) {
    // 1. Sumar PT al inventario
    addToInventory(record.codigoPT, record.cantidad, `Producción: ${record.id}`, 'MAIN');
    
    // 2. Restar MP del inventario
    bom.componentes.forEach(comp => {
      const totalMP = comp.cantidad * record.cantidad;
      deductFromInventory(comp.codigo, totalMP, `Consumo Producción: ${record.codigoPT}`, 'MAIN');
    });
  }
};

export const saveSaleToHistory = (sale: SaleRecord) => {
  const history = getStoredSalesHistory();
  localStorage.setItem(KEYS.SALES_HISTORY, JSON.stringify([sale, ...history].slice(0, 100)));
};

export const getStoredSalePrices = (location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN'): Record<string, number> => {
  const key = location === 'MAIN' ? KEYS.SALE_PRICES_MAIN : (location === 'MZT' ? KEYS.SALE_PRICES_MZT : KEYS.SALE_PRICES_TAB);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : {};
};

export const setStoredSalePrices = (prices: Record<string, number>, location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN') => {
  const key = location === 'MAIN' ? KEYS.SALE_PRICES_MAIN : (location === 'MZT' ? KEYS.SALE_PRICES_MZT : KEYS.SALE_PRICES_TAB);
  localStorage.setItem(key, JSON.stringify(prices));
};

export const getStoredWholesalePrices = (location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN'): Record<string, number> => {
  const key = location === 'MAIN' ? KEYS.WHOLESALE_PRICES_MAIN : (location === 'MZT' ? KEYS.WHOLESALE_PRICES_MZT : KEYS.WHOLESALE_PRICES_TAB);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : {};
};

export const setStoredWholesalePrices = (prices: Record<string, number>, location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN') => {
  const key = location === 'MAIN' ? KEYS.WHOLESALE_PRICES_MAIN : (location === 'MZT' ? KEYS.WHOLESALE_PRICES_MZT : KEYS.WHOLESALE_PRICES_TAB);
  localStorage.setItem(key, JSON.stringify(prices));
};

export const getStoredPurchases = (): PurchaseOrder[] => {
  const data = localStorage.getItem(KEYS.PURCHASES);
  return data ? JSON.parse(data) : [];
};

export const setStoredPurchases = (purchases: PurchaseOrder[]) => {
  localStorage.setItem(KEYS.PURCHASES, JSON.stringify(purchases));
};

export const addToInventory = (codigo: string, cantidad: number, referencia: string, location: 'MAIN' | 'MZT' | 'TAB') => {
  const inv = getStoredInventory(location);
  const movements = getInventoryMovements();
  const upper = codigo.toUpperCase();
  
  if (inv[upper]) {
    inv[upper].cantidadFisica += cantidad;
    const movement: InventoryMovement = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      sku: upper,
      cantidad: cantidad,
      tipo: 'IN',
      fecha: new Date().toISOString(),
      referencia: `${referencia} (${location})`
    };
    setStoredInventory(inv, location);
    setInventoryMovements([movement, ...movements]);
  } else {
    const newItem: InventarioItem = {
      codigo: upper,
      descripcion: "Material recibido por compra",
      pesoUnitario: 0,
      cantidadFisica: cantidad,
      fechaToma: new Date().toLocaleDateString(),
      observaciones: referencia
    };
    inv[upper] = newItem;
    setStoredInventory(inv, location);
  }
};

export const getSATCodeByDescription = (description: string): string => {
  const desc = description.toUpperCase();
  
  // 1. Cementos, Morteros, Adhesivos y Mezclas (Cemenquin, Basecoat, etc)
  if (desc.includes('CEMENQUIN') || desc.includes('BASECOAT') || desc.includes('BASE COAT') || 
      desc.includes('READY MIX') || desc.includes('REDIMIX') || desc.includes('PEGAMENTO') || 
      desc.includes('MORTERO') || desc.includes('CEMENTO') || desc.includes('ADHESIVO') || 
      desc.includes('PEGA') || desc.includes('BOQUILLA') || desc.includes('PASTA') || 
      desc.includes('COMPUESTO') || desc.includes('MASILLA')) {
    return '30111505';
  }

  // 2. Perfiles y Estructuras de Acero
  if (desc.includes('POSTE') || desc.includes('CANAL') || desc.includes('ANGULO') || 
      desc.includes('CANALETA') || desc.includes('ESQUINERO') || desc.includes('REBORDE') || 
      desc.includes('POLIN') || desc.includes('VIGA') || desc.includes('ESTRUCTURA') ||
      desc.includes('PERFIL') || desc.includes('ZINTRO') || desc.includes('GALVANIZADO')) {
    if (!desc.includes('CINTA')) {
      return '30101804';
    }
  }
  
  // 3. Tableros, Paneles y Placas
  if (desc.includes('DUROCK') || desc.includes('TABLAROCA') || desc.includes('YESO') || 
      desc.includes('PANEL') || desc.includes('PLACA') || desc.includes('DENSGLASS') ||
      desc.includes('PERMABASE') || desc.includes('TABLERO')) {
    return '30161500';
  }
  
  // 4. Tornillería y Fijación
  if (desc.includes('TORNILLO') || desc.includes('PIJA') || desc.includes('CLAVO') || 
      desc.includes('TAQUETE') || desc.includes('ANCLAJE') || desc.includes('PERNO') || 
      desc.includes('SUJETADOR') || desc.includes('BROCA') || desc.includes('PUNTA')) {
    return '31161500';
  }
  
  // 5. Cintas y Mallas de Refuerzo
  if (desc.includes('CINTA') || desc.includes('MALLA') || desc.includes('REFUERZO') || 
      desc.includes('PERFACINTA') || desc.includes('FIBRA') || desc.includes('TELA')) {
    return '31151500';
  }
  
  // 6. Aislamientos Térmicos y Acústicos
  if (desc.includes('AISLAMIENTO') || desc.includes('LANA') || desc.includes('COLCHONETA') || 
      desc.includes('FOAM') || desc.includes('POLIESTIRENO') || desc.includes('FIBRA DE VIDRIO')) {
    return '30141500';
  }
  
  // 7. Selladores y Químicos
  if (desc.includes('SELLADOR') || desc.includes('SILICON') || desc.includes('IMPERMEABILIZANTE') ||
      desc.includes('ADITIVO') || desc.includes('LIMPIADOR')) {
    return '31201600';
  }
  
  // 8. Herramientas
  if (desc.includes('ESPATULA') || desc.includes('LLANA') || desc.includes('MARTILLO') || 
      desc.includes('SERRUCHO') || desc.includes('HERRAMIENTA') || desc.includes('TIJERA') ||
      desc.includes('FLEXOMETRO') || desc.includes('NIVEL')) {
    return '27112100';
  }

  // 9. Desperdicio
  if (desc.includes('DESPERDICIO') || desc.includes('SCRAP') || desc.includes('SOBRANTE')) {
    return '11141501';
  }

  return '01010101'; 
};

export const getStoredInventory = (location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN'): Record<string, InventarioItem> => {
  const key = location === 'MAIN' ? KEYS.INVENTORY_MAIN : (location === 'MZT' ? KEYS.INVENTORY_MZT : KEYS.INVENTORY_TAB);
  const data = localStorage.getItem(key);
  const inventory: Record<string, InventarioItem> = data ? JSON.parse(data) : {};
  
  // Asegurar que todos los productos tengan clave SAT
  let changed = false;
  Object.keys(inventory).forEach(sku => {
    // Si no tiene clave o tiene la genérica, intentamos re-asignar con la nueva lógica intuitiva
    if (!inventory[sku].claveSAT || inventory[sku].claveSAT === '01010101') {
      const newCode = getSATCodeByDescription(inventory[sku].descripcion);
      if (newCode !== inventory[sku].claveSAT) {
        inventory[sku].claveSAT = newCode;
        changed = true;
      }
    }
  });

  if (changed) {
    setStoredInventory(inventory, location);
  }

  return inventory;
};

export const setStoredInventory = (inventory: Record<string, InventarioItem>, location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN') => {
  const key = location === 'MAIN' ? KEYS.INVENTORY_MAIN : (location === 'MZT' ? KEYS.INVENTORY_MZT : KEYS.INVENTORY_TAB);
  localStorage.setItem(key, JSON.stringify(inventory));
};

export const getInventorySnapshots = (): Record<string, Record<string, InventarioItem>> => {
  const data = localStorage.getItem(KEYS.SNAPSHOTS);
  return data ? JSON.parse(data) : {};
};

export const saveInventorySnapshot = (location: 'MAIN' | 'MZT' | 'TAB', date: string, inventory: Record<string, InventarioItem>) => {
  const snapshots = getInventorySnapshots();
  snapshots[`${location}_${date}`] = inventory;
  localStorage.setItem(KEYS.SNAPSHOTS, JSON.stringify(snapshots));
};

export const getStoredCosts = (): Record<string, number> => {
  const data = localStorage.getItem(KEYS.COSTS);
  return data ? JSON.parse(data) : {};
};

export const setStoredCosts = (costs: Record<string, number>) => {
  localStorage.setItem(KEYS.COSTS, JSON.stringify(costs));
};

export const getStoredClients = (location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN'): Record<string, Cliente> => {
  const key = location === 'MAIN' ? KEYS.CLIENTS : (location === 'MZT' ? KEYS.CLIENTS_MZT : KEYS.CLIENTS_TAB);
  const data = localStorage.getItem(key);
  const clients: Record<string, Cliente> = data ? JSON.parse(data) : {};
  
  // Default client
  if (Object.keys(clients).length === 0) {
    const defaultClient = {
      nombre: "PUBLICO EN GENERAL",
      direccion: "MOSTRADOR",
      contacto: "CLIENTE FINAL",
      telefono: "0000000000"
    };
    clients[defaultClient.nombre] = defaultClient;
    localStorage.setItem(key, JSON.stringify(clients));
  }
  
  return clients;
};

export const setStoredClients = (clients: Record<string, Cliente>, location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN') => {
  const key = location === 'MAIN' ? KEYS.CLIENTS : (location === 'MZT' ? KEYS.CLIENTS_MZT : KEYS.CLIENTS_TAB);
  localStorage.setItem(key, JSON.stringify(clients));
};

export const getStoredExpenses = (): Gastos => {
  const data = localStorage.getItem(KEYS.EXPENSES);
  return data ? JSON.parse(data) : { operativos: 0, envio: 0, otros: 0 };
};

export const setStoredExpenses = (expenses: Gastos) => {
  localStorage.setItem(KEYS.EXPENSES, JSON.stringify(expenses));
};

export const getStoredBOMs = (): BOM[] => {
  const data = localStorage.getItem(KEYS.BOMS);
  return data ? JSON.parse(data) : [];
};

export const setStoredBOMs = (boms: BOM[]) => {
  localStorage.setItem(KEYS.BOMS, JSON.stringify(boms));
};

export const getCompanyData = (location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN'): CompanyData => {
  const key = location === 'TAB' ? KEYS.COMPANY_TAB : KEYS.COMPANY;
  const data = localStorage.getItem(key);
  if (data) return JSON.parse(data);
  
  if (location === 'TAB') {
    return {
      nombre: "SUC. +TABLAROCA",
      direccion: "DIRECCIÓN TABLAROCA",
      telefono: "0000000000",
      correo: "tablaroca@example.com",
      rfc: "TAB000000XXX",
      leyenda: "Sucursal Tablaroca"
    };
  }

  return {
    nombre: "GRUPO MASTABLAROCA LOS MOCHIS",
    direccion: "5 DE FEBRERO 364, COL. ANÁHUAC, LOS MOCHIS, SIN. CP 81280",
    telefono: "6681234567",
    correo: "contacto@mastablaroca.com",
    rfc: "GML240101ABC",
    leyenda: "Materiales de alta calidad"
  };
};

export const setCompanyData = (data: CompanyData, location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN') => {
  const key = location === 'TAB' ? KEYS.COMPANY_TAB : KEYS.COMPANY;
  localStorage.setItem(key, JSON.stringify(data));
};

export const getInventoryMovements = (): InventoryMovement[] => {
  const data = localStorage.getItem(KEYS.MOVEMENTS);
  return data ? JSON.parse(data) : [];
};

export const setInventoryMovements = (movements: InventoryMovement[]) => {
  localStorage.setItem(KEYS.MOVEMENTS, JSON.stringify(movements));
};

export const getQuotesHistory = (): GeneratedQuote[] => {
  const data = localStorage.getItem(KEYS.QUOTE_HISTORY);
  return data ? JSON.parse(data) : [];
};

export const saveQuoteToHistory = (quote: GeneratedQuote) => {
  const history = getQuotesHistory();
  localStorage.setItem(KEYS.QUOTE_HISTORY, JSON.stringify([quote, ...history].slice(0, 50)));
};

export const getShipmentsHistory = (): GeneratedShipment[] => {
  const data = localStorage.getItem(KEYS.HISTORY);
  return data ? JSON.parse(data) : [];
};

export const saveShipmentToHistory = (shipment: GeneratedShipment) => {
  const history = getShipmentsHistory();
  localStorage.setItem(KEYS.HISTORY, JSON.stringify([shipment, ...history].slice(0, 50)));
};

export const deductFromInventory = (codigo: string, cantidad: number, referencia: string = "Venta", location: 'MAIN' | 'MZT' | 'TAB' = 'MAIN') => {
  const inv = getStoredInventory(location);
  const movements = getInventoryMovements();
  const upper = codigo.toUpperCase();
  if (inv[upper]) {
    inv[upper].cantidadFisica = Math.max(0, inv[upper].cantidadFisica - cantidad);
    const movement: InventoryMovement = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      sku: upper,
      cantidad: cantidad,
      tipo: 'OUT',
      fecha: new Date().toISOString(),
      referencia: `${referencia} (${location})`
    };
    setStoredInventory(inv, location);
    setInventoryMovements([movement, ...movements]);
  }
};

export const getInventoryAtDate = (targetDate: string, location: 'MAIN' | 'MZT' | 'TAB'): Record<string, InventarioItem> => {
    const snapshots = getInventorySnapshots();
    const snapshotKey = `${location}_${targetDate}`;
    
    if (snapshots[snapshotKey]) {
      return JSON.parse(JSON.stringify(snapshots[snapshotKey]));
    }

    const currentInv = getStoredInventory(location);
    const todayStr = new Date().toISOString().split('T')[0];
    if (targetDate === todayStr) return JSON.parse(JSON.stringify(currentInv));
    const allMovements = getInventoryMovements().filter(m => m.referencia.includes(`(${location})`));
    const snapshot = JSON.parse(JSON.stringify(currentInv));
    const endOfTargetDay = new Date(targetDate + 'T23:59:59').getTime();
    allMovements.forEach(m => {
        const moveTime = new Date(m.fecha).getTime();
        if (moveTime > endOfTargetDay) {
            if (snapshot[m.sku]) {
                if (m.tipo === 'OUT') snapshot[m.sku].cantidadFisica += m.cantidad;
                else if (m.tipo === 'IN') snapshot[m.sku].cantidadFisica -= m.cantidad;
            }
        }
    });
    return snapshot;
};

const getFullSystemData = () => {
  return {
    [KEYS.COSTS]: getStoredCosts(),
    [KEYS.SALE_PRICES_MAIN]: localStorage.getItem(KEYS.SALE_PRICES_MAIN) ? JSON.parse(localStorage.getItem(KEYS.SALE_PRICES_MAIN)!) : {},
    [KEYS.SALE_PRICES_MZT]: localStorage.getItem(KEYS.SALE_PRICES_MZT) ? JSON.parse(localStorage.getItem(KEYS.SALE_PRICES_MZT)!) : {},
    [KEYS.SALE_PRICES_TAB]: localStorage.getItem(KEYS.SALE_PRICES_TAB) ? JSON.parse(localStorage.getItem(KEYS.SALE_PRICES_TAB)!) : {},
    [KEYS.WHOLESALE_PRICES_MAIN]: localStorage.getItem(KEYS.WHOLESALE_PRICES_MAIN) ? JSON.parse(localStorage.getItem(KEYS.WHOLESALE_PRICES_MAIN)!) : {},
    [KEYS.WHOLESALE_PRICES_MZT]: localStorage.getItem(KEYS.WHOLESALE_PRICES_MZT) ? JSON.parse(localStorage.getItem(KEYS.WHOLESALE_PRICES_MZT)!) : {},
    [KEYS.WHOLESALE_PRICES_TAB]: localStorage.getItem(KEYS.WHOLESALE_PRICES_TAB) ? JSON.parse(localStorage.getItem(KEYS.WHOLESALE_PRICES_TAB)!) : {},
    [KEYS.EXPENSES]: getStoredExpenses(),
    [KEYS.CLIENTS]: getStoredClients(),
    [KEYS.INVENTORY_MAIN]: getStoredInventory('MAIN'),
    [KEYS.INVENTORY_MZT]: getStoredInventory('MZT'),
    [KEYS.INVENTORY_TAB]: getStoredInventory('TAB'),
    [KEYS.MOVEMENTS]: getInventoryMovements(),
    [KEYS.COMPANY]: getCompanyData('MAIN'),
    [KEYS.COMPANY_TAB]: getCompanyData('TAB'),
    [KEYS.HISTORY]: getShipmentsHistory(),
    [KEYS.QUOTE_HISTORY]: getQuotesHistory(),
    [KEYS.BOMS]: getStoredBOMs(),
    [KEYS.PURCHASES]: getStoredPurchases(),
    [KEYS.SALES_HISTORY]: getStoredSalesHistory(),
    [KEYS.PRODUCTION_HISTORY]: getProductionHistory(),
  };
};

export const copySyncTokenToClipboard = async () => {
  const data = getFullSystemData();
  const jsonStr = JSON.stringify(data);
  const bytes = new TextEncoder().encode(jsonStr);
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const token = btoa(binString);
  await navigator.clipboard.writeText(`GML-SYNC:${token}`);
  return true;
};

export const bulkLoadTablarocaCatalog = (catalog: { codigo: string, descripcion: string, precio: number }[]) => {
  const currentInv = getStoredInventory('TAB');
  const currentPrices = getStoredSalePrices('TAB');
  
  catalog.forEach(item => {
    const code = item.codigo.toUpperCase();
    if (!currentInv[code]) {
      currentInv[code] = {
        codigo: code,
        descripcion: item.descripcion.toUpperCase(),
        pesoUnitario: 0,
        cantidadFisica: 0,
        fechaToma: new Date().toLocaleDateString(),
        observaciones: "Carga inicial de catálogo",
        oculto: false
      };
    }
    currentPrices[code] = item.precio;
  });
  
  setStoredInventory(currentInv, 'TAB');
  setStoredSalePrices(currentPrices, 'TAB');
  return true;
};

export const importFromSyncToken = (token: string, target: 'MAIN' | 'MZT' | 'TAB' | 'BOTH'): boolean => {
  try {
    const cleanToken = token.trim().startsWith('GML-SYNC:') ? token.trim().replace('GML-SYNC:', '') : token.trim();
    if (!cleanToken) return false;
    const binString = atob(cleanToken);
    const bytes = Uint8Array.from(binString, (char) => char.charCodeAt(0));
    const jsonStr = new TextDecoder().decode(bytes);
    const json = JSON.parse(jsonStr);
    
    const safeSet = (key: string, val: any) => {
      if (val !== undefined && val !== null) {
        localStorage.setItem(key, JSON.stringify(val));
      }
    };

    if (target === 'BOTH') {
      Object.keys(json).forEach(key => safeSet(key, json[key]));
    } else if (target === 'MAIN') {
      safeSet(KEYS.INVENTORY_MAIN, json[KEYS.INVENTORY_MAIN]);
      safeSet(KEYS.SALE_PRICES_MAIN, json[KEYS.SALE_PRICES_MAIN]);
      safeSet(KEYS.WHOLESALE_PRICES_MAIN, json[KEYS.WHOLESALE_PRICES_MAIN]);
      safeSet(KEYS.COSTS, json[KEYS.COSTS]);
      safeSet(KEYS.CLIENTS, json[KEYS.CLIENTS]);
      safeSet(KEYS.COMPANY, json[KEYS.COMPANY]);
      safeSet(KEYS.EXPENSES, json[KEYS.EXPENSES]);
      safeSet(KEYS.BOMS, json[KEYS.BOMS]);
      safeSet(KEYS.MOVEMENTS, json[KEYS.MOVEMENTS]);
      safeSet(KEYS.HISTORY, json[KEYS.HISTORY]);
      safeSet(KEYS.QUOTE_HISTORY, json[KEYS.QUOTE_HISTORY]);
      safeSet(KEYS.PURCHASES, json[KEYS.PURCHASES]);
      safeSet(KEYS.SALES_HISTORY, json[KEYS.SALES_HISTORY]);
      safeSet(KEYS.PRODUCTION_HISTORY, json[KEYS.PRODUCTION_HISTORY]);
    } else if (target === 'MZT') {
      safeSet(KEYS.INVENTORY_MZT, json[KEYS.INVENTORY_MZT]);
      safeSet(KEYS.SALE_PRICES_MZT, json[KEYS.SALE_PRICES_MZT]);
      safeSet(KEYS.WHOLESALE_PRICES_MZT, json[KEYS.WHOLESALE_PRICES_MZT]);
      safeSet(KEYS.SALES_HISTORY, json[KEYS.SALES_HISTORY]);
    } else if (target === 'TAB') {
      safeSet(KEYS.INVENTORY_TAB, json[KEYS.INVENTORY_TAB]);
      safeSet(KEYS.SALE_PRICES_TAB, json[KEYS.SALE_PRICES_TAB]);
      safeSet(KEYS.WHOLESALE_PRICES_TAB, json[KEYS.WHOLESALE_PRICES_TAB]);
      safeSet(KEYS.COMPANY_TAB, json[KEYS.COMPANY_TAB]);
    }
    return true;
  } catch (e) {
    console.error("Error crítico al importar token:", e);
    return false;
  }
};
