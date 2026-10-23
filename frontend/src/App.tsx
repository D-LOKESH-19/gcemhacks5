import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { LiveDemoPage } from "./pages/LiveDemoPage";
import { TrafficBotsPage } from "./pages/TrafficBotsPage";
import { AgentInsightsPage } from "./pages/AgentInsightsPage";
import { SlaCompliancePage } from "./pages/SlaCompliancePage";
import { TrainingPage } from "./pages/TrainingPage";
import { ResultsPage } from "./pages/ResultsPage";
import { PresenterPage } from "./pages/PresenterPage";
import { StoryPage } from "./pages/StoryPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<LiveDemoPage />} />
          <Route path="/traffic" element={<TrafficBotsPage />} />
          <Route path="/agent" element={<AgentInsightsPage />} />
          <Route path="/sla" element={<SlaCompliancePage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/present" element={<PresenterPage />} />
          <Route path="/about" element={<StoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
