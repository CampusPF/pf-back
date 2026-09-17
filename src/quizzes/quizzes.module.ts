import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quiz } from './entities/quiz.entity';
import { Question } from './entities/question.entity';
import { Option } from './entities/option.entity';
import { QuizAttempt } from './entities/quiz-attempt.entity';

// Solo registra las entidades para que TypeORM las vea.
// TODO: agregar service y controller en otra tarea.
@Module({ imports: [TypeOrmModule.forFeature([Quiz, Question, Option, QuizAttempt])] })
export class QuizzesModule { }
