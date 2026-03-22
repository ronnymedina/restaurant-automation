import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';
import { AppService } from './app.service';
import { API_PUBLIC_PATH } from './config';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('dash/menus/:id')
  serveMenuDetail(@Res() res: Response) {
    res.sendFile(join(API_PUBLIC_PATH, 'dash', 'menus', 'detail', 'index.html'));
  }

  @Get('kitchen/:slug')
  serveKitchen(@Res() res: Response) {
    res.sendFile(join(API_PUBLIC_PATH, 'kitchen', '_', 'index.html'));
  }

  @Get('storefront/kiosk/:slug')
  serveKiosk(@Res() res: Response) {
    res.sendFile(join(API_PUBLIC_PATH, 'storefront', 'kiosk', '_', 'index.html'));
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
