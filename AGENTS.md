### Context

This monorepo contains two applications, to create a restaurant and manage it.

#### Principal Product

Offer a kiosk interface for customers to order from the menu. This interface should be accessible through a unique URL for each restaurant. This module must be accesible from Totem Kiosk on site.

#### Secondary Product

Offer a management interface for restaurant owners to manage their restaurants. This interface should be accessible through a unique URL for each restaurant. This module must be accesible from Totem Admin on site.


### Stack

* The [api-core](restaurants/apps/api-core) is a NestJS application that uses Prisma for database access and PostgreSQL as the database.

* The [restaurant-ui](restaurants/apps/restaurant-ui) is a Astro application that uses React for the UI and Tailwind CSS for styling.

* Turborepo is used to manage the monorepo.

### Commands

* To run the development server  `npm run dev`.
