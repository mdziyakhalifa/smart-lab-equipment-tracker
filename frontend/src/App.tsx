import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/auth/protected-route";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { EquipmentListPage } from "@/pages/EquipmentListPage";
import { EquipmentDetailPage } from "@/pages/EquipmentDetailPage";
import { EquipmentFormPage } from "@/pages/EquipmentFormPage";
import { AvailabilityPage } from "@/pages/AvailabilityPage";
import { BorrowPage } from "@/pages/BorrowPage";
import { ReturnsPage } from "@/pages/ReturnsPage";
import { BorrowingsPage } from "@/pages/BorrowingsPage";
import { ReservationsPage } from "@/pages/ReservationsPage";
import { MyReservationsPage } from "@/pages/MyReservationsPage";
import { ScanPage } from "@/pages/ScanPage";
import { DamageReportsPage } from "@/pages/DamageReportsPage";
import { MaintenancePage } from "@/pages/MaintenancePage";
import { CalibrationPage } from "@/pages/CalibrationPage";
import { ConsumablesPage } from "@/pages/ConsumablesPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { UsersPage } from "@/pages/UsersPage";
import { LabsPage } from "@/pages/LabsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ForbiddenPage, NotFoundPage } from "@/pages/ErrorPages";

const STAFF = ["admin", "lab_assistant"] as const;
const BORROWERS = ["student", "faculty"] as const;

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/equipment" element={<EquipmentListPage />} />
        <Route path="/equipment/new" element={<ProtectedRoute roles={[...STAFF]}><EquipmentFormPage /></ProtectedRoute>} />
        <Route path="/equipment/:id" element={<EquipmentDetailPage />} />
        <Route path="/equipment/:id/edit" element={<ProtectedRoute roles={[...STAFF]}><EquipmentFormPage /></ProtectedRoute>} />
        <Route path="/availability" element={<AvailabilityPage />} />
        <Route path="/borrow" element={<ProtectedRoute roles={[...BORROWERS]}><BorrowPage /></ProtectedRoute>} />
        <Route path="/returns" element={<ProtectedRoute roles={[...STAFF]}><ReturnsPage /></ProtectedRoute>} />
        <Route path="/borrowings" element={<BorrowingsPage />} />
        <Route path="/reservations" element={<ReservationsPage />} />
        <Route path="/my-reservations" element={<ProtectedRoute roles={[...BORROWERS]}><MyReservationsPage /></ProtectedRoute>} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/damage-reports" element={<DamageReportsPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/calibration" element={<CalibrationPage />} />
        <Route path="/consumables" element={<ConsumablesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/reports" element={<ProtectedRoute roles={[...STAFF]}><ReportsPage /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute roles={["admin"]}><UsersPage /></ProtectedRoute>} />
        <Route path="/labs" element={<ProtectedRoute roles={["admin"]}><LabsPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
