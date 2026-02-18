import { Module } from '@nestjs/common';

import { MenusService } from './menus.service';
import { MenuItemsService } from './menu-items.service';
import { MenusController } from './menus.controller';
import { MenuItemsController } from './menu-items.controller';
import { MenuRepository } from './menu.repository';
import { MenuItemRepository } from './menu-item.repository';

@Module({
  controllers: [MenusController, MenuItemsController],
  providers: [
    MenusService,
    MenuItemsService,
    MenuRepository,
    MenuItemRepository,
  ],
  exports: [MenusService, MenuItemsService, MenuRepository, MenuItemRepository],
})
export class MenusModule {}
