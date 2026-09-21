import { ApiProperty } from '@nestjs/swagger';
import type { Quiz } from '../entities/quiz.entity';
import type { QuestionWithOptions } from './student-quiz.dto';

/** Lo que ve el DOCENTE dueño: igual que el alumno pero con `isCorrect` y `order`, para poder editar. */

export class TeacherQuizOptionDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    text: string;

    @ApiProperty()
    isCorrect: boolean;
}

export class TeacherQuizQuestionDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    text: string;

    @ApiProperty()
    order: number;

    @ApiProperty({ type: [TeacherQuizOptionDto] })
    options: TeacherQuizOptionDto[];
}

export class TeacherQuizDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    courseId: string;

    @ApiProperty({ nullable: true, type: String })
    moduleId: string | null;

    @ApiProperty({ nullable: true, type: Number })
    moduleOrder: number | null;

    @ApiProperty()
    title: string;

    @ApiProperty()
    passingScore: number;

    @ApiProperty({ type: [TeacherQuizQuestionDto] })
    questions: TeacherQuizQuestionDto[];

    static from(quiz: Quiz, questions: QuestionWithOptions[]): TeacherQuizDto {
        return {
            id: quiz.id,
            courseId: quiz.courseId,
            moduleId: quiz.moduleId,
            moduleOrder: quiz.module?.order ?? null,
            title: quiz.title,
            passingScore: quiz.passingScore,
            questions: questions.map((question) => ({
                id: question.id,
                text: question.text,
                order: question.order,
                options: question.options.map((option) => ({
                    id: option.id,
                    text: option.text,
                    isCorrect: option.isCorrect,
                })),
            })),
        };
    }
}
