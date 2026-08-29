import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthProvider";
import { ProtectedRoute, HomeRedirect } from "./components/ProtectedRoute";
import { UpdateBanner } from "./components/UpdateBanner";
import { Login } from "./pages/Login";
import { RajCockpit } from "./pages/RajCockpit";
import { DaneCockpit } from "./pages/DaneCockpit";
import { JeremiahCockpit } from "./pages/JeremiahCockpit";
import { ColtonCockpit } from "./pages/ColtonCockpit";
import { ZoCockpit } from "./pages/ZoCockpit";
import { ZoInspect } from "./pages/ZoInspect";
import { KarenCockpit } from "./pages/KarenCockpit";
import { RexCockpit } from "./pages/RexCockpit";
import { ElleryCockpit } from "./pages/ElleryCockpit";
import { CorneliusCockpit } from "./pages/CorneliusCockpit";
import { LandingPage } from "./pages/LandingPage";
import { PipelineBoard } from "./pages/PipelineBoard";
import { DocumentTitle } from "./lib/DocumentTitle";

export function App() {
  const isMarketingDomain =
    typeof window !== "undefined" &&
    ["ablebuyshomes.com", "www.ablebuyshomes.com"].includes(
      window.location.hostname,
    );

  useEffect(() => {
    // Only the cockpit app (and the Vercel preview fallback) should ever
    // install as a PWA — the public marketing site must stay a plain website.
    if (isMarketingDomain) return;
    import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  }, [isMarketingDomain]);

  return (
    <AuthProvider>
      <UpdateBanner />
      <BrowserRouter>
        <DocumentTitle />
        <Routes>
          {/* Public. No ProtectedRoute - a customer must never meet a login. */}
          <Route path="/sell" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/raj"
            element={
              <ProtectedRoute cockpit="raj">
                <RajCockpit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dane"
            element={
              <ProtectedRoute cockpit="dane">
                <DaneCockpit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jeremiah"
            element={
              <ProtectedRoute cockpit="jeremiah">
                <JeremiahCockpit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/colton"
            element={
              <ProtectedRoute cockpit="colton">
                <ColtonCockpit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/zo"
            element={
              <ProtectedRoute cockpit="zo">
                <ZoCockpit />
              </ProtectedRoute>
            }
          />
          {/* Unit inspections. A separate capability from the rehab photo lane -
              deliberately not bolted onto the stage flow. */}
          <Route
            path="/zo/inspect"
            element={
              <ProtectedRoute cockpit="zo">
                <ZoInspect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/karen"
            element={
              <ProtectedRoute cockpit="karen">
                <KarenCockpit />
              </ProtectedRoute>
            }
          />

          <Route
            path="/rex"
            element={
              <ProtectedRoute cockpit="rex">
                <RexCockpit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/raj/pipeline"
            element={
              <ProtectedRoute cockpit="raj">
                <PipelineBoard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ellery"
            element={
              <ProtectedRoute cockpit="ellery">
                <ElleryCockpit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cornelius"
            element={
              <ProtectedRoute cockpit="cornelius">
                <CorneliusCockpit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={isMarketingDomain ? <LandingPage /> : <HomeRedirect />}
          />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
