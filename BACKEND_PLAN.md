# 🚗 El Condado CarWash - Plan de Desarrollo Backend

Este documento detalla la hoja de ruta para la implementación del sistema de gestión de El Condado CarWash.

## 📌 Visión General
Transformar la landing page estática en una plataforma dinámica con gestión de usuarios, reservas, fidelización y panel administrativo.

---

## 📂 Estructura del Proyecto (Monorepo)
```text
/
├── client/          # Frontend (React + Vite)
├── server/          # Backend (Node + Express)
│   ├── routes/      # Endpoints
│   ├── models/      # Esquemas de DB
│   ├── controllers/ # Lógica de negocio
│   └── middleware/  # Auth & Validaciones
├── .env             # Variables de entorno
└── package.json     # Scripts globales
```
- [x] Configuración de **Node.js + Express**.
- [x] Conexión a Base de Datos (PostgreSQL o MongoDB).
- [x] Sistema de Autenticación **JWT** (Registro, Login).
- [x] Roles de usuario: `CLIENT` y `ADMIN`.

## 📅 Fase 2: Gestión de Servicios (Dinámico)
- [x] **CRUD de Servicios**: El Admin podrá crear, editar y eliminar servicios.
- [x] **Frontend Dinámico**: Reemplazar los datos hardcodeados por llamadas a la API (`GET /services`).
- [x] **Categorización**: Lavados, Promos, Extras, Membresías.

## 🕒 Fase 3: Reservas y Pagos
- [ ] **Sistema de Agendamiento**: Validación de horarios disponibles.
- [ ] **Historial de Pedidos**: Los clientes ven sus servicios pasados y futuros.
- [ ] **Integración de Pagos**: Pasarela Recurrente (Guatemala).

## 🏆 Fase 4: Fidelidad y Reseñas
- [x] **Sistema de Puntos**: Acumulación por cada lavado realizado (Lógica Base).
- [x] **Reseñas**: Clientes pueden calificar y comentar servicios específicos (Lógica Base).
- [x] **Dashboard Cliente**: Visualización de puntos e historial de reservas.

## 👑 Fase 5: Panel Administrativo (Admin Console)
- [x] **Gestión de Reservas**: Ver y actualizar estado de citas (Base).
- [x] **Gestión de Servicios**: Visualización del catálogo dinámico (Base).
- [ ] **Métricas**: Ingresos mensuales y servicios más pedidos.

---

## 🗄️ Modelo de Datos (Borrador)

### User
- `id`, `name`, `email`, `password`, `role` (admin/client), `loyalty_points`.

### Service
- `id`, `title`, `description`, `price`, `type` (basic/membership/extra), `tag`.

### Booking
- `id`, `user_id`, `service_id`, `date`, `time`, `plate`, `status` (pending/confirmed/completed/cancelled).

### Review
- `id`, `user_id`, `service_id`, `rating`, `comment`.
