import { ApiProperty } from '@nestjs/swagger';

export class RestaurantProfileDto {
  @ApiProperty({ example: 'uuid-restaurant-id', description: 'Restaurant unique identifier' })
  id: string;

  @ApiProperty({ example: 'My Restaurant', description: 'Restaurant display name' })
  name: string;

  @ApiProperty({ example: 'my-restaurant', description: 'URL-friendly restaurant slug' })
  slug: string;
}

export class ProfileResponseDto {
  @ApiProperty({ example: 'uuid-user-id', description: 'User unique identifier' })
  id: string;

  @ApiProperty({ example: 'admin@example.com', description: 'User email address' })
  email: string;

  @ApiProperty({ example: 'MANAGER', description: 'User role within the restaurant' })
  role: string;

  @ApiProperty({ type: () => RestaurantProfileDto, description: 'Restaurant the user belongs to' })
  restaurant: RestaurantProfileDto;
}
