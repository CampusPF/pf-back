import { ApiProperty } from '@nestjs/swagger';

/** Un checkpoint de un curso y si el usuario autenticado ya lo aprobó. */
export class CourseCheckpointDto {
    @ApiProperty()
    quizId: string;

    @ApiProperty({ nullable: true, type: String, description: 'null = checkpoint de fin de curso' })
    moduleId: string | null;

    @ApiProperty({ nullable: true, type: Number })
    moduleOrder: number | null;

    @ApiProperty()
    passed: boolean;
}
