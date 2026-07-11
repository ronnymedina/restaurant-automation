import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';

function isPostgresUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith('postgresql://') || url.startsWith('postgres://'));
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';

    if (isPostgresUrl(dbUrl)) {
      // PostgreSQL: use the pg driver adapter (required by Prisma 7's WASM engine)
      const adapter = new PrismaPg({ connectionString: dbUrl });
      super({ adapter });
    } else {
      // SQLite: use the better-sqlite3 driver adapter
      const adapter = new PrismaBetterSqlite3({ url: dbUrl });
      super({ adapter });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }
}
