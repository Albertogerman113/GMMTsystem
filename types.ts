
export interface Partida {
  id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  ventaUnit: number;
  costoUnit: number;
  pesoUnit: number;
  pesoTotal: number;
  utilidadTotal: number;
  claveSAT?: string;
}

export interface PurchaseItem extends Partida {
  recibido?: boolean;
}

export type PurchaseStatus = 'REQUISITION' | 'QUOTED' | 'ORDERED' | 'RECEIVED';
export type PurchaseType = 'EXTERNAL' | 'INTERNAL_TRANSFER';
export type PaymentMethod = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

export interface PurchaseOrder {
  id: string;
  folio: string;
  fecha: string;
  sucursal: 'MAIN' | 'MZT' | 'TAB';
  tipo: PurchaseType;
  proveedor: string;
  items: PurchaseItem[];
  status: PurchaseStatus;
  totalEstimado: number;
  costoSeguro?: number;
  costoManiobra?: number;
  folioCotizacionProveedor?: string;
  comentarios: string;
}

export interface PaymentDetail {
  metodo: PaymentMethod;
  monto: number;
}

export interface SaleRecord {
  id: string;
  folio: string;
  fecha: string;
  sucursal: 'MAIN' | 'MZT' | 'TAB';
  items: Partida[];
  subtotal: number;
  iva: number;
  total: number;
  metodoPago: PaymentMethod;
  pagos?: PaymentDetail[];
  vendedor: string;
  cliente?: string;
}

export interface GeneratedQuote {
  id: string;
  folio: string;
  fecha: string;
  usuario: string;
  cliente: string;
  subtotal: number;
  iva: number;
  total: number;
  items: Partida[];
}

export interface GeneratedShipment {
  id: string;
  folio: string;
  fecha: string;
  usuario: string;
  cliente: string;
  pesoTotal: number;
  items: Partida[];
  comments: string;
  isFinalized: boolean; // Nuevo: Para saber si ya descontó stock
}

export interface Cliente {
  nombre: string;
  direccion: string;
  contacto: string;
  telefono: string;
  listaPrecios?: Record<string, number>; // Precios específicos para este cliente
}

export interface CompanyData {
  nombre: string;
  direccion: string;
  telefono: string;
  correo: string;
  rfc: string;
  leyenda: string;
  logoUrl?: string;
}

export interface Gastos {
  operativos: number;
  envio: number;
  otros: number;
}

export interface InventarioItem {
  codigo: string;
  descripcion: string;
  pesoUnitario: number;
  cantidadFisica: number;
  fechaToma: string;
  observaciones: string;
  oculto?: boolean;
  claveSAT?: string;
}

// Added BOMComponent interface to fix compilation error in components/BOMView.tsx
export interface BOMComponent {
  codigo: string;
  cantidad: number;
}

// Added BOM interface to fix compilation errors in utils/storage.ts, components/ProductionPlanView.tsx, and components/BOMView.tsx
export interface BOM {
  id: string;
  codigoFinal: string;
  descripcion: string;
  componentes: BOMComponent[];
  pesoTotalEst: number;
}

// Added InventoryMovement interface to fix compilation errors in utils/storage.ts and components/InventoryView.tsx
export interface InventoryMovement {
  id: string;
  sku: string;
  cantidad: number;
  tipo: 'IN' | 'OUT';
  fecha: string;
  referencia: string;
}

// Added CompetitorItem interface as it is a required part of CompetitorReport
export interface CompetitorItem {
  codigo: string;
  descripcion: string;
  precio: number;
}

// Added CompetitorReport interface to fix compilation error in components/CompetitionView.tsx
export interface CompetitorReport {
  empresa: string;
  fecha: string;
  items: CompetitorItem[];
}

export interface ProductionRecord {
  id: string;
  codigoPT: string;
  descripcion: string;
  cantidad: number;
  desperdicio: number;
  fecha: string;
  usuario: string;
}

export enum AppSection {
  ANALYSIS = 'ANALYSIS',
  DELIVERY = 'DELIVERY',
  PRODUCTION = 'PRODUCTION',
  BOMS = 'BOMS',
  INVENTORY = 'INVENTORY',
  SETTINGS = 'SETTINGS',
  COMPETITION = 'COMPETITION',
  MAZATLAN = 'MAZATLAN',
  TABLAROCA = 'TABLAROCA',
  PURCHASING = 'PURCHASING'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  PRODUCTION = 'PRODUCTION',
  SALES_MZT = 'SALES_MZT',
  SALES_TAB = 'SALES_TAB'
}

export interface UserSession {
  username: string;
  role: UserRole;
}
