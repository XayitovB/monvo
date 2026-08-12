import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import BusinessLogin from './pages/BusinessLogin'
import AdminLayout from './components/AdminLayout'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Merchants from './pages/Merchants'
import Cards from './pages/Cards'
import Transactions from './pages/Transactions'
import TransactionDetail from './pages/TransactionDetail'
import ApiDocs from './pages/ApiDocs'
import Logs from './pages/Logs'
import Push from './pages/Push'
import Links from './pages/Links'
import Traffic from './pages/Traffic'
import Retention from './pages/Retention'
import ScheduledPush from './pages/ScheduledPush'
import ServerStats from './pages/ServerStats'
import AppSettings from './pages/AppSettings'
import Analytics from './pages/Analytics'
import Announcements from './pages/Announcements'
import MerchantInbox from './pages/MerchantInbox'
import Finance from './pages/Finance'
import Billing from './pages/Billing'
import AdminUsers from './pages/AdminUsers'
import HealthStatus from './pages/HealthStatus'
import Crashes from './pages/Crashes'
import Achievements from './pages/Achievements'
import Contests from './pages/Contests'
import SpinPrizes from './pages/SpinPrizes'
import GamesStats from './pages/GamesStats'
import PosIntegrations from './pages/PosIntegrations'
import LandingLogos from './pages/LandingLogos'
import LandingReviews from './pages/LandingReviews'
import LandingSocial from './pages/LandingSocial'
import MerchantHome from './pages/MerchantHome'
import MerchantDetail from './pages/MerchantDetail'
import UserDetail from './pages/UserDetail'
import MerchantPhoneLogin from './pages/MerchantPhoneLogin'
import LoyaltyBuilder from './pages/LoyaltyBuilder'
import CardDesigner from './pages/CardDesigner'
import WebScanner from './pages/WebScanner'
import CustomerCRM from './pages/CustomerCRM'
import MerchantAnalytics from './pages/MerchantAnalytics'
import AiAssistant from './pages/AiAssistant'
import {
  MerchantBranches, MerchantStaff, MerchantCampaigns,
  MerchantNotifications, MerchantReviews,
} from './pages/MerchantManage'
import './admin.css'

function PrivateRoute({ children }) {
  return localStorage.getItem('admin_token') ? children : <Navigate to="/panel/login" replace />
}

function MerchantRoute({ children }) {
  return localStorage.getItem('merchant_token') ? children : <Navigate to="/merchant/login" replace />
}

export default function AdminApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/panel/login" element={<BusinessLogin />} />
        <Route path="/panel/*" element={
          <PrivateRoute>
            <AdminLayout>
              <Routes>
                <Route index                element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard"     element={<Dashboard />} />
                <Route path="merchants"     element={<Merchants />} />
                <Route path="merchants/:id" element={<MerchantDetail />} />
                <Route path="users"         element={<Users />} />
                <Route path="users/:id"     element={<UserDetail />} />
                <Route path="cards"         element={<Cards />} />
                <Route path="transactions"  element={<Transactions />} />
                <Route path="transactions/:id" element={<TransactionDetail />} />
                <Route path="api"           element={<ApiDocs />} />
                <Route path="logs"          element={<Logs />} />
                <Route path="crashes"       element={<Crashes />} />
                <Route path="push"          element={<Push />} />
                <Route path="links"         element={<Links />} />
                <Route path="traffic"       element={<Traffic />} />
                <Route path="retention"     element={<Retention />} />
                <Route path="scheduled-push" element={<ScheduledPush />} />
                <Route path="server"        element={<ServerStats />} />
                <Route path="app-settings" element={<AppSettings />} />
                <Route path="analytics"     element={<Analytics />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="merchant-inbox" element={<MerchantInbox />} />
                <Route path="finance"       element={<Finance />} />
                <Route path="billing"       element={<Billing />} />
                <Route path="admins"        element={<AdminUsers />} />
                <Route path="health"        element={<HealthStatus />} />
                <Route path="achievements"  element={<Achievements />} />
                <Route path="contests"      element={<Contests />} />
                <Route path="spin-prizes"   element={<SpinPrizes />} />
                <Route path="games-stats"   element={<GamesStats />} />
                <Route path="pos"           element={<PosIntegrations />} />
                <Route path="landing-logos"   element={<LandingLogos />} />
                <Route path="landing-reviews" element={<LandingReviews />} />
                <Route path="landing-social"  element={<LandingSocial />} />
                <Route path="ai-assistant"  element={<AiAssistant />} />
              </Routes>
            </AdminLayout>
          </PrivateRoute>
        } />

        <Route path="/merchant" element={<Navigate to="/merchant/home" replace />} />
        <Route path="/merchant/login" element={<BusinessLogin />} />
        <Route path="/merchant/home" element={<MerchantRoute><MerchantHome /></MerchantRoute>} />
        <Route path="/merchant/loyalty" element={<MerchantRoute><LoyaltyBuilder /></MerchantRoute>} />
        <Route path="/merchant/card-design" element={<MerchantRoute><CardDesigner /></MerchantRoute>} />
        <Route path="/merchant/scanner" element={<MerchantRoute><WebScanner /></MerchantRoute>} />
        <Route path="/merchant/customers" element={<MerchantRoute><CustomerCRM /></MerchantRoute>} />
        <Route path="/merchant/analytics" element={<MerchantRoute><MerchantAnalytics /></MerchantRoute>} />
        <Route path="/merchant/branches" element={<MerchantRoute><MerchantBranches /></MerchantRoute>} />
        <Route path="/merchant/staff" element={<MerchantRoute><MerchantStaff /></MerchantRoute>} />
        <Route path="/merchant/campaigns" element={<MerchantRoute><MerchantCampaigns /></MerchantRoute>} />
        <Route path="/merchant/notifications" element={<MerchantRoute><MerchantNotifications /></MerchantRoute>} />
        <Route path="/merchant/reviews" element={<MerchantRoute><MerchantReviews /></MerchantRoute>} />

        <Route path="/auth" element={<MerchantPhoneLogin />} />

        <Route path="*" element={<Navigate to="/panel/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
