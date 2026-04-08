import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@refhire/db';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaClient) {}

  private async rawUpdateUserProfile(id: string, data: any) {
    const result = await (this.prisma as any).$runCommandRaw({
      update: 'User',
      updates: [
        {
          q: { _id: { $oid: id } },
          u: {
            $set: {
              name: data.name,
              phone: data.phone,
              college: data.college,
              gradYear: data.gradYear,
              bio: data.bio,
              location: data.location,
            },
          },
          multi: false,
        },
      ],
    });
    if (result.ok !== 1) {
      throw new Error(`Raw update in User failed: ${JSON.stringify(result)}`);
    }
  }

  async findAll() {
    return this.prisma.user.findMany();
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateProfile(id: string, data: any) {
    await this.rawUpdateUserProfile(id, data);
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findReferredStudents(id: string) {
    return this.prisma.user.findMany({
      where: { referredById: id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
