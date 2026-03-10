import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { FRONTEND_URL } from '../config';

@WebSocketGateway({
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      const kitchenToken = client.handshake.auth?.kitchenToken as string | undefined;
      const slug = client.handshake.query?.slug as string | undefined;

      if (token) {
        const payload = this.jwtService.verify<{ restaurantId: string }>(token);
        const restaurantId = payload.restaurantId;
        client.join(`restaurant:${restaurantId}`);
        this.logger.log(`Dashboard connected: ${client.id} → restaurant:${restaurantId}`);
        return;
      }

      if (kitchenToken && slug) {
        const restaurant = await this.restaurantsService.findBySlug(slug);
        if (!restaurant || restaurant.kitchenToken !== kitchenToken) {
          client.disconnect();
          return;
        }
        if (restaurant.kitchenTokenExpiresAt && restaurant.kitchenTokenExpiresAt < new Date()) {
          this.logger.warn(`Kitchen token expired for slug: ${slug}`);
          client.disconnect();
          return;
        }
        client.join(`kitchen:${restaurant.id}`);
        this.logger.log(`Kitchen connected: ${client.id} → kitchen:${restaurant.id}`);
        return;
      }

      if (slug) {
        const restaurant = await this.restaurantsService.findBySlug(slug);
        if (!restaurant) {
          client.disconnect();
          return;
        }
        client.join(`kiosk:${restaurant.id}`);
        this.logger.log(`Kiosk connected: ${client.id} → kiosk:${restaurant.id}`);
        return;
      }

      client.disconnect();
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToRestaurant(restaurantId: string, event: string, data: unknown) {
    this.server.to(`restaurant:${restaurantId}`).emit(event, data);
  }

  emitToKiosk(restaurantId: string, event: string, data: unknown) {
    this.server.to(`kiosk:${restaurantId}`).emit(event, data);
  }

  emitToKitchen(restaurantId: string, event: string, data: unknown) {
    this.server.to(`kitchen:${restaurantId}`).emit(event, data);
  }
}
