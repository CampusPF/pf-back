/**
 * Un alumno quedó inscripto a un curso: inscripción nueva o reactivación de
 * una cancelada. Cubre la inscripción directa (curso gratis, suscriptor) y la
 * que crea el webhook de Stripe después de una compra.
 */
export class CourseEnrolledEvent {
  constructor(
    public readonly userId: string,
    public readonly courseId: string,
    public readonly enrollmentId: string,
  ) { }
}
