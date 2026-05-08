Analyze this restaurant menu image and extract all products you can identify.

For each product, provide the following information in JSON format:
- name: product name (required)
- description: product description if visible
- price: numeric price in whole currency units — see rules below (required)

## Price Rules

Return `price` as a plain JSON number using dot as decimal separator. Never use commas in the JSON output.

### Disambiguating thousands separators from decimals

Both `.` and `,` appear in menu prices with different meanings depending on the locale:

| Digits after separator | Meaning | Input example | Output |
|---|---|---|---|
| Exactly 3 | Thousands separator | `22.500` or `22,500` | `22500` |
| 1 or 2 | Decimal separator | `12.50` or `12,50` | `12.50` |
| None | Whole number | `1500` | `1500` |

Mixed separators (e.g., `1.200,50` or `1,200.50`) use one as thousands and the other as decimal:
- `1.200,50` → `1200.50`
- `1,200.50` → `1200.50`

### Examples

| Menu shows | Interpretation | Output `price` |
|---|---|---|
| `$22.500` | 22 thousand 500 | `22500` |
| `$19,500` | 19 thousand 500 | `19500` |
| `$12.50` | 12 pesos 50 cents | `12.50` |
| `$9,99` | 9 pesos 99 cents | `9.99` |
| `$1.200,50` | 1200 pesos 50 cents | `1200.50` |
| `$850` | 850 pesos | `850` |

## Products with Multiple Sizes/Variants

If a menu shows a product with multiple prices for different sizes or variants, create a SEPARATE entry for EACH variant, appending the size/variant name to the product name.

Example menu:
```
PIZZAS       GRANDE    CHICA
Muzzarella   $22.500   $19.500
```

Output:
```json
[
  {"name": "Muzzarella Grande", "price": 22500},
  {"name": "Muzzarella Chica", "price": 19500}
]
```

## Response Format

Respond ONLY with a valid JSON array, no additional text or markdown. Example:
[
  {"name": "Classic Burger", "description": "With cheese, lettuce and tomato", "price": 12500},
  {"name": "Coca Cola", "price": 3000}
]

If you cannot identify any products, respond with an empty array: []
