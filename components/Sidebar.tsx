
import React from 'react';
import { AppSection, UserRole, UserSession } from '../types';

interface SidebarProps {
  activeSection: AppSection;
  onSelect: (section: AppSection) => void;
  currentUser: UserSession;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSelect, currentUser, isOpen, onClose }) => {
  const allMenuItems = [
    { id: AppSection.MAZATLAN, label: 'Suc. Mazatlán', icon: 'fa-map-marker-alt', roles: [UserRole.ADMIN, UserRole.SALES_MZT], color: 'text-cyan-400' },
    { id: AppSection.TABLAROCA, label: 'Suc. +Tablaroca', icon: 'fa-building', roles: [UserRole.ADMIN, UserRole.SALES_TAB], color: 'text-indigo-400' },
    { id: AppSection.PURCHASING, label: 'Compras / Abasto', icon: 'fa-shopping-cart', roles: [UserRole.ADMIN, UserRole.SALES_MZT], color: 'text-orange-400' },
    { id: AppSection.ANALYSIS, label: 'Cotizaciones', icon: 'fa-file-invoice-dollar', roles: [UserRole.ADMIN] },
    { id: AppSection.DELIVERY, label: 'Envíos', icon: 'fa-truck', roles: [UserRole.ADMIN, UserRole.PRODUCTION] },
    { id: AppSection.COMPETITION, label: 'Competencia', icon: 'fa-chart-area', roles: [UserRole.ADMIN] },
    { id: AppSection.PRODUCTION, label: 'Producción', icon: 'fa-industry', roles: [UserRole.ADMIN, UserRole.PRODUCTION] },
    { id: AppSection.BOMS, label: 'BOMs (Recetas)', icon: 'fa-sitemap', roles: [UserRole.ADMIN, UserRole.PRODUCTION] },
    { id: AppSection.INVENTORY, label: 'Inventario', icon: 'fa-boxes', roles: [UserRole.ADMIN, UserRole.PRODUCTION] },
    { id: AppSection.SETTINGS, label: 'Configuración', icon: 'fa-cog', roles: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.SALES_MZT, UserRole.SALES_TAB, UserRole.STAFF] },
  ];

  const menuItems = allMenuItems.filter(item => item.roles.includes(currentUser.role));

  return (
    <aside className={`fixed lg:static inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-50 transition-transform duration-300 transform ${
      isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    }`}>
      <div className="p-6 lg:p-8 border-b border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/20">
            <i className="fas fa-layer-group text-white text-xl"></i>
          </div>
          <div className="flex flex-col">
            <h1 className="font-black text-sm tracking-tighter leading-none">MAS TABLAROCA</h1>
            <span className="text-[9px] font-bold text-slate-500 tracking-[0.2em] uppercase mt-1">Los Mochis</span>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
          <i className="fas fa-times text-xl"></i>
        </button>
      </div>
      
      <nav className="flex-1 mt-4 lg:mt-8 px-4 overflow-y-auto">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item.id)}
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-300 group ${
                  activeSection === item.id 
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20 translate-x-1' 
                    : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeSection === item.id 
                    ? 'bg-white/20' 
                    : 'bg-slate-800 group-hover:bg-slate-700'
                }`}>
                  <i className={`fas ${item.icon} text-sm ${item.color || ''}`}></i>
                </div>
                <span className={`font-black text-[11px] uppercase tracking-widest`}>
                  {item.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-6">
        <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-800">
          <p className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-widest">Estado Sistema</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 shadow-lg shadow-green-400/50 animate-pulse"></div>
              <span className="text-[10px] font-bold uppercase text-slate-300">Mazatlán Online</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
