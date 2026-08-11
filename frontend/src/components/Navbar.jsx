import { useState, useEffect } from 'react'
import { CreditCard, Menu, X, Sun, Moon, LogIn } from 'lucide-react'
import { useLang } from '../LangContext'
import { useTheme } from '../ThemeContext'
import { LANGS, LANG_LABELS } from '../i18n'
import './Navbar.css'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { lang, t, changeLang } = useLang()
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { label: t.nav.features, href: "#features" },
    { label: t.nav.how, href: "#how" },
    { label: t.nav.pricing, href: "#pricing" },
    { label: t.nav.stats, href: "#stats" },
  ]

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="container navbar-inner">
        <a href="#" className="navbar-logo">
          <div className="logo-icon">
            <CreditCard size={20} />
          </div>
          <span className="logo-text">Monvo</span>
        </a>

        <ul className={`navbar-links ${menuOpen ? 'open' : ''}`}>
          {links.map(l => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>
            </li>
          ))}
          <li className="nav-lang-group">
            {LANGS.map(l => (
              <button
                key={l}
                className={`lang-btn ${lang === l ? 'active' : ''}`}
                onClick={() => { changeLang(l); setMenuOpen(false) }}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </li>
          <li>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </li>
          <li className="nav-login">
            <a
              href="/auth"
              className="btn btn-primary nav-login-btn"
              onClick={() => setMenuOpen(false)}
            >
              <LogIn size={14} /> {t.nav.login}
            </a>
          </li>
        </ul>

        <button className="nav-burger" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </nav>
  )
}
