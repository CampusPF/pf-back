/**
 * Se emitió un certificado.
 *
 * Existe porque la evaluación de logros se dispara por eventos: sin esto, el
 * logro `first_certificate` quedaría bloqueado hasta que el alumno completara
 * OTRA lección — y justamente el que termina su último curso no va a completar
 * ninguna más.
 */
export class CertificateIssuedEvent {
    constructor(
        public readonly userId: string,
        public readonly courseId: string,
        public readonly code: string,
    ) { }
}
