import { ApiProperty } from '@nestjs/swagger';

/** Un checkpoint de un curso y si el usuario autenticado ya lo aprobó. */
export class CourseCheckpointDto {
    @ApiProperty()
    quizId: string;

    @ApiProperty({ nullable: true, type: String, description: 'null = checkpoint de fin de curso' })
    moduleId: string | null;

    @ApiProperty({ nullable: true, type: Number })
    moduleOrder: number | null;

    /* El título que le puso el docente. Es lo que el front muestra en el
       temario y en el aviso de "te falta aprobar X": sin esto, un checkpoint
       de fin de curso ("Examen final") no se puede distinguir de uno de
       módulo, porque `moduleOrder` viene null en ese caso. */
    @ApiProperty({ example: 'Checkpoint del módulo 1' })
    title: string;

    @ApiProperty()
    passed: boolean;
}
