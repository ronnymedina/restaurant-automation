import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export class BulkCreateMenuItemsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  productIds: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sectionName: string;
}
