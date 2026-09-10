import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { coursesArray } from '../courses/seed/course.seed';


@Injectable()
export class CategoriesRepository {
    constructor(
        @InjectRepository(Category)
        private readonly ormCategoriesRepository: Repository<Category>,
    ) { }

    async getAllCategoriesRepository(): Promise<Category[]> {
        return await this.ormCategoriesRepository.find();
    }

    async addCategoryRepository(): Promise<string> {
        // 1. Extraemos solo los nombres de las categorías del arreglo de cursos
        const allCategories = coursesArray.map((course) => course.categoryName);

        // 2. Usamos Set para eliminar los duplicados (ej: 'Programación' aparece varias veces)
        const uniqueCategories = [...new Set(allCategories)];
        console.log('allCategories', allCategories);
        // 3. Creamos las promesas de inserción
        const insertPromises = uniqueCategories.map((categoryName) =>

            this.ormCategoriesRepository
                .createQueryBuilder()
                .insert()
                .into(Category)
                .values({ name: categoryName }) // Asumimos que tu entidad tiene la columna 'name'
                .orIgnore()
                .execute()


        );

        //* Se espera a que todas las promesas se resuelvan antes de seguir
        await Promise.all(insertPromises);

        return 'Categorias agregadas';
    }


    //RESTO DEL CRUD .. DE Categories
    async getCategoryByIdRepository(id: string): Promise<Category | null> {
        return await this.ormCategoriesRepository.findOne({ where: { id } });
    }
    //update category
    async updateCategoryRepository(
        id: string,
        data: { name: string },
    ): Promise<string> {
        await this.ormCategoriesRepository.update(id, data);
        return 'Categoria actualizada';
    }
    //delete category
    async deleteCategoryRepository(id: string): Promise<string> {
        await this.ormCategoriesRepository.delete(id);
        return 'Categoria eliminada';
    }
}
