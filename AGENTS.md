### Context

This monorepo contains applications, to manage a restaurant. The dashboard is for the restaurant owners and the kiosk is for the customers.

#### Principal Product

The

Offer a dashboard and a kiosk interface for customers to order from the menu. This interface should be accessible through a unique URL for each restaurant. This module must be accesible from Totem Kiosk on site. The project is called [ui-storefront](restaurants/apps/ui-storefront).

#### Secondary Product

Offer a management interface for restaurant owners to manage their restaurants. This interface should be accessible through a unique URL for each restaurant. This module must be accesible from Totem Admin on site. The project is called [ui-admin](restaurants/apps/ui-admin).


### Stack

* The [api-core](restaurants/apps/api-core) is a NestJS application that uses Prisma for database access and PostgreSQL as the database.

* The [restaurant-ui](restaurants/apps/restaurant-ui) is a Astro application that uses React for the UI and Tailwind CSS for styling.

* Turborepo is used to manage the monorepo.

### Skills

* The [web-design-guidelines](apps/restaurant-ui/.claude/skills/web-design-guidelines/SKILL.md) is a skill that can be used to review UI code for Web Interface Guidelines compliance.

* The [nestjs-best-practices](apps/api-core/.claude/skills/nestjs-best-practices/SKILL.md) is a skill that can be used to review API code for NestJS best practices compliance.



### Commands

* To run the development server  `npm run dev`.
