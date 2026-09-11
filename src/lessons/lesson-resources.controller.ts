import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { LessonResourcesService } from './lesson-resources.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import {
    PDF_UPLOAD_OPTIONS,
    assertFilePresent,
} from '../file-upload/file-validation';

/**
 * PDFs adjuntos de una lección (apuntes, ejercicios, slides).
 *
 * Se suben a Cloudinary como `authenticated`, así que la URL pública no sirve
 * el archivo: descargarlo exige pedir una URL firmada por este controller, que
 * aplica el mismo gate de acceso que el contenido de la lección.
 */
@ApiTags('lesson-resources')
@ApiBearerAuth()
@Controller('lessons/:id/resources')
export class LessonResourcesController {
    constructor(private readonly resourcesService: LessonResourcesService) { }

    @Get()
    @ApiOperation({
        summary: 'Listar los adjuntos de una lección',
        description:
            'Devuelve sólo metadatos (título, tamaño). La URL de descarga se ' +
            'pide aparte y exige tener acceso al curso.',
    })
    @ApiResponse({ status: 404, description: 'Lección no encontrada' })
    findAll(@Param('id') lessonId: string) {
        return this.resourcesService.findAllByLesson(lessonId);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    @UseInterceptors(FileInterceptor('file', PDF_UPLOAD_OPTIONS))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: { type: 'string', format: 'binary', description: 'PDF, máx. 20MB' },
                title: {
                    type: 'string',
                    description: 'Opcional. Por defecto, el nombre del archivo.',
                },
            },
        },
    })
    @ApiOperation({ summary: 'Adjuntar un PDF a una lección' })
    @ApiResponse({ status: 201, description: 'Recurso adjuntado' })
    @ApiResponse({ status: 400, description: 'Archivo faltante, muy grande o que no es un PDF' })
    @ApiResponse({ status: 503, description: 'Cloudinary no configurado' })
    create(
        @Param('id') lessonId: string,
        @UploadedFile() file: Express.Multer.File | undefined,
        @Body('title') title?: string,
    ) {
        return this.resourcesService.create(
            lessonId,
            assertFilePresent(file),
            title,
        );
    }

    @Get(':resourceId/download')
    @ApiOperation({
        summary: 'Obtener una URL firmada para descargar el adjunto',
        description:
            'La URL vence a los 10 minutos. Responde 403 si el usuario no ' +
            'tiene acceso al contenido del curso.',
    })
    @ApiResponse({ status: 200, description: '{ url, expiresAt, title }' })
    @ApiResponse({ status: 403, description: 'Sin acceso al contenido del curso' })
    @ApiResponse({ status: 404, description: 'Lección o recurso no encontrado' })
    download(
        @Param('id') lessonId: string,
        @Param('resourceId') resourceId: string,
        @CurrentUser() user: { id: string; role: UserRole },
    ) {
        return this.resourcesService.getDownloadUrl(lessonId, resourceId, user);
    }

    @Delete(':resourceId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Eliminar un adjunto',
        description: 'Borrado físico: se elimina también el archivo en Cloudinary.',
    })
    @ApiResponse({ status: 204, description: 'Recurso eliminado' })
    @ApiResponse({ status: 404, description: 'Lección o recurso no encontrado' })
    remove(
        @Param('id') lessonId: string,
        @Param('resourceId') resourceId: string,
    ) {
        return this.resourcesService.remove(lessonId, resourceId);
    }
}
