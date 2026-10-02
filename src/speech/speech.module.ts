import { Module } from '@nestjs/common';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';

/** Dictado por voz (speech-to-text) con Whisper en Groq. */
@Module({
    controllers: [SpeechController],
    providers: [SpeechService],
})
export class SpeechModule { }
