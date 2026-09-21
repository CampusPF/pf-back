import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuestionDto } from './create-question.dto';
import { CreateQuizDto } from './create-quiz.dto';

/** Las reglas de validación del docente, tal como las aplica el ValidationPipe global. */

async function errorsOf<T extends object>(cls: new () => T, plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true });
    const flatten = (list: typeof errors): string[] =>
        list.flatMap((error) => [
            ...Object.keys(error.constraints ?? {}),
            ...flatten(error.children ?? []),
        ]);
    return flatten(errors);
}

const QUESTION = {
    text: '¿Qué es un módulo?',
    options: [
        { text: 'Una clase con @Module', isCorrect: true },
        { text: 'Un archivo JSON', isCorrect: false },
    ],
};

describe('CreateQuestionDto', () => {
    it('pregunta válida → sin errores', async () => {
        await expect(errorsOf(CreateQuestionDto, QUESTION)).resolves.toEqual([]);
    });

    it('menos de 2 opciones → arrayMinSize', async () => {
        const errors = await errorsOf(CreateQuestionDto, {
            ...QUESTION,
            options: [{ text: 'Única', isCorrect: true }],
        });
        expect(errors).toContain('arrayMinSize');
    });

    it('ninguna correcta → exactlyOneCorrect', async () => {
        const errors = await errorsOf(CreateQuestionDto, {
            ...QUESTION,
            options: QUESTION.options.map((option) => ({ ...option, isCorrect: false })),
        });
        expect(errors).toContain('exactlyOneCorrect');
    });

    it('dos correctas → exactlyOneCorrect', async () => {
        const errors = await errorsOf(CreateQuestionDto, {
            ...QUESTION,
            options: QUESTION.options.map((option) => ({ ...option, isCorrect: true })),
        });
        expect(errors).toContain('exactlyOneCorrect');
    });

    it('opción con campos de más → rechazada (whitelist)', async () => {
        const errors = await errorsOf(CreateQuestionDto, {
            ...QUESTION,
            options: [...QUESTION.options, { text: 'x', isCorrect: false, id: 'hack' }],
        });
        expect(errors).toContain('whitelistValidation');
    });
});

describe('CreateQuizDto', () => {
    const QUIZ = {
        courseId: 'b3f1c2a0-1234-4a5b-9abc-1234567890ab',
        title: 'Checkpoint',
        passingScore: 70,
        questions: [QUESTION],
    };

    it('quiz válido, de fin de curso (moduleId null) → sin errores', async () => {
        await expect(errorsOf(CreateQuizDto, { ...QUIZ, moduleId: null })).resolves.toEqual([]);
    });

    it.each([-1, 101])('passingScore %d fuera de 0-100 → error', async (passingScore) => {
        const errors = await errorsOf(CreateQuizDto, { ...QUIZ, passingScore });
        expect(errors.some((error) => error === 'min' || error === 'max')).toBe(true);
    });

    it('valida también las preguntas anidadas', async () => {
        const errors = await errorsOf(CreateQuizDto, {
            ...QUIZ,
            questions: [{ ...QUESTION, options: [{ text: 'Única', isCorrect: true }] }],
        });
        expect(errors).toContain('arrayMinSize');
    });
});
