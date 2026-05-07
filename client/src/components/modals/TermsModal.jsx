import Modal from "../Modal";

export default function TermsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Términos y Condiciones">
      <div
        style={{
          color: "#9ca3af",
          fontSize: "0.82rem",
          lineHeight: 1.7,
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <p style={{ color: "#D4AF37", fontWeight: 700, marginBottom: "1.5rem" }}>
          Última actualización: 2025 · El Condado CarWash, Guatemala
        </p>

        {[
          {
            title: "1. Horario de Atención",
            body: `El Condado CarWash atiende de lunes a sábado. Fuera de este horario no se realizan servicios. Los horarios específicos de apertura y cierre estarán publicados en nuestras redes sociales y podrán consultarse por WhatsApp. Nos reservamos el derecho de ajustar el horario por días festivos o circunstancias especiales, notificando con anticipación.`,
          },
          {
            title: "2. Membresías y Vigencia",
            body: `Las membresías —mensual (Q100) y trimestral (Q300)— no tienen renovación automática. Cada membresía inicia el día de su contratación y vence cuando se consuman todos los lavados incluidos o transcurra el período estipulado, lo que suceda primero. La vigencia no se pausa ni se extiende por inactividad del cliente. El cliente puede renovar su membresía cuando lo desee, contratando un nuevo plan.`,
          },
          {
            title: "3. Titularidad y Uso de Membresías",
            body: `Las membresías son intransferibles y de uso exclusivo del titular registrado. El vehículo asociado a la membresía debe coincidir con el registrado al momento de la contratación. La membresía aplica únicamente para un (1) vehículo. Si el cliente desea incluir un segundo vehículo deberá adquirir un plan separado o contratar la promoción de dos vehículos.`,
          },
          {
            title: "4. Cancelación y Reembolsos",
            body: `Una vez adquirida la membresía o servicio, no se realizan reembolsos monetarios. Si por causas imputables a El Condado CarWash no se puede brindar el servicio en la fecha agendada, se reprogramará sin costo adicional. Los lavados no utilizados dentro del período de membresía caducan al vencerse el plan.`,
          },
          {
            title: "5. Reagendamiento",
            body: `El cliente puede reagendar su cita con al menos 24 horas de anticipación, notificando al número de WhatsApp oficial. Reagendamientos con menos de 24 horas de antelación quedan sujetos a disponibilidad y no garantizan el mismo día solicitado.`,
          },
          {
            title: "6. Responsabilidad sobre el Vehículo",
            body: `El Condado CarWash aplica procesos de lavado de manera profesional y cuidadosa. Sin embargo, no se responsabiliza por daños preexistentes en la pintura, carrocería, accesorios sueltos o interiores del vehículo que no hayan sido reportados antes de iniciar el servicio. Al momento de ingresar el vehículo, el personal verificará el estado general del mismo. Cualquier observación deberá manifestarse antes del inicio del lavado.`,
          },
          {
            title: "7. Artículos en el Vehículo",
            body: `El Condado CarWash no se hace responsable por artículos de valor dejados dentro del vehículo durante la prestación del servicio. Se recomienda retirar objetos personales, documentos, efectivo o cualquier artículo de valor antes de entregar el vehículo.`,
          },
          {
            title: "8. Promociones",
            body: `Las promociones de dos vehículos (2 lavados completos por Q100 / 2 lavados exteriores por Q60) aplican únicamente para servicios realizados el mismo día o en la misma visita. Las promociones no son acumulables con membresías ni otros descuentos salvo indicación expresa del negocio.`,
          },
          {
            title: "9. Pagos",
            body: `Los pagos se realizan al momento de contratar el servicio o membresía. Se aceptan los métodos de pago habilitados en la plataforma, incluyendo —próximamente— la pasarela Recurrente. El Condado CarWash emite comprobante de cada transacción.`,
          },
          {
            title: "10. Modificaciones a los Términos",
            body: `El Condado CarWash se reserva el derecho de actualizar estos Términos y Condiciones en cualquier momento. Los cambios entrarán en vigor al publicarse en los canales oficiales del negocio. El uso continuado de los servicios implica la aceptación de los términos vigentes.`,
          },
          {
            title: "11. Contacto",
            body: `Para consultas, quejas o sugerencias puedes escribirnos por WhatsApp al +502 3767-4506. Nos comprometemos a responder en un máximo de 24 horas hábiles.`,
          },
        ].map(({ title, body }) => (
          <div key={title}>
            <h4 style={{ color: "#D4AF37", margin: "0 0 4px", fontSize: "0.9rem" }}>
              {title}
            </h4>
            <p style={{ margin: 0 }}>{body}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
