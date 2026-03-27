# Especificación Técnica: Manejo de Precios y Facturación (BigInt + Centavos)

. Contexto y Problema
El sistema del restaurante maneja precios en múltiples entornos (SQLite en local, PostgreSQL en la nube). Para evitar inconsistencias entre motores de bases de datos y estar protegidos contra la inflación argentina (que podría desbordar los límites de un entero tradicional de 32 bits), se requiere una estrategia robusta para el manejo de dinero.
El modelo anterior utilizaba Decimal, lo cual genera fricción en JavaScript/TypeScript y posibles pérdidas de precisión si no se maneja con librerías estrictas en cada cálculo.

2. Decisión Arquitectónica y Regla de Oro
Se adopta la Estrategia de Centavos con BigInt.

REGLA DE ORO DE IMPLEMENTACIÓN:
Absolutamente todas las implementaciones de cálculo de la aplicación (carritos de compras, aplicación de descuentos, reportes de caja, cálculos de impuestos) DEBEN realizarse utilizando esta lógica. Queda estrictamente prohibido usar Number, Float o Double para operaciones aritméticas de dinero en el backend.

Base de Datos: Todos los campos monetarios se almacenan como BigInt (centavos).

Matemática de Dominio: Los cálculos (precio * cantidad, sumatorias) se hacen nativamente con BigInt (ej: 150n * 3n).

Capa de Presentación (API): Los montos se transforman a Number (divididos por 100) únicamente en el último paso antes de ser enviados al Frontend, ya que JSON.stringify no soporta BigInt.

3. Actualización de Modelos Prisma
A continuación, los modelos actualizados reflejando el cambio de Decimal a BigInt:


model Product {
  id          String   @id @default(uuid())
  name        String
  description String?
  price       BigInt   @default(0) // Guardado en centavos
  // ... resto de las relaciones
}

model Order {
  id                 String        @id @default(uuid())
  orderNumber        Int
  status             OrderStatus   @default(CREATED)
  // ... otros campos
  totalAmount        BigInt        // Guardado en centavos
  isPaid             Boolean       @default(false)
  
  items              OrderItem[]
  // ... resto de las relaciones
}

model OrderItem {
  id          String   @id @default(uuid())
  quantity    Int
  unitPrice   BigInt   // Precio unitario al momento de la compra (en centavos)
  subtotal    BigInt   // quantity * unitPrice (en centavos)
  notes       String?

  // ... resto de las relaciones
}


# 4. Casos de Prueba (TDD) - Validación de Lógica de Negocio


La siguiente suite de pruebas define los escenarios críticos que fallarían con la implementación actual basada en coma flotante o tipos numéricos estándar, pero que deben pasar exitosamente tras la migración a BigInt.

```ts

import { 
  calculateItemSubtotal, 
  calculateOrderTotal, 
  formatMoneyForApi 
} from './pricing-service';

describe('Cálculos Core de Facturación (BigInt)', () => {

  describe('Cálculo de Subtotales en OrderItem', () => {
    // 🔴 CASO 1: Falla actual por redondeo flotante
    // En JS normal: 10.14 * 3 = 30.420000000000005
    it('debe calcular el subtotal multiplicando precio unitario por cantidad sin errores decimales', () => {
      const unitPriceCents = 1014n; // $10.14
      const quantity = 3n; // Usamos BigInt también para la cantidad para operar tipos iguales
      
      const subtotal = calculateItemSubtotal(unitPriceCents, quantity);
      
      expect(subtotal).toBe(3042n); // $30.42 exactos
    });
  });

  describe('Cálculo de Totales en Order', () => {
    // 🔴 CASO 2: Falla actual por arrastre de error flotante en sumatorias
    // En JS normal sumar varios 0.1 y 0.2 termina generando diferencias de centavos.
    it('debe calcular el totalAmount de la orden sumando los subtotales con precisión absoluta', () => {
      const orderItems = [
        { subtotal: 1010n }, // $10.10
        { subtotal: 2020n }, // $20.20
        { subtotal: 3030n }  // $30.30
      ];

      const totalAmount = calculateOrderTotal(orderItems);
      
      expect(totalAmount).toBe(6060n); // $60.60 exactos
    });

    // 🔴 CASO 3: Falla actual por Integer Overflow (Límite de 32 bits)
    // Si usáramos Int normal, esta suma superaría los 2.147 millones de centavos y rompería la app.
    it('debe soportar órdenes de alto volumen que superen límites de enteros tradicionales', () => {
      const orderItems = [
        { subtotal: 1500000000n }, // $15,000,000.00
        { subtotal: 1200000000n }  // $12,000,000.00
      ];

      const totalAmount = calculateOrderTotal(orderItems);
      
      expect(totalAmount).toBe(2700000000n); // $27,000,000.00 en centavos
    });
  });

  describe('Serialización para la API', () => {
    // 🔴 CASO 4: Falla actual porque JSON.stringify lanza TypeError con BigInt nativo
    it('debe formatear el BigInt a un Number decimal para la respuesta de la API', () => {
      const totalAmountDb = 254550n; // $2545.50
      
      const responseValue = formatMoneyForApi(totalAmountDb);
      
      expect(typeof responseValue).toBe('number');
      expect(responseValue).toBe(2545.50);
      
      // Comprobación de seguridad para Express/Next.js
      expect(() => JSON.stringify({ total: responseValue })).not.toThrow();
    });
  });
});
```