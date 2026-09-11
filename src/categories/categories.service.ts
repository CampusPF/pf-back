import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CloudinaryService,
  UPLOAD_FOLDERS,
} from '../file-upload/cloudinary.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly customRepo: CategoriesRepository,
    private readonly cloudinary: CloudinaryService,
  ) { }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const existing = await this.categoriesRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }

    const category = this.categoriesRepository.create(dto);
    return this.categoriesRepository.save(category);
  }

  async findAll(includeInactive = false): Promise<Category[]> {
    return this.categoriesRepository.find({
      where: includeInactive ? {} : { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
      relations: { courses: true },
    });

    if (!category) {
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    if (dto.name && dto.name !== category.name) {
      const existing = await this.categoriesRepository.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException('Ya existe una categoría con ese nombre');
      }
    }

    Object.assign(category, dto);
    return this.categoriesRepository.save(category);
  }

  /**
   * Reemplaza la imagen de la categoría por un archivo subido a Cloudinary.
   * Se guarda el publicId junto a la URL para poder borrar la anterior.
   */
  async updateImage(id: string, file: Express.Multer.File): Promise<Category> {
    const category = await this.findOne(id);

    const { url, publicId } = await this.cloudinary.replaceImage(
      file,
      UPLOAD_FOLDERS.CATEGORIES,
      category.imagePublicId,
    );

    category.imageUrl = url;
    category.imagePublicId = publicId;

    return this.categoriesRepository.save(category);
  }

  /**
   * Borrado lógico: nunca se elimina la fila. Se marca isActive:false para
   * que deje de aparecer en el catálogo público, pero los cursos que ya la
   * referencian (courses.categoryId) no quedan con una FK rota.
   */
  async remove(id: string): Promise<Category> {
    const category = await this.findOne(id);
    category.isActive = false;
    return this.categoriesRepository.save(category);
  }

  async restore(id: string): Promise<Category> {
    const category = await this.findOne(id);
    category.isActive = true;
    return this.categoriesRepository.save(category);
  }
  addCategoryService() {
    return this.customRepo.addCategoryRepository();
  }

}