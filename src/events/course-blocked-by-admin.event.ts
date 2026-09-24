/**
 * Un administrador desactivó un curso.
 *
 * Lo escucha EmailNotificationsListener para avisarle al instructor del
 * curso que ya no puede editarlo ni reactivarlo.
 */
export class CourseBlockedByAdminEvent {
    constructor(
        public readonly instructorId: string,
        public readonly courseId: string,
        public readonly courseTitle: string,
        public readonly courseUpdatedAt: Date,
    ) { }
}