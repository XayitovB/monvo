import { useEffect, useState } from 'react'
import { CreditCard, Github, Twitter, Send, Smartphone, Apple, MessageCircle } from 'lucide-react'
import { useLang } from '../LangContext'
import './Footer.css'

export default function Footer() {
  const [links, setLinks] = useState({ android_url: '', ios_url: '', telegram_url: '' })
  const { t } = useLang()
  const f = t.footer

  useEffect(() => {
    fetch('/links')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLinks(data) })
      .catch(() => {})
  }, [])

  const year = new Date().getFullYear()

  const appLinks = [
    { href: links.android_url, icon: <Smartphone size={20} />, label: f.android, sub: 'Google Play', color: '#FFFFFF' },
    { href: links.ios_url, icon: <Apple size={20} />, label: f.ios, sub: 'App Store', color: '#94A3B8' },
    { href: links.telegram_url, icon: <MessageCircle size={20} />, label: f.telegram, sub: '@MonvoBot', color: '#1E40AF' },
  ]

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo">
              <div className="logo-icon"><CreditCard size={18} /></div>
              <span className="logo-text">Monvo</span>
            </div>
            <p className="footer-tagline">{f.tagline}</p>
            <div className="footer-socials">
              <a href="#" className="social-btn"><Github size={18} /></a>
              <a href="#" className="social-btn"><Twitter size={18} /></a>
              <a href="#" className="social-btn"><Send size={18} /></a>
            </div>
          </div>

          <div className="footer-apps">
            <h4 className="footer-col-title">{f.apps_title}</h4>
            <div className="app-links">
              {appLinks.map((a, i) => (
                <a
                  key={i}
                  href={a.href || '#'}
                  className={`app-link-btn ${!a.href ? 'disabled' : ''}`}
                  target={a.href ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  style={{ '--app-color': a.color }}
                >
                  <span className="app-link-icon" style={{ color: a.color }}>{a.icon}</span>
                  <span className="app-link-text">
                    <span className="app-link-label">{a.label}</span>
                    <span className="app-link-sub">{a.href ? a.sub : f.coming_soon}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} Monvo. {f.rights}</span>
          <div className="footer-legal">
            <a href="#">{f.privacy}</a>
            <a href="#">{f.terms}</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
