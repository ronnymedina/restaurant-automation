import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

describe('BaseException', () => {
  it('expone message como array de un elemento en el body de respuesta', () => {
    const ex = new BaseException('Something failed', HttpStatus.CONFLICT, 'SOMETHING_FAILED', { id: '1' });
    const body = ex.getResponse() as Record<string, unknown>;

    expect(body.message).toEqual(['Something failed']);
    expect(body.code).toBe('SOMETHING_FAILED');
    expect(body.statusCode).toBe(HttpStatus.CONFLICT);
    expect(body.details).toEqual({ id: '1' });
  });

  it('mantiene getStatus() igual al statusCode', () => {
    const ex = new BaseException('x', HttpStatus.BAD_REQUEST, 'X');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});
