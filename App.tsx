
import React, { useState } from 'react';
import { AppSection, UserRole, UserSession, Partida, Cliente, Gastos } from './types';
import Sidebar from './components/Sidebar';
import AnalysisView from './components/AnalysisView';
import DeliveryView from './components/DeliveryView';
import InventoryView from './components/InventoryView';
import SettingsView from './components/SettingsView';
import AiChatWidget from './components/AiChatWidget';
import ProductionPlanView from './components/ProductionPlanView';
import BOMView from './components/BOMView';
import CompetitionView from './components/CompetitionView';
import MazatlanView from './components/MazatlanView';
import TablarocaBranchView from './components/TablarocaBranchView';
import PurchasingView from './components/PurchasingView';
import { saveInventorySnapshot, getInventorySnapshots } from './utils/storage';
import { SNAPSHOT_2025_12_31 } from './utils/snapshot_data';

const VALID_USERS = [
  { username: 'Admin', password: 'mas2025', role: UserRole.ADMIN },
  { username: 'Karo', password: 'Lapiz1325', role: UserRole.ADMIN },
  { username: 'Jose', password: 'asd123', role: UserRole.SALES_MZT },
  { username: 'Manuel', password: 'Produccion1', role: UserRole.PRODUCTION },
  { username: 'P.MAZATLAN', password: 'Ventas', role: UserRole.SALES_MZT },
  { username: 'Alejandra', password: 'Admin', role: UserRole.SALES_TAB }
];

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AppSection>(AppSection.MAZATLAN);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Estados persistentes compartidos...
  const [analysisPartidas, setAnalysisPartidas] = useState<Partida[]>([]);
  const [analysisClient, setAnalysisClient] = useState<Cliente | null>(null);
  const [analysisFolio, setAnalysisFolio] = useState('');
  const [analysisExpenses, setAnalysisExpenses] = useState<Gastos>({ operativos: 0, envio: 0, otros: 0 });
  const [analysisMode, setAnalysisMode] = useState<'ANALYSIS' | 'QUOTE'>('ANALYSIS');

  const [deliveryItems, setDeliveryItems] = useState<Partida[]>([]);
  const [deliveryFolio, setDeliveryFolio] = useState('');
  const [deliveryComments, setDeliveryComments] = useState('');
  const [deliveryClient, setDeliveryClient] = useState<Cliente | null>(null);

  const [productionJobs, setProductionJobs] = useState<any[]>([]);

  React.useEffect(() => {
    const snapshots = getInventorySnapshots();
    if (!snapshots['MAIN_2025-12-31']) {
      saveInventorySnapshot('MAIN', '2025-12-31', SNAPSHOT_2025_12_31);
    }
  }, []);

  const handleNewQuote = () => {
    setAnalysisPartidas([]);
    setAnalysisClient(null);
    setAnalysisFolio('');
    setAnalysisExpenses({ operativos: 0, envio: 0, otros: 0 });
    setAnalysisMode('QUOTE');
  };

  const handleNewDelivery = () => {
    setDeliveryItems([]);
    setDeliveryFolio('');
    setDeliveryComments('');
    setDeliveryClient(null);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const userMatch = VALID_USERS.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );

    if (userMatch) {
      const session: UserSession = { username: userMatch.username, role: userMatch.role };
      setCurrentUser(session);
      setError('');
      if (userMatch.role === UserRole.SALES_MZT) setActiveSection(AppSection.MAZATLAN);
      else if (userMatch.role === UserRole.SALES_TAB) setActiveSection(AppSection.TABLAROCA);
      else if (userMatch.role === UserRole.PRODUCTION) setActiveSection(AppSection.INVENTORY);
      else setActiveSection(AppSection.MAZATLAN);
    } else {
      setError('Usuario o contraseña incorrectos');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUsername('');
    setPassword('');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-10 w-full max-w-md animate-in zoom-in duration-300 border border-white/10">
          <div className="flex justify-center mb-8">
            <div className="bg-blue-600 p-5 rounded-full shadow-xl shadow-blue-500/20 ring-4 ring-blue-50">
              <i className="fas fa-lock text-white text-3xl md:text-4xl"></i>
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-center text-slate-800 mb-2 uppercase tracking-tighter">Acceso al Sistema</h1>
          <p className="text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-8">Grupo Mas Tablaroca v2.5</p>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuario</label>
              <div className="relative">
                <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-100 bg-slate-50 outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                  placeholder="Nombre de usuario"
                  required 
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
              <div className="relative">
                <i className="fas fa-key absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-100 bg-slate-50 outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                  placeholder="••••••••"
                  required 
                />
              </div>
            </div>
            {error && (
              <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-wider p-3 rounded-lg text-center border border-red-100 animate-bounce">
                <i className="fas fa-exclamation-circle mr-2"></i>
                {error}
              </div>
            )}
            <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-xl shadow-xl shadow-slate-900/20 transition-all uppercase text-xs tracking-widest mt-6 active:scale-[0.98]">
              Iniciar Sesión <i className="fas fa-arrow-right ml-2"></i>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isManuel = currentUser.username.toLowerCase() === 'manuel';

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans relative overflow-hidden">
      <Sidebar 
        activeSection={activeSection} 
        onSelect={(section) => {
          setActiveSection(section);
          setIsSidebarOpen(false);
        }} 
        currentUser={currentUser}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-10 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        <header className="bg-white border-b px-4 lg:px-8 py-3 lg:py-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600"
            >
              <i className="fas fa-bars"></i>
            </button>
            <h2 className="text-base lg:text-xl font-black text-slate-800 flex items-center gap-2 lg:gap-3 uppercase tracking-tighter truncate max-w-[200px] lg:max-w-none">
              {activeSection === AppSection.MAZATLAN && <><i className="fas fa-map-marker-alt text-cyan-500"></i> <span className="hidden sm:inline">Sucursal</span> Mazatlán</>}
              {activeSection === AppSection.TABLAROCA && <><i className="fas fa-building text-indigo-500"></i> <span className="hidden sm:inline">Sucursal</span> +Tablaroca</>}
              {activeSection === AppSection.PURCHASING && <><i className="fas fa-shopping-cart text-orange-500"></i> <span className="hidden sm:inline">Gestión de</span> Compras</>}
              {activeSection === AppSection.ANALYSIS && <><i className="fas fa-file-invoice-dollar text-blue-600"></i> Análisis</>}
              {activeSection === AppSection.DELIVERY && <><i className="fas fa-truck text-green-600"></i> Envíos</>}
              {activeSection === AppSection.COMPETITION && <><i className="fas fa-chart-area text-purple-600"></i> Mercado</>}
              {activeSection === AppSection.PRODUCTION && <><i className="fas fa-industry text-amber-600"></i> Producción</>}
              {activeSection === AppSection.BOMS && <><i className="fas fa-sitemap text-indigo-600"></i> BOMs</>}
              {activeSection === AppSection.INVENTORY && <><i className="fas fa-boxes text-orange-600"></i> Inventario</>}
              {activeSection === AppSection.SETTINGS && <><i className="fas fa-cog text-gray-600"></i> Config</>}
            </h2>
          </div>
          <div className="flex items-center gap-2 lg:gap-4">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-[8px] lg:text-[10px] font-black text-blue-600 uppercase tracking-widest">{currentUser.role}</span>
              <span className="text-xs lg:text-sm font-bold text-slate-700">{currentUser.username}</span>
            </div>
            <button onClick={handleLogout} className="w-9 h-9 lg:w-10 lg:h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50">
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-[#fdfdfd]">
          {activeSection === AppSection.MAZATLAN && <MazatlanView currentUser={currentUser} />}
          {activeSection === AppSection.TABLAROCA && <TablarocaBranchView currentUser={currentUser} />}
          {activeSection === AppSection.PURCHASING && <PurchasingView currentUser={currentUser} branch="MAIN" />}
          {activeSection === AppSection.ANALYSIS && (
            <AnalysisView 
              currentUser={currentUser}
              partidas={analysisPartidas} setPartidas={setAnalysisPartidas}
              selectedClient={analysisClient} setSelectedClient={setAnalysisClient}
              quoteFolio={analysisFolio} setQuoteFolio={setAnalysisFolio}
              sessionExpenses={analysisExpenses} setSessionExpenses={setAnalysisExpenses}
              mode={analysisMode} setMode={setAnalysisMode}
              onClear={handleNewQuote}
              location={currentUser.role === UserRole.SALES_MZT ? 'MZT' : currentUser.role === UserRole.SALES_TAB ? 'TAB' : 'MAIN'}
            />
          )}
          {activeSection === AppSection.DELIVERY && (
            <DeliveryView 
              currentUser={currentUser}
              items={deliveryItems} setItems={setDeliveryItems}
              quoteNumber={deliveryFolio} setQuoteNumber={setDeliveryFolio}
              comments={deliveryComments} setComments={setDeliveryComments}
              selectedClient={deliveryClient} setSelectedClient={setDeliveryClient}
              onClear={handleNewDelivery}
              isReadOnly={isManuel}
              location={currentUser.role === UserRole.SALES_MZT ? 'MZT' : currentUser.role === UserRole.SALES_TAB ? 'TAB' : 'MAIN'}
            />
          )}
          {activeSection === AppSection.COMPETITION && <CompetitionView />}
          {activeSection === AppSection.PRODUCTION && (
            <ProductionPlanView 
              jobs={productionJobs} 
              setJobs={setProductionJobs} 
              onClear={() => setProductionJobs([])}
              isReadOnly={isManuel}
              currentUser={currentUser}
            />
          )}
          {activeSection === AppSection.BOMS && <BOMView isReadOnly={isManuel} />}
          {activeSection === AppSection.INVENTORY && <InventoryView currentUser={currentUser} forcedLocation={currentUser.role === UserRole.SALES_MZT ? 'MZT' : currentUser.role === UserRole.SALES_TAB ? 'TAB' : undefined} />}
          {activeSection === AppSection.SETTINGS && <SettingsView currentUser={currentUser} />}
        </div>
      </main>
      <AiChatWidget />
    </div>
  );
};

export default App;
