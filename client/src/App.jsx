import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Success from "./pages/Success";
import CustomerDashboard from "./pages/dashboard/CustomerDashboard";
import AdminConsole from "./pages/dashboard/AdminConsole";
import { useAuth } from "./context/useAuth";

function App() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/success" element={<Success />} />
        
        {/* Rutas Protegidas */}
        <Route 
          path="/dashboard" 
          element={user ? <CustomerDashboard /> : <Navigate to="/" />} 
        />
        
        <Route 
          path="/admin" 
          element={user?.role === 'admin' ? <AdminConsole /> : <Navigate to="/" />} 
        />
      </Routes>
    </Router>
  );
}

export default App;
