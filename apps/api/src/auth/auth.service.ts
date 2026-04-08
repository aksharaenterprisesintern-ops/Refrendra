import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@refhire/db';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ObjectId } from 'bson';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

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
      const newObj: Record<string, any> = {};
      for (const key of Object.keys(val)) {
        newObj[key] = this.formatRawValue(val[key]);
      }
      return newObj;
    }
    return val;
  }

  private async rawInsert(collection: string, doc: Record<string, any>) {
    const _id = new ObjectId();
    const formattedDoc = this.formatRawValue(doc);

    const result = await (this.prisma as any).$runCommandRaw({
      insert: collection,
      documents: [
        {
          _id: { $oid: _id.toHexString() },
          ...formattedDoc,
        },
      ],
    });

    if (result.ok !== 1) {
      throw new Error(`Raw insert into ${collection} failed: ${JSON.stringify(result)}`);
    }

    return _id.toHexString();
  }

  private async rawUpdateMany(
    collection: string,
    where: Record<string, any>,
    setData: Record<string, any>,
  ) {
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

  async validateUser(email: string, pass: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return null;

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email before logging in.');
    }

    const match = await bcrypt.compare(pass, user.passwordHash);
    if (match) {
      const { passwordHash, otp, otpExpiry, ...result } = user;
      return result;
    }

    return null;
  }

  async registerUser(data: { name: string; email: string; phone: string; password?: string }) {
    try {
      console.log('--- Registration Start ---', data.email);
      const existing = await this.prisma.user.findUnique({ where: { email: data.email } });

      if (existing && existing.isVerified) {
        throw new ConflictException('An account with this email already exists.');
      }

      const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;

      const count = await this.prisma.user.count();
      const employeeId = `EMP-${String(count + 1).padStart(4, '0')}`;

      let user;
      if (existing) {
        await this.rawUpdateMany(
          'User',
          { email: data.email },
          {
            name: data.name,
            phone: data.phone,
            passwordHash,
            isVerified: false,
          },
        );

        user = await this.prisma.user.findUnique({ where: { email: data.email } });
      } else {
        const now = new Date();
        await this.rawInsert('User', {
          email: data.email,
          name: data.name,
          phone: data.phone,
          passwordHash,
          isVerified: false,
          employeeId,
          role: 'CLUB_HEADER',
          createdAt: now,
        });

        user = await this.prisma.user.findUnique({ where: { email: data.email } });
      }

      if (!user) {
        throw new Error('User creation failed - could not retrieve user after insert.');
      }

      const otpResult = await this.sendOtp(user.email);

      return {
        message: 'OTP sent for verification',
        email: user.email,
        name: user.name,
        ...otpResult,
      };
    } catch (e: any) {
      if (e.status) throw e;

      console.error('CRITICAL Registration Error:', e.stack || e);
      try {
        require('fs').appendFileSync(
          'auth_error.log',
          `[REGISTRATION] ${new Date().toISOString()}\n${e.stack || e}\n\n`,
        );
      } catch {
        // no-op
      }

      throw new InternalServerErrorException(`Registration failed: ${e.message}`);
    }
  }

  async sendOtp(email: string) {
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Invalid email address.');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('No account found for this email.');
    }

    const recentOtp = await this.prisma.otpVerification.findFirst({
      where: {
        email,
        used: false,
        createdAt: { gt: new Date(Date.now() - 30 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentOtp) {
      throw new BadRequestException('Please wait 30 seconds before requesting another OTP.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.rawUpdateMany('OtpVerification', { email, used: false }, { used: true });

    await this.rawInsert('OtpVerification', {
      email,
      otpHash,
      expiresAt,
      attempts: 0,
      used: false,
      createdAt: new Date(),
    });

    await this.rawUpdateMany('User', { email }, { otp, otpExpiry: expiresAt });

    console.log(`\nOTP for ${email}: ${otp}\n`);

    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPort = this.config.get<string>('SMTP_PORT');
    const smtpFrom = this.config.get<string>('SMTP_FROM') || '"Refentra Auth" <noreply@refentra.com>';

    if (smtpUser && smtpUser !== 'your-email@gmail.com') {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: Number(smtpPort) || 587,
          secure: Number(smtpPort) === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: smtpFrom,
          to: email,
          subject: 'Verify your Refentra Account',
          html: this.createEmailTemplate(otp),
        });

        return { success: true, message: 'OTP sent to your email.' };
      } catch (err: any) {
        console.error('SMTP Error:', err.message);
        throw new BadRequestException('Email service error.');
      }
    }

    try {
      const testAccount = await nodemailer.createTestAccount();
      const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });

      const info = await transporter.sendMail({
        from: '"Refentra Dev-Mode" <no-reply@ethereal.email>',
        to: email,
        subject: 'Verify your Refentra Account',
        html: this.createEmailTemplate(otp),
      });

      return {
        demo: true,
        otp,
        previewUrl: nodemailer.getTestMessageUrl(info),
        message: `OTP [${otp}] sent via Ethereal.`,
      };
    } catch (err: any) {
      try {
        require('fs').appendFileSync(
          'auth_error.log',
          `[SEND_OTP_ETHEREAL] ${new Date().toISOString()}\n${err.stack || err}\n\n`,
        );
      } catch {
        // no-op
      }

      return { demo: true, otp, message: `OTP (Console): ${otp}` };
    }
  }

  private createEmailTemplate(otp: string) {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #2B1D1C;">Refentra Account Verification</h2>
        <p>Your one-time verification code is:</p>
        <div style="background: #ECCEB6; padding: 30px; text-align: center; border-radius: 16px; margin: 30px 0;">
          <h1 style="color: #861C1C; font-size: 56px; letter-spacing: 12px; margin: 0;">${otp}</h1>
        </div>
        <p style="font-size: 12px; color: #718096;">If you did not initiate this request, please ignore this email.</p>
      </div>
    `;
  }

  async verifyOtp(email: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid identifier.');

    const otpRecord = await this.prisma.otpVerification.findFirst({
      where: { email, used: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('OTP invalid or expired.');
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isMatch) throw new UnauthorizedException('Invalid OTP.');

    await this.rawUpdateMany('User', { email }, { isVerified: true, otp: null, otpExpiry: null });
    await this.rawUpdateMany('OtpVerification', { _id: new ObjectId(otpRecord.id) }, { used: true });

    const payload = { sub: user.id, role: user.role, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' } as any),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isVerified: true,
      },
    };
  }

  async adminLogin(user: any) {
    const payload = { sub: user.userId || user.id, role: user.role, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' } as any),
      user: { ...user },
    };
  }

  async login(user: any) {
    return this.adminLogin(user);
  }
}
