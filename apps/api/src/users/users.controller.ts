import { Controller, Get, Param, UseGuards, Patch, Body, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/profile')
  async getMe(@Request() req: any) {
    return this.usersService.findOne(req.user.userId);
  }

  @Patch('me/profile')
  async updateProfile(@Request() req: any, @Body() data: any) {
    return this.usersService.updateProfile(req.user.userId, data);
  }

  @Get('me/referred-students')
  async getReferredStudents(@Request() req: any) {
    return this.usersService.findReferredStudents(req.user.userId);
  }

  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
