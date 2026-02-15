import { Controller, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { ActivateUserDto } from './dto';

@ApiTags('Users')
@Controller({ version: '1', path: 'users' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put('activate')
  @ApiOperation({
    summary: 'Activar cuenta de usuario',
    description:
      'Activa una cuenta usando el token de activación y establece la contraseña',
  })
  @ApiResponse({ status: 200, description: 'Cuenta activada exitosamente' })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 409, description: 'La cuenta ya está activa' })
  async activate(@Body() body: ActivateUserDto) {
    const user = await this.usersService.activateUser(body.token, body.password);
    return {
      message: 'Cuenta activada exitosamente',
      userId: user.id,
      email: user.email,
    };
  }
}
