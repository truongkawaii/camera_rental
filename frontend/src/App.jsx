import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { BarChart3, Package, Calendar, Users, LogOut, Menu, X, Activity, ShieldCheck, Store, TrendingUp, Wallet, ChevronDown, Percent, GitBranch } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import DashboardV1 from './pages/DashboardV1';
import Equipment from './pages/Equipment';
import Rentals from './pages/Rentals';
import Customers from './pages/Customers';
import CalendarPage from './pages/Calendar';
import ActivityLog from './pages/ActivityLog';
import Branches from './pages/Branches';
import Performance from './pages/Performance';
import UsersPage from './pages/Users';
import Payroll from './pages/Payroll';
import SaleTransfer from './pages/SaleTransfer';
import CommissionConfigs from './pages/CommissionConfigs';
import CollaboratorHierarchy from './pages/CollaboratorHierarchy';
import Login from './pages/Login';
import './index.css';

/* ── Auth Gate ──────────────────────────────────────────────────── */
function AuthGate() {
  const { user, loading, logout, isAdmin, isSaler, isCameraManager, isInvestor, isDriver, activeRole, switchRole } = useAuth();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = React.useState(false);

  // Close mobile menu on route change
  const location = useLocation();
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="flex h-[100dvh] bg-gray-100 overflow-x-hidden">
      {/* ── Mobile Overlay ────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[100] xl:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <div className={`
        fixed inset-y-0 left-0 z-[110] transform xl:relative xl:translate-x-0 flex flex-col bg-secondary text-white
        ${sidebarOpen ? 'w-64' : 'w-20'}
        ${mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full xl:translate-x-0'}
      `}>
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between gap-2">
            {(sidebarOpen || mobileMenuOpen) ? (
              <>
                <div className="flex items-center gap-2.5">
                  <img src="/camera-icon.svg" className="w-8 h-8 shrink-0" alt="Logo" />
                  <div>
                    <h1 className="text-lg font-bold text-primary whitespace-nowrap leading-none">SnapPro</h1>
                    <p className="text-[10px] text-gray-400 whitespace-nowrap mt-1">Camera Rental</p>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-2 hover:bg-gray-700 rounded-lg hidden xl:block"
                >
                  <Menu size={20} />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center w-full gap-2">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 hover:bg-gray-700 rounded-lg"
                  title="Mở rộng"
                >
                  <img src="/camera-icon.svg" className="w-8 h-8 hover:scale-110 transition-transform" alt="Logo" />
                </button>
              </div>
            )}
            {mobileMenuOpen && (
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 hover:bg-gray-700 rounded-lg xl:hidden"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* User badge */}
        {(sidebarOpen || mobileMenuOpen) && (
          <div className="px-4 py-3 border-b border-gray-700 relative">
            <div 
              className={`flex items-center justify-between ${user?.roles?.length > 1 ? 'cursor-pointer hover:bg-gray-800 p-1 -mx-1 rounded' : ''}`}
              onClick={() => {
                if (user?.roles?.length > 1) {
                  setRoleDropdownOpen(!roleDropdownOpen);
                }
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg shrink-0 ${
                  isAdmin ? 'bg-orange-500/20' :
                  isCameraManager ? 'bg-purple-500/20' :
                  isInvestor ? 'bg-emerald-500/20' :
                  'bg-blue-500/20'
                }`}>
                  {isAdmin ? <ShieldCheck size={16} className="text-orange-400" /> :
                   isCameraManager ? <ShieldCheck size={16} className="text-purple-400" /> :
                   isInvestor ? <ShieldCheck size={16} className="text-emerald-400" /> :
                   <Store size={16} className="text-blue-400" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.full_name || user.username}</p>
                  <p className={`text-xs font-semibold ${
                    isAdmin ? 'text-orange-400' :
                    isCameraManager ? 'text-purple-400' :
                    isInvestor ? 'text-emerald-400' :
                    'text-blue-400'
                  }`}>
                    {isAdmin ? 'Quản trị viên' : isCameraManager ? 'Quản lý Camera' : isInvestor ? 'Nhà đầu tư' : activeRole === 'driver' ? 'Giao nhận máy' : 'Nhân viên bán hàng'}
                  </p>
                </div>
              </div>
              {user?.roles?.length > 1 && (
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
              )}
            </div>

            {roleDropdownOpen && user?.roles?.length > 1 && (
              <div className="absolute top-full left-4 right-4 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                {user.roles.map(r => (
                  <button
                    key={r}
                    className={`w-full text-left px-3 py-2 text-sm ${r === activeRole ? 'bg-primary/20 text-primary' : 'text-gray-300 hover:bg-gray-700'}`}
                    onClick={() => {
                      switchRole(r);
                      setRoleDropdownOpen(false);
                    }}
                  >
                    {r === 'admin' ? 'Quản trị viên' : r === 'camera_manager' ? 'Quản lý Camera' : r === 'investor' ? 'Nhà đầu tư' : r === 'driver' ? 'Giao nhận máy' : 'Nhân viên bán hàng'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar-dark">
          {(isAdmin || isCameraManager || isInvestor || isDriver) && (
            <NavLink to="/"          icon={<BarChart3 size={20} />} label="Dashboard"   open={sidebarOpen || mobileMenuOpen} />
          )}
          <NavLink to="/rentals" icon={<Calendar size={20} />} label="Đơn Thuê" open={sidebarOpen || mobileMenuOpen} />
          <NavLink to="/calendar" icon={<Calendar size={20} />} label="Lịch Trình" open={sidebarOpen || mobileMenuOpen} />
          <NavLink to="/equipment" icon={<Package size={20} />} label="Thiết Bị" open={sidebarOpen || mobileMenuOpen} />
          <NavLink to="/customers" icon={<Users size={20} />} label="Khách Hàng" open={sidebarOpen || mobileMenuOpen} />
          <NavLink to="/performance" icon={<TrendingUp  size={20} />} label="Hiệu Suất"   open={sidebarOpen || mobileMenuOpen} />
          {isSaler && (
            <NavLink to="/sale-transfers" icon={<Wallet size={20} />} label="Chuyển Tiền" open={sidebarOpen || mobileMenuOpen} />
          )}
          {(isAdmin || isCameraManager) && (
            <>
              <NavLink to="/commission-configs" icon={<Percent size={20} />} label="Cấu Hình Hoa Hồng" open={sidebarOpen || mobileMenuOpen} />
              <NavLink to="/collaborators" icon={<GitBranch size={20} />} label="Tuyến Cộng Tác" open={sidebarOpen || mobileMenuOpen} />
            </>
          )}
          {isAdmin && (
            <>
              <NavLink to="/payroll"     icon={<Wallet      size={20} />} label="Báo Cáo Chi Phí" open={sidebarOpen || mobileMenuOpen} />
              <NavLink to="/branches" icon={<Store     size={20} />} label="Cơ Sở"       open={sidebarOpen || mobileMenuOpen} />
              <NavLink to="/users"       icon={<Users       size={20} />} label="Tài Khoản"   open={sidebarOpen || mobileMenuOpen} />
              <NavLink to="/activity" icon={<Activity  size={20} />} label="Nhật Ký"     open={sidebarOpen || mobileMenuOpen} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg"
          >
            <LogOut size={20} className="shrink-0" />
            {(sidebarOpen || mobileMenuOpen) && <span>Đăng Xuất</span>}
          </button>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="xl:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-40 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <img src="/camera-icon.svg" className="w-6 h-6" alt="Logo" />
              <h2 className="font-bold text-gray-800 leading-none">SnapPro</h2>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
            {user.username.charAt(0).toUpperCase()}
          </div>
        </header>

        <div id="main-scroll-area" className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-auto min-h-0 flex flex-col">
          <main className="flex-1 min-h-0 min-w-0 overflow-x-hidden">
          <Routes>
            <Route path="/"          element={(isAdmin || isCameraManager || isInvestor || isDriver) ? <DashboardV1 key={activeRole} /> : <Navigate to="/rentals" replace />} />
            <Route path="/equipment" element={<Equipment key={activeRole} />} />
            <Route path="/rentals"   element={<Rentals key={activeRole} />} />
            <Route path="/calendar"  element={<CalendarPage key={activeRole} />} />
            <Route path="/customers" element={<Customers key={activeRole} />} />
             <Route path="/branches"  element={isAdmin ? <Branches key={activeRole} /> : <Navigate to="/rentals" replace />} />
            <Route path="/users"     element={isAdmin ? <UsersPage key={activeRole} /> : <Navigate to="/rentals" replace />} />
            <Route path="/payroll"   element={isAdmin ? <Payroll key={activeRole} /> : <Navigate to="/rentals" replace />} />
            <Route path="/sale-transfers" element={isSaler ? <SaleTransfer key={activeRole} /> : <Navigate to="/" replace />} />
            <Route path="/commission-configs" element={(isAdmin || isCameraManager) ? <CommissionConfigs key={activeRole} /> : <Navigate to="/rentals" replace />} />
            <Route path="/collaborators" element={(isAdmin || isCameraManager) ? <CollaboratorHierarchy key={activeRole} /> : <Navigate to="/rentals" replace />} />
            <Route path="/performance" element={<Performance key={activeRole} />} />
            <Route path="/activity"  element={isAdmin ? <ActivityLog key={activeRole} /> : <Navigate to="/rentals" replace />} />
            <Route path="*"          element={<Navigate to={(isAdmin || isCameraManager || isInvestor || isDriver) ? "/" : "/rentals"} replace />} />
          </Routes>
        </main>
        </div>
      </div>
    </div>
  );
}

/* ── NavLink ──────────────────────────────────────────────────────── */
function NavLink({ to, icon, label, open }) {
  const location = useLocation();
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={`flex items-center rounded-lg ${
        open ? 'gap-3 px-4 py-3' : 'justify-center p-3 mx-2'
      } ${
        isActive ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-300 hover:text-white hover:bg-gray-700'
      }`}
      title={!open ? label : ''}
    >
      <div className="shrink-0 w-5 flex items-center justify-center">
        {icon}
      </div>
      {open && <span className="whitespace-nowrap">{label}</span>}
    </Link>
  );
}

/* ── App root ─────────────────────────────────────────────────────── */
function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthGate />
      </Router>
    </AuthProvider>
  );
}

export default App;
