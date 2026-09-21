import { ApiProperty } from '@nestjs/swagger';

/* Sólo para Swagger: la forma la produce CourseProgressionService. */

export class ModuleGateDto {
    @ApiProperty()
    moduleId: string;

    @ApiProperty()
    order: number;

    @ApiProperty()
    title: string;

    @ApiProperty()
    totalLessons: number;

    @ApiProperty()
    completedLessons: number;

    @ApiProperty()
    lessonsCompleted: boolean;

    @ApiProperty({ nullable: true, type: String })
    quizId: string | null;

    @ApiProperty()
    quizPassed: boolean;

    @ApiProperty()
    attemptsUsed: number;

    @ApiProperty({ description: 'Intentos que quedan antes de agotar el checkpoint' })
    attemptsLeft: number;

    @ApiProperty({ description: 'Se puede entrar a las lecciones de este módulo' })
    lessonsUnlocked: boolean;

    @ApiProperty({ description: 'Se puede rendir el checkpoint del módulo' })
    checkpointUnlocked: boolean;

    @ApiProperty({ nullable: true, type: String })
    lockedReason: string | null;
}

export class FinalCheckpointGateDto {
    @ApiProperty()
    quizId: string;

    @ApiProperty()
    passed: boolean;

    @ApiProperty()
    attemptsUsed: number;

    @ApiProperty()
    attemptsLeft: number;

    @ApiProperty()
    unlocked: boolean;

    @ApiProperty({ nullable: true, type: String })
    lockedReason: string | null;
}

export class CourseProgressionDto {
    @ApiProperty()
    courseId: string;

    @ApiProperty({ description: 'El actor no cursa: admin o docente dueño' })
    bypassed: boolean;

    @ApiProperty({ type: [ModuleGateDto] })
    modules: ModuleGateDto[];

    @ApiProperty({ type: FinalCheckpointGateDto, nullable: true })
    finalCheckpoint: FinalCheckpointGateDto | null;
}
