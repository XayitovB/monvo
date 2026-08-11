import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LangProvider } from './i18n/LangContext';
import RequireAuth from './auth/RequireAuth';
import RequireSubscription from './auth/RequireSubscription';
import FeatureGate from './auth/FeatureGate';
import MerchantLayout from './layout/MerchantLayout';

import Login from './screens/Login';
import Onboarding from './screens/Onboarding';
import Dashboard from './screens/Dashboard';
import Customers from './screens/Customers';
import CustomerDetail from './screens/CustomerDetail';
import Cards from './screens/Cards';
import Transactions from './screens/Transactions';
import Loyalty from './screens/Loyalty';
import Push from './screens/Push';
import Analytics from './screens/Analytics';
import Branches from './screens/Branches';
import Staff from './screens/Staff';
import CardDesign from './screens/CardDesign';
import QrCodes from './screens/QrCodes';
import Billing from './screens/Billing';
import Settings from './screens/Settings';
import ApiTokens from './screens/ApiTokens';

export default function MerchantApp() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter basename="/merchant">
          <Routes>
          <Route path="/login" element={<Login/>}/>
          <Route path="/onboarding" element={<RequireAuth><Onboarding/></RequireAuth>}/>

          <Route element={<RequireAuth><RequireSubscription><MerchantLayout/></RequireSubscription></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace/>}/>
            <Route path="/dashboard" element={<Dashboard/>}/>
            <Route path="/customers" element={<Customers/>}/>
            <Route path="/customers/:id" element={<CustomerDetail/>}/>
            <Route path="/cards" element={<Cards/>}/>
            <Route path="/transactions" element={<Transactions/>}/>
            <Route path="/loyalty" element={<Loyalty/>}/>
            <Route path="/push" element={<Push/>}/>
            <Route path="/analytics" element={<Analytics/>}/>
            <Route path="/branches" element={<Branches/>}/>
            <Route path="/staff" element={<Staff/>}/>
            <Route path="/design" element={<FeatureGate feature="card_design_custom"><CardDesign/></FeatureGate>}/>
            <Route path="/qr" element={<QrCodes/>}/>
            <Route path="/billing" element={<Billing/>}/>
            <Route path="/settings" element={<Settings/>}/>
            <Route path="/api-tokens" element={<FeatureGate feature="api_access"><ApiTokens/></FeatureGate>}/>
            <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
          </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  );
}
