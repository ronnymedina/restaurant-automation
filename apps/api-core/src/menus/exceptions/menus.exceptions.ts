import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class MenuNotFoundException extends BaseException {
  constructor(menuId: string) {
    super(
      `Menu '${menuId}' not found`,
      HttpStatus.NOT_FOUND,
      'MENU_NOT_FOUND',
      { menuId },
    );
  }
}

export class MenuItemNotFoundException extends BaseException {
  constructor(itemId: string) {
    super(
      `Menu item '${itemId}' not found`,
      HttpStatus.NOT_FOUND,
      'MENU_ITEM_NOT_FOUND',
      { itemId },
    );
  }
}
