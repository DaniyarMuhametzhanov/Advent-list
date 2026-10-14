import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './index.css'
import App from './App.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { RequireAuth } from './components/RequireAuth.tsx'
import { PrivacyPage } from './pages/PrivacyPage.tsx'
import { TermsPage } from './pages/TermsPage.tsx'
import { Footer } from './components/Footer.tsx'
import { CookiesPage } from './pages/CookiesPage.tsx'
import { CookieBanner } from './components/CookieBanner.tsx'

// Хранилище ответов сервера для всего приложения
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/cookies" element={<CookiesPage />} />
                    <Route path="/" element={<RequireAuth><App /></RequireAuth>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <Footer />
                <CookieBanner />
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>,
)