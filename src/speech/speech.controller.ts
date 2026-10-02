import {
    Body,
    Controller,
    Get,
    HttpCode,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
    AUDIO_UPLOAD_OPTIONS,
    assertFilePresent,
    assertMagicBytes,
} from '../file-upload/file-validation';
import { TranscribeAudioDto } from './dto/transcribe-audio.dto';
import { SpeechService } from './speech.service';

// Cada dictado es una llamada paga a Groq. Cuenta por usuario (la ruta está
// autenticada). Es el único freno: no hay límite diario ni cuenta para el
// cupo de mensajes del tutor.
//
// El límite es alto a propósito: el front muestra el texto MIENTRAS se habla,
// así que manda lo grabado cada 4 s además de la transcripción final. Un
// dictado de 30 s son ~8 llamadas. A US$ 0,04/hora con mínimo facturable de
// 10 s, ese dictado cuesta menos de US$ 0,001.
const SPEECH_THROTTLE_LIMIT = () => Number(process.env.THROTTLE_SPEECH_LIMIT ?? 60);
const SPEECH_THROTTLE_TTL_MS = () => Number(process.env.THROTTLE_TTL ?? 60) * 1000;

@ApiTags('speech')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('speech')
export class SpeechController {
    constructor(private readonly speechService: SpeechService) { }

    /** Para que el front muestre el micrófono sólo si el dictado funciona. */
    @Get('status')
    @ApiOperation({ summary: '¿Está disponible el dictado por voz? { available }' })
    status(): { available: boolean } {
        return { available: this.speechService.isConfigured() };
    }

    /**
     * Dictado por voz para el tutor IA y el chat en vivo. Devuelve sólo el
     * texto: el front lo deja en el campo para que el usuario lo revise antes
     * de enviarlo (nunca se manda solo).
     */
    @Post('transcriptions')
    @HttpCode(200)
    @Throttle({ default: { limit: SPEECH_THROTTLE_LIMIT, ttl: SPEECH_THROTTLE_TTL_MS } })
    @UseInterceptors(FileInterceptor('audio', AUDIO_UPLOAD_OPTIONS))
    @ApiOperation({ summary: 'Transcribir un audio corto (dictado) a texto' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['audio'],
            properties: {
                audio: { type: 'string', format: 'binary', description: 'WebM, OGG, MP4/M4A, MP3 o WAV. Máx. 5 MB.' },
                context: { type: 'string', maxLength: 200 },
            },
        },
    })
    @ApiResponse({ status: 200, description: '{ text } — vacío si no se detectó voz' })
    @ApiResponse({ status: 400, description: 'Sin audio, formato no soportado o archivo inválido' })
    @ApiResponse({ status: 429, description: 'Demasiados dictados seguidos' })
    @ApiResponse({ status: 503, description: 'Transcripción no configurada o no disponible' })
    async transcribe(
        @UploadedFile() file: Express.Multer.File | undefined,
        @Body() dto: TranscribeAudioDto,
    ): Promise<{ text: string }> {
        const audio = assertFilePresent(file, 'audio');
        assertMagicBytes(audio, 'audio');
        const text = await this.speechService.transcribe({
            buffer: audio.buffer,
            mimetype: audio.mimetype,
            context: dto.context,
        });
        return { text };
    }
}
