import { ApiProperty } from '@nestjs/swagger';

export class CountryOptionSerializer {
  @ApiProperty({ example: 'CL', description: 'ISO 3166-1 alpha-2' })
  code: string;

  @ApiProperty({ example: 'Chile', description: 'Nombre del país en español' })
  name: string;

  @ApiProperty({ example: 'CLP', description: 'Código ISO 4217 — solo etiqueta de display' })
  currency: string;

  @ApiProperty({ example: ',', enum: ['.', ','], description: 'Separador decimal por defecto del país' })
  defaultDecimalSeparator: '.' | ',';
}
