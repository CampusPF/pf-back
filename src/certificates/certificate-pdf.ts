import PDFDocument = require('pdfkit');

export interface CertificateData {
    studentName: string;
    courseName: string;
    hours: number;
    /** Ya formateada, ej "17 de septiembre de 2026". */
    date: string;
    code: string;
    /** PNG del QR. pdfkit necesita un buffer o un path, no un data-URL. */
    qrBuffer: Buffer;
}

/**
 * Arma el PDF del certificado y devuelve el archivo entero en memoria.
 *
 * Se usa pdfkit y no un navegador headless (Puppeteer) a propósito: es JS puro,
 * no levanta ningún proceso aparte y no descarga un Chromium de 300 MB. En el
 * free tier de Render, donde la memoria es poca y compartida, eso es la
 * diferencia entre que ande siempre y que falle justo en la demo. Se pierde
 * prolijidad visual (esto es texto y bordes, no un diseño con CSS), pero el QR
 * va igual y para mostrarlo alcanza.
 *
 * pdfkit trabaja por streams: se juntan los chunks y se resuelve con el buffer
 * completo en `end`. No hay nada que cerrar a mano — `doc.end()` termina el
 * stream y no queda ningún proceso colgado entre una emisión y otra.
 */
export function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width;

        // Marco doble: el de afuera grueso, el de adentro fino.
        doc.rect(20, 20, pageWidth - 40, doc.page.height - 40).lineWidth(3).stroke('#1e3a5f');
        doc.rect(30, 30, pageWidth - 60, doc.page.height - 60).lineWidth(1).stroke('#c9a227');

        doc.moveDown(2);
        doc
            .fontSize(30)
            .font('Helvetica-Bold')
            .fillColor('#1e3a5f')
            .text('CERTIFICADO DE FINALIZACIÓN', { align: 'center' });

        doc.moveDown(1.5);
        doc
            .fontSize(14)
            .font('Helvetica')
            .fillColor('#333333')
            .text('Este certificado se otorga a', { align: 'center' });

        doc.moveDown(0.5);
        doc
            .fontSize(26)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text(data.studentName, { align: 'center' });

        doc.moveDown(0.5);
        doc
            .fontSize(14)
            .font('Helvetica')
            .fillColor('#333333')
            .text('por completar exitosamente el curso', { align: 'center' });

        doc.moveDown(0.5);
        doc
            .fontSize(18)
            .font('Helvetica-Bold')
            .fillColor('#1e3a5f')
            .text(`"${data.courseName}"`, { align: 'center' });

        doc.moveDown(0.8);
        doc
            .fontSize(12)
            .font('Helvetica')
            .fillColor('#333333')
            .text(`${data.hours} ${data.hours === 1 ? 'hora' : 'horas'} de contenido · Emitido el ${data.date}`, {
                align: 'center',
            });

        /* El QR se dibuja en una posición absoluta: `doc.image` no mueve el
           cursor vertical, así que si después se escribiera con el flujo normal
           el texto caería ENCIMA de la imagen. Por eso se calcula la Y a mano y
           el texto que sigue también va posicionado. */
        const qrSize = 90;
        const qrY = doc.y + 10;
        doc.image(data.qrBuffer, pageWidth / 2 - qrSize / 2, qrY, { width: qrSize });

        doc
            .fontSize(9)
            .fillColor('#555555')
            .text('Escaneá el código para verificar este certificado', 0, qrY + qrSize + 8, {
                align: 'center',
            });

        doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .fillColor('#1e3a5f')
            .text(`Código de verificación: ${data.code}`, 0, qrY + qrSize + 22, {
                align: 'center',
            });

        doc.end();
    });
}
