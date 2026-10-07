import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForumCategory } from './entities/forum-category.entity';
import { CreateForumCategoryDto, UpdateForumCategoryDto } from './dto/forum-category.dto';

/** "Ayuda técnica" → "ayuda-tecnica". El slug queda fijo: cambiar el nombre no rompe links. */
export function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Administración de las categorías del foro general (sólo ADMIN, desde el controller). */
@Injectable()
export class ForumCategoriesService {
    constructor(
        @InjectRepository(ForumCategory)
        private readonly categoriesRepository: Repository<ForumCategory>,
    ) { }

    /** Lista pública: sólo las activas. */
    findActive(): Promise<ForumCategory[]> {
        return this.categoriesRepository.find({
            where: { isActive: true },
            order: { position: 'ASC', name: 'ASC' },
        });
    }

    /** Lista de administración: todas, también las ocultas. */
    findAll(): Promise<ForumCategory[]> {
        return this.categoriesRepository.find({ order: { position: 'ASC', name: 'ASC' } });
    }

    async create(dto: CreateForumCategoryDto): Promise<ForumCategory> {
        const slug = slugify(dto.name);
        if (!slug) throw new ConflictException('El nombre no genera un identificador válido.');
        if (await this.categoriesRepository.exists({ where: { slug } })) {
            throw new ConflictException('Ya existe una categoría con ese nombre.');
        }
        return this.categoriesRepository.save(
            this.categoriesRepository.create({
                name: dto.name.trim(),
                slug,
                description: dto.description?.trim() || null,
                position: dto.position ?? 0,
                isActive: true,
            }),
        );
    }

    async update(id: string, dto: UpdateForumCategoryDto): Promise<ForumCategory> {
        const category = await this.categoriesRepository.findOne({ where: { id } });
        if (!category) throw new NotFoundException('Categoría no encontrada.');

        if (dto.name !== undefined) category.name = dto.name.trim();
        if (dto.description !== undefined) category.description = dto.description.trim() || null;
        if (dto.position !== undefined) category.position = dto.position;
        if (dto.isActive !== undefined) category.isActive = dto.isActive;
        return this.categoriesRepository.save(category);
    }
}
