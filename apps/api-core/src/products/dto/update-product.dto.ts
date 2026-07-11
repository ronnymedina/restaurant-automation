import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['imageUrl'] as const)) {
  @ApiPropertyOptional({
    example: '/uploads/products/abc.jpg',
    nullable: true,
    description: 'URL de imagen. Enviar null para eliminar la imagen actual.',
  })
  @IsOptional()
  @ValidateIf((o) => o.imageUrl !== null)
  @IsString()
  @Matches(/^(https?:\/\/.+|\/.+)/, { message: 'imageUrl must be a URL address' })
  imageUrl?: string | null;
}
