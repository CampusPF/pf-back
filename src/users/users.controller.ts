import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetPasswordDto } from './dto/set-password.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { UserRole } from './entities/user.entity';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {

  constructor(private readonly usersService: UsersService) { }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  /* Las rutas literales `me` van declaradas ANTES de las paramétricas `:id`:
     Nest matchea por orden, y si `:id` viniera primero se tragaría "me" y el
     ParseUUIDPipe devolvería un 400. */

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser('id') id: string) {
    return this.usersService.findProfile(id);
  }

  /**
   * Datos personales del propio usuario (pantalla de configuración).
   * No lleva assertSelfOrAdmin: el id sale del token, siempre es uno mismo.
   * `email` y `role` no están en UpdateProfileDto, así que el ValidationPipe
   * global los rechaza con 400 — ver el comentario del DTO.
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @CurrentUser('id') id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(id, dto);
  }

  /** Cambia la contraseña, o crea la primera si la cuenta es de Google. */
  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  setMyPassword(
    @CurrentUser('id') id: string,
    @Body() dto: SetPasswordDto,
  ) {
    return this.usersService.setPassword(id, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    // Los datos de un usuario (email, teléfono, dirección) son personales:
    // solo el propio usuario o un admin pueden leerlos. Antes alcanzaba con
    // estar logueado para leer la ficha de cualquiera pasando su id.
    this.assertSelfOrAdmin(id, user);
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    this.assertSelfOrAdmin(id, user);

    // UpdateUserDto incluye `role`, así que sin este chequeo cualquier alumno
    // podía hacerse ADMIN con un PATCH sobre su propio usuario.
    // Cambiar roles es una operación de administración.
    if (updateUserDto.role !== undefined && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('No podés cambiar tu rol');
    }

    return this.usersService.update(id, updateUserDto);
  }

  /**
   * El recurso se resuelve por el id de la URL, pero solo se permite si ese id
   * es el del token. El admin es la única excepción, y es deliberada.
   */
  private assertSelfOrAdmin(
    targetId: string,
    user: { id: string; role: UserRole },
  ): void {
    if (user?.role === UserRole.ADMIN) return;
    if (targetId !== user?.id) {
      throw new ForbiddenException('Solo podés acceder a tu propio usuario');
    }
  }

  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.restore(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}