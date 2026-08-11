import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Store, CreditCard, Gift, Repeat,
  FileText, Bell, Link2, LogOut, Menu, X, BarChart2,
  RefreshCw, CalendarClock, Sun, Moon, Code2, Server, Settings,
  Megaphone, DollarSign, Package, Shield, Activity, PieChart,
  Trophy, Flag, Gamepad2, Sparkles, Plug, Image, MessageSquare, Bug,
} from 'lucide-react'
import './AdminLayout.css'
import { APP_VERSION } from '../../version'

// Sidebar — bo'limlar bo'yicha guruhlangan, hammasi UZ tilida
const NAV_SECTIONS = [
  {
    title: null,
    items: [
      { to: '/panel/dashboard', icon: <LayoutDashboard size={17}/>, label: 'Boshqaruv' },
    ],
  },
  {
    title: 'Analitika',
    items: [
      { to: '/panel/analytics', icon: <PieChart size={17}/>,    label: 'Analitika' },
      { to: '/panel/finance',   icon: <DollarSign size={17}/>,  label: 'Moliya' },
      { to: '/panel/traffic',   icon: <BarChart2 size={17}/>,   label: 'Trafik' },
      { to: '/panel/retention', icon: <RefreshCw size={17}/>,   label: 'Retention' },
    ],
  },
  {
    title: 'Kataloglar',
    items: [
      { to: '/panel/merchants',    icon: <Store size={17}/>,        label: 'Bizneslar' },
      { to: '/panel/users',        icon: <Users size={17}/>,        label: 'Mijozlar' },
      { to: '/panel/cards',        icon: <CreditCard size={17}/>,   label: 'Kartalar' },
      { to: '/panel/transactions', icon: <Repeat size={17}/>,       label: 'Tranzaksiyalar' },
    ],
  },
  {
    title: 'Hisob-kitob',
    items: [
      { to: '/panel/billing', icon: <Package size={17}/>, label: 'Hisob-kitob' },
    ],
  },
  {
    title: "Gamification",
    items: [
      { to: '/panel/achievements', icon: <Trophy size={17}/>,   label: 'Yutuqlar' },
      { to: '/panel/contests',     icon: <Flag size={17}/>,     label: 'Musobaqalar' },
      { to: '/panel/spin-prizes',  icon: <Sparkles size={17}/>, label: 'Spin sovrinlari' },
      { to: '/panel/games-stats',  icon: <Gamepad2 size={17}/>, label: "O'yinlar" },
    ],
  },
  {
    title: 'Kontent',
    items: [
      { to: '/panel/announcements',   icon: <Megaphone size={17}/>,     label: 'Bannerlar' },
      { to: '/panel/merchant-inbox',  icon: <MessageSquare size={17}/>, label: "Merchant e'lonlar" },
      { to: '/panel/landing-logos',   icon: <Image size={17}/>,         label: 'Landing logolar' },
      { to: '/panel/landing-reviews', icon: <MessageSquare size={17}/>, label: 'Landing sharhlar' },
      { to: '/panel/landing-social',  icon: <Link2 size={17}/>,         label: 'Ijtimoiy tarmoqlar' },
      { to: '/panel/push',            icon: <Bell size={17}/>,          label: 'Push xabarlar' },
      { to: '/panel/scheduled-push',  icon: <CalendarClock size={17}/>, label: 'Rejali push' },
    ],
  },
  {
    title: 'Tizim',
    items: [
      { to: '/panel/admins',       icon: <Shield size={17}/>,   label: 'Adminlar' },
      { to: '/panel/health',       icon: <Activity size={17}/>, label: 'Tizim holati' },
      { to: '/panel/server',       icon: <Server size={17}/>,   label: 'Server' },
      { to: '/panel/pos',          icon: <Plug size={17}/>,     label: 'POS tizimi' },
      { to: '/panel/links',        icon: <Link2 size={17}/>,    label: 'App linklar' },
      { to: '/panel/logs',         icon: <FileText size={17}/>, label: 'Audit loglar' },
      { to: '/panel/crashes',      icon: <Bug size={17}/>,      label: 'Crash hisobotlar' },
      { to: '/panel/app-settings', icon: <Settings size={17}/>, label: 'Sozlamalar' },
    ],
  },
]


function getInitialTheme() {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

function getAdminInfo() {
  return {
    username: localStorage.getItem('admin_name')
      || localStorage.getItem('admin_username')
      || 'admin',
    role: (localStorage.getItem('admin_role') || 'super_admin').replace(/_/g, ' '),
  }
}

export default function AdminLayout({ children }) {
  const navigate = useNavigate()
  const [sideOpen, setSideOpen] = useState(false)
  const [theme, setTheme] = useState(getInitialTheme)
  const [admin] = useState(getAdminInfo)

  useEffect(() => {
    document.body.classList.add('admin-body')
    return () => document.body.classList.remove('admin-body')
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function logout() {
    if (!confirm("Tizimdan chiqishni tasdiqlaysizmi?")) return
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_role')
    localStorage.removeItem('admin_name')
    navigate('/panel/login')
  }

  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }

  const initial = (admin.username || 'A').charAt(0).toUpperCase()

  return (
    <div className="al-root">
      <aside className={`al-sidebar ${sideOpen ? 'open' : ''}`}>
        <div className="al-brand">
          <img
            src="/branding/monvo-logo-green.png"
            alt="Monvo"
            style={{ height: 28, objectFit: 'contain' }}
          />
          <span className="al-brand-tag">Admin</span>
        </div>

        <nav className="al-nav">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className="al-nav-section">
              {section.title && (
                <div className="al-nav-section-title">{section.title}</div>
              )}
              {section.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `al-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSideOpen(false)}
                >
                  <span className="al-nav-icon">{item.icon}</span>
                  <span className="al-nav-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="al-profile">
          <div className="al-profile-avatar">{initial}</div>
          <div className="al-profile-info">
            <div className="al-profile-name">{admin.username}</div>
            <div className="al-profile-role">{admin.role}</div>
          </div>
          <button
            className="al-profile-logout"
            onClick={logout}
            aria-label="Chiqish"
            title="Tizimdan chiqish"
          >
            <LogOut size={15}/>
          </button>
        </div>
      </aside>

      {sideOpen && <div className="al-overlay" onClick={() => setSideOpen(false)} />}

      <div className="al-main">
        <header className="al-topbar">
          <button className="al-burger" onClick={() => setSideOpen(!sideOpen)}>
            {sideOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="al-topbar-status">
            <span className="al-status-dot"/>
            <span className="al-status-text">Live</span>
          </div>

          <div className="al-topbar-version" title="Sayt versiyasi">
            v{APP_VERSION}
          </div>

          <div className="al-topbar-spacer"/>

          <div className="al-topbar-admin">
            <span className="al-topbar-admin-name">{admin.username}</span>
            <span className="al-topbar-admin-role">· {admin.role}</span>
          </div>

          <button className="al-theme" onClick={toggleTheme} aria-label="Toggle theme" title="Tema almashtirish">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>
        <div className="al-content">{children}</div>
      </div>
    </div>
  )
}
