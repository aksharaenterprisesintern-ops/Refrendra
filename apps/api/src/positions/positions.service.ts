import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@refhire/db';
import { ObjectId } from 'bson';

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaClient) {}

  private readonly defaultPositions: Array<{ title: string; department: string }> = [
    { title: 'Frontend Developer', department: 'Engineering' },
    { title: 'Backend Developer', department: 'Engineering' },
    { title: 'Full Stack Developer', department: 'Engineering' },
    { title: 'React Developer', department: 'Engineering' },
    { title: 'Node.js Developer', department: 'Engineering' },
    { title: 'Java Developer', department: 'Engineering' },
    { title: 'Python Developer', department: 'Engineering' },
    { title: 'DevOps Engineer', department: 'Engineering' },
    { title: 'Cloud Engineer', department: 'Engineering' },
    { title: 'Data Engineer', department: 'Data' },
    { title: 'Data Analyst', department: 'Data' },
    { title: 'Data Scientist', department: 'Data' },
    { title: 'Machine Learning Engineer', department: 'Data' },
    { title: 'QA Engineer', department: 'Engineering' },
    { title: 'Automation Test Engineer', department: 'Engineering' },
    { title: 'Product Manager', department: 'Product' },
    { title: 'Business Analyst', department: 'Product' },
    { title: 'UI/UX Designer', department: 'Design' },
    { title: 'Mobile Developer', department: 'Engineering' },
    { title: 'Cybersecurity Analyst', department: 'Security' },
  ];

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

  private async rawInsertPosition(doc: Record<string, any>) {
    const _id = new ObjectId();
    const result = await (this.prisma as any).$runCommandRaw({
      insert: 'Position',
      documents: [{ _id: { $oid: _id.toHexString() }, ...this.formatRawValue(doc) }],
    });
    if (result.ok !== 1) {
      throw new Error(`Raw insert into Position failed: ${JSON.stringify(result)}`);
    }
    return _id.toHexString();
  }

  private async ensureDefaultPositions() {
    const existingCount = await this.prisma.position.count({ where: { isActive: true } });
    if (existingCount > 0) {
      return;
    }

    for (const pos of this.defaultPositions) {
      const existing = await this.prisma.position.findUnique({ where: { title: pos.title } });
      if (!existing) {
        await this.rawInsertPosition({
          title: pos.title,
          department: pos.department,
          isActive: true,
        });
      }
    }
  }

  async findAll() {
    await this.ensureDefaultPositions();
    return this.prisma.position.findMany({
      where: { isActive: true },
      orderBy: { title: 'asc' },
    });
  }

  async create(title: string, department?: string) {
    const existing = await this.prisma.position.findUnique({ where: { title } });
    if (existing) {
      return existing;
    }
    await this.rawInsertPosition({ title, department, isActive: true });
    return this.prisma.position.findUnique({ where: { title } });
  }
}
