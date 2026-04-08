import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@refhire/db';
import { ObjectId } from 'bson';
import { CreateReferralDto } from './dto/create-referral.dto';
import { UpdateReferralStatusDto, ReferralStatus } from './dto/update-referral-status.dto';

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaClient) {}

  private formatRawValue(val: any): any {
    if (val instanceof Date) {
      return { $date: val.toISOString() };
    }
    if (val instanceof ObjectId) {
      return { $oid: val.toHexString() };
    }
    if (Array.isArray(val)) {
      return val.map((item) => this.formatRawValue(item));
    }
    if (val !== null && typeof val === 'object') {
      const obj: Record<string, any> = {};
      for (const key of Object.keys(val)) {
        obj[key] = this.formatRawValue(val[key]);
      }
      return obj;
    }
    return val;
  }

  private async rawInsert(collection: string, doc: Record<string, any>) {
    const _id = new ObjectId();
    const result = await (this.prisma as any).$runCommandRaw({
      insert: collection,
      documents: [{ _id: { $oid: _id.toHexString() }, ...this.formatRawValue(doc) }],
    });
    if (result.ok !== 1) {
      throw new Error(`Raw insert into ${collection} failed: ${JSON.stringify(result)}`);
    }
    return _id.toHexString();
  }

  private async rawUpdateMany(collection: string, where: Record<string, any>, setData: Record<string, any>) {
    const result = await (this.prisma as any).$runCommandRaw({
      update: collection,
      updates: [
        {
          q: this.formatRawValue(where),
          u: { $set: this.formatRawValue(setData) },
          multi: true,
        },
      ],
    });
    if (result.ok !== 1) {
      throw new Error(`Raw update in ${collection} failed: ${JSON.stringify(result)}`);
    }
  }

  private async rawDeleteOne(collection: string, where: Record<string, any>) {
    const result = await (this.prisma as any).$runCommandRaw({
      delete: collection,
      deletes: [{ q: this.formatRawValue(where), limit: 1 }],
    });
    if (result.ok !== 1) {
      throw new Error(`Raw delete in ${collection} failed: ${JSON.stringify(result)}`);
    }
  }

  private generateRefCode() {
    return `REF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  async create(createReferralDto: CreateReferralDto, userId: string) {
    let positionId = createReferralDto.positionId;
    if (!positionId) {
      const firstActivePosition = await this.prisma.position.findFirst({
        where: { isActive: true },
        orderBy: { title: 'asc' },
      });
      positionId = firstActivePosition?.id || '';
    }

    const position = positionId
      ? await this.prisma.position.findUnique({ where: { id: positionId } })
      : null;

    if (!position) throw new NotFoundException('Position not found');

    const now = new Date();
    const id = await this.rawInsert('Referral', {
      refCode: this.generateRefCode(),
      candidateName: createReferralDto.candidateName,
      candidateEmail: createReferralDto.candidateEmail,
      candidatePhone: createReferralDto.candidatePhone,
      resumeUrl: createReferralDto.resumeUrl || null,
      notes: createReferralDto.notes || null,
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
      referredById: new ObjectId(userId),
      positionId: new ObjectId(positionId),
    });

    return this.prisma.referral.findUnique({
      where: { id },
      include: { position: true },
    });
  }

  async findAll(status?: ReferralStatus, query?: string) {
    return this.prisma.referral.findMany({
      where: {
        AND: [
          status ? { status } : {},
          query
            ? {
                OR: [
                  { candidateName: { contains: query } },
                  { candidateEmail: { contains: query } },
                  { position: { title: { contains: query } } },
                ],
              }
            : {},
        ],
      },
      include: {
        referredBy: { select: { id: true, name: true, email: true, employeeId: true } },
        position: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
      include: {
        referredBy: true,
        position: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!referral) throw new NotFoundException('Referral not found');
    return referral;
  }

  async updateStatus(id: string, updateDto: UpdateReferralStatusDto, userId: string) {
    const referral = await this.findOne(id);

    await this.rawInsert('StatusLog', {
      referralId: new ObjectId(id),
      fromStatus: referral.status,
      toStatus: updateDto.status,
      note: updateDto.note || null,
      changedBy: userId,
      createdAt: new Date(),
    });

    await this.rawUpdateMany('Referral', { _id: new ObjectId(id) }, {
      status: updateDto.status,
      updatedAt: new Date(),
    });

    return this.prisma.referral.findUnique({
      where: { id },
      include: { position: true },
    });
  }

  async getStats() {
    const stats = await this.prisma.referral.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return stats.reduce((acc, curr) => ({ ...acc, [curr.status]: curr._count._all }), {});
  }

  async bulkImport(data: any[], userId: string) {
    const results = [];
    for (const item of data) {
      try {
        const referral = await this.create(
          {
            candidateName: item.candidateName,
            candidateEmail: item.candidateEmail,
            candidatePhone: item.candidatePhone || '',
            positionId: item.positionId,
            notes: 'Bulk Imported',
          },
          userId,
        );
        results.push(referral);
      } catch (err: any) {
        console.error('Failed to import item', item, err.message);
      }
    }
    return { imported: results.length, total: data.length };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.rawDeleteOne('Referral', { _id: new ObjectId(id) });
    return { success: true };
  }

  async update(id: string, data: Partial<CreateReferralDto>) {
    await this.findOne(id);

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (typeof data.candidateName === 'string') updateData.candidateName = data.candidateName;
    if (typeof data.candidateEmail === 'string') updateData.candidateEmail = data.candidateEmail;
    if (typeof data.candidatePhone === 'string') updateData.candidatePhone = data.candidatePhone;
    if (typeof data.notes === 'string') updateData.notes = data.notes;
    if (typeof data.resumeUrl === 'string') updateData.resumeUrl = data.resumeUrl;
    if (typeof data.positionId === 'string' && data.positionId) {
      updateData.positionId = new ObjectId(data.positionId);
    }

    await this.rawUpdateMany('Referral', { _id: new ObjectId(id) }, updateData);

    return this.prisma.referral.findUnique({
      where: { id },
      include: { position: true },
    });
  }
}
